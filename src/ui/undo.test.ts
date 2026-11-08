import { describe, expect, it } from 'vitest';
import { canUndo, commit, newHistory, nextUndoLabel, undo, undoSteps, undoTo, UNDO_LIMIT } from './undo';

describe('復原', () => {
  it('變更後可復原回前一狀態', () => {
    let h = newHistory({ n: 0 });
    h = commit(h, { n: 1 }, '加一');
    expect(canUndo(h)).toBe(true);
    expect(undo(h).present).toEqual({ n: 0 });
  });
  it('內容沒變不記一步；空歷史復原不動', () => {
    const h = newHistory({ n: 0 });
    expect(commit(h, { n: 0 }, 'x')).toBe(h);
    expect(undo(h)).toBe(h);
    expect(nextUndoLabel(h)).toBeUndefined();
  });
  it('最多保留 20 步', () => {
    let h = newHistory(0);
    for (let i = 1; i <= 30; i++) h = commit(h, i, `步${i}`);
    expect(h.past.length).toBe(UNDO_LIMIT);
    for (let i = 0; i < 40; i++) h = undo(h);
    expect(h.present).toBe(10);
  });
  it('記錄動作名稱；按鈕顯示最近一步，復原一步後換成前一步', () => {
    let h = newHistory(0);
    h = commit(h, 1, '新增學生');
    h = commit(h, 2, '修改班級色');
    expect(nextUndoLabel(h)).toBe('修改班級色');
    h = undo(h);
    expect(nextUndoLabel(h)).toBe('新增學生');
    expect(h.present).toBe(1);
  });
  it('沒給名稱用預設名稱', () => {
    expect(nextUndoLabel(commit(newHistory(0), 1))).toBe('上一個動作');
  });
  it('可直接回到任一步之前，後面的步驟被列為過期（新到舊）', () => {
    let h = newHistory(0);
    h = commit(h, 1, '新增學生');
    h = commit(h, 2, '修改考科表');
    h = commit(h, 3, '排座');
    expect(undoSteps(h).map((s) => s.label)).toEqual(['排座', '修改考科表', '新增學生']);
    const r = undoTo(h, 1);
    expect(r.history.present).toBe(1);
    expect(r.dropped).toEqual(['排座', '修改考科表']);
    expect(nextUndoLabel(r.history)).toBe('新增學生');
    expect(undoTo(h, 99).history).toBe(h);
  });
});
