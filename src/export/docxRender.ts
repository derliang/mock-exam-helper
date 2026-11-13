/**
 * Word 輸出（D29、D44）：把中介模型畫成 .docx。
 * 字型：Regular 嵌 Big5 全集，Bold 只嵌實際用粗體的字（數字、編號、固定詞）。
 * boldMode：
 *  - 'embed-bold'（預設）：docx 套件原生寫法，Bold 掛在同一家族的 embedBold，文字用 bold 旗標。
 *  - 'separate-family'：Bold 當另一個字型家族「Noto Sans TC Bold」嵌入，粗體字用該家族（備案）。
 *    兩者待真檔抽驗後擇一（見 docs/archive/dispatch/完工-D.md）。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  LineRuleType,
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
import { hatchPng } from './hatchPng';
import {
  footerText,
  groupMarks,
  labelBoxMm,
  labelGrid,
  periodLineFontPt,
  mmToTwip,
  PAPER_MM,
  SEAT_PAGE,
  seatGeometry,
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

function footer(opts: DocxOptions): Footer {
  return new Footer({
    children: [para([run(footerText(opts.generatedAt, opts.dataVersion), { size: 8, color: '555555' }, 'separate-family')], AlignmentType.RIGHT)],
  });
}

const A4_MARGIN_MM = 12;

/* ---------- 座位表與標籤共用的小零件（版面照稿件，單位 mm／pt） ---------- */

const INK = '22201B';
const NAVY = '1F3A5F';
const GRAY = '6B6657';
const CUT = '8E8670';
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

/** 估算一段字的印出寬度（mm）。中文與全形標點 1em，數字與英文約 0.58em，空白約 0.28em */
function textMm(text: string, pt: number, bold = false): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if (/[!-~]/.test(ch)) em += /[ij|l.,:;!']/.test(ch) ? 0.3 : 0.58;
    else em += 1;
  }
  return em * pt * 0.3528 * (bold ? 1.02 : 1);
}

/** 固定行高的段落（mm）：用來精準留白與排版 */
function line(children: TextRun[], o: { h: number; align?: Align; before?: number; after?: number; left?: number; right?: number; extra?: object }): Paragraph {
  return new Paragraph({
    alignment: o.align ?? AlignmentType.CENTER,
    spacing: { before: mmToTwip(o.before ?? 0), after: mmToTwip(o.after ?? 0), line: Math.max(20, mmToTwip(o.h)), lineRule: LineRuleType.EXACT },
    indent: o.left || o.right ? { left: mmToTwip(o.left ?? 0), right: mmToTwip(o.right ?? 0) } : undefined,
    children,
    ...(o.extra ?? {}),
  });
}
const spacer = (h: number): Paragraph => line([], { h });

interface Run2 {
  size: number;
  bold?: boolean;
  color?: string;
  spacing?: number; // 字距（pt）
  font?: string;
}
function run2(text: string, o: Run2, mode: BoldMode): TextRun {
  const base = run(text, { size: o.size, bold: o.bold, color: o.color }, mode);
  if (!o.spacing && !o.font) return base;
  const name = o.font ?? (o.bold && mode === 'separate-family' ? FONT_BOLD : FONT);
  return new TextRun({
    text,
    size: Math.round(o.size * 2),
    bold: o.bold && (mode === 'embed-bold' || o.font) ? true : undefined,
    color: o.color,
    characterSpacing: o.spacing ? Math.round(o.spacing * 20) : undefined,
    font: { ascii: name, hAnsi: name, eastAsia: name, cs: name },
  });
}

// 大標題用襯線字（稿件寫 Noto Serif TC，新細明體備用）。不內嵌：只有「座位表」三個字用到，找不到時 Word 會自動換成系統的襯線字
const SERIF = 'Noto Serif TC';
const bd = (color: string, size: number, style: Bd['style'] = BorderStyle.SINGLE): Bd => ({ style, size, color });
const noBd = { top: none, bottom: none, left: none, right: none };
const HATCH_FILL = { type: ShadingType.CLEAR, fill: 'EAE5D4', color: 'auto' } as const;

