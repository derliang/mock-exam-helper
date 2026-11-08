import { describe, expect, it } from 'vitest';
import { makeFixture } from '../export/fixtures';
import { prepareExport } from './exportInput';
import { examResult, reseat } from './seating';
import { emptyDoc } from './repository';
import type { Doc } from './store';

function docOf(): Doc {
  const f = makeFixture();
  const classrooms = f.settings.classrooms.map((r, i) => (r.kind === 'class' ? { ...r, track: i % 2 ? ('liberal' as const) : ('science' as const), rows: 4, depth: 5, seatCount: 20 } : r));
  return { settings: { ...f.settings, classrooms }, rosters: { senior: f.students, junior: [] }, exams: [f.exam], examFiles: { [f.exam.id]: { entries: f.entries, diffs: [], overrides: [] } } };
}

describe('prepareExport', () => {
  it('學生名單空：擋下並說明', () => {
    const d = emptyDoc();
    const r = prepareExport({ ...d, exams: [makeFixture().exam] }, makeFixture().exam);
    expect(r.ok).toBe(false);
  });

  it('沒勾教室：擋下', () => {
    const d = docOf();
    const r = prepareExport(d, { ...d.exams[0]!, classroomIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^缺教室.*③/);
  });

  it('沒匯入考試名單：說缺什麼、去哪補', () => {
    const d = docOf();
    const r = prepareExport({ ...d, examFiles: {} }, d.exams[0]!);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^缺考試名單.*②/);
  });

  it('沒有排座結果：擋下並請回 ⑤', () => {
    const d = docOf();
    const r = prepareExport(d, d.exams[0]!);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^缺排座結果.*⑤/);
  });

  it('用 ⑤ 已存的結果：同一份座位、版本碼與產生時間，不因匯出時間改變', () => {
    const d = docOf();
    const s = reseat(d, d.exams[0]!, '2026-11-08T00:00:00Z');
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const a = prepareExport(s.doc, d.exams[0]!);
    const b = prepareExport(s.doc, d.exams[0]!);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.input.result).toBe(examResult(s.doc, d.exams[0]!));
      expect(a.input.result.generatedAt).toBe('2026-11-08T00:00:00Z');
      expect(b.input.result.dataVersion).toBe(a.input.result.dataVersion);
    }
  });

  it('排座後改過名單：視為過期，擋下', () => {
    const d = docOf();
    const s = reseat(d, d.exams[0]!, '2026-11-08T00:00:00Z');
    if (!s.ok) throw new Error(s.error);
    const f = s.doc.examFiles![d.exams[0]!.id]!;
    const changed: Doc = { ...s.doc, examFiles: { [d.exams[0]!.id]: { ...f, entries: f.entries!.slice(1) } } };
    const r = prepareExport(changed, d.exams[0]!);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^排座已過期.*⑤/);
  });
});
