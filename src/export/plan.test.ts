import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeFixture } from './fixtures';
import { defaultOptions, planFiles, preflight, runExport, safeName } from './plan';

const fd = new URL('./fonts/', import.meta.url);
const fonts = {
  regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', fd))),
  bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', fd))),
};
const chars = new Set(readFileSync(new URL('NotoSansTC-Regular-big5.chars.txt', fd), 'utf8'));
const has = (ch: string) => chars.has(ch);

describe('匯出規劃', () => {
  it('預設：座位表、標籤、抽離自習名單、預備教室座位表與標籤，各一個檔', () => {
    const files = planFiles(makeFixture(), defaultOptions('B4'));
    expect(files.map((f) => f.key)).toEqual(['seat', 'label', 'study', 'reserveSeat', 'reserveLabel']);
    expect(files.map((f) => f.pages)).toEqual([2, 2, 1, 1, 1]);
    expect(files[0]!.name).toBe('測試模擬考-座位表.docx');
    expect(files[1]!.name).toBe('測試模擬考-標籤（B4）.docx');
  });

  it('取消勾選就不產生；標籤沒勾則沒有預備教室標籤', () => {
    const f = planFiles(makeFixture(), { ...defaultOptions('A3'), seat: false, label: false, study: false });
    expect(f.map((x) => x.key)).toEqual(['reserveSeat']);
  });

  it('A3 預設 7×7，B4 預設 6×8：標籤檔格數跟著紙張走', async () => {
    const a3 = await runExport(makeFixture(), { ...defaultOptions('A3'), seat: false, study: false, reserve: false }, { fonts });
    expect(a3).toHaveLength(1);
    const z = await JSZip.loadAsync(a3[0]!.data as Uint8Array);
    const doc = await z.file('word/document.xml')!.async('string');
    expect(doc).toContain(`w:w="${Math.round((297 * 1440) / 25.4)}"`);
    expect([...doc.matchAll(/<w:gridCol /g)]).toHaveLength(14); // 2 頁 × 7 欄
  });

  it('Word：每類一個 .docx，內含字型與頁尾版本碼', async () => {
    const out = await runExport(makeFixture(), defaultOptions('B4'), { fonts });
    expect(out.map((f) => f.name.split('-')[1])).toEqual(['座位表.docx', '標籤（B4）.docx', '抽離自習名單.docx', '預備教室座位表.docx', '預備教室標籤（B4）.docx']);
    for (const f of out) {
      const z = await JSZip.loadAsync(f.data as Uint8Array);
      expect(Object.keys(z.files).filter((n) => n.startsWith('word/fonts/'))).toHaveLength(2);
      const footer = await Promise.all(Object.keys(z.files).filter((n) => /footer\d+\.xml$/.test(n)).map((n) => z.file(n)!.async('string')));
      expect(footer.join('')).toContain('A1B2C3D4');
    }
  });

  it('PDF：所有內容合併成一個列印用頁面，含各種紙張', async () => {
    const out = await runExport(makeFixture(), { ...defaultOptions('A3'), format: 'pdf' }, { fonts });
    expect(out).toHaveLength(1);
    const html = out[0]!.data as string;
    expect(out[0]!.name).toBe('測試模擬考-列印用頁面.html');
    expect(html).toContain('page:a3');
    expect(html).toContain('page:a4');
  });

  it('檔名安全', () => expect(safeName('a/b:c?')).toBe('a_b_c_'));
});

describe('匯出前檢查', () => {
  const ok = { stale: false, unresolvedDiffs: 0 };
  it('通過時沒有問題', () => expect(preflight(makeFixture(), defaultOptions(), ok, has)).toEqual([]));

  it('過期與未處理差異會擋下', () => {
    const i = preflight(makeFixture(), defaultOptions(), { stale: true, unresolvedDiffs: 3 }, has);
    expect(i.filter((x) => x.level === 'block')).toHaveLength(2);
    expect(i[1]!.text).toContain('3 筆');
  });

  it('什麼都沒勾會擋下', () => {
    const i = preflight(makeFixture(), { ...defaultOptions(), seat: false, label: false, study: false, reserve: false }, ok, has);
    expect(i[0]!.text).toContain('至少勾選');
  });

  it('標籤格數不夠會擋下並說明', () => {
    const f = makeFixture();
    f.settings.classrooms[0]!.rows = 8; // 不影響；改用結果塞滿
    for (let i = 0; i < 60; i++) f.result.assignments.push({ classroomId: 'r1', row: 9 + Math.floor(i / 5), depth: (i % 5) + 1, code: '0101' });
    const issues = preflight(f, defaultOptions('A3'), ok, has);
    expect(issues.some((x) => x.level === 'block' && x.text.includes('超過標籤'))).toBe(true);
  });

  it('字集外罕用字只警告（Word），訊息有編號、沒有姓名', () => {
    const f = makeFixture();
    f.students[0]!.name = '甲\u{2A6A5}';
    const i = preflight(f, defaultOptions(), ok, has);
    expect(i).toHaveLength(1);
    expect(i[0]!.level).toBe('warn');
    expect(i[0]!.text).toContain('0101');
    expect(i[0]!.text).not.toContain('甲');
    expect(preflight(f, { ...defaultOptions(), format: 'pdf' }, ok, has)).toEqual([]);
  });
});