/** 空位格：整格鋪斜線圖（圖片比格子內側小一點，避免蓋住框線） */
function hatchParas(wMm: number, hMm: number): Paragraph[] {
  const { data } = hatchPng(wMm, hMm);
  const px = (mm: number) => Math.round((mm * 96) / 25.4);
  return [
    new Paragraph({
      spacing: { before: 0, after: 0 },
      run: { size: 2 },
      children: [new ImageRun({ type: 'png', data, transformation: { width: px(wMm), height: px(hMm) } })],
    }),
  ];
}

/** 抬頭：左邊標題、右邊深色教室牌，底下一條深色線 */
function headBlock(
  o: { widthMm: number; h1: string; h2?: string; room: string; h1Pt: number; roomPt: number; padX: number; padY: number },
  mode: BoldMode,
): Table {
  const roomW = textMm(o.room, o.roomPt, true) + 2 * o.padX + 1.5;
  const leftW = o.widthMm - roomW;
  const lineBd = bd(NAVY, 18);
  const left: Paragraph[] = [
    line([run2(o.h1, { size: o.h1Pt, bold: true, color: NAVY, spacing: o.h1Pt * 0.04 }, mode)], { h: o.h1Pt * 0.3528 * 1.45, align: AlignmentType.LEFT }),
  ];
  if (o.h2) left.push(line([run2(o.h2, { size: 28, bold: true, font: SERIF }, mode)], { h: 28 * 0.3528 * 1.1 + 1.2, align: AlignmentType.LEFT, before: 1 }));
  const chip = new Table({
    width: { size: mmToTwip(roomW), type: WidthType.DXA },
    columnWidths: [mmToTwip(roomW)],
    layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: mmToTwip(roomW), type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
            borders: noBd,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: mmToTwip(o.padY), bottom: mmToTwip(o.padY), left: mmToTwip(o.padX), right: mmToTwip(o.padX) },
            children: [line([run2(o.room, { size: o.roomPt, bold: true, color: 'FFFFFF' }, mode)], { h: o.roomPt * 0.3528 * 1.45 })],
          }),
        ],
      }),
    ],
  });
  return new Table({
    width: { size: mmToTwip(o.widthMm), type: WidthType.DXA },
    columnWidths: [mmToTwip(leftW), mmToTwip(roomW)],
    layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: mmToTwip(leftW), type: WidthType.DXA }, verticalAlign: VerticalAlign.BOTTOM, borders: { ...noBd, bottom: lineBd }, margins: { top: 0, bottom: mmToTwip(3), left: 0, right: 0 }, children: left }),
          new TableCell({
            width: { size: mmToTwip(roomW), type: WidthType.DXA },
            verticalAlign: VerticalAlign.BOTTOM,
            borders: { ...noBd, bottom: lineBd },
            margins: { top: 0, bottom: mmToTwip(2.6), left: 0, right: 0 },
            children: [chip, line([], { h: 0.35 })],
          }),
        ],
      }),
    ],
  });
}

/** 格內的標示小牌（X 不考：黑底白字；＋ 加考：白底雙線框）。回傳固定行高的段落 */
function chipPara(c: { kind: 'x' | 'add'; text: string }, pt: number, innerMm: number, mode: BoldMode): Paragraph {
  const padH = 1.4;
  const w = textMm(c.text, pt, true) + 2 * padH;
  const side = Math.max(0, (innerMm - w) / 2);
  const col = c.kind === 'x' ? 'FFFFFF' : INK;
  const sp = (padH * 72) / 25.4; // 左右留白，用框線的 space 撐開（pt）
  const b = c.kind === 'x' ? bd(INK, 4) : bd(INK, 8, BorderStyle.DOUBLE);
  return line([run2(c.text, { size: pt, bold: true, color: col }, mode)], {
    h: pt * 0.3528 * 1.15,
    left: side,
    right: side,
    extra: {
      shading: c.kind === 'x' ? { type: ShadingType.CLEAR, fill: INK, color: 'auto' } : undefined,
      border: { top: { ...b, space: 1 }, bottom: { ...b, space: 1 }, left: { ...b, space: sp }, right: { ...b, space: sp } },
    },
  });
}

