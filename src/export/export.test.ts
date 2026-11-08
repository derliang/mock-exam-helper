import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeFixture } from './fixtures';
import {
  buildDetachList,
  buildLabelPages,
  buildSeatPages,
  findMissingChars,
  footerText,
  labelCellMm,
  defaultLabelLayout,
  mmToTwip,
  renderDocx,
  renderPrintHtml,
  FONT,
  FONT_BOLD,
} from './index';

const fontDir = new URL('./fonts/', import.meta.url);
const fonts = {
  regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', fontDir))),
  bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', fontDir))),
};
const charset = new Set(readFileSync(new URL('NotoSansTC-Regular-big5.chars.txt', fontDir), 'utf8'));
const meta = { generatedAt: '2026-11-08T08:30:00Z', dataVersion: 'A1B2C3D4' };

async function unzip(buf: Uint8Array) {
  const z = await JSZip.loadAsync(buf);
  const text = async (n: string) => z.file(n)!.async('string');
  return { z, text };
}

describe('頁尾（D66）', () => {
  it('台北時間＋資料版本碼', () => {
    expect(footerText('2026-11-08T08:30:00Z', 'A1B2C3D4')).toBe('產生時間：2026-11-08 16:30（台北）　資料版本碼：A1B2C3D4');
  });
});

describe('版面模型', () => {
  it('座位表：每間教室一頁，預備教室依抽離科目另成柔和單色頁（UI-23）', () => {
    const pages = buildSeatPages(makeFixture());
    expect(pages.map((p) => p.detachStyle)).toEqual([false, false, true]);
    expect(pages[0]!.cells.get('1-1')!.code).toBe('0101');
    expect(pages[2]!.title).toContain('抽離考試（英文）');
    expect(pages[2]!.cells.size).toBe(2);
  });

  it('統計依該教室計算（D40）', () => {
    const [p1, p2] = buildSeatPages(makeFixture());
    expect(p1!.stats.total).toBe(18);
    expect(p1!.stats.perClass).toEqual([
      { className: '溫', count: 10 },
      { className: '良', count: 8 },
    ]);
    // 使用核心 roomStats：英文有 2 人抽離到預備教室，本教室實際考 16 人
    expect(p1!.stats.perSubject.map((s) => s.count)).toEqual([18, 16, 18]);
    expect(p2!.stats.total).toBe(12);
  });

  it('空位只在最後（D72）：可用座位集合是連續前段', () => {
    const p = buildSeatPages(makeFixture())[0]!;
    expect(p.usable.size).toBe(18);
    expect(p.usable.has('4-3')).toBe(true);
    expect(p.usable.has('4-4')).toBe(false);
  });

  it('個別標示帶文字（D39）', () => {
    const p = buildSeatPages(makeFixture())[0]!;
    expect(p.cells.get('1-2')!.tags[0]).toEqual({ kind: 'absent', text: 'X 不考英文' });
    expect(p.cells.get('1-3')!.tags[0]).toEqual({ kind: 'extra', text: '＋ 加考數學' });
  });

  it('標籤：格數參數化，每張紙格子大小固定、順序同座位表（D69/D72）', () => {
    const f48 = labelCellMm({ paper: 'B4', cols: 6, rows: 8 }, 0);
    expect(f48.w).toBeCloseTo(250 / 6, 5);
    expect(f48.h).toBeCloseTo((353 - 3) / 8, 5);
    expect(labelCellMm({ paper: 'A3', cols: 7, rows: 7 }, 0)).toEqual({ w: 35, h: 35 });
    expect(labelCellMm({ paper: 'B4', cols: 7, rows: 7 }, 0).w).toBeCloseTo(250 / 7, 5);
    const pages = buildLabelPages(makeFixture({ labelCols: 7, labelRows: 7 }));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.cells.slice(0, 3).map((c) => c.coord)).toEqual(['1-1', '1-2', '1-3']);
    expect(pages[0]!.cells).toHaveLength(18);
  });

  it('標籤預設（D74）：A3 7×7 固定 35mm 正方，B4 6 欄×8 列', () => {
    expect(defaultLabelLayout('A3')).toEqual({ paper: 'A3', cols: 7, rows: 7 });
    expect(defaultLabelLayout('B4')).toEqual({ paper: 'B4', cols: 6, rows: 8 });
    expect(labelCellMm(defaultLabelLayout('A3'), 10)).toEqual({ w: 35, h: 35 });
    const b4 = labelCellMm(defaultLabelLayout('B4'), 10);
    expect(b4.w).toBeCloseTo(230 / 6, 5);
    expect(b4.h).toBeCloseTo((353 - 20 - 3) / 8, 5);
  });

  it('標籤：座位多於格數時丟錯，不默默截斷', () => {
    expect(() => buildLabelPages(makeFixture({ labelCols: 4, labelRows: 4 }))).toThrow(/超過標籤/);
  });

  it('抽離名單：抽離考試／自習／單人特例都列', () => {
    const l = buildDetachList(makeFixture());
    expect(l.rows).toHaveLength(4);
    expect(l.rows.map((r) => r.purpose).sort()).toEqual(['單人考試', '抽離自習', '抽離考試', '抽離考試'].sort());
    expect(l.rows.find((r) => r.code === '0105')!.place).toBe('預備教室 1-1');
  });

  it('字集外罕用字：回報班級＋座號＋字元，不含姓名', () => {
    const f = makeFixture();
    f.students[0]!.name = '甲\u{2A6A5}';
    const miss = findMissingChars(f, (ch) => charset.has(ch));
    expect(miss).toEqual([{ classNo: 1, seatNo: 1, ch: '\u{2A6A5}' }]);
  });
});

