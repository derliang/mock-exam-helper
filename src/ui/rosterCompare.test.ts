import { describe, expect, it } from 'vitest';
import type { ExamEntry, RosterDiff, Student } from '../data';
import { applyDiffs, compareRosters, diffsStale, refreshDiffs, validateResolved } from '../import';
import { emptyDoc, withDefaults } from './repository';
import { applyImport, importOutcome, planImport } from './rosterIO';
import { newExam, nextRound, suggestExamName, syncDiffs, updateExam, type Doc } from './store';

const S = (classNo: number, seatNo: number, name: string, extra: Partial<Student> = {}): Student => ({ classNo, seatNo, name, ...extra });
const E = (classNo: number, seatNo: number, name: string): ExamEntry => ({ classNo, seatNo, name, subjectIds: ['chinese'] });
const nos = new Set([1, 2]);

describe('#59 套用差異保留學號／類組／特殊註記', () => {
  const rich = S(1, 1, '甲', { schoolId: '11500001', groupCode: 'D', special: '延長' });
  it('同座號改名（以考試名單為準）', () => {
    const entries = [E(1, 1, '甲乙')];
    const diffs = compareRosters([rich], entries, 'all').diffs.map((d) => ({ ...d, choice: 'use-exam' as const }));
    const r = applyDiffs([rich], entries, diffs);
    expect(r.students).toEqual([{ ...rich, name: '甲乙' }]);
  });
  it('跨班換號（同名一人）保留附加欄位', () => {
    const entries = [E(2, 5, '甲')];
    const diffs = compareRosters([rich], entries, 'all').diffs.map((d) => ({ ...d, choice: 'use-exam' as const }));
    expect(applyDiffs([rich], entries, diffs).students[0]).toMatchObject({ classNo: 2, seatNo: 5, schoolId: '11500001', groupCode: 'D', special: '延長' });
  });
  it('手動修改保留；原本無 Student 的新增不憑空產生欄位', () => {
    const entries = [E(1, 1, '甲乙'), E(1, 3, '新')];
    const diffs = compareRosters([rich], entries, 'all').diffs.map((d): RosterDiff =>
      d.code === '0101' ? { ...d, choice: 'manual', edited: { classNo: 1, seatNo: 7, name: '甲丙' } } : { ...d, choice: 'use-exam' });
    const r = applyDiffs([rich], entries, diffs);
    expect(r.students.find((s) => s.seatNo === 7)).toMatchObject({ schoolId: '11500001', groupCode: 'D', special: '延長' });
    expect(r.students.find((s) => s.seatNo === 3)).toEqual({ classNo: 1, seatNo: 3, name: '新' });
  });
  it('重載（JSON 往返）後學號仍在', () => {
    const entries = [E(1, 1, '甲乙')];
    const diffs = compareRosters([rich], entries, 'all').diffs.map((d) => ({ ...d, choice: 'use-exam' as const }));
    const back = JSON.parse(JSON.stringify(applyDiffs([rich], entries, diffs).students)) as Student[];
    expect(back[0]?.schoolId).toBe('11500001');
  });
});

describe('#67 套用前驗證整份名單', () => {
  const r = (students: Student[], entries: ExamEntry[] = []) => validateResolved({ students, entries }, nos);
  it('合法通過', () => expect(r([S(1, 1, '甲'), S(1, 2, '乙')], [E(1, 1, '甲')])).toBeNull());
  it('兩人改成同座號：指出兩人', () => {
    const m = r([S(1, 2, '李'), S(1, 2, '王')]);
    expect(m).toContain('李'); expect(m).toContain('王'); expect(m).toContain('重複');
  });
  it('座號超出 1–99、未知班級、姓名空白、考試名單重複', () => {
    expect(r([S(1, 100, '甲')])).toContain('1～99');
    expect(r([S(1, 0, '甲')])).toContain('1～99');
    expect(r([S(9, 1, '甲')])).toContain('班級不存在');
    expect(r([S(1, 1, ' ')])).toContain('姓名');
    expect(r([], [E(1, 1, 'a'), E(1, 1, 'b')])).toContain('考試名單');
  });
  it('手動改成已存在學生的座號會被擋下', () => {
    const roster = [S(1, 1, '王'), S(1, 2, '李')];
    const entries = [E(1, 1, '王小')];
    const diffs: RosterDiff[] = compareRosters(roster, entries, 'partial').diffs.map((d) => ({ ...d, choice: 'manual' as const, edited: { classNo: 1, seatNo: 2, name: '王小' } }));
    expect(validateResolved(applyDiffs(roster, entries, diffs), nos)).toContain('0102');
  });
});

