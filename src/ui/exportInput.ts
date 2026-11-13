/**
 * ⑥ 匯出頁的資料轉接：從 Doc 與考試設定組出輸出層要的 ExportInput。
 * 考試名單與覆寫取自 Doc.examFiles（② 匯入）。排座結果直接用 ⑤ 已存的 result，
 * 不在匯出時重算：⑤ 驗證的、⑥ 預覽的、實際匯出的永遠是同一份（同座位、同版本碼、同產生時間）。
 * 沒有結果或已過期（名單或設定在排座後改過）就擋下，請回 ⑤ 重新排座。
 */
import { examResult, isStale, validationChecks } from './seating';
import type { ExamConfig, ExamEntry, Override } from '../data';
import type { ExportInput } from '../export';
import type { preflight } from '../export/plan';
import type { Doc } from './store';
import { fillHeader, headerTemplates } from './header';

/** 該次考試的考試名單（②匯入）；沒匯入時為 null */
export const entriesOf = (doc: Doc, exam: ExamConfig): ExamEntry[] | null => doc.examFiles?.[exam.id]?.entries ?? null;

export const overridesOf = (doc: Doc, exam: ExamConfig): Override[] => doc.examFiles?.[exam.id]?.overrides ?? [];

/** ② 尚未處理的名單差異數 */
export const unresolvedDiffsOf = (doc: Doc, exam: ExamConfig): number => doc.examFiles?.[exam.id]?.diffs?.length ?? 0;

export type Prepared =
  | { ok: true; input: ExportInput; warnings: string[] }
  | { ok: false; errors: string[] };

/** 組輸入並排座；缺教室、缺學生或排座被擋時回 errors（中文，只含考生編號） */
export function prepareExport(doc: Doc, exam: ExamConfig): Prepared {
  const students = doc.rosters[exam.division];
  if (students.length === 0) return { ok: false, errors: ['缺學生名單：請先到「共用設定 → 學生名單」匯入或新增學生，再回來下載。'] };
  const rooms = exam.classroomIds
    .map((id) => doc.settings.classrooms.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (rooms.length === 0) return { ok: false, errors: ['缺教室：這次考試還沒勾選教室，請先到 ③ 教室設定勾選要用的教室，再回來下載。'] };
  const entries = entriesOf(doc, exam);
  if (!entries || entries.length === 0) return { ok: false, errors: ['缺考試名單：請先到 ② 考試名單匯入大考中心的考生資料 Excel，再回來下載。'] };
  const result = examResult(doc, exam);
  if (!result) return { ok: false, errors: ['缺排座結果：請先到 ⑤ 排座並完成驗證，再回來下載。'] };
  if (isStale(doc, exam)) return { ok: false, errors: ['排座已過期：名單或設定在排座之後改過，請先到 ⑤ 重新排座，再回來下載。'] };
  // 最後輸出邊界再驗一次（與 ⑤ 同一份驗證）：存得下結果不代表驗證通過
  const failed = validationChecks(doc, exam, result).filter((c) => !c.ok);
  if (failed.length) return { ok: false, errors: [`排座驗證未通過：${failed.map((c) => `${c.title}（${c.detail}）`).join('；')}。請先到 ⑤ 處理並重新排座，再回來下載。`] };
  const tpl = headerTemplates(doc.settings);
  return { ok: true, warnings: [], input: { settings: doc.settings, exam, students, entries, result, seatHeading: fillHeader(tpl.seat, exam), labelHeading: fillHeader(tpl.label, exam) } };
}


/**
 * 「至少選一項」：核心項目（座位表、標籤、抽離）全不選、但有勾選用文件時，算有選，不再擋「還沒勾選」。
 * 畫面的按鈕狀態與按下去的檢查都要用這同一條，避免按鈕可按卻無聲沒輸出（#65）。
 */
export const relevantIssues = (list: ReturnType<typeof preflight>, mainNone: boolean, extrasChosen: number): ReturnType<typeof preflight> =>
  list.filter((i) => !(mainNone && extrasChosen > 0 && i.text.startsWith('還沒勾選')));
