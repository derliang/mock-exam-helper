/** 復原機制（UI-05，DESIGN 10.1）：快照式，最多 20 步，Ctrl+Z 同效。泛型、不碰 DOM。 */
export const UNDO_LIMIT = 20;

export interface History<T> {
  past: T[];
  present: T;
}

export const newHistory = <T>(present: T): History<T> => ({ past: [], present });

/** 套用一次變更；內容沒變就不記一步 */
export function commit<T>(h: History<T>, next: T, limit = UNDO_LIMIT): History<T> {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  const past = [...h.past, h.present];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev };
}
