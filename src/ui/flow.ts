/**
 * 全站引路的純邏輯（施工G）：六步驟的完成狀態、前置條件、常駐摘要、下一步、完工後「下一步」。
 * 不碰 DOM；元件只負責把這裡的結果畫出來。規則改這裡，測試在 flow.test.ts。
 */
import type { ExamConfig } from '../data';
import { checkSeats, roomsMissingTrack, seatTotals } from './rooms';
import { seatableEntries, examResult, examRooms, isStale, seatingBlockers, needsMarks, validationChecks, type StepNo } from './seating';
import { STEP_NAMES } from './nav';
import type { Doc } from './store';

import type { StepState } from './components';

export interface FlowIssue {
  /** 要去哪一步處理 */
  step: StepNo;
  text: string;
  /** 「前往」按鈕上的字，例：去 ② 匯入考試名單 */
  fix: string;
  /** block＝擋下後面的步驟；warn＝提醒 */
  level: 'block' | 'warn';
}

export interface FlowStep { no: StepNo; name: string; state: StepState; note?: string }

export interface FlowSummary {
  students: number;
  seats: number;
  /** 座位減考生；負數＝座位不夠 */
  spare: number;
  warnings: number;
}

export interface Flow {
  steps: FlowStep[];
  issues: FlowIssue[];
  summary: FlowSummary;
}

const STEPS: StepNo[] = [1, 2, 3, 4, 5, 6];

/** 算出目前考試的整體流程狀態；current 是正在看的步驟（顯示成「目前」） */
export function flowOf(doc: Doc, exam: ExamConfig, current: StepNo): Flow {
  const issues: FlowIssue[] = [];
  const add = (i: FlowIssue) => issues.push(i);

  const students = seatableEntries(doc, exam).length;
  const rooms = examRooms(doc, exam);
  const { classSeats } = seatTotals(rooms.filter((r) => r.kind === 'class'));
  const spare = classSeats - students;

  // ① 考試設定
  const s1 = exam.subjects.length > 0;
  if (!s1) add({ step: 1, text: '① 考科表是空的，沒有任何科目', fix: '去 ① 還原預設考科', level: 'block' });

  // ② 考試名單與比對（沿用排座的擋下條件，文字統一）
  const blockers = seatingBlockers(doc, exam);
  const b2 = blockers.filter((b) => b.step === 2);
  for (const b of b2) add({ step: 2, text: b.text, fix: b.text.includes('比對') ? '去 ② 處理比對' : '去 ② 匯入考試名單', level: 'block' });
  const s2 = students > 0 && b2.length === 0;

  // ③ 教室
  const classRooms = rooms.filter((r) => r.kind === 'class');
  if (classRooms.length === 0) add({ step: 3, text: '③ 還沒有選班級教室', fix: '去 ③ 勾選教室', level: 'block' });
  else if (students > 0 && checkSeats(classSeats, students).level === 'block') {
    add({ step: 3, text: `③ 座位 ${classSeats} 少於考生 ${students}，還差 ${students - classSeats} 個`, fix: '去 ③ 增加座位', level: 'block' });
  }
  const noTrack = roomsMissingTrack(classRooms, exam.division);
  if (noTrack.length) add({ step: 3, text: `③ 班級教室「${noTrack.map((r) => r.name).join('、')}」還沒指定理組／文組，排座時分不出誰坐哪間`, fix: '去 ③ 指定理組／文組', level: 'block' });
  const s3 = classRooms.length > 0 && spare >= 0 && noTrack.length === 0;

  // ④ 標示與抽離
  const b4 = blockers.filter((b) => b.step === 4);
  for (const b of b4) add({ step: 4, text: b.text, fix: '去 ④ 選標示', level: 'block' });
  const s4 = s2 && s3 && b4.length === 0; // 會考不需要這一步，needsMarks 為 false 時 b4 必為空

  // ⑤ 排座、過期、驗證
  const result = examResult(doc, exam);
  const stale = !!result && isStale(doc, exam);
  let s5: StepState = 'todo';
  if (!result) {
    add({ step: 5, text: '⑤ 還沒有排座結果', fix: '去 ⑤ 開始排座', level: 'block' });
  } else if (stale) {
    s5 = 'stale';
    add({ step: 5, text: '⑤ 名單或設定在排座後改過，需要重新排座', fix: '去 ⑤ 重新排座', level: 'block' });
  } else {
    const bad = validationChecks(doc, exam, result).filter((c) => !c.ok);
    if (bad.length) add({ step: 5, text: `⑤ 驗證有 ${bad.length} 項不通過：${bad.map((c) => c.title).join('、')}`, fix: '去 ⑤ 看驗證', level: 'block' });
    else s5 = 'done';
  }

  const done: Record<StepNo, StepState> = { 1: s1 ? 'done' : 'todo', 2: s2 ? 'done' : 'todo', 3: s3 ? 'done' : 'todo', 4: s4 ? 'done' : 'todo', 5: s5, 6: 'todo' };
  const steps: FlowStep[] = STEPS.map((no) => ({
    no,
    name: STEP_NAMES[no - 1]!,
    state: no === current ? 'cur' : no === 4 && !needsMarks(exam) ? 'skip' : done[no],
    ...(no === 4 && !needsMarks(exam) ? { note: '會考不需要' } : {}),
  }));
  return { steps, issues, summary: { students, seats: classSeats, spare, warnings: issues.length } };
}

/** 進入 target 之前，有哪些 block 問題在它前面（⑥ 之前還要 ⑤ 本身完成） */
export function prerequisites(flow: Flow, target: StepNo): FlowIssue[] {
  return flow.issues.filter((i) => i.level === 'block' && i.step < target);
}

