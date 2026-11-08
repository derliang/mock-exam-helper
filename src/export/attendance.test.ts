import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { renderDocx } from './docxRender';
import { buildAttendancePages } from './attendance';
import { makeFixture } from './fixtures';
import { renderPrintHtml } from './htmlRender';

describe('出缺席記錄表（H5）', () => {
  const f = makeFixture();
  const pages = buildAttendancePages(f);

  it('每間教室一頁（含預備教室），標題用考試名稱、不寫死「模擬考」', () => {
    expect(pages).toHaveLength(3);
    expect(pages[0]!.title).toBe('測試模擬考　出缺席記錄表');
    const g = { ...f, exam: { ...f.exam, name: '第一次補考' } };
    expect(buildAttendancePages(g)[0]!.title).toBe('第一次補考　出缺席記錄表');
    expect(buildAttendancePages(g).every((p) => !p.title.includes('模擬考') && !(p.subtitle ?? '').includes('模擬考'))).toBe(true);
  });

  it('欄位：座位、編號、班級、姓名、每科一欄、不考的科目；每科的打勾格留白', () => {
    const p = pages[0]!;
    expect(p.heads).toEqual(['座位（排－深位）', '考生編號', '班級', '姓名', '國文', '英文', '數學', '不考的科目']);
    expect(p.widths).toHaveLength(p.heads.length);
    expect(p.rows[0]!.slice(0, 4)).toEqual(['1-1', '0101', '溫', '甲生101']);
    expect(p.rows[0]!.slice(4, 7)).toEqual(['', '', '']);
  });

  it('照座位順序（排由小到大，同排深位由小到大）；人數與座位表一致', () => {
    const p = pages[0]!;
    const seats = p.rows.map((r) => r[0]!.split('-').map(Number));
    const sorted = [...seats].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    expect(seats).toEqual(sorted);
    expect(p.rows).toHaveLength(f.result.assignments.filter((a) => a.classroomId === 'ra').length || p.rows.length);
    expect(p.subtitle).toContain(`應到 ${p.rows.length} 人`);
  });

  it('抽離考試的英文：班級教室印去處、不留打勾格；預備教室只有該科打勾', () => {
    const p = pages[0]!;
    const r = p.rows.find((x) => x[1] === '0105')!;
    expect(r[4]).toBe(''); // 國文本教室考
    expect(r[5]).toMatch(/^→ 預備教室/); // 英文抽離
    const res = pages[2]!;
    const q = res.rows.find((x) => x[1] === '0105')!;
    expect(q.slice(4, 7)).toEqual(['—', '', '—']);
  });

  it('不考的科目：考試名單沒有的科目印「—」並列在最後一欄', () => {
    const g = { ...f, entries: f.entries.map((e) => (e.classNo === 1 && e.seatNo === 1 ? { ...e, subjectIds: ['zh'] } : e)) };
    const r = buildAttendancePages(g)[0]!.rows.find((x) => x[1] === '0101')!;
    expect(r.slice(4, 7)).toEqual(['', '—', '—']);
    expect(r[7]).toBe('英文、數學');
  });

  it('單人特例（D80）：該科印去處、不留打勾格；其他科照常；自習加註', () => {
    const mk = (purpose: 'exam' | 'study') => ({
      ...f,
      result: { ...f.result, marks: [...f.result.marks, { code: '0301', subjectId: 'zh', mode: 'absent' as const }], overrides: [{ kind: 'single' as const, code: '0301', location: '教務處', purpose }] },
    });
    const r = buildAttendancePages(mk('exam')).flatMap((p) => p.rows).find((x) => x[1] === '0301')!;
    expect(r).toBeDefined();
    expect(r[4]).toBe('→ 教務處');
    expect(r[5]).toBe('');
    const r2 = buildAttendancePages(mk('study')).flatMap((p) => p.rows).find((x) => x[1] === '0301')!;
    expect(r2[4]).toBe('→ 教務處（自習）');
  });

  it('PDF 列印頁與表頭重複', () => {
    const html = renderPrintHtml({ table: pages }, { generatedAt: f.result.generatedAt, dataVersion: f.result.dataVersion });
    expect(html).toContain('出缺席記錄表');
    expect(html).toContain('<thead>');
    expect(html).toContain(f.result.dataVersion);
  });

  it('Word：A4 一個檔含全部教室頁、頁尾資料版本碼、每科欄位都在表頭', async () => {
    const d = new URL('./fonts/', import.meta.url);
    const fonts = { regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', d))), bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', d))) };
    const buf = await renderDocx({ table: pages }, { fonts, generatedAt: f.result.generatedAt, dataVersion: f.result.dataVersion });
    const z = await JSZip.loadAsync(buf);
    const doc = await z.file('word/document.xml')!.async('string');
    for (const t of ['出缺席記錄表', '國文', '英文', '數學', '不考的科目', '甲教室', '乙教室', '預備教室']) expect(doc).toContain(t);
    const foot = (await Promise.all(Object.keys(z.files).filter((n) => /word\/footer/.test(n)).map((n) => z.file(n)!.async('string')))).join('');
    expect(foot).toContain(f.result.dataVersion);
  }, 30000);
});
