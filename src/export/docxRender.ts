/**
 * Word 輸出（D29、D44）：把中介模型畫成 .docx。
 * 字型：Regular 嵌 Big5 全集，Bold 只嵌實際用粗體的字（數字、編號、固定詞）。
 * boldMode：
 *  - 'embed-bold'（預設）：docx 套件原生寫法，Bold 掛在同一家族的 embedBold，文字用 bold 旗標。
 *  - 'separate-family'：Bold 當另一個字型家族「Noto Sans TC Bold」嵌入，粗體字用該家族（備案）。
 *    兩者待真檔抽驗後擇一（見 docs/dispatch/完工-D.md）。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ISectionOptions,
} from 'docx';
import {
  footerText,
  labelCellMm,
  mmToTwip,
  PAPER_MM,
  type CellModel,
  type LabelPageModel,
  type ListPageModel,
  type TablePageModel,
  type SeatPageModel,
} from './model';

export const FONT = 'Noto Sans TC';
export const FONT_BOLD = 'Noto Sans TC Bold';

export interface FontData {
  regular: Uint8Array;
  bold: Uint8Array;
}
export type BoldMode = 'separate-family' | 'embed-bold';
export interface DocxOptions {
  fonts: FontData;
  generatedAt: string;
  dataVersion: string;
  boldMode?: BoldMode;
  /** 標籤頁邊界（mm）。印表機不能印到紙邊，預設 10mm，可由使用者核對後調整 */
  labelMarginMm?: number;
}

/** 抽離考試座位表的柔和單色（UI-23，主色 #274690 的淡底） */
const DETACH = { bg: 'E6EBF7', line: '274690', fg: '274690' };

interface RunOpts {
  size: number; // pt
  bold?: boolean;
  color?: string;
}
function run(text: string, o: RunOpts, mode: BoldMode): TextRun {
  const useBoldFamily = o.bold && mode === 'separate-family';
  const name = useBoldFamily ? FONT_BOLD : FONT;
  return new TextRun({
    text,
    size: Math.round(o.size * 2),
    bold: o.bold && mode === 'embed-bold' ? true : undefined,
    color: o.color,
    font: { ascii: name, hAnsi: name, eastAsia: name, cs: name },
  });
}

type Bd = { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string; space?: number };
const thin = (color = '808080'): Bd => ({ style: BorderStyle.SINGLE, size: 4, color });
const allBorders = (b: Bd) => ({ top: b, bottom: b, left: b, right: b });
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function para(children: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.CENTER, extra: object = {}): Paragraph {
  return new Paragraph({ alignment: align, spacing: { before: 0, after: 0 }, children, ...extra });
}

function tagParagraphs(cell: CellModel, sizePt: number, mode: BoldMode): Paragraph[] {
  return cell.tags.map((t) =>
    t.kind === 'absent'
      ? para([run(t.text, { size: sizePt, bold: true, color: 'FFFFFF' }, mode)], AlignmentType.CENTER, {
          shading: { type: ShadingType.CLEAR, fill: '000000', color: 'auto' },
        })
      : para([run(t.text, { size: sizePt, bold: true, color: '000000' }, mode)], AlignmentType.CENTER, {
          border: allBorders({ style: BorderStyle.DOUBLE, size: 6, color: '000000', space: 1 }),
        }),
  );
}

function footer(opts: DocxOptions): Footer {
  return new Footer({
    children: [para([run(footerText(opts.generatedAt, opts.dataVersion), { size: 8, color: '555555' }, 'separate-family')], AlignmentType.RIGHT)],
  });
}

/* ---------- 座位表（A4）---------- */

const A4_MARGIN_MM = 12;

