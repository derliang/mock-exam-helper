/** ② 考試名單的純邏輯：匯入結果 → 該次考試的考試名單；從活頁簿挑出最像名單的工作表 */
import type { ExamConfig, ExamEntry, Student } from '../data';
import { parseExamList, parseRoster, type ExamListResult, type RosterResult, type Sheet } from '../import';

/** 解析器的科目代碼 → 考科表的科目 id（見 subjects.ts） */
export const SUBJECT_ID_MAP: Record<string, string> = {
  chi: 'chinese', eng: 'english', math: 'math', mathA: 'math-a', mathB: 'math-b', sci: 'science', soc: 'social',
};

export interface ExamImport extends ExamListResult {
  /** 有幾位學生因科目不在本次考科表而被略過科目 */
  droppedSubjects: number;
}

export function parseExamWorkbook(sheets: readonly Sheet[], exam: ExamConfig, classNames: readonly string[]): ExamImport {
  const bcct = exam.kind === 'bcct';
  let best: ExamListResult | null = null;
  for (const s of sheets) {
    const r = parseExamList(s.rows, { round: exam.round, classNames, ...(bcct ? { defaultSubjectIds: exam.subjects.map((x) => x.id) } : {}) });
    if (!best || r.entries.length > best.entries.length) best = r;
  }
  const res = best ?? { entries: [], issues: [{ row: 0, message: '檔案裡沒有工作表' }], columns: {}, headers: {} };
  const ids = new Set(exam.subjects.map((x) => x.id));
  let dropped = 0;
  const entries: ExamEntry[] = res.entries.map((e) => {
    const mapped = e.subjectIds.map((x) => (bcct ? x : (SUBJECT_ID_MAP[x] ?? x)));
    const kept = mapped.filter((x) => ids.has(x));
    if (kept.length !== mapped.length) dropped++;
    return { ...e, subjectIds: kept };
  });
  return { ...res, entries, droppedSubjects: dropped };
}

/** 學生名單：多張工作表時取人數最多者 */
export function parseRosterWorkbook(sheets: readonly Sheet[], classNames: readonly string[]): RosterResult {
  let best: RosterResult | null = null;
  for (const s of sheets) {
    const r = parseRoster(s.rows, { classNames });
    if (!best || r.students.length > best.students.length) best = r;
  }
  return best ?? { students: [], issues: [{ row: 0, message: '檔案裡沒有工作表' }], layout: 'unknown' };
}

export const FIELD_LABEL: Record<string, string> = {
  classNo: '班級', seatNo: '座號', name: '姓名', group: '組別', schoolId: '學號', note: '特殊生需求註明', extra: '加考', school: '校代碼', grade: '年級',
};

export const rosterOf = (students: readonly Student[]): number => students.length;
