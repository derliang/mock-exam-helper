import { describe, expect, it } from 'vitest';
import { checksum, decode, encode, SCHEMA_VERSION } from './envelope';
import { createMemoryFS } from './dirfs';
import { StorageError, loadDoc, loadExamFile, saveDoc, saveExamFile } from './folder';
import type { Doc } from '../ui/store';
import type { ExamConfig } from './types';

const exam = (id: string, at: string): ExamConfig => ({
  id,
  name: `考試${id}`,
  kind: 'gsat',
  division: 'senior',
  semester: 'first',
  participation: 'all',
  subjects: [{ id: 'chi', name: '國文' }],
  markRules: [],
  classroomIds: [],
  labelLayout: { paper: 'B4', cols: 7, rows: 7 },
  createdAt: at,
});

const doc = (): Doc => ({
  settings: {
    schoolName: '範例高中',
    headerText: '模擬考',
    defaultLabelPaper: 'B4',
    classes: [{ no: 1, name: '溫', division: 'senior', track: 'science', colorIndex: 1 }],
    classrooms: [{ id: 'r1', name: '第一試場', kind: 'class', rows: 2, depth: 3, seatCount: 5 }],
  },
  rosters: { senior: [{ classNo: 1, seatNo: 1, name: '測試甲' }], junior: [] },
  exams: [exam('e2', '2026-02-01'), exam('e1', '2026-01-01')],
});

describe('檔案外殼', () => {
  it('編碼後可解回原資料', () => {
    const r = decode<{ a: number }>(encode({ a: 1 }));
    expect(r).toEqual({ ok: true, data: { a: 1 } });
  });
  it('偵測壞掉的 JSON、被手改的內容、格式不符、較新版本', () => {
    expect(decode('{壞掉').ok).toBe(false);
    const edited = encode({ a: 1 }).replace('"a":1', '"a":2');
    const r = decode(edited);
    expect(r.ok === false && r.reason).toBe('checksum');
    const noShape = decode('[1,2]');
    expect(noShape.ok === false && noShape.reason).toBe('shape');
    const newer = `{"schemaVersion":${SCHEMA_VERSION + 1},"checksum":"${checksum('1')}","data":1}`;
    const n = decode(newer);
    expect(n.ok === false && n.reason).toBe('newer-version');
  });
});

describe('資料夾存讀', () => {
  it('空資料夾載入為空文件', async () => {
    const { data } = await loadDoc(createMemoryFS());
    expect(data.exams).toEqual([]);
    expect(data.rosters).toEqual({ senior: [], junior: [] });
  });
  it('存了再讀，內容相同，考試依建立時間排序', async () => {
    const fs = createMemoryFS();
    await saveDoc(fs, doc());
    const { data, warning } = await loadDoc(fs);
    expect(warning).toBeUndefined();
    expect(data.settings).toEqual(doc().settings);
    expect(data.rosters.senior).toEqual(doc().rosters.senior);
    expect(data.exams.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('主檔損壞時改讀備份並警告；沒有備份就丟 StorageError', async () => {
    const fs = createMemoryFS();
    await saveDoc(fs, doc());
    const d2 = doc();
    d2.rosters.senior = [{ classNo: 1, seatNo: 2, name: '測試乙' }];
    await saveDoc(fs, d2); // 此時 .bak 是第一版
    fs.files.set('roster-senior.json', '壞了');
    const r = await loadDoc(fs);
    expect(r.warning).toContain('roster-senior.json');
    expect(r.data.rosters.senior[0]?.name).toBe('測試甲');
    fs.files.delete('roster-senior.json.bak');
    await expect(loadDoc(fs)).rejects.toBeInstanceOf(StorageError);
  });
  it('資料內容被手改會被偵測', async () => {
    const fs = createMemoryFS();
    await saveDoc(fs, doc());
    fs.files.set('settings.json', fs.files.get('settings.json')!.replace('範例高中', '別校'));
    await expect(loadDoc(fs)).rejects.toMatchObject({ reason: 'checksum' });
  });
  it('刪除的模擬考其檔案被移除', async () => {
    const fs = createMemoryFS();
    await saveDoc(fs, doc());
    const d = doc();
    d.exams = [d.exams[1]!];
    await saveDoc(fs, d);
    expect([...fs.files.keys()].some((k) => k.startsWith('exams/e2/'))).toBe(false);
    expect(fs.files.has('exams/e1/exam.json')).toBe(true);
  });
  it('模擬考底下的其他檔案存讀；不合法的代碼被擋', async () => {
    const fs = createMemoryFS();
    await saveExamFile(fs, 'e1', 'entries', [{ classNo: 1, seatNo: 1, name: '測試甲', subjectIds: ['chi'] }]);
    const r = await loadExamFile(fs, 'e1', 'entries');
    expect(r?.data[0]?.name).toBe('測試甲');
    expect(await loadExamFile(fs, 'e1', 'result')).toBeNull();
    await expect(saveExamFile(fs, '../x', 'diffs', [])).rejects.toThrow();
  });
  it('Doc.examFiles 跟著存讀；拿掉某個檔（例如復原到排座前）就移除主檔', async () => {
    const fs = createMemoryFS();
    const d: Doc = {
      ...doc(),
      examFiles: {
        e1: {
          entries: [{ classNo: 1, seatNo: 1, name: '測試甲', subjectIds: ['chi'] }],
          result: { examId: 'e1', generatedAt: '2026-01-02', dataVersion: 'AAAA-BBBB-CCCC', assignments: [], marks: [], detaches: [], overrides: [] },
        },
      },
    };
    await saveDoc(fs, d);
    expect((await loadDoc(fs)).data.examFiles).toEqual(d.examFiles);
    await saveDoc(fs, { ...d, examFiles: { e1: { entries: d.examFiles!.e1!.entries! } } });
    expect(await loadExamFile(fs, 'e1', 'result')).toBeNull();
    expect((await loadDoc(fs)).data.examFiles?.e1?.result).toBeUndefined();
    await saveDoc(fs, doc());
    expect((await loadDoc(fs)).data.examFiles).toBeUndefined();
  });
});