describe('Word 輸出（D44/D45）', () => {
  it('內嵌字型、A4 座位表、頁尾版本碼', async () => {
    const f = makeFixture();
    const buf = await renderDocx({ seat: buildSeatPages(f) }, { fonts, ...meta });
    const { z, text } = await unzip(buf);
    expect(Object.keys(z.files).filter((n) => n.startsWith('word/fonts/'))).toHaveLength(2);
    expect(await text('word/settings.xml')).toContain('embedTrueTypeFonts');
    const ft = await text('word/fontTable.xml');
    expect(ft).toContain(`w:name="${FONT}"`);
    expect(ft).toContain(`w:name="${FONT_BOLD}"`);
    const doc = await text('word/document.xml');
    expect([...doc.matchAll(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/g)].map((m) => [m[1], m[2]])).toEqual(
      Array(3).fill([String(mmToTwip(210)), String(mmToTwip(297))]),
    );
    expect(doc).toContain('第4排');
    expect(doc).toContain('0101');
    expect(doc).toContain('各科考試人數');
    expect(doc).toContain(`w:ascii="${FONT_BOLD}"`);
    const footers = await Promise.all(Object.keys(z.files).filter((n) => /word\/footer\d+\.xml/.test(n)).map((n) => text(n)));
    expect(footers.length).toBeGreaterThan(0);
    for (const x of footers) expect(x).toContain('資料版本碼：A1B2C3D4');
  });

  it('字型位元組還原後與原檔相同（混淆正確）', async () => {
    const buf = await renderDocx({ seat: buildSeatPages(makeFixture()) }, { fonts, ...meta });
    const { z, text } = await unzip(buf);
    const keys = [...(await text('word/fontTable.xml')).matchAll(/fontKey="\{([^}]+)\}"/g)].map((m) => m[1]!);
    const d = Buffer.from(await z.file('word/fonts/font1.odttf')!.async('nodebuffer'));
    const k = Buffer.from(keys[0]!.replace(/-/g, ''), 'hex').reverse();
    for (let j = 0; j < 32; j++) d[j]! ^= k[j % 16]!;
    expect(d.equals(Buffer.from(fonts.regular))).toBe(true);
  });

  it('標籤：B4 紙張、欄寬相等、列高固定、7×7 與 6×8 都能出', async () => {
    for (const [cols, rows] of [[6, 8], [7, 7]] as const) {
      const f = makeFixture({ labelCols: cols, labelRows: rows });
      const buf = await renderDocx({ label: buildLabelPages(f) }, { fonts, ...meta, labelMarginMm: 10 });
      const doc = await (await unzip(buf)).text('word/document.xml');
      const pg = [...doc.matchAll(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(pg).toEqual(Array(2).fill([mmToTwip(250), mmToTwip(353)]));
      const grid = [...doc.matchAll(/<w:tblGrid>(.*?)<\/w:tblGrid>/g)][0]![1]!;
      const widths = [...grid.matchAll(/w:w="(\d+)"/g)].map((m) => Number(m[1]));
      expect(widths).toHaveLength(cols);
      expect(new Set(widths).size).toBe(1);
      expect(widths[0]! * cols).toBeLessThanOrEqual(mmToTwip(250 - 20));
      const heights = [...doc.matchAll(/<w:trHeight w:val="(\d+)" w:hRule="exact"/g)].map((m) => Number(m[1]));
      expect(heights).toHaveLength(rows * 2);
      expect(new Set(heights).size).toBe(1);
      expect(heights[0]! * rows).toBeLessThanOrEqual(mmToTwip(353 - 20));
    }
  });

  it('A3 7×7：每格 35mm 正方、格子大小不隨人數變', async () => {
    const f = makeFixture({ paper: 'A3', labelCols: 7, labelRows: 7 });
    const doc = await (await unzip(await renderDocx({ label: buildLabelPages(f) }, { fonts, ...meta }))).text('word/document.xml');
    const widths = [...[...doc.matchAll(/<w:tblGrid>(.*?)<\/w:tblGrid>/g)][0]![1]!.matchAll(/w:w="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths).toEqual(Array(7).fill(mmToTwip(35)));
    const heights = new Set([...doc.matchAll(/<w:trHeight w:val="(\d+)" w:hRule="exact"/g)].map((m) => Number(m[1])));
    expect([...heights]).toEqual([mmToTwip(35)]);
  });

  it('embed-bold 後處理：Bold 掛在同一家族下，不再有獨立 Bold 家族', async () => {
    const buf = await renderDocx({ seat: buildSeatPages(makeFixture()) }, { fonts, ...meta, boldMode: 'embed-bold' });
    const { text } = await unzip(buf);
    const ft = await text('word/fontTable.xml');
    expect(ft).toContain('<w:embedBold ');
    expect(ft).not.toContain(FONT_BOLD);
    expect(await text('word/document.xml')).not.toContain(`w:ascii="${FONT_BOLD}"`);
  });

  it('抽離名單合併成一個檔，表頭重複', async () => {
    const buf = await renderDocx({ list: buildDetachList(makeFixture()) }, { fonts, ...meta });
    const doc = await (await unzip(buf)).text('word/document.xml');
    expect(doc).toContain('<w:tblHeader');
    expect(doc).toContain('教務處');
  });

  it('沒有頁面時丟錯', async () => {
    await expect(renderDocx({}, { fonts, ...meta })).rejects.toThrow();
  });
});

describe('PDF 列印 HTML（D29）', () => {
  it('具名紙張、頁尾版本碼、脫逸', () => {
    const f = makeFixture();
    f.students[0]!.name = '<b>&';
    const html = renderPrintHtml(
      { seat: buildSeatPages(f), label: buildLabelPages(f), list: buildDetachList(f) },
      meta,
    );
    expect(html).toContain('@page a4');
    expect(html).toContain('size: 250mm 353mm');
    expect(html).toContain('page:b4');
    expect(html).toContain('資料版本碼：A1B2C3D4');
    expect(html).toContain('&lt;b&gt;&amp;');
    expect(html).not.toContain('<b>&');
  });
});
