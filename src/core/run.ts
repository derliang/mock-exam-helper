/**
 * 一次完成整套排座（給畫面層 C 與輸出層 D 用的單一入口）：
 * 主排座 → 標示 → 抽離分配 → 組成 SeatingResult（含資料版本碼）。任一步不合規則就擋下（D25）。
 */
import type { ClassInfo, Classroom, Division, ExamEntry, MarkRule, Override, SeatingResult, Subject } from '../data/types';
import { studentCode } from '../data/helpers';
import { allocateDetaches, overrideWarnings, type SpecialPlacement } from './detach';
import { seatExam } from './exam';
import { applyMarks } from './marks';
import { dataVersion } from './version';

export interface RunSeatingInput {
  examId: string;
  division: Division;
  classes: readonly ClassInfo[];
  /** 本次勾選的教室，依清單順序；班級教室用於主排座，預備教室用於抽離（D6/D27） */
  classrooms: readonly Classroom[];
  entries: readonly ExamEntry[];
  subjects: readonly Subject[];
  markRules: readonly MarkRule[];
  overrides: readonly Override[];
  /** D79：全科缺考者（無任何考科）預設不排座、不計份數；設 true 才照排 */
  seatFullyAbsent?: boolean;
  /** 產生時間（ISO 字串）；由呼叫端給，讓函式保持純粹 */
  now: string;
}

export type RunSeatingResult =
  | { ok: true; result: SeatingResult; special: SpecialPlacement[]; warnings: string[]; /** D79：未排座的全科缺考者編號 */ fullyAbsent: string[] }
  | { ok: false; errors: string[] };

/** 資料版本碼的輸入：只含影響排座結果的資料（不含產生時間） */
export function seatingVersion(input: RunSeatingInput): string {
  const { examId, division, classes, classrooms, entries, subjects, markRules, overrides } = input;
  // 只在開啟時才放進版本碼，避免舊存檔的版本碼全部變成「過期」
  return dataVersion({ examId, division, classes, classrooms, entries, subjects, markRules, overrides, ...(input.seatFullyAbsent ? { seatFullyAbsent: true } : {}) });
}

/** D79：全科缺考者（無任何考科）的編號；設「仍排座」時為空（＝都要排） */
export const fullyAbsentCodes = (input: { entries: readonly { classNo: number; seatNo: number; subjectIds: string[] }[]; seatFullyAbsent?: boolean }): string[] =>
  input.seatFullyAbsent ? [] : input.entries.filter((e) => e.subjectIds.length === 0).map((e) => studentCode(e.classNo, e.seatNo));

export function runSeating(input: RunSeatingInput): RunSeatingResult {
  const fullyAbsent = fullyAbsentCodes(input);
  const absentSet = new Set(fullyAbsent);
  const seatable = input.entries.filter((e) => !absentSet.has(studentCode(e.classNo, e.seatNo)));
  const codes = seatable.map((e) => studentCode(e.classNo, e.seatNo));
  const seated = seatExam({ division: input.division, classes: input.classes, classrooms: input.classrooms, codes });
  if (!seated.ok) return { ok: false, errors: seated.errors };

  const marks = applyMarks(seatable, input.classes, input.subjects, input.markRules);
  const detached = allocateDetaches({
    subjects: input.subjects,
    marks,
    overrides: input.overrides,
    reserveRooms: input.classrooms.filter((c) => c.kind === 'reserve'),
    classes: input.classes,
  });
  if (!detached.ok) return { ok: false, errors: detached.errors };

  return {
    ok: true,
    result: {
      examId: input.examId,
      generatedAt: input.now,
      dataVersion: seatingVersion(input),
      assignments: seated.assignments,
      marks,
      detaches: detached.detaches,
      overrides: [...input.overrides],
    },
    special: detached.special,
    warnings: overrideWarnings(input.overrides, codes),
    fullyAbsent,
  };
}
