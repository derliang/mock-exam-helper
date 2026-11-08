/**
 * ⑥ 匯出頁的資料轉接：從 Doc 與考試設定組出輸出層要的 ExportInput。
 * 目前 Doc 還沒有「考試名單」與「已存排座結果」（② 由施工A、⑤ 由施工B 實作中），
 * 所以暫時：考試名單＝該部別全部學生、全部科目都考；排座在匯出頁即時用 runSeating 算。
 * ②、⑤ 併入後，只要改這個檔的 entriesOf／overridesOf（及改用已存結果），Step6 不用動。
 */
import { runSeating } from '../core';
import type { ExamConfig, ExamEntry, Override } from '../data';
import type { ExportInput } from '../export';
import type { Doc } from './store';

export function entriesOf(doc: Doc, exam: ExamConfig): ExamEntry[] {
  return doc.rosters[exam.division].map((s) => ({
    classNo: s.classNo,
    seatNo: s.seatNo,
    name: s.name,
    subjectIds: exam.subjects.map((x) => x.id),
  }));
}

export const overridesOf = (_doc: Doc, _exam: ExamConfig): Override[] => [];

export type Prepared =
  | { ok: true; input: ExportInput; warnings: string[] }
  | { ok: false; errors: string[] };

/** 組輸入並排座；缺教室、缺學生或排座被擋時回 errors（中文，只含考生編號） */
export function prepareExport(doc: Doc, exam: ExamConfig, now: string): Prepared {
  const students = doc.rosters[exam.division];
  if (students.length === 0) return { ok: false, errors: ['學生名單是空的，請先到設定頁匯入或新增學生。'] };
  const rooms = exam.classroomIds
    .map((id) => doc.settings.classrooms.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (rooms.length === 0) return { ok: false, errors: ['這次考試還沒勾選教室，請先到 ③ 教室設定。'] };
  const entries = entriesOf(doc, exam);
  const r = runSeating({
    examId: exam.id,
    division: exam.division,
    classes: doc.settings.classes.filter((c) => c.division === exam.division),
    classrooms: rooms,
    entries,
    subjects: exam.subjects,
    markRules: exam.markRules,
    overrides: overridesOf(doc, exam),
    now,
  });
  if (!r.ok) return { ok: false, errors: r.errors };
  return {
    ok: true,
    warnings: r.warnings,
    input: { settings: doc.settings, exam, students, entries, result: r.result },
  };
}