/** 格內最下方的標示區：固定高度 areaMm，標示垂直置中；沒有標示時是一段留白 */
function markArea(c: CellModel, pt: number, areaMm: number, innerMm: number, mode: BoldMode): Paragraph[] {
  const chips = groupMarks(c);
  if (chips.length === 0) return [spacer(areaMm)];
  const ch = pt * 0.3528 * 1.15 + 0.7; // 小牌高度（含上下框線）
  const gap = Math.max(0, (areaMm - ch * chips.length) / 2);
  return [spacer(gap), ...chips.map((m) => chipPara(m, pt, innerMm, mode)), spacer(gap)];
}

/** 一格（座位表或標籤）的段落：座標在右上、編號、班｜姓名、標示 */
function cellParas(
  c: CellModel,
  g: { h: number; innerW: number; topPad: number; codePt: number; namePt: number; coordPt: number; markPt: number; markArea: number; bottomPad: number; codeAtBottom: boolean; codeGap: number },
  fg: string,
  mode: BoldMode,
): Paragraph[] {
  const codeH = g.codePt * 0.3528;
  const nameH = g.namePt * 0.3528 * 1.15;
  const region = g.h - g.topPad - nameH - g.markArea - g.bottomPad;
  const before = g.codeAtBottom ? Math.max(0, region - codeH - g.codeGap + 1.2) : Math.max(0, (region - codeH) / 2);
  const after = g.codeAtBottom ? Math.max(0, g.codeGap - 1.2) : Math.max(0, (region - codeH) / 2);
  return [
    line([run2(c.coord, { size: g.coordPt, bold: true, color: '4A463A' }, mode)], { h: g.topPad, align: AlignmentType.RIGHT, right: 0.6 }),
    line([run2(c.code, { size: g.codePt, bold: true, color: INK, spacing: g.codePt * 0.02 }, mode)], { h: codeH, before, after }),
    line(
      [
        run2(c.classLabel, { size: g.namePt, bold: true, color: fg }, mode),
        run2(' ', { size: g.namePt * 0.8 }, mode),
        run2('|', { size: g.namePt, color: fg }, mode),
        run2(' ', { size: g.namePt * 0.8 }, mode),
        run2(c.name, { size: g.namePt, color: INK }, mode),
      ],
      { h: nameH },
    ),
    ...markArea(c, g.markPt, g.markArea, g.innerW, mode),
  ];
}

/** 預備教室合併標籤格（D94-5）：右上座標，下面每節一行、同字級（節次＋科目＋班座號） */
function periodParas(c: CellModel, w: number, h: number, coordPt: number, mode: BoldMode): Paragraph[] {
  const lines = c.periodLines ?? [];
  const top = 4.5;
  const pt = periodLineFontPt(lines, w - 3, h - top - 1.5);
  const lh = pt * 0.3528 * 1.3;
  return [
    line([run2(c.coord, { size: coordPt, bold: true, color: '4A463A' }, mode)], { h: top, align: AlignmentType.RIGHT, right: 0.6 }),
    ...lines.map((l) =>
      line(
        [
          run2(l.head, { size: Math.round(pt * 7) / 10, bold: true, color: INK }, mode),
          run2(' ', { size: Math.round(pt * 7) / 10 }, mode),
          run2(l.text, { size: pt, bold: true, color: INK }, mode),
        ],
        { h: lh, align: AlignmentType.LEFT, left: 0.6 },
      ),
    ),
  ];
}

function pageFooter(opts: DocxOptions): Footer {
  return new Footer({
    children: [line([run2(footerText(opts.generatedAt, opts.dataVersion), { size: 9.5, color: GRAY }, 'separate-family')], { h: 4.6 })],
  });
}

/* ---------- 座位表（A4，照稿件）---------- */

