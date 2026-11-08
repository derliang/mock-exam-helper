/**
 * 列印對位測試頁（H6）：先印一張確認「100% 縮放、邊界沒被裁掉、紙張選對」，再印正式的座位表與標籤。
 * 每種紙（A4、B4、A3）一頁，用 SVG（1 單位＝1mm）畫：四邊 10mm 刻度與邊框、對角線與中心十字、
 * 1cm 方格、100mm 尺規；B4／A3 另疊印標籤格線（與 htmlRender 的標籤頁同一組格數與邊界）。
 * 色碼對應 tokens.css 淺色：墨藍 --accent（格線、邊框）、玫紅 --danger（對角線）；列印不跟深色模式。
 */
import { esc } from './htmlRender';
import type { LabelPaper } from '../data';
import { defaultLabelLayout, footerText, labelCellMm, PAPER_MM } from './model';

export type AlignPaper = LabelPaper | 'A4';
export const ALIGN_PAPERS: AlignPaper[] = ['A4', 'B4', 'A3'];
export const ALIGN_MARGIN_MM = 10;
export const SCALE_BAR_MM = 100;
const INK = '#22201B';
const ACCENT = '#274690';
const DANGER = '#C81E45';
const GRID = '#CFC7B2';
const SURFACE = '#FFFDF8';
const MUTED = '#6F6858';

export interface AlignSpec {
  paper: AlignPaper;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  scaleBarMm: number;
  /** 標籤格線（A4 沒有） */
  labels?: { cols: number; rows: number; cellW: number; cellH: number };
}

export function alignmentSpec(paper: AlignPaper): AlignSpec {
  const { w, h } = PAPER_MM[paper];
  const spec: AlignSpec = { paper, widthMm: w, heightMm: h, marginMm: ALIGN_MARGIN_MM, scaleBarMm: SCALE_BAR_MM };
  if (paper !== 'A4') {
    const layout = defaultLabelLayout(paper);
    const c = labelCellMm(layout, ALIGN_MARGIN_MM);
    spec.labels = { cols: layout.cols, rows: layout.rows, cellW: c.w, cellH: c.h };
  }
  return spec;
}

const n = (x: number): string => String(Math.round(x * 100) / 100);
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number, extra = ''): string =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${w}"${extra}/>`;
const text = (x: number, y: number, s: string, size: number, o: { anchor?: string; weight?: number; fill?: string } = {}): string =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${size}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? INK}">${esc(s)}</text>`;

