import { describe, expect, it } from 'vitest';
import { canUndo, commit, newHistory, undo, UNDO_LIMIT } from './undo';

describe('復原', () => {
  it('變更後可復原回前一狀態', () => {
    let h = newHistory({ n: 0 });
    h = commit(h, { n: 1 });
    expect(canUndo(h)).toBe(true);
    expect(undo(h).present).toEqual({ n: 0 });
  });
  it('內容沒變不記一步；空歷史復原不動', () => {
    const h = newHistory({ n: 0 });
    expect(commit(h, { n: 0 })).toBe(h);
    expect(undo(h)).toBe(h);
  });
  it('最多保留 20 步', () => {
    let h = newHistory(0);
    for (let i = 1; i <= 30; i++) h = commit(h, i);
    expect(h.past.length).toBe(UNDO_LIMIT);
    for (let i = 0; i < 40; i++) h = undo(h);
    expect(h.present).toBe(10);
  });
});