function seatSection(page: SeatPageModel, opts: DocxOptions): ISectionOptions {
  const mode = opts.boldMode ?? 'embed-bold';
  const { cw, ch, st } = seatGeometry(page);
  const innerW = SEAT_PAGE.w - 2 * SEAT_PAGE.padX;
  const axisW = 6.5;
  const tw = (mm: number) => mmToTwip(mm);
  const noInside = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

  // 小標籤列：共 N 人、不考／加考各科人數
  const chipCols: number[] = [];
  const chipCells: TableCell[] = [];
  page.chips.forEach((t, i) => {
    if (i > 0) {
      chipCols.push(tw(2));
      chipCells.push(new TableCell({ width: { size: tw(2), type: WidthType.DXA }, borders: noBd, children: [line([], { h: 1 })] }));
    }
    const w = textMm(t, 12, true) * 1.06 + 7 + 3;
    chipCols.push(tw(w));
    chipCells.push(
      new TableCell({
        width: { size: tw(w), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: i === 0 ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' } : undefined,
        borders: { top: bd(NAVY, 7), bottom: bd(NAVY, 7), left: bd(NAVY, 7), right: bd(NAVY, 7) },
        margins: { top: 0, bottom: 0, left: tw(3.5), right: tw(3.5) },
        children: [line([run2(t, { size: 12, bold: true, color: i === 0 ? 'FFFFFF' : NAVY }, mode)], { h: 7 })],
      }),
    );
  });
  const chipTable = new Table({ width: { size: chipCols.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: chipCols, layout: TableLayoutType.FIXED, borders: noInside, rows: [new TableRow({ height: { value: tw(7.2), rule: HeightRule.EXACT }, children: chipCells })] });

  // 座位格：最外框深色粗線，格間細線；有標示的格加粗黑框
  const g = { h: ch, innerW: cw - 1.4, topPad: 4.5, codePt: 19, namePt: 8.5, coordPt: 6.5, markPt: 7.5, markArea: 5.2, bottomPad: 0.8, codeAtBottom: false, codeGap: 0 };
  const rows: TableRow[] = [];
  for (let d = page.depth; d >= 1; d--) {
    const cells: TableCell[] = [
      new TableCell({
        width: { size: tw(axisW), type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: noBd,
        margins: { top: 0, bottom: 0, left: 0, right: tw(1.5) },
        children: [line([run2(String(d), { size: 7, bold: true, color: GRAY }, mode)], { h: 3.2, align: AlignmentType.RIGHT })],
      }),
    ];
    for (let r = 1; r <= page.rows; r++) {
      const c = page.cells.get(`${r}-${d}`);
      const edge = (on: boolean) => (on ? bd(INK, 16) : bd(CUT, 7));
      const marked = !!c && c.marks.length > 0;
      const frame = bd(INK, 16);
      const borders = marked
        ? { top: frame, bottom: frame, left: frame, right: frame }
        : { top: edge(d === page.depth), bottom: edge(d === 1), left: edge(r === 1), right: edge(r === page.rows) };
      const pal = c ? (page.detachStyle ? DETACH : { bg: c.colorBg, line: c.colorLine, fg: c.colorFg }) : null;
      cells.push(
        new TableCell({
          width: { size: tw(cw), type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 0, bottom: 0, left: tw(0.5), right: tw(0.5) },
          shading: c ? { type: ShadingType.CLEAR, fill: pal!.bg, color: 'auto' } : HATCH_FILL,
          borders,
          children: c ? cellParas(c, g, pal!.fg, mode) : hatchParas(cw - 1.3, ch - 1.4),
        }),
      );
    }
    rows.push(new TableRow({ height: { value: tw(ch), rule: HeightRule.EXACT }, cantSplit: true, children: cells }));
  }
  rows.push(
    new TableRow({
      height: { value: tw(4.4), rule: HeightRule.EXACT },
      cantSplit: true,
      children: [
        new TableCell({ width: { size: tw(axisW), type: WidthType.DXA }, borders: noBd, children: [spacer(1)] }),
        ...Array.from({ length: page.rows }, (_, i) =>
          new TableCell({
            width: { size: tw(cw), type: WidthType.DXA },
            borders: noBd,
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [line([run2(`第${i + 1}排`, { size: 7, bold: true, color: GRAY }, mode)], { h: 3.4 })],
          }),
        ),
      ],
    }),
  );
  const gridW = axisW + cw * page.rows;
  const grid = new Table({ width: { size: tw(gridW), type: WidthType.DXA }, columnWidths: [tw(axisW), ...Array<number>(page.rows).fill(tw(cw))], layout: TableLayoutType.FIXED, alignment: AlignmentType.CENTER, borders: noInside, rows });

  // 講臺列：左邊共 N 人、中間講臺框
  const podW = 40;
  const sideW = (innerW - podW) / 2;
  const podBd = bd(INK, 12);
  const bottom = new Table({
    width: { size: tw(innerW), type: WidthType.DXA },
    columnWidths: [tw(sideW), tw(podW), tw(sideW)],
    layout: TableLayoutType.FIXED,
    borders: noInside,
    rows: [
      new TableRow({
        height: { value: tw(8.4), rule: HeightRule.EXACT },
        children: [
          new TableCell({ width: { size: tw(sideW), type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, borders: noBd, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [line([run2(`共 ${page.stats.total} 人`, { size: 9 }, mode)], { h: 4.6, align: AlignmentType.LEFT })] }),
          new TableCell({
            width: { size: tw(podW), type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: { top: podBd, bottom: podBd, left: podBd, right: podBd },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [line([run2('講臺', { size: 13, bold: true, color: INK, spacing: 13 * 0.6 }, mode)], { h: 6.4, left: 1.4 })],
          }),
          new TableCell({ width: { size: tw(sideW), type: WidthType.DXA }, borders: noBd, children: [line([], { h: 1 })] }),
        ],
      }),
    ],
  });

  // 統計表
  const nCls = page.stats.table.classes.length;
  const classW = Math.min(22.5, (innerW - 30 - 32) / Math.max(1, nCls));
  const totalW = 32;
  const firstW = innerW - classW * nCls - totalW;
  const stCols = [firstW, ...Array<number>(nCls).fill(classW), totalW];
  const stBd = { top: bd(CUT, 7), bottom: bd(CUT, 7), left: bd(CUT, 7), right: bd(CUT, 7) };
  const stCell = (text: string, i: number, o: { head?: boolean; bold?: boolean }) =>
    new TableCell({
      width: { size: tw(stCols[i]!), type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: o.head ? { type: ShadingType.CLEAR, fill: 'F3EEDD', color: 'auto' } : undefined,
      borders: stBd,
      margins: { top: 0, bottom: 0, left: tw(2), right: tw(2) },
      children: [line([run2(text, { size: 13, bold: o.head || o.bold }, mode)], { h: 6.4, align: i === 0 && !o.head ? AlignmentType.LEFT : AlignmentType.CENTER })],
    });
  const stRowsT = [
    new TableRow({ height: { value: tw(8.6), rule: HeightRule.EXACT }, children: ['項目', ...page.stats.table.classes, '合計'].map((t, i) => stCell(t, i, { head: true })) }),
    ...st.map((r) => new TableRow({ height: { value: tw(8.6), rule: HeightRule.EXACT }, children: [r.label, ...r.per.map(String), String(r.total)].map((t, i, a) => stCell(t, i, { bold: i === a.length - 1 })) })),
  ];
  const stTable = new Table({ width: { size: tw(innerW), type: WidthType.DXA }, columnWidths: stCols.map(tw), layout: TableLayoutType.FIXED, borders: noInside, rows: stRowsT });

  return {
    properties: {
      page: {
        size: { width: tw(PAPER_MM.A4.w), height: tw(PAPER_MM.A4.h) },
        margin: { top: tw(SEAT_PAGE.padY), bottom: tw(SEAT_PAGE.padY), left: tw(SEAT_PAGE.padX), right: tw(SEAT_PAGE.padX), footer: tw(6) },
      },
    },
    footers: { default: pageFooter(opts) },
    children: [
      headBlock({ widthMm: innerW, h1: page.heading ?? page.examName, ...(page.heading ? {} : { h2: '座位表' }), room: page.roomName, h1Pt: 15, roomPt: 16, padX: 6, padY: 1.6 }, mode),
      spacer(3.5),
      chipTable,
      spacer(4),
      grid,
      spacer(3),
      bottom,
      spacer(5),
      stTable,
      line([], { h: 0.35 }),
    ],
  };
}

/* ---------- 標籤（B4／A3，照稿件）---------- */

function labelSection(page: LabelPageModel, opts: DocxOptions): ISectionOptions {
  const mode = opts.boldMode ?? 'embed-bold';
  const margin = opts.labelMarginMm ?? 10;
  const { layout } = page;
  const paper = PAPER_MM[layout.paper];
  const box = labelBoxMm(layout, margin, page.notes.length);
  const tw = (mm: number) => mmToTwip(mm);
  const isB4 = layout.paper === 'B4';
  const gridW = box.w * layout.cols;
  // 欄寬無條件捨去：四捨五入可能讓整排比可印範圍多出幾 twip
  const cellTw = Math.floor((box.w * 1440) / 25.4);
  const noInside = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

  const g = { h: box.h, innerW: box.w - 2.2, topPad: 5, codePt: isB4 ? 33 : 31, namePt: 15, coordPt: 9, markPt: 12, markArea: 9, bottomPad: 0.8, codeAtBottom: true, codeGap: 2.6 };
  const grid = labelGrid(page);
  const rows: TableRow[] = [];
  for (let r = 0; r < layout.rows; r++) {
    const cells: TableCell[] = [];
    for (let c = 0; c < layout.cols; c++) {
      const m = grid[r * layout.cols + c];
      const marked = !!m && m.marks.length > 0;
      const b = marked ? bd(INK, 16) : bd(CUT, 8);
      cells.push(
        new TableCell({
          width: { size: cellTw, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 0, bottom: 0, left: tw(1), right: tw(1) },
          shading: m ? { type: ShadingType.CLEAR, fill: marked ? 'FFE08A' : 'FFFFFF', color: 'auto' } : HATCH_FILL,
          borders: { top: b, bottom: b, left: b, right: b },
          children: m ? (m.periodLines ? periodParas(m, box.w - 2, box.h, g.coordPt, mode) : cellParas(m, g, INK, mode)) : hatchParas(box.w - 2.1, box.h - 1.4),
        }),
      );
    }
    rows.push(new TableRow({ height: { value: tw(box.h), rule: HeightRule.EXACT }, cantSplit: true, children: cells }));
  }
  const gridTable = new Table({ width: { size: cellTw * layout.cols, type: WidthType.DXA }, columnWidths: Array<number>(layout.cols).fill(cellTw), layout: TableLayoutType.FIXED, borders: noInside, rows });

  // 注意事項（字數固定，框寬依字級估算）
  const notePt = isB4 ? 13 : 20;
  const h4Pt = isB4 ? 14 : 22;
  const lines = page.notes;
  const noteTextW = Math.max(textMm('注意事項：', h4Pt, true), ...lines.map((l) => l.reduce((w, s) => w + textMm(s.text, notePt, s.bold), 0)));
  const padX = isB4 ? 6 : 9;
  const padY = isB4 ? 3 : 5;
  const leftBar = isB4 ? 1.8 : 2.4;
  const noteW = Math.min(gridW, noteTextW + 2 * padX + leftBar + 2);
  const lh = notePt * 0.3528 * 1.75;
  const noteBd = bd(CUT, 7);
  const note = new Table({
    width: { size: tw(noteW), type: WidthType.DXA },
    columnWidths: [tw(noteW)],
    layout: TableLayoutType.FIXED,
    borders: noInside,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: tw(noteW), type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 'FBF8EE', color: 'auto' },
            borders: { top: noteBd, bottom: noteBd, right: noteBd, left: bd(NAVY, Math.round(leftBar * 2.835 * 8)) },
            margins: { top: tw(padY), bottom: tw(padY), left: tw(padX), right: tw(padX) },
            children: [
              line([run2('注意事項：', { size: h4Pt, bold: true, color: NAVY }, mode)], { h: h4Pt * 0.3528 * 1.75, align: AlignmentType.LEFT, after: isB4 ? 1 : 2 }),
              ...lines.map((l) => line(l.map((s) => run2(s.text, { size: notePt, bold: s.bold }, mode)), { h: lh, align: AlignmentType.LEFT })),
            ],
          }),
        ],
      }),
    ],
  });

  return {
    properties: {
      page: {
        size: { width: tw(paper.w), height: tw(paper.h) },
        margin: { top: tw(margin), bottom: tw(12), left: tw(box.padX), right: tw(box.padX), footer: tw(6) },
      },
    },
    footers: { default: pageFooter(opts) },
    children: [
      headBlock({ widthMm: gridW, h1: page.heading ?? `${page.examName}　標籤`, room: page.roomName, h1Pt: 15, roomPt: 12, padX: 4, padY: 1 }, mode),
      spacer(3),
      gridTable,
      ...(lines.length ? [spacer(isB4 ? 5 : 8), note] : []),
      line([], { h: 0.35 }),
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
