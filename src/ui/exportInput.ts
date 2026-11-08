/**
 * ⑥ 匯出頁的資料轉接：從 Doc 與考試設定組出輸出層要的 ExportInput。
 * 考試名單與覆寫取自 Doc.examFiles（② 匯入）。⑤ 排座頁（施工B）尚未併入，
 * 所以排座仍在匯出頁即時用 runSeating 算；⑤ 併入後改用已存的 result 與過期判斷，Step6 不用動。
 */
import { runSeating } from '../core';
import type { ExamConfig, ExamEntry, Override } from '../data';
import type { ExportInput } from '../export';
import type { Doc } from './store';

/** 該次考試的考試名單（②匯入）；沒匯入時為 null */
export const entriesOf = (doc: Doc, exam: ExamConfig): ExamEntry[] | null => doc.examFiles?.[exam.id]?.entries ?? null;

export const overridesOf = (doc: Doc, exam: ExamConfig): Override[] => doc.examFiles?.[exam.id]?.overrides ?? [];

/** ② 尚未處理的名單差異數 */
export const unresolvedDiffsOf = (doc: Doc, exam: ExamConfig): number => doc.examFiles?.[exam.id]?.diffs?.length ?? 0;

export type Prepared =
  | { ok: true; input: ExportInput; warnings: string[] }
  | { ok: false; errors: string[] };

/** 組輸入並排座；缺教室、缺學生或排座被擋時回 errors（中文，只含考生編號） */
export function prepareExport(doc: Doc, exam: ExamConfig, now: string): Prepared {
  const students = doc.rosters[exam.division];
  if (students.length === 0) return { ok: false, errors: ['缺學生名單：請先到「設定 → 學生名單」匯入或新增學生，再回來匯出。'] };
  const rooms = exam.classroomIds
    .map((id) => doc.settings.classrooms.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (rooms.length === 0) return { ok: false, errors: ['缺教室：這次考試還沒勾選教室，請先到 ③ 教室設定勾選要用的教室，再回來匯出。'] };
  const entries = entriesOf(doc, exam);
  if (!entries || entries.length === 0) return { ok: false, errors: ['缺考試名單：請先到 ② 考試名單匯入大考中心的考生資料 Excel，再回來匯出。'] };
  const r = runSeating({
    examId: exam.id,
    division: exam.division,
    classes: doc.settings.classes.filter((c) => c.division === exam.division),
    classrooms: rooms,
    entries,
    subjects: exam.subjects,
    markRules: exam.markRules,
    overrides: overridesOf(doc, exam),
    ...(exam.seatFullyAbsent ? { seatFullyAbsent: true } : {}),
    now,
  });
  if (!r.ok) return { ok: false, errors: r.errors };
  return {
    ok: true,
    warnings: r.warnings,
    input: { settings: doc.settings, exam, students, entries, result: r.result },
  };
}

