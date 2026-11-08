import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createMemoryFS, encode, DEFAULT_LABEL_NOTES, labelNoteLines, loadDoc, LABEL_NOTE_MAX_LINES, parseNoteLine } from '../data';
import { makeFixture } from './fixtures';
import { buildLabelPages, labelBoxMm, renderDocx, renderPrintHtml } from './index';

const fontDir = new URL('./fonts/', import.meta.url);
const fonts = {
  regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', fontDir))),
  bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', fontDir))),
};
const meta = { generatedAt: '2026-11-08T08:30:00Z', dataVersion: 'A1B2C3D4' };

const withNotes = (notes: string | undefined, o: Parameters<typeof makeFixture>[0] = {}) => {
  const f = makeFixture(o);
  if (notes !== undefined) f.settings.labelNotes = notes;
  return f;
};
const docXml = async (f: ReturnType<typeof makeFixture>) => {
  const z = await JSZip.loadAsync(await renderDocx({ label: buildLabelPages(f, 'class') }, { fonts, ...meta }));
  return z.file('word/document.xml')!.async('string');
};
const htmlOf = (f: ReturnType<typeof makeFixture>) => renderPrintHtml({ label: buildLabelPages(f, 'class') }, meta);

describe('標籤注意事項（設定頁可改）', () => {
  it('預設文字與改版前一致：列印頁逐字相同、「0101」「右上角」「透明膠帶」粗體', () => {
    const h = htmlOf(makeFixture());
    expect(h).toContain(
      '<div class="pp-note"><h4>注意事項：</h4><div>*<b>0101</b>開始為第一排第一個位置以此類推。</div><div>*請貼於桌面<b>右上角</b>。</div><div>*請使用<b>透明膠帶</b>黏貼。</div></div>',
    );
  });

  it('預設文字在 Word 裡也在（三行都出現）', async () => {
    const x = await docXml(makeFixture());
    for (const t of ['注意事項：', '開始為第一排第一個位置以此類推。', '右上角', '透明膠帶', '黏貼。']) expect(x).toContain(t);
  });

  it('粗體語法：開頭的 * 項目符號不受影響，沒成對的 ** 當一般字', () => {
    expect(parseNoteLine('***0101**開始')).toEqual([{ text: '*', bold: false }, { text: '0101', bold: true }, { text: '開始', bold: false }]);
    expect(parseNoteLine('a**b')).toEqual([{ text: 'a**b', bold: false }]);
    expect(labelNoteLines(undefined)).toHaveLength(3);
    expect(labelNoteLines(DEFAULT_LABEL_NOTES)).toEqual(labelNoteLines(undefined));
  });

  it('自訂文字出現在列印頁與 Word，舊文字消失，粗體標記生效，HTML 特殊字元被跳脫', async () => {
    const f = withNotes('*請帶**准考證**入場。\n*A<B&C');
    const h = htmlOf(f);
    expect(h).toContain('<div>*請帶<b>准考證</b>入場。</div><div>*A&lt;B&amp;C</div>');
    expect(h).not.toContain('透明膠帶');
    const x = await docXml(f);
    expect(x).toContain('准考證');
    expect(x).toContain('入場。');
    expect(x).not.toContain('透明膠帶');
  });

  it('空白內容＝不印注意事項框（兩種輸出都沒有），格高回到 35mm', async () => {
    const f = withNotes('  \n\n');
    expect(htmlOf(f)).not.toContain('pp-note"><h4>');
    expect(await docXml(f)).not.toContain('注意事項');
    const f8 = withNotes('', { paper: 'B4', labelCols: 6, labelRows: 8 });
    expect(htmlOf(f8)).toContain('height:35mm');
  });

  it('超過上限的行數與字數會被截掉', () => {
    const many = Array.from({ length: 10 }, (_, i) => `第${i}行`).join('\n');
    expect(labelNoteLines(many)).toHaveLength(LABEL_NOTE_MAX_LINES);
    const long = labelNoteLines('一'.repeat(50))[0]!;
    expect(long.map((s) => s.text).join('')).toHaveLength(30);
  });

  it('行數越多格高越矮，B4 排 8 列最多行時仍放得下（格子＋保留高度不超過紙高）', () => {
    const layout = { paper: 'B4' as const, cols: 6, rows: 8 };
    const hs = [0, 1, 2, 3, 4].map((n) => labelBoxMm(layout, 10, n).h);
    expect(hs[0]).toBe(35);
    for (let i = 2; i < hs.length; i++) expect(hs[i]!).toBeLessThan(hs[i - 1]!);
    expect(hs[3]).toBe(33.6); // 預設三行與改版前相同
    // 注意事項框＋抬頭＋頁尾的高度（與 labelReserveMm 同算法）加格子不超過可印高度
    for (let n = 1; n <= 4; n++) expect(labelBoxMm(layout, 10, n).h * 8 + 15 + (5 + 6 + 8.6 + 1 + n * 8) + 14 + 10).toBeLessThanOrEqual(353);
    const a3 = { paper: 'A3' as const, cols: 7, rows: 7 };
    for (let n = 1; n <= 4; n++) expect(labelBoxMm(a3, 10, n).h * 7 + 15 + (8 + 10 + 13.6 + 2 + n * 12.35) + 14 + 10).toBeLessThanOrEqual(420);
  });

  it('Word：4 行（上限）、B4 排 8 列仍是單頁（頁數＝教室數），列高等於 labelBoxMm', async () => {
    const f = withNotes(Array.from({ length: 4 }, (_, i) => `*第${i + 1}行注意事項。`).join('\n'), { paper: 'B4', labelCols: 6, labelRows: 8 });
    const pages = buildLabelPages(f, 'class');
    expect(pages[0]!.notes).toHaveLength(4);
    const x = await docXml(f);
    const rowH = Number(x.match(/<w:trHeight w:val="(\d+)"/)![1]);
    expect(rowH).toBe(Math.round((labelBoxMm(pages[0]!.layout, 10, 4).h * 1440) / 25.4));
    expect((x.match(/<w:sectPr/g) ?? []).length).toBe(pages.length);
  });

  it('舊存檔相容：settings.json 沒有 labelNotes 欄位也能讀，輸出是預設文字', async () => {
    const fs = createMemoryFS();
    const old = { schoolName: '範例高中', headerText: '模擬考', defaultLabelPaper: 'B4', classes: [], classrooms: [] };
    fs.files.set('settings.json', encode(old));
    const { data } = await loadDoc(fs);
    expect(data.settings.labelNotes).toBeUndefined();
    expect(labelNoteLines(data.settings.labelNotes)).toEqual(labelNoteLines(DEFAULT_LABEL_NOTES));
  });
});
