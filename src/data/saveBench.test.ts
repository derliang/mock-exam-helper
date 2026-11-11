/**
 * #72 量測：中大型資料下「編輯 1 個字」一次存檔的 I/O 次數與耗時，以及 undo.commit 單次耗時。
 * 用記憶體 DirFS 計數（不含真實磁碟延遲，真實 File System Access 每次 read/write 還要更貴，故以次數為主）。
 * 預設只跑小規模當回歸測試；設 BENCH=1 印出完整表格。
 */
import { describe, expect, it } from 'vitest';
import type { DirFS } from './dirfs';
import { saveDoc, createIncrementalSaver } from './folder';
import { commit, newHistory } from '../ui/undo';
import type { Doc } from '../ui/store';
import { bigDoc, countingFS } from './testData';

const edit = (d: Doc, i: number): Doc => ({ ...d, settings: { ...d.settings, schoolName: `範例學校${i}` } });

type Saver = (fs: DirFS) => (d: Doc) => Promise<void>;
const full: Saver = (fs) => (d) => saveDoc(fs, d);
const incr: Saver = (fs) => { const s = createIncrementalSaver(fs); return (d) => s(d); };

async function run(mk: Saver, exams: number, people: number) {
  const { fs, c, reset } = countingFS();
  const save = mk(fs);
  let doc = bigDoc(exams, people);
  await save(doc); // 首次全存（不計）
  reset();
  const t0 = performance.now();
  for (let i = 1; i <= 20; i++) { doc = edit(doc, i); await save(doc); }
  const ms = performance.now() - t0;
  return { ...c, ms: Math.round(ms) };
}

describe('#72 量測', () => {
  const sizes: [number, number][] = process.env.BENCH ? [[6, 100], [24, 300], [60, 500]] : [[6, 100]];
  for (const [e, p] of sizes) {
    it(`編輯 20 字 ${e} 次考試×${p} 人：完整 vs 增量`, async () => {
      const a = await run(full, e, p);
      const b = await run(incr, e, p);
      if (process.env.BENCH) console.log(`BENCH ${e}x${p}\n  full ${JSON.stringify(a)}\n  incr ${JSON.stringify(b)}`);
      expect(b.reads).toBeLessThan(a.reads);
      expect(b.writes).toBeLessThanOrEqual(40); // 20 次只寫 settings 與其 .bak
    });
  }

  it('commit 單次耗時（60×500 的 Doc）', () => {
    const doc = bigDoc(process.env.BENCH ? 60 : 6, process.env.BENCH ? 500 : 100);
    let h = newHistory(doc);
    const t0 = performance.now();
    for (let i = 1; i <= 20; i++) h = commit(h, edit(h.present, i), 'x');
    const per = (performance.now() - t0) / 20;
    if (process.env.BENCH) console.log(`BENCH commit per-call ms=${per.toFixed(2)}`);
    expect(h.past.length).toBe(20);
  });
});
