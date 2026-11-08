import { describe, expect, it } from 'vitest';
import { createMemoryFS, type DirFS } from './dirfs';
import { loadDoc } from './folder';
import { createFsRepository, type PermHandle } from './fsRepository';
import { createSaveQueue, SwitchBlockedError } from './saveQueue';
import { emptyDoc } from '../ui/repository';
import type { Doc } from '../ui/store';

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const mk = (n: number): Doc => ({ ...emptyDoc(), settings: { ...emptyDoc().settings, schoolName: `範例學校${n}` } });

/** 可控延遲的假檔案系統：越早發出的寫入延遲越久（刻意讓舊快照後完成），可指定失敗 */
function slowFS(initial: Record<string, string> = {}) {
  const base = createMemoryFS(initial);
  let n = 0;
  const ctl = { failWrites: false, writes: 0 };
  const fs: DirFS = {
    ...base,
    async writeText(p, t) {
      ctl.writes++;
      const k = n++;
      await tick(Math.max(0, 30 - k) % 7);
      if (ctl.failWrites) throw new Error('磁碟寫入失敗');
      await base.writeText(p, t);
    },
  };
  return { fs, base, ctl };
}
const handle = (name: string) => ({ name }) as unknown as PermHandle;

describe('存檔佇列（#58）', () => {
  it('連續 100 次存檔（含 undo 回到舊值）：重載後等於最後一份 Doc', async () => {
    const { fs, base } = slowFS();
    const { saveDoc } = await import('./folder');
    const q = createSaveQueue<Doc>((d) => saveDoc(fs, d));
    let last = mk(0);
    for (let i = 1; i <= 100; i++) {
      last = i % 10 === 0 ? mk(i - 5) : mk(i); // 模擬 undo 回到較舊內容
      q.enqueue(last);
      if (i % 7 === 0) await tick(1);
    }
    expect(await q.flush()).toBe(true);
    expect((await loadDoc(base)).data.settings.schoolName).toBe(last.settings.schoolName);
  });

  it('寫入失敗：狀態為 error 並保留快照，重試成功後存妥', async () => {
    const { fs, base, ctl } = slowFS();
    const { saveDoc } = await import('./folder');
    const seen: string[] = [];
    const q = createSaveQueue<Doc>((d) => saveDoc(fs, d), (s) => seen.push(s.state));
    ctl.failWrites = true;
    q.enqueue(mk(1));
    expect(await q.flush()).toBe(false);
    expect(q.status()).toMatchObject({ state: 'error', message: '磁碟寫入失敗' });
    ctl.failWrites = false;
    expect(await q.retry()).toBe(true);
    expect(q.status().state).toBe('idle');
    expect((await loadDoc(base)).data.settings.schoolName).toBe('範例學校1');
    expect(seen).toContain('error');
  });

  it('失敗後來了更新的快照：改寫新快照並清除錯誤', async () => {
    const { fs, base, ctl } = slowFS();
    const { saveDoc } = await import('./folder');
    const q = createSaveQueue<Doc>((d) => saveDoc(fs, d));
    ctl.failWrites = true;
    q.enqueue(mk(1));
    await q.flush();
    ctl.failWrites = false;
    q.enqueue(mk(2));
    expect(await q.flush()).toBe(true);
    expect(q.status().state).toBe('idle');
    expect((await loadDoc(base)).data.settings.schoolName).toBe('範例學校2');
  });
});

describe('fsRepository 換資料夾（#69）', () => {
  function setup() {
    const A = slowFS();
    const B = slowFS();
    const fsOf = new Map<string, DirFS>([['A', A.fs], ['B', B.fs]]);
    const granted = new Map<string, boolean>([['A', true], ['B', true]]);
    const next: { h: PermHandle } = { h: handle('A') };
    const repo = createFsRepository({
      pick: async () => next.h,
      permission: async (h) => granted.get(h.name) ?? false,
      makeFs: (h) => fsOf.get(h.name)!,
      remember: async () => {},
    });
    return { A, B, repo, granted, next };
  }

  it('A→B 成功：切換並可存到 B，A 的最後快照先存妥', async () => {
    const { A, B, repo, next } = setup();
    expect(await repo.chooseFolder()).toBe(true);
    await repo.save(mk(1));
    next.h = handle('B');
    expect(await repo.chooseFolder()).toBe(true);
    expect(repo.folderName?.()).toBe('B');
    expect((await loadDoc(A.base)).data.settings.schoolName).toBe('範例學校1');
    await repo.save(mk(2));
    expect(await repo.retrySave?.()).toBe(true);
    expect((await loadDoc(B.base)).data.settings.schoolName).toBe('範例學校2');
  });

  it('A→B 拒絕授權：回 false、不切換、仍寫入 A', async () => {
    const { A, B, repo, granted, next } = setup();
    await repo.chooseFolder();
    granted.set('B', false);
    next.h = handle('B');
    expect(await repo.chooseFolder()).toBe(false);
    expect(repo.folderName?.()).toBe('A');
    await repo.save(mk(3));
    await repo.retrySave?.();
    expect((await loadDoc(A.base)).data.settings.schoolName).toBe('範例學校3');
    expect(B.ctl.writes).toBe(0);
  });

  it('B 讀檔失敗：丟錯且不切換', async () => {
    const { B, repo, next } = setup();
    await repo.chooseFolder();
    B.base.files.set('settings.json', '{壞掉');
    next.h = handle('B');
    await expect(repo.chooseFolder()).rejects.toThrow();
    expect(repo.folderName?.()).toBe('A');
  });

  it('A 有存不進去的變更時：不切換（SwitchBlockedError），修好後可切換', async () => {
    const { A, repo, next } = setup();
    await repo.chooseFolder();
    A.ctl.failWrites = true;
    await repo.save(mk(4));
    next.h = handle('B');
    await expect(repo.chooseFolder()).rejects.toBeInstanceOf(SwitchBlockedError);
    expect(repo.folderName?.()).toBe('A');
    expect(repo.saveStatus?.().state).toBe('error');
    A.ctl.failWrites = false;
    expect(await repo.retrySave?.()).toBe(true);
    expect(await repo.chooseFolder()).toBe(true);
    expect(repo.folderName?.()).toBe('B');
  });

  it('使用者取消選擇視窗：AbortError 往上丟', async () => {
    const { A, B } = setup();
    void A; void B;
    const repo = createFsRepository({ pick: async () => { throw new DOMException('cancel', 'AbortError'); } });
    await expect(repo.chooseFolder()).rejects.toMatchObject({ name: 'AbortError' });
  });
});