/** 「下一步」：永遠可以按（D47：六步可隨意跳）；前面還有沒做完的事就在旁邊標示原因，不禁止 */
export type NextAction =
  | { kind: 'none' }
  | { kind: 'go'; to: StepNo; label: string; pending?: { reason: string; fix: string; fixStep: StepNo } };

/** 「下一步」按鈕：不擋人；前置有問題只標示缺什麼並給一鍵跳轉（擋下的只有 ⑤ 排座與 ⑥ 下載本身，D47） */
export function nextAction(flow: Flow, current: StepNo): NextAction {
  if (current >= 6) return { kind: 'none' };
  const to = (current + 1) as StepNo;
  const label = `下一步：${'①②③④⑤⑥'[to - 1]} ${STEP_NAMES[to - 1]}`;
  // 前面的步驟（含目前這步）還有 block 問題就標示；進 ⑥ 時 ⑤ 本身也要完成
  const need = prerequisites(flow, to);
  const first = need[0];
  if (first) {
    const more = need.length > 1 ? `（另有 ${need.length - 1} 項）` : '';
    return { kind: 'go', to, label, pending: { reason: `${first.text}${more}`, fix: first.fix, fixStep: first.step } };
  }
  return { kind: 'go', to, label };
}

/** 摘要列「待處理 X」點下去要去哪：第一個 block 問題的步驟，沒有就回 undefined */
export function firstIssueStep(flow: Flow): StepNo | undefined {
  return flow.issues[0]?.step;
}

/** 摘要列文字（常駐、不可關） */
export function summaryText(s: FlowSummary): { seatNote: string; bad: boolean } {
  if (s.spare < 0) return { seatNote: `缺 ${-s.spare}`, bad: true };
  return { seatNote: String(s.spare), bad: false };
}

// ───── 行內驗證 ─────

export interface FieldCheck { ok: boolean; message: string }

/** 新增模擬考的名稱：邊打邊檢查，說明原因與怎麼改 */
export function checkExamName(doc: Doc, name: string): FieldCheck {
  const n = name.trim();
  if (!n) return { ok: false, message: '請輸入名稱，例如「學測第三次」。' };
  if (n.length > 30) return { ok: false, message: `名稱太長（${n.length} 字），請縮到 30 字以內。` };
  if (doc.exams.some((e) => e.name === n)) return { ok: false, message: `已經有叫「${n}」的模擬考，請改個名稱（例如加上日期）。` };
  return { ok: true, message: '' };
}

// ───── 破壞性動作 ─────

export interface ConfirmCopy { title: string; body: string; confirm: string }

/** 破壞性動作的確認文案：說清楚會失去什麼，並提示可用「↶ 復原」找回 */
export const confirmCopy = {
  deleteStudent: (name: string, code: string): ConfirmCopy => ({
    title: '刪除這位學生？', body: `將刪除 ${code} ${name}。其他考生的編號不會改變，這個編號會空著、不會被遞補。`, confirm: '刪除',
  }),
  deleteClass: (name: string): ConfirmCopy => ({
    title: '刪除這個班級？', body: `將刪除班級「${name}」。這個班目前沒有學生，刪除後可用「↶ 復原」還原。`, confirm: '刪除',
  }),
  deleteRoom: (name: string, inUse: boolean): ConfirmCopy => ({
    title: '刪除這間教室？', body: `將刪除「${name}」。教室清單是所有模擬考共用的，${inUse ? '已選用它的模擬考會少一間教室，排座結果可能因此過期。' : '其他模擬考若選用了它，也會少一間教室。'}`, confirm: '刪除',
  }),
  deleteSubject: (name: string): ConfirmCopy => ({
    title: '刪除這個考科？', body: `將從考科表刪除「${name}」，名單裡這一科的資料不會再用於排座與標示。`, confirm: '刪除',
  }),
  resetSubjects: (): ConfirmCopy => ({
    title: '還原本次的預設考科？', body: '你對本次考科表做的新增、修改、刪除都會被取代成預設值。', confirm: '還原本次考科',
  }),
  reimportList: (count: number): ConfirmCopy => ({
    title: '重新匯入考試名單？', body: `目前已有 ${count} 位考生。匯入新檔後會取代整份考試名單，已排好的座位表會變成過期，要重新排座。`, confirm: '繼續匯入',
  }),
  reseat: (overrides: number): ConfirmCopy => ({
    title: '重新排座？', body: `會用目前的名單與設定重排座位表，舊結果將被取代。${overrides ? `已設定的 ${overrides} 筆個別覆寫會保留並重新套用。` : ''}`, confirm: '重新排座',
  }),
};
export const UNDO_HINT = '做錯了可以在這次使用中按頁面上方的「↶ 復原」（或 Ctrl+Z）還原；重新整理頁面後可能就不能復原了。';

// ───── 完工頁「下一步」 ─────

export interface AfterExportItem { text: string; step?: StepNo; nav?: 'exams' }

/** 下載完成後該做什麼（程式內部仍叫 export） */
export function afterExport(format: 'word' | 'pdf', paper: string): AfterExportItem[] {
  const items: AfterExportItem[] = [
    { text: format === 'word' ? '打開下載資料夾，檢查每個 Word 檔的頁數與內容。' : '在新開的視窗選「列印」→ 目的地選「另存為 PDF」。' },
    { text: `列印前先確認紙張：座位表與名單用 A4，標籤用 ${paper}。` },
    { text: '考試前若名單或教室有變，回 ⑤ 重新排座，再重新下載。', step: 5 },
    { text: '這次考完，回模擬考列表建立下一次（會帶入上一次的設定）。', nav: 'exams' },
  ];
  return items;
}