function sheetSvg(spec: AlignSpec, footer: string): string {
  const { widthMm: W, heightMm: H, marginMm: m } = spec;
  const p: string[] = [];
  // 1cm 方格（每 5cm 加深）
  for (let x = 0; x <= W; x += 10) p.push(line(x, 0, x, H, GRID, x % 50 === 0 ? 0.25 : 0.12));
  for (let y = 0; y <= H; y += 10) p.push(line(0, y, W, y, GRID, y % 50 === 0 ? 0.25 : 0.12));
  // 標籤格線（B4、A3）
  if (spec.labels) {
    const { cols, rows, cellW, cellH } = spec.labels;
    const d = ' stroke-dasharray="2 1.5"';
    for (let c = 0; c <= cols; c++) p.push(line(m + c * cellW, m, m + c * cellW, m + rows * cellH, ACCENT, 0.35, d));
    for (let r = 0; r <= rows; r++) p.push(line(m, m + r * cellH, m + cols * cellW, m + r * cellH, ACCENT, 0.35, d));
  }
  // 對角線與中心十字
  p.push(line(0, 0, W, H, DANGER, 0.25, ' stroke-dasharray="4 2"'), line(W, 0, 0, H, DANGER, 0.25, ' stroke-dasharray="4 2"'));
  p.push(line(W / 2, 0, W / 2, H, DANGER, 0.2), line(0, H / 2, W, H / 2, DANGER, 0.2));
  p.push(`<circle cx="${n(W / 2)}" cy="${n(H / 2)}" r="10" fill="none" stroke="${DANGER}" stroke-width="0.3"/>`);
  // 10mm 邊框
  p.push(`<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${ACCENT}" stroke-width="0.5"/>`);
  // 四邊刻度：每 1mm 一格，5mm 中格，10mm 長格並標公分數字
  for (let i = 0; i <= Math.max(W, H); i++) {
    const len = i % 10 === 0 ? 5 : i % 5 === 0 ? 3 : 1.5;
    const sw = i % 10 === 0 ? 0.3 : 0.15;
    if (i <= W) p.push(line(i, 0, i, len, INK, sw), line(i, H, i, H - len, INK, sw));
    if (i <= H) p.push(line(0, i, len, i, INK, sw), line(W, i, W - len, i, INK, sw));
  }
  for (let cm = 1; cm * 10 < W - 10; cm++) p.push(text(cm * 10, 8.6, String(cm), 2.8, { anchor: 'middle' }), text(cm * 10, H - 6.2, String(cm), 2.8, { anchor: 'middle' }));
  for (let cm = 1; cm * 10 < H - 10; cm++) p.push(text(7.2, cm * 10 + 1, String(cm), 2.8, { anchor: 'middle' }), text(W - 7.2, cm * 10 + 1, String(cm), 2.8, { anchor: 'middle' }));
  // 邊框四角十字
  for (const [cx, cy] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]] as const) {
    p.push(line(cx - 6, cy, cx + 6, cy, ACCENT, 0.5), line(cx, cy - 6, cx, cy + 6, ACCENT, 0.5));
  }
  // 說明卡
  const cw = Math.min(W - 60, 150);
  const cx = (W - cw) / 2;
  const cy = 34;
  const ch = 66;
  p.push(`<rect x="${n(cx)}" y="${cy}" width="${n(cw)}" height="${ch}" rx="3" fill="${SURFACE}" stroke="${ACCENT}" stroke-width="0.5"/>`);
  p.push(text(W / 2, cy + 11, '列印對位測試頁', 8, { anchor: 'middle', weight: 700, fill: ACCENT }));
  p.push(text(W / 2, cy + 18.5, `${spec.paper}　${spec.widthMm}×${spec.heightMm} mm`, 4, { anchor: 'middle', weight: 700 }));
  const steps = [
    '1. 列印設定選「實際大小／100%」，不要選「符合頁面」。',
    `2. 紙張選 ${spec.paper}，邊界選「無」，關閉「頁首與頁尾」。`,
    `3. 下方尺規要量到 ${spec.scaleBarMm} mm 才正確。`,
    `4. 四邊 ${spec.marginMm} mm 藍框與四角十字都要完整印出。`,
  ];
  steps.forEach((s, i) => p.push(text(cx + 8, cy + 29 + i * 6.2, s, 3.4)));
  if (spec.labels) {
    p.push(text(W / 2, cy + ch - 5, `虛線藍格＝標籤格 ${spec.labels.cols}×${spec.labels.rows}（每格 ${n(spec.labels.cellW)}×${n(spec.labels.cellH)} mm），疊上標籤紙檢查對位。`, 2.9, { anchor: 'middle', fill: ACCENT }));
  } else {
    p.push(text(W / 2, cy + ch - 5, '紅色虛線＝對角線與中心十字，應通過紙張四角與正中央。', 2.9, { anchor: 'middle', fill: DANGER }));
  }
  // 100mm 尺規
  const bx = (W - spec.scaleBarMm) / 2;
  const by = cy + ch + 16;
  p.push(`<rect x="${n(bx - 6)}" y="${by - 11}" width="${spec.scaleBarMm + 12}" height="26" rx="2" fill="${SURFACE}" stroke="${GRID}" stroke-width="0.3"/>`);
  p.push(line(bx, by, bx + spec.scaleBarMm, by, INK, 0.6));
  for (let i = 0; i <= spec.scaleBarMm; i += 5) p.push(line(bx + i, by, bx + i, by + (i % 10 === 0 ? 4 : 2.2), INK, 0.3));
  for (let i = 0; i <= spec.scaleBarMm; i += 10) p.push(text(bx + i, by + 8, String(i), 2.6, { anchor: 'middle' }));
  p.push(line(bx, by - 4, bx, by + 4, DANGER, 0.7), line(bx + spec.scaleBarMm, by - 4, bx + spec.scaleBarMm, by + 4, DANGER, 0.7));
  p.push(text(W / 2, by - 4.5, `${spec.scaleBarMm} mm`, 3.6, { anchor: 'middle', weight: 700, fill: DANGER }));
  p.push(text(W / 2, H / 2 + 28, '請以 100% 列印，量到 100 mm 才正確', 4.2, { anchor: 'middle', weight: 700 }));
  p.push(text(W / 2, H - m - 4, footer, 2.6, { anchor: 'middle', fill: MUTED }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="'Noto Sans TC','Microsoft JhengHei',sans-serif">${p.join('')}</svg>`;
}

/** 列印用 HTML：每種紙一頁，各自用具名 @page 指定紙張與零邊界 */
export function renderAlignmentHtml(meta: { generatedAt: string; dataVersion: string }, papers: AlignPaper[] = ALIGN_PAPERS): string {
  const footer = footerText(meta.generatedAt, meta.dataVersion);
  const css = papers.map((pp) => `@page ${pp.toLowerCase()} { size: ${PAPER_MM[pp].w}mm ${PAPER_MM[pp].h}mm; margin: 0 }`).join('\n');
  const body = papers
    .map((pp) => {
      const { w, h } = PAPER_MM[pp];
      // 高度少 0.3mm，避免剛好滿版時多出一張空白頁
      return `<section class="sheet" style="page:${pp.toLowerCase()};width:${w}mm;height:${h - 0.3}mm">${sheetSvg(alignmentSpec(pp), footer)}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>列印對位測試頁</title><style>${css}
html,body{margin:0;padding:0;background:#fff}
.sheet{break-after:page;overflow:hidden;position:relative}
.sheet:last-child{break-after:auto}
svg{display:block}
</style></head><body>${body}</body></html>`;
}