function seatSection(page: SeatPageModel, opts: DocxOptions): ISectionOptions {
  const mode = opts.boldMode ?? 'embed-bold';
  const contentW = mmToTwip(PAPER_MM.A4.w - 2 * A4_MARGIN_MM);
  const depthColW = mmToTwip(8);
  const colW = Math.floor((contentW - depthColW) / Math.max(page.rows, 1));
  const columnWidths = [depthColW, ...Array<number>(page.rows).fill(colW)];
  const totalW = columnWidths.reduce((a, b) => a + b, 0);
  const rowH = mmToTwip(Math.min(24, 190 / (page.depth + 1)));

  let sizeCode = Math.min(18, (colW / 1440) * 25.4 * 0.62);
  let sizeSmall = Math.min(9, (colW / 1440) * 25.4 * 0.36);
  const sizeCoord = 7;
  const sizeTag = 7;
  // 格內有「X 不考／＋ 加考」標示時，內容會比列高多：Word 的列高是固定值，超出的部分會被裁掉，
  // 只剩一條線（使用者回報的「不正確的線條」）。這裡先算內容需要多高，不夠就把考生編號與姓名縮小，標示字維持可讀。
  // 中文字型行高約為字級的 1.5 倍，另加上下邊距。
  const LH = 1.5;
  const maxTags = Math.max(0, ...[...page.cells.values()].map((c) => c.tags.length));
  const availPt = rowH / 20 - 6;
  const fixedPt = (sizeCoord + sizeTag * maxTags) * LH;
  const flexPt = (sizeCode + sizeSmall) * LH;
  if (fixedPt + flexPt > availPt) {
    const k = Math.max(0.5, (availPt - fixedPt) / flexPt);
    sizeCode *= k;
    sizeSmall *= k;
  }

  const rows: TableRow[] = [];
  // 深位由上到下：最大深位在上、1 在下（講臺在下方，0101 在左下角）
  for (let d = page.depth; d >= 1; d--) {
    const cells: TableCell[] = [
      new TableCell({
        width: { size: depthColW, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: allBorders(none),
        children: [para([run(String(d), { size: 10, bold: true }, mode)])],
      }),
    ];
    for (let r = 1; r <= page.rows; r++) {
      const key = `${r}-${d}`;
      const cell = page.cells.get(key);
      const usable = page.usable.has(key);
      const pal = cell ? (page.detachStyle ? DETACH : { bg: cell.colorBg, line: cell.colorLine, fg: cell.colorFg }) : null;
      const children: Paragraph[] = cell
        ? [
            para([run(cell.coord, { size: sizeCoord, color: pal!.fg }, mode)], AlignmentType.RIGHT),
            para([run(cell.code, { size: sizeCode, bold: true, color: pal!.fg }, mode)]),
            para([run(`${cell.classLabel}｜${cell.name}`, { size: sizeSmall, color: pal!.fg }, mode)]),
            ...tagParagraphs(cell, sizeTag, mode),
          ]
        : [para([run(usable ? '' : '空位', { size: 7, color: '999999' }, mode)])];
      cells.push(
        new TableCell({
          width: { size: colW, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 20, bottom: 20, left: 30, right: 30 },
          shading: pal ? { type: ShadingType.CLEAR, fill: pal.bg, color: 'auto' } : usable ? undefined : { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' },
          borders: allBorders(pal ? thin(pal.line) : usable ? thin('BBBBBB') : { style: BorderStyle.DASHED, size: 4, color: '999999' }),
          children,
        }),
      );
    }
    rows.push(new TableRow({ height: { value: rowH, rule: HeightRule.ATLEAST }, cantSplit: true, children: cells }));
  }
  // 底部標「第N排」
  rows.push(
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: depthColW, type: WidthType.DXA }, borders: allBorders(none), children: [para([])] }),
        ...Array.from({ length: page.rows }, (_, i) =>
          new TableCell({
            width: { size: colW, type: WidthType.DXA },
            borders: allBorders(none),
            children: [para([run(`第${i + 1}排`, { size: 10, bold: true }, mode)])],
          }),
        ),
      ],
    }),
  );

  const s = page.stats;
  const statsLines = [
    `各班人數：${s.perClass.map((c) => `${c.className} ${c.count}`).join('　') || '無'}`,
    `本教室考生合計：${s.total} 人`,
    `各科考試人數：${s.perSubject.map((c) => `${c.subjectName} ${c.count}`).join('　')}`,
  ];

  return {
    properties: {
      page: {
        size: { width: mmToTwip(PAPER_MM.A4.w), height: mmToTwip(PAPER_MM.A4.h) },
        margin: { top: mmToTwip(A4_MARGIN_MM), bottom: mmToTwip(A4_MARGIN_MM), left: mmToTwip(A4_MARGIN_MM), right: mmToTwip(A4_MARGIN_MM), footer: mmToTwip(6) },
      },
    },
    footers: { default: footer(opts) },
    children: [
      para([run(page.title, { size: 16, bold: true }, mode)], AlignmentType.CENTER, { spacing: { before: 0, after: 120 } }),
      new Table({ width: { size: totalW, type: WidthType.DXA }, columnWidths, layout: TableLayoutType.FIXED, rows }),
      para([run('▲ 講臺在座位表下方（0101 在左下角）　座標＝排－深位', { size: 8, color: '555555' }, mode)], AlignmentType.CENTER, { spacing: { before: 60, after: 60 } }),
      ...statsLines.map((l) => para([run(l, { size: 13 }, mode)], AlignmentType.LEFT, { spacing: { before: 0, after: 60 } })),
    ],
  };
}

