/**
 * 復原機制（UI-05／TODO-07，DESIGN 10.1）：快照式，最多 20 步，Ctrl+Z 同效。泛型、不碰 DOM。
 * 每一步都記「做了什麼」（label），按鈕才能寫「↶ 復原：新增學生」，不再顯示累計數字。
 */
export const UNDO_LIMIT = 20;

/** 一步：state 是這個動作「之前」的快照，label 是這個動作的名稱 */
export interface UndoEntry<T> { state: T; label: string }

export interface History<T> {
  past: UndoEntry<T>[];
  present: T;
}

export const DEFAULT_LABEL = '上一個動作';

export const newHistory = <T>(present: T): History<T> => ({ past: [], present });

/** 套用一次變更；內容沒變就不記一步 */
export function commit<T>(h: History<T>, next: T, label: string = DEFAULT_LABEL, limit = UNDO_LIMIT): History<T> {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  const past = [...h.past, { state: h.present, label }];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;

/** 下一次復原會退掉哪個動作（沒有就 undefined） */
export const nextUndoLabel = <T>(h: History<T>): string | undefined => h.past[h.past.length - 1]?.label;

/** 可回頭的步驟，最新的在前（供「回到某一步」選單用） */
export const undoSteps = <T>(h: History<T>): { index: number; label: string }[] =>
  h.past.map((e, index) => ({ index, label: e.label })).reverse();

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev.state };
}

/**
 * 直接回到第 index 步「之前」的狀態（0 = 最早）。比它新的步驟一併退掉，所以只回傳
 * 被退掉的動作名稱（新到舊），畫面據此標示「已過期」並提醒。
 */
export function undoTo<T>(h: History<T>, index: number): { history: History<T>; dropped: string[] } {
  const target = h.past[index];
  if (target === undefined) return { history: h, dropped: [] };
  return {
    history: { past: h.past.slice(0, index), present: target.state },
    dropped: h.past.slice(index).map((e) => e.label).reverse(),
  };
}
