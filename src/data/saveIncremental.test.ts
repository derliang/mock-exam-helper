import { describe, expect, it } from 'vitest';
import { createMemoryFS } from './dirfs';
import { createIncrementalSaver, loadDoc, saveDoc } from './folder';
import { bigDoc, countingFS } from './testData';
import type { Doc } from '../ui/store';

/** 增量存檔（#72）：落盤結果必須與完整 saveDoc 逐檔相同 */
const snapshot = (m: Map<string, string>) => [...m.entries()].filter(([k]) => !k.endsWith('.bak')).sort(([a], [b]) => a.localeCompare(b));
async function fullResult(docs: Doc[]) {
  const fs = createMemoryFS();
  for (const d of docs) await saveDoc(fs, d);
  return snapshot(fs.files);
}

describe('增量存檔 createIncrementalSaver（#72）', () => {
  it('改一個字：只寫 settings，不讀不寫其他檔、不掃資料夾', async () => {
    const { fs, base, c, reset } = countingFS();
    const save = createIncrementalSaver(fs);
    const d0 = bigDoc(3, 20);
    await save(d0);
    reset();
    const d1 = { ...d0, settings: { ...d0.settings, schoolName: '改了' } };
    await save(d1);
    expect(c.writes).toBe(2); // settings.json 與其 .bak
    expect(c.reads).toBe(1);
    expect(c.lists).toBe(0);
    expect(c.removes).toBe(0);
    expect((await loadDoc(base)).data.settings.schoolName).toBe('改了');
  });

  it('沒變的 Doc：完全不碰磁碟', async () => {
    const { fs, c, reset } = countingFS();
    const save = createIncrementalSaver(fs);
    const d = bigDoc(2, 5);
    await save(d);
    reset();
    await save(d);
    expect(c).toEqual({ reads: 0, writes: 0, lists: 0, removes: 0, bytes: 0 });
  });

  it('被刪的考試：檔案與 .bak 都移除，其餘考試不動；刪完又復原回來會重寫', async () => {
    const fs = createMemoryFS();
    const save = createIncrementalSaver(fs);
    const d0 = bigDoc(3, 5);
    await save(d0);
    expect([...fs.files.keys()].some((k) => k.startsWith('exams/exam-1/'))).toBe(true);
    const d1: Doc = { ...d0, exams: d0.exams.filter((e) => e.id !== 'exam-1'), examFiles: { 'exam-0': d0.examFiles!['exam-0']!, 'exam-2': d0.examFiles!['exam-2']! } };
    await save(d1);
    expect([...fs.files.keys()].some((k) => k.startsWith('exams/exam-1/'))).toBe(false);
    expect(snapshot(fs.files)).toEqual(await fullResult([d0, d1]));
    await save(d0); // 復原：考試回來，檔案要重新寫出
    expect(snapshot(fs.files)).toEqual(await fullResult([d0]));
    expect((await loadDoc(fs)).data.exams.map((e) => e.id)).toEqual(['exam-0', 'exam-1', 'exam-2']);
  });

  it('復原到排座前：result 主檔被移除（備份保留），再重排會寫回', async () => {
    const fs = createMemoryFS();
    const save = createIncrementalSaver(fs);
    const d0 = bigDoc(2, 5);
    const withResult: Doc = { ...d0, examFiles: { ...d0.examFiles, 'exam-0': { ...d0.examFiles!['exam-0']!, result: { examId: 'exam-0', assignments: [] } as never } } };
    await save(withResult);
    expect(fs.files.has('exams/exam-0/result.json')).toBe(true);
    await save(d0); // 復原到排座前
    expect(fs.files.has('exams/exam-0/result.json')).toBe(false);
    await save(withResult); // 重做
    expect(fs.files.has('exams/exam-0/result.json')).toBe(true);
    expect(snapshot(fs.files)).toEqual(await fullResult([withResult]));
  });

  it('寫入中途失敗：已寫的不重寫、未寫的下次補上，最終與完整存檔相同', async () => {
    const { base } = countingFS();
    let fail = true;
    const fs = { ...base, writeText: async (p: string, t: string) => { if (fail && p === 'exams/exam-1/entries.json') throw new Error('壞了'); return base.writeText(p, t); } };
    const save = createIncrementalSaver(fs);
    const d0 = bigDoc(3, 5);
    await expect(save(d0)).rejects.toThrow('壞了');
    fail = false;
    await save(d0); // 佇列重試同一份快照
    expect(snapshot((base as unknown as { files: Map<string, string> }).files)).toEqual(await fullResult([d0]));
  });

  it('多步編輯序列：每一步後落盤都等於完整存檔', async () => {
    const fs = createMemoryFS();
    const save = createIncrementalSaver(fs);
    const steps: Doc[] = [];
    let d = bigDoc(3, 6);
    steps.push(d);
    d = { ...d, settings: { ...d.settings, headerText: 'x' } }; steps.push(d);
    d = { ...d, rosters: { ...d.rosters, junior: [{ classNo: 7, seatNo: 1, name: '新生' }] } }; steps.push(d);
    d = { ...d, exams: d.exams.slice(1), examFiles: { 'exam-1': d.examFiles!['exam-1']!, 'exam-2': d.examFiles!['exam-2']! } }; steps.push(d);
    steps.push(steps[1]!); // 復原
    const seen: Doc[] = [];
    for (const s of steps) {
      await save(s);
      seen.push(s);
      expect(snapshot(fs.files)).toEqual(await fullResult(seen.slice(-1)));
    }
  });
});
