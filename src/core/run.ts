/**
 * 一次完成整套排座（給畫面層 C 與輸出層 D 用的單一入口）：
 * 主排座 → 標示 → 抽離分配 → 組成 SeatingResult（含資料版本碼）。任一步不合規則就擋下（D25）。
 */
import type { ClassInfo, Classroom, Division, ExamEntry, MarkRule, Override, SeatingResult, Subject, Track } from '../data/types';
import { studentCode } from '../data/helpers';
import { allocateDetaches, overrideWarnings, periodGroupKey, type ReserveMode, type SpecialPlacement } from './detach';
import type { SubjectPeriod } from './periods';
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
  /** 共用學生名單的姓名與考試名單不同者（輸出優先用共用名單，會改變文件內容）；空或不給＝無差異 */
  rosterNames?: readonly { code: string; name: string }[];
  /** 科目→節次（D94）；沒給＝每科各自一節 */
  periods?: ReadonlyMap<string, readonly SubjectPeriod[]>;
  /** 預備教室排座方式（D94-4）；沒給＝監考優先（以前的排法）。畫面預設傳同學優先 */
  reserveMode?: ReserveMode;
  /** 產生時間（ISO 字串）；由呼叫端給，讓函式保持純粹 */
  now: string;
}

export type RunSeatingResult =
  | { ok: true; result: SeatingResult; special: SpecialPlacement[]; warnings: string[]; /** D79：未排座的全科缺考者編號 */ fullyAbsent: string[] }
  | { ok: false; errors: string[] };

/** 資料版本碼的輸入：只含影響排座結果的資料（不含產生時間） */
export function seatingVersion(input: RunSeatingInput): string {
  const { examId, division, classes, entries, subjects, markRules, overrides } = input;
  // 教室的「部別」（校-33）只決定步驟③列哪些教室，不影響排座；不放進版本碼，否則舊存檔讀檔補上部別後，所有排座結果都會變「過期」
  const classrooms = input.classrooms.map(({ division: _d, ...rest }) => rest);
  // 只在開啟時才放進版本碼，避免舊存檔的版本碼全部變成「過期」
  return dataVersion({ examId, division, classes, classrooms, entries, subjects, markRules, overrides, ...(input.seatFullyAbsent ? { seatFullyAbsent: true } : {}), ...(input.rosterNames?.length ? { rosterNames: input.rosterNames } : {}), ...versionExtras(input) });
}

/**
 * 節次與預備教室排座方式放進版本碼的部分：只在與以前不同時才放，舊存檔的版本碼不變——
 * 節次分組只有「有兩科同節」才放；排座方式只有選「監考優先」才放（同學優先的結果與舊結果一樣都合規則）。
 */
function versionExtras(input: RunSeatingInput): Record<string, unknown> {
  const groups = periodGroupKey(input.subjects, input.periods);
  return { ...(groups ? { periodGroups: groups } : {}), ...(input.reserveMode === 'proctor' ? { reserveMode: 'proctor' } : {}) };
}

/** D79：全科缺考者（無任何考科）的編號；設「仍排座」時為空（＝都要排） */
export const fullyAbsentCodes = (input: { entries: readonly { classNo: number; seatNo: number; subjectIds: string[] }[]; seatFullyAbsent?: boolean }): string[] =>
  input.seatFullyAbsent ? [] : input.entries.filter((e) => e.subjectIds.length === 0).map((e) => studentCode(e.classNo, e.seatNo));

/** 逐人指定的文理組（分科）；沒有任何人指定就回 undefined，行為與以前完全相同 */
export function entryTracks(entries: readonly ExamEntry[]): Map<string, Track> | undefined {
  const m = new Map<string, Track>();
  for (const e of entries) if (e.track) m.set(studentCode(e.classNo, e.seatNo), e.track);
  return m.size ? m : undefined;
}

export function runSeating(input: RunSeatingInput): RunSeatingResult {
  const fullyAbsent = fullyAbsentCodes(input);
  const absentSet = new Set(fullyAbsent);
  const seatable = input.entries.filter((e) => !absentSet.has(studentCode(e.classNo, e.seatNo)));
  const codes = seatable.map((e) => studentCode(e.classNo, e.seatNo));
  const seated = seatExam({ division: input.division, classes: input.classes, classrooms: input.classrooms, codes, ...(entryTracks(seatable) ? { trackOf: entryTracks(seatable)! } : {}) });
  if (!seated.ok) return { ok: false, errors: seated.errors };

  const marks = applyMarks(seatable, input.classes, input.subjects, input.markRules);
  const detached = allocateDetaches({
    subjects: input.subjects,
    marks,
    overrides: input.overrides,
    reserveRooms: input.classrooms.filter((c) => c.kind === 'reserve'),
    classes: input.classes,
    ...(input.periods ? { periods: input.periods } : {}),
    ...(input.reserveMode ? { mode: input.reserveMode } : {}),
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
    warnings: [...overrideWarnings(input.overrides, codes), ...(detached.warnings ?? [])],
    fullyAbsent,
  };
}
