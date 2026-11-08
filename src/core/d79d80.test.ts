/** D79（全科缺考者不排座）與 D80（單人特例 purpose 以手動設定為準）的回歸測試 */
import { describe, expect, it } from 'vitest';
import { roomStats, runSeating, seatingVersion, specialOf, type RunSeatingInput } from '../core';

const base = (): RunSeatingInput => ({
  examId: 'E',
  division: 'junior',
  classes: [{ no: 1, name: 'A', division: 'junior', colorIndex: 0 }],
  classrooms: [
    { id: 'R', name: 'R', kind: 'class', rows: 1, depth: 5, seatCount: 5 },
    { id: 'P', name: 'P', kind: 'reserve', rows: 1, depth: 3, seatCount: 3 },
  ],
  entries: [
    { classNo: 1, seatNo: 1, name: '甲生0101', subjectIds: ['x'] },
    { classNo: 1, seatNo: 2, name: '甲生0102', subjectIds: [] }, // 全科缺考
    { classNo: 1, seatNo: 3, name: '甲生0103', subjectIds: ['x'] },
  ],
  subjects: [{ id: 'x', name: '自然' }],
  markRules: [],
  overrides: [],
  now: '2026-11-08T08:00:00Z',
});

describe('D79 全科缺考者不排座', () => {
  it('預設不排座、不佔座位，並列入 fullyAbsent', () => {
    const r = runSeating(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.assignments.map((a) => a.code)).toEqual(['0101', '0103']);
    expect(r.fullyAbsent).toEqual(['0102']);
  });
  it('seatFullyAbsent: true 時仍排座', () => {
    const r = runSeating({ ...base(), seatFullyAbsent: true });
    expect(r.ok && r.result.assignments.map((a) => a.code)).toEqual(['0101', '0102', '0103']);
    expect(r.ok && r.fullyAbsent).toEqual([]);
  });
  it('座位只夠實際參加者時不再報座位不足', () => {
    const i = base();
    i.classrooms[0]!.seatCount = 2;
    expect(runSeating(i).ok).toBe(true);
    expect(runSeating({ ...i, seatFullyAbsent: true }).ok).toBe(false);
  });
  it('切換選項會改變資料版本碼（過期偵測），沒開時版本碼與舊版相同形式', () => {
    expect(seatingVersion({ ...base(), seatFullyAbsent: true })).not.toBe(seatingVersion(base()));
    expect(seatingVersion({ ...base(), seatFullyAbsent: false })).toBe(seatingVersion(base()));
  });
});

describe('D80 單人特例 purpose 以手動設定為準', () => {
  const withMark = (purpose: 'exam' | 'study'): RunSeatingInput => ({
    ...base(),
    entries: [{ classNo: 1, seatNo: 1, name: '甲生0101', subjectIds: ['x'] }],
    // 標「加考」→ 標示方向是 exam
    markRules: [{ subjectId: 'x', mode: 'mark-extra' }],
    overrides: [{ kind: 'single', code: '0101', location: '教務處', purpose }],
  });
  it('override 說自習、標示方向是加考 → 特例歸類為自習', () => {
    const r = runSeating(withMark('study'));
    expect(r.ok && r.special).toEqual([{ code: '0101', subjectId: 'x', purpose: 'study', location: '教務處' }]);
  });
  it('override 說考試 → 特例歸類為考試', () => {
    const r = runSeating(withMark('exam'));
    expect(r.ok && r.special[0]?.purpose).toBe('exam');
  });
  it('specialOf（存檔還原）與 runSeating 一致', () => {
    for (const p of ['exam', 'study'] as const) {
      const r = runSeating(withMark(p));
      if (!r.ok) throw new Error('x');
      expect(specialOf(r.result)).toEqual(r.special);
    }
  });
  it('統計：自習特例不算「到他處考試」，考試特例才扣本教室人數', () => {
    for (const [p, inRoom] of [['exam', 0], ['study', 1]] as const) {
      const i = withMark(p);
      const r = runSeating(i);
      if (!r.ok) throw new Error('x');
      const s = roomStats('R', r.result.assignments, i.entries, i.subjects, r.result.detaches, specialOf(r.result));
      expect(s.perSubject[0]!.inRoom).toBe(inRoom);
    }
  });
});
