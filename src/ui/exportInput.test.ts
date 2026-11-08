import { describe, expect, it } from 'vitest';
import { makeFixture } from '../export/fixtures';
import { prepareExport } from './exportInput';
import { emptyDoc } from './repository';
import type { Doc } from './store';

function docOf(): Doc {
  const f = makeFixture();
  return { settings: f.settings, rosters: { senior: f.students, junior: [] }, exams: [f.exam] };
}

describe('prepareExport', () => {
  it('學生名單空：擋下並說明', () => {
    const d = emptyDoc();
    const r = prepareExport({ ...d, exams: [makeFixture().exam] }, makeFixture().exam, '2026-11-08T00:00:00Z');
    expect(r.ok).toBe(false);
  });

  it('沒勾教室：擋下', () => {
    const d = docOf();
    const r = prepareExport(d, { ...d.exams[0]!, classroomIds: [] }, '2026-11-08T00:00:00Z');
    expect(r).toEqual({ ok: false, errors: ['這次考試還沒勾選教室，請先到 ③ 教室設定。'] });
  });

  it('排座結果的版本碼穩定，與產生時間無關', () => {
    const d = docOf();
    const a = prepareExport(d, d.exams[0]!, '2026-11-08T00:00:00Z');
    const b = prepareExport(d, d.exams[0]!, '2026-11-09T00:00:00Z');
    if (a.ok && b.ok) expect(a.input.result.dataVersion).toBe(b.input.result.dataVersion);
    else expect(a.ok === b.ok).toBe(true);
  });
});
