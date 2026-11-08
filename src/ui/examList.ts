/** 模擬考列表的純邏輯：六格進度、「N／M 步完成・進行中：…」、學年與人數、排序。畫面只負責畫。 */
import type { ExamConfig } from '../data';
import { flowOf } from './flow';
import { STEP_NAMES } from './nav';
import { examEntries, needsMarks, type StepNo } from './seating';
import { lastModified, type Doc } from './store';

/** d 完成／s 過期／c 目前／n 不需要／空字串 未開始（與原型 .dots 的 class 一致） */
export type Cell = 'd' | 's' | 'c' | 'n' | '';

export interface ExamProgress {
  cells: Cell[];
  done: number;
  total: number;
  /** 例：「3／6 步完成」 */
  headline: string;
  /** 例：「進行中：④ 標示與抽離規則」「⑤ 排座與預覽已過期」「已匯出」 */
  detail: string;
  tone: 'amb' | 'mut';
  status: 'done' | 'stale' | 'doing';
}

const NO = '①②③④⑤⑥';
const stepLabel = (i: number): string => `${NO[i]} ${STEP_NAMES[i]}`;

export function examProgress(doc: Doc, exam: ExamConfig): ExamProgress {
  // 傳 0：不把任何一步當成「目前正在看」，拿到純粹的完成狀態
  const flow = flowOf(doc, exam, 0 as unknown as StepNo);
  const skip4 = !needsMarks(exam);
  const cells: Cell[] = flow.steps.map((s, i) => (i === 3 && skip4 ? 'n' : s.state === 'done' ? 'd' : s.state === 'stale' ? 's' : ''));
  const stale = cells.indexOf('s');
  const cur = stale > -1 ? -1 : cells.findIndex((c) => c === '');
  if (cur > -1) cells[cur] = 'c';
  const done = cells.filter((c) => c === 'd').length;
  const total = cells.filter((c) => c !== 'n').length;
  const all = done === total;
  const detail = stale > -1 ? `${stepLabel(stale)}已過期` : cur > -1 ? `進行中：${stepLabel(cur)}` : '已完成';
  return {
    cells, done, total, headline: `${done}／${total} 步完成`, detail,
    tone: stale > -1 ? 'amb' : 'mut', status: stale > -1 ? 'stale' : all ? 'done' : 'doing',
  };
}

/** 人數：已匯入考試名單就用名單，否則先用該部別學生名單的人數 */
export function examHeadcount(doc: Doc, exam: ExamConfig): number {
  const n = examEntries(doc, exam).length;
  return n > 0 ? n : doc.rosters[exam.division].length;
}

export const examLevel = (exam: ExamConfig): string => (exam.division === 'senior' ? '高三' : '國三');

/** 依最後修改由新到舊 */
export const sortExams = (exams: ExamConfig[]): ExamConfig[] => [...exams].sort((a, b) => lastModified(b).localeCompare(lastModified(a)));

/** 「2026-11-08 15:30」台北時間 */
export function formatModified(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return p;
}