describe('#60 差異依輸入重算', () => {
  const roster = [S(1, 1, '甲'), S(1, 2, '乙')];
  const entries = [E(1, 1, '甲')];
  it('全員 ↔ 部分雙向切換，差異筆數正確', () => {
    const partial = refreshDiffs(roster, entries, 'partial', []);
    expect(partial).toHaveLength(0);
    const all = refreshDiffs(roster, entries, 'all', partial);
    expect(all.map((d) => d.kind)).toEqual(['only-in-roster']);
    expect(diffsStale(partial, all)).toBe(true);
    expect(refreshDiffs(roster, entries, 'partial', all)).toHaveLength(0);
  });
  it('相符的舊選擇保留，不同考生不沿用', () => {
    const all = refreshDiffs(roster, entries, 'all', []).map((d) => ({ ...d, choice: 'use-exam' as const }));
    const same = refreshDiffs(roster, entries, 'all', all);
    expect(same[0]?.choice).toBe('use-exam');
    const other = refreshDiffs([S(1, 1, '甲'), S(1, 2, '丙')], entries, 'all', all);
    expect(other[0]?.choice).toBeUndefined();
  });
  const doc = (participation: 'all' | 'partial'): Doc => {
    let d = withDefaults(emptyDoc());
    const r = newExam(d, 'gsat', '考', new Date(2026, 10, 8), { semester: 'first' });
    if (!r.ok) throw new Error(r.error);
    d = r.doc;
    const id = d.exams[0]!.id;
    d = { ...d, rosters: { ...d.rosters, senior: roster }, examFiles: { [id]: { entries, diffs: [] } } };
    const u = updateExam(d, id, { participation });
    if (!u.ok) throw new Error(u.error);
    return u.doc;
  };
  it('syncDiffs：改參加方式、新增／刪除／改名共用學生後差異跟著變', () => {
    const d = doc('partial');
    const id = d.exams[0]!.id;
    expect(syncDiffs(d)).toBe(d); // 沒變動就是同一份
    const all = syncDiffs({ ...d, exams: [{ ...d.exams[0]!, participation: 'all' }] });
    expect(all.examFiles![id]!.diffs).toHaveLength(1);
    const added = syncDiffs({ ...all, rosters: { ...all.rosters, senior: [...roster, S(1, 3, '丁')] } });
    expect(added.examFiles![id]!.diffs).toHaveLength(2);
    const removed = syncDiffs({ ...added, rosters: { ...added.rosters, senior: [roster[0]!] } });
    expect(removed.examFiles![id]!.diffs).toHaveLength(0);
    const renamed = syncDiffs({ ...removed, rosters: { ...removed.rosters, senior: [S(1, 1, '甲改')] } });
    expect(renamed.examFiles![id]!.diffs!.map((x) => x.kind)).toEqual(['mismatch']);
  });
});

describe('#71 匯入確認人數依最終選擇', () => {
  it('略過未知班級：實際人數少於讀到人數；全略過為 0', () => {
    const d: Doc = withDefaults(emptyDoc());
    const known = d.settings.classes.find((c) => c.division === 'senior')!.no;
    const students = [S(known, 1, '甲'), S(99, 1, '乙'), S(99, 2, '丙')];
    const plan = planImport(d, 'senior', students);
    expect(plan.after).toBe(3);
    expect(importOutcome(d, 'senior', plan, 'skip')).toEqual({ count: 1, skipped: 2 });
    expect(importOutcome(d, 'senior', plan, 'add').count).toBe(3);
    const onlyUnknown = planImport(d, 'senior', [S(99, 1, '乙')]);
    expect(importOutcome(d, 'senior', onlyUnknown, 'skip').count).toBe(0);
    expect(applyImport(d, 'senior', onlyUnknown, 'skip').rosters.senior).toHaveLength(0);
  });
});

describe('#68 學測次別依學年度與學期推算', () => {
  it('新學年從第 1 次重新開始，不因歷史筆數超出', () => {
    let d: Doc = withDefaults(emptyDoc());
    for (let i = 1; i <= 5; i++) {
      const r = newExam(d, 'gsat', i === 1 ? '學測第一次' : `舊${i}`, new Date(2026, 8, i), { semester: 'first' });
      if (!r.ok) throw new Error(r.error);
      d = r.doc;
    }
    expect(d.exams.map((e) => e.round)).toEqual([1, 2, 3, 4, 5]);
    const next = newExam(d, 'gsat', '新學年', new Date(2027, 8, 1), { semester: 'first' });
    expect(next.ok && next.doc.exams.at(-1)?.round).toBe(1);
    expect(nextRound(d, 'gsat', new Date(2027, 1, 1))).toBe(6);
    expect(suggestExamName(d, 'gsat', new Date(2027, 8, 1))).toBe('116學年度學測第一次');
  });
  it('使用者指定次別優先；非正整數拒絕', () => {
    const d: Doc = withDefaults(emptyDoc());
    const r = newExam(d, 'gsat', 'x', new Date(2026, 8, 1), { round: 3 });
    expect(r.ok && r.doc.exams[0]!.round).toBe(3);
    expect(newExam(d, 'gsat', 'y', new Date(2026, 8, 1), { round: 0 }).ok).toBe(false);
  });
});