/* ---------- 標籤（B4／A3）---------- */

function labelSection(page: LabelPageModel, opts: DocxOptions): ISectionOptions {
  const mode = opts.boldMode ?? 'embed-bold';
  const margin = opts.labelMarginMm ?? 10;
  const { layout } = page;
  const paper = PAPER_MM[layout.paper];
  const cell = labelCellMm(layout, margin);
  const colW = Math.min(Math.floor((cell.w * 1440) / 25.4), Math.floor(mmToTwip(cell.w)));
  // 預留 3mm 給 Word 在表格後必須有的段落，避免多出一張空白頁
  const rowH = Math.min(Math.floor((cell.h * 1440) / 25.4), Math.floor(mmToTwip(cell.h)));
  const sizeCode = cell.w * 0.8;
  const sizeName = cell.w * 0.4;
  const sizeSmall = cell.w * 0.26;

  const rows: TableRow[] = [];
  for (let r = 0; r < layout.rows; r++) {
    const cells: TableCell[] = [];
    for (let c = 0; c < layout.cols; c++) {
      const m = page.cells[r * layout.cols + c];
      cells.push(
        new TableCell({
          width: { size: colW, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 20, bottom: 20, left: 30, right: 30 },
          // 標籤一律白底，細實線相鄰共用（P12）；班級用文字印出，黑白也分得出（D39）
          borders: allBorders(thin('666666')),
          children: m
            ? [
                para([run(m.coord, { size: sizeSmall }, mode)], AlignmentType.RIGHT),
                para([run(m.code, { size: sizeCode, bold: true }, mode)]),
                para([run(`${m.classLabel}｜${m.name}`, { size: sizeName, color: '000000' }, mode)]),
                ...tagParagraphs(m, sizeSmall, mode),
              ]
            : [para([])],
        }),
      );
    }
    rows.push(new TableRow({ height: { value: rowH, rule: HeightRule.EXACT }, cantSplit: true, children: cells }));
  }
  return {
    properties: {
      page: {
        size: { width: mmToTwip(paper.w), height: mmToTwip(paper.h) },
        margin: { top: mmToTwip(margin), bottom: mmToTwip(margin), left: mmToTwip(margin), right: mmToTwip(margin), footer: mmToTwip(3) },
      },
    },
    footers: { default: footer(opts) },
    children: [
      new Table({ width: { size: colW * layout.cols, type: WidthType.DXA }, columnWidths: Array<number>(layout.cols).fill(colW), layout: TableLayoutType.FIXED, rows }),
      para([], AlignmentType.LEFT, { spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' } }),
    ],
  };
}

/* ---------- 抽離名單（A4）---------- */

function listSection(page: ListPageModel, opts: DocxOptions): ISectionOptions {
  const mode = opts.boldMode ?? 'embed-bold';
  const contentW = mmToTwip(PAPER_MM.A4.w - 2 * A4_MARGIN_MM);
  const fr = [2, 1.4, 1.6, 1.8, 3, 1.6];
  const sum = fr.reduce((a, b) => a + b, 0);
  const columnWidths = fr.map((f) => Math.floor((contentW * f) / sum));
  const heads = ['科目', '考生編號', '班級', '姓名', '去處（教室／座位）', '用途'];
  const mk = (texts: string[], head: boolean) =>
    new TableRow({
      tableHeader: head,
      cantSplit: true,
      children: texts.map(
        (t, i) =>
          new TableCell({
            width: { size: columnWidths[i]!, type: WidthType.DXA },
            borders: allBorders(thin('808080')),
            shading: head ? { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' } : undefined,
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: [para([run(t, { size: 10.5, bold: head }, mode)], AlignmentType.LEFT)],
          }),
      ),
    });
  const rows = [mk(heads, true), ...page.rows.map((r) => mk([r.subject, r.code, r.className, r.name, r.place, r.purpose], false))];
  return {
    properties: {
      page: {
        size: { width: mmToTwip(PAPER_MM.A4.w), height: mmToTwip(PAPER_MM.A4.h) },
        margin: { top: mmToTwip(A4_MARGIN_MM), bottom: mmToTwip(A4_MARGIN_MM), left: mmToTwip(A4_MARGIN_MM), right: mmToTwip(A4_MARGIN_MM), footer: mmToTwip(6) },
      },
    },
    footers: { default: footer(opts) },
    children: [
      para([run(page.title, { size: 16, bold: true }, mode)], AlignmentType.CENTER, { spacing: { before: 0, after: 120 } }),
      new Table({ width: { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths, layout: TableLayoutType.FIXED, rows }),
    ],
  };
}

/* ---------- 通用表格頁（A4，領卷清單等）---------- */

function tableSection(page: TablePageModel, opts: DocxOptions): ISectionOptions {
  const mode = opts.boldMode ?? 'embed-bold';
  const contentW = mmToTwip(PAPER_MM.A4.w - 2 * A4_MARGIN_MM);
  const sum = page.widths.reduce((a, b) => a + b, 0);
  const columnWidths = page.widths.map((f) => Math.floor((contentW * f) / sum));
  const mk = (texts: string[], kind: 'head' | 'body' | 'total') =>
    new TableRow({
      tableHeader: kind === 'head',
      cantSplit: true,
      height: kind === 'head' ? undefined : { value: mmToTwip(9), rule: HeightRule.ATLEAST },
      children: texts.map(
        (t, i) =>
          new TableCell({
            width: { size: columnWidths[i]!, type: WidthType.DXA },
            borders: allBorders(thin('808080')),
            shading: kind === 'body' ? undefined : { type: ShadingType.CLEAR, fill: kind === 'head' ? 'EEEEEE' : 'F4F4F4', color: 'auto' },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: [para([run(t, { size: 10.5, bold: kind !== 'body' }, mode)], AlignmentType.LEFT)],
          }),
      ),
    });
  const rows = [mk(page.heads, 'head'), ...page.rows.map((r) => mk(r, 'body')), ...(page.totalRow ? [mk(page.totalRow, 'total')] : [])];
  return {
    properties: {
      page: {
        size: { width: mmToTwip(PAPER_MM.A4.w), height: mmToTwip(PAPER_MM.A4.h) },
        margin: { top: mmToTwip(A4_MARGIN_MM), bottom: mmToTwip(A4_MARGIN_MM), left: mmToTwip(A4_MARGIN_MM), right: mmToTwip(A4_MARGIN_MM), footer: mmToTwip(6) },
      },
    },
    footers: { default: footer(opts) },
    children: [
      para([run(page.title, { size: 16, bold: true }, mode)], AlignmentType.CENTER, { spacing: { before: 0, after: 80 } }),
      ...(page.subtitle ? [para([run(page.subtitle, { size: 12 }, mode)], AlignmentType.CENTER, { spacing: { before: 0, after: 120 } })] : []),
      new Table({ width: { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths, layout: TableLayoutType.FIXED, rows }),
    ],
  };
}

/* ---------- 組裝 ---------- */

export type DocxPages = { seat?: SeatPageModel[]; label?: LabelPageModel[]; list?: ListPageModel | ListPageModel[]; table?: TablePageModel[] };

/** 把一類輸出合併成一個多頁檔（D69）；回傳 .docx 位元組 */
export async function renderDocx(pages: DocxPages, opts: DocxOptions): Promise<Uint8Array> {
  const mode = opts.boldMode ?? 'embed-bold';
  const sections: ISectionOptions[] = [];
  for (const p of pages.seat ?? []) sections.push(seatSection(p, opts));
  for (const p of pages.label ?? []) sections.push(labelSection(p, opts));
  for (const l of [pages.list ?? []].flat()) sections.push(listSection(l, opts));
  for (const t of pages.table ?? []) sections.push(tableSection(t, opts));
  if (sections.length === 0) throw new Error('沒有可輸出的頁面');
  const doc = new Document({
    creator: '模擬考小幫手',
    title: '模擬考小幫手輸出',
    // docx 9.15 原生支援 bold 面（寫成同家族的 embedBold）；舊做法把 Bold 當另一個家族
    fonts:
      mode === 'embed-bold'
        ? [{ name: FONT, data: opts.fonts.regular as never, bold: opts.fonts.bold as never, characterSet: '00' }]
        : [
            { name: FONT, data: opts.fonts.regular as never, characterSet: '00' },
            { name: FONT_BOLD, data: opts.fonts.bold as never, characterSet: '00' },
          ],
    styles: { default: { document: { run: { font: { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT }, size: 20 } } } },
    sections,
  });
  // toArrayBuffer：瀏覽器沒有 Node 的 Buffer
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
