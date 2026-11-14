import { describe, expect, it } from 'vitest';
import { examHeadcount, examProgress, formatModified, sortExams } from './examList';
import { demoDoc } from './repository';
import { examLabel, newExam, previousExam, schoolYear, stampModified, suggestExamName, type Doc } from './store';

const t0 = new Date('2026-11-01T02:00:00Z');
function withExam(kind: 'gsat' | 'bcct', name: string, at = t0): Doc {
  const r = newExam(demoDoc(), kind, name, at);
  if (!r.ok) throw new Error(r.error);
  return r.doc;
}

describe('列表：進度條', () => {
  it('剛建立的學測：六格，第一格以外都沒完成；有一格是「目前」', () => {
    const d = withExam('gsat', '學測第一次');
    const p = examProgress(d, d.exams[0]!);
    expect(p.cells).toHaveLength(6);
    expect(p.cells.filter((c) => c === 'c')).toHaveLength(1);
    expect(p.total).toBe(6);
    expect(p.headline).toBe(`${p.done}／6 步完成`);
    expect(p.detail).toMatch(/^進行中：/);
  });
  it('會考第 4 格是「不需要」，分母 5', () => {
    const d = withExam('bcct', '會考第一次');
    const p = examProgress(d, d.exams[0]!);
    expect(p.cells[3]).toBe('n');
    expect(p.total).toBe(5);
    expect(p.headline.endsWith('／5 步完成')).toBe(true);
  });
  it('考科表被清空時第 1 步不算完成', () => {
    const d = withExam('gsat', 'A');
    const e = { ...d.exams[0]!, subjects: [] };
    expect(examProgress({ ...d, exams: [e] }, e).cells[0]).not.toBe('d');
  });
});

describe('列表：人數、排序、時間', () => {
  it('沒匯入本次考試名單時人數是 0（不拿共用學生名單充數）', () => {
    const d = withExam('gsat', 'A');
    expect(examHeadcount(d, d.exams[0]!)).toBe(0);
  });
  it('依最後修改由新到舊；沒有 updatedAt 用 createdAt', () => {
    const a = withExam('gsat', 'A', new Date('2026-10-01T00:00:00Z')).exams[0]!;
    const b = { ...withExam('gsat', 'B', new Date('2026-09-01T00:00:00Z')).exams[0]!, updatedAt: '2026-11-05T00:00:00Z' };
    const c = withExam('gsat', 'C', new Date('2026-10-20T00:00:00Z')).exams[0]!;
    expect(sortExams([a, b, c]).map((e) => e.name)).toEqual(['B', 'C', 'A']);
  });
  it('時間顯示台北時間、壞值不丟例外', () => {
    expect(formatModified('2026-11-07T07:30:00Z')).toBe('2026-11-07 15:30');
    expect(formatModified('壞掉')).toBe('—');
  });
});

describe('最後修改時間', () => {
  it('有變動的模擬考才蓋章，其他不動', () => {
    let d = withExam('gsat', 'A');
    const b = newExam(d, 'gsat', 'B', t0);
    if (!b.ok) throw new Error(b.error);
    d = { ...b.doc, exams: b.doc.exams.map((e, i) => ({ ...e, id: `x${i}` })) };
    const later = new Date('2026-11-08T00:00:00Z');
    const next: Doc = { ...d, exams: [{ ...d.exams[0]!, name: 'A2' }, d.exams[1]!] };
    const r = stampModified(d, next, later);
    expect(r.exams[0]!.updatedAt).toBe(later.toISOString());
    expect(r.exams[1]).toBe(d.exams[1]);
  });
  it('只動考試底下的檔案（名單）也算修改', () => {
    const d = withExam('gsat', 'A');
    const id = d.exams[0]!.id;
    const later = new Date('2026-11-08T00:00:00Z');
    const r = stampModified(d, { ...d, examFiles: { [id]: { entries: [] } } }, later);
    expect(r.exams[0]!.updatedAt).toBe(later.toISOString());
  });
  it('沒變就回同一份', () => {
    const d = withExam('gsat', 'A');
    expect(stampModified(d, d, new Date())).toBe(d);
  });
});

describe('新增：建議名稱、學年、沿用', () => {
  it('建議名稱依同類型次數；被用掉就往後', () => {
    expect(suggestExamName(demoDoc(), 'gsat')).toBe('學測第一次');
    expect(suggestExamName(demoDoc(), 'bcct')).toBe('會考第一次');
    const d = withExam('gsat', '學測第一次');
    expect(suggestExamName(d, 'gsat')).toBe('學測第二次');
    const d2 = { ...d, exams: [{ ...d.exams[0]!, name: '學測第二次' }] };
    expect(suggestExamName(d2, 'gsat')).toBe('學測第三次');
  });
  it('學年度：8 月起算新學年', () => {
    expect(schoolYear(new Date(2026, 10, 8))).toBe(115);
    expect(schoolYear(new Date(2027, 1, 1))).toBe(115);
    expect(schoolYear(new Date(2027, 7, 1))).toBe(116);
  });
  it('學期寫入；沿用上一次的教室與標示規則，次別往後算', () => {
    const d = withExam('gsat', '學測第一次');
    const prev = { ...d.exams[0]!, classroomIds: ['r1'], participation: 'partial' as const };
    const d1 = { ...d, exams: [prev] };
    expect(previousExam(d1, 'gsat')).toBe(prev);
    expect(previousExam(d1, 'bcct')).toBeUndefined();
    const r = newExam(d1, 'gsat', '學測第二次', t0, { semester: 'second', prev });
    if (!r.ok) throw new Error(r.error);
    const e = r.doc.exams[1]!;
    expect(e.semester).toBe('second');
    expect(e.classroomIds).toEqual(['r1']);
    expect(e.participation).toBe('partial');
    expect(e.round).toBe(2);
    expect(e.classroomIds).not.toBe(prev.classroomIds);
  });
  it('不同類型的 prev 不沿用', () => {
    const d = withExam('gsat', 'A');
    const prev = { ...d.exams[0]!, classroomIds: ['r1'] };
    const r = newExam(d, 'bcct', 'B', t0, { prev });
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.exams[1]!.classroomIds).toEqual([]);
  });
});

describe('考試種類標示', () => {
  it('部別・種類', () => {
    expect(examLabel({ division: 'senior', kind: 'gsat' })).toBe('高中部・學測');
    expect(examLabel({ division: 'junior', kind: 'bcct' })).toBe('國中部・會考');
  });
});
