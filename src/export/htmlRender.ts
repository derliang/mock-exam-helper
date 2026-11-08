/**
 * PDF 輸出（D29：PDF 為輔）：產生列印用 HTML，由瀏覽器「列印成 PDF」。
 * 內容與 Word 共用 model.ts 的版面模型。紙張用 @page 具名頁面（Chrome 支援）：座位表、名單 A4，標籤 B4 或 A3。
 * 座位表與標籤的樣式照設計系統成品頁「座位表與標籤」稿件（docs/design/mockups/設計系統.html #paper）：
 * 改這裡的版面要同步改稿件，反之亦然。
 */
import { footerText, groupMarks, labelBoxMm, labelGrid, PAPER_MM, SEAT_PAGE, seatGeometry, type CellModel, type LabelPageModel, type ListPageModel, type SeatPageModel, type TablePageModel } from './model';

export interface HtmlOptions {
  generatedAt: string;
  dataVersion: string;
  /** 標籤頁邊界 mm，與 Word 一致 */
  labelMarginMm?: number;
  /** 額外 CSS（例如 @font-face）。字型由呼叫端提供，避免本檔讀檔 */
  extraCss?: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DETACH = { bg: '#E6EBF7', fg: '#274690' };
const mm = (n: number): string => `${+n.toFixed(2)}mm`;

function marksHtml(c: CellModel): string {
  return groupMarks(c).map((m) => `<span class="pp-mk ${m.kind}">${esc(m.text)}</span>`).join('');
}

/** 一格：座位表用班級色（抽離考試用柔和單色），標籤用白底，有標示的標籤格用淺黃 */
function cellHtml(c: CellModel | undefined, w: number, h: number, mode: 'seat' | 'detach' | 'label'): string {
  const size = `width:${mm(w)};height:${mm(h)}`;
  if (!c) return `<div class="pp-c pp-e" style="${size}"></div>`;
  const marked = c.marks.length > 0;
  const bg = mode === 'label' ? (marked ? '#FFE08A' : '#fff') : mode === 'detach' ? DETACH.bg : `#${c.colorBg}`;
  const em = mode === 'label' ? '#22201B' : mode === 'detach' ? DETACH.fg : `#${c.colorFg}`;
  return `<div class="pp-c${marked ? ' mk' : ''}" style="${size};background:${bg}"><i class="pp-co">${esc(c.coord)}</i><b class="pp-no">${esc(c.code)}</b><span class="pp-nm"><em style="color:${em}">${esc(c.classLabel)}</em><span>${esc(c.name)}</span></span>${marksHtml(c)}</div>`;
}

function seatHtml(p: SeatPageModel, o: HtmlOptions): string {
  const { cw, ch, st } = seatGeometry(p);
  const mode = p.detachStyle ? 'detach' : 'seat';
  let cells = '';
  for (let d = p.depth; d >= 1; d--) for (let r = 1; r <= p.rows; r++) cells += cellHtml(p.cells.get(`${r}-${d}`), cw, ch, mode);
  const ay = Array.from({ length: p.depth }, (_, i) => `<span>${p.depth - i}</span>`).join('');
  const ax = Array.from({ length: p.rows }, (_, i) => `<span>第${i + 1}排</span>`).join('');
  const chips = p.chips.map((t, i) => `<span class="pp-chip${i === 0 ? ' s' : ''}">${esc(t)}</span>`).join('');
  const stHtml = `<table class="pp-st"><thead><tr><th>項目</th>${p.stats.table.classes.map((c) => `<th>${esc(c)}</th>`).join('')}<th>合計</th></tr></thead><tbody>${st
    .map((r) => `<tr><td>${esc(r.label)}</td>${r.per.map((n) => `<td>${n}</td>`).join('')}<td class="t">${r.total}</td></tr>`)
    .join('')}</tbody></table>`;
  return `<section class="sheet pp pp-seat" style="page:a4full;width:${SEAT_PAGE.w}mm;height:${SEAT_PAGE.h - 0.5}mm;padding:${SEAT_PAGE.padY}mm ${SEAT_PAGE.padX}mm">
<div class="pp-hd"><div><div class="pp-h1">${esc(p.examName)}</div><div class="pp-h2">座位表</div></div><span class="pp-room">${esc(p.roomName)}</span></div>
<div class="pp-chips">${chips}</div>
<div class="pp-wrapg" style="margin-top:4mm"><div class="pp-ay" style="grid-template-rows:repeat(${p.depth},${mm(ch)})">${ay}</div><div><div class="pp-grid" style="grid-template-columns:repeat(${p.rows},${mm(cw)})">${cells}</div><div class="pp-ax" style="grid-template-columns:repeat(${p.rows},${mm(cw)})">${ax}</div></div></div>
<div class="pp-bottom"><span class="l">共 ${p.stats.total} 人</span><span class="pp-pod">講臺</span><span></span></div>
${stHtml}
<div class="pp-foot">${esc(footerText(o.generatedAt, o.dataVersion))}</div></section>`;
}

function labelHtml(p: LabelPageModel, o: HtmlOptions): string {
  const margin = o.labelMarginMm ?? 10;
  const { layout } = p;
  const paper = PAPER_MM[layout.paper];
  // 稿件：格高最多 35mm，格子下方才留得出注意事項與頁尾（Word 版待下一步對齊後再共用）
  const cell = labelBoxMm(layout, margin, p.notes.length);
  const cells = labelGrid(p)
    .map((m) => cellHtml(m, cell.w, cell.h, 'label'))
    .join('');
  const padX = cell.padX;
  const noteHtml = p.notes.length
    ? `<div class="pp-note"><h4>注意事項：</h4>${p.notes.map((l) => `<div>${l.map((s) => (s.bold ? `<b>${esc(s.text)}</b>` : esc(s.text))).join('')}</div>`).join('')}</div>`
    : '';
  const cls = layout.paper.toLowerCase();
  return `<section class="sheet pp pp-lab ${cls}" style="page:${cls};width:${paper.w}mm;height:${paper.h - 0.5}mm;padding:${margin}mm ${mm(padX)}">
<div class="pp-hd" style="margin-bottom:3mm"><div><div class="pp-h1">${esc(p.examName)}　標籤</div></div><span class="pp-room" style="font-size:12pt;padding:1mm 4mm">${esc(p.roomName)}</span></div>
<div class="pp-grid" style="grid-template-columns:repeat(${layout.cols},${mm(cell.w)})">${cells}</div>
${noteHtml}
<div class="pp-foot">${esc(footerText(o.generatedAt, o.dataVersion))}</div></section>`;
}

function listHtml(p: ListPageModel, o: HtmlOptions): string {
  const rows = p.rows.map((r) => `<tr><td>${esc(r.subject)}</td><td>${esc(r.code)}</td><td>${esc(r.className)}</td><td>${esc(r.name)}</td><td>${esc(r.place)}</td><td>${esc(r.purpose)}</td></tr>`).join('');
  return `<section class="sheet a4" style="page:a4"><h1>${esc(p.title)}</h1><table class="list"><thead><tr><th>科目</th><th>考生編號</th><th>班級</th><th>姓名</th><th>去處（教室／座位）</th><th>用途</th></tr></thead><tbody>${rows}</tbody></table>
<footer>${esc(footerText(o.generatedAt, o.dataVersion))}</footer></section>`;
}

function tableHtml(p: TablePageModel, o: HtmlOptions): string {
  const sum = p.widths.reduce((a, b) => a + b, 0);
  const tr = (cells: string[], tag: 'td' | 'th', cls = '') =>
    `<tr${cls}>${cells.map((c, i) => `<${tag} style="width:${(((p.widths[i] ?? 1) * 100) / sum).toFixed(1)}%">${esc(c)}</${tag}>`).join('')}</tr>`;
  const rows = p.rows.map((r) => tr(r, 'td')).join('') + (p.totalRow ? tr(p.totalRow, 'td', ' class="total"') : '');
  return `<section class="sheet a4" style="page:a4"><h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="sub">${esc(p.subtitle)}</p>` : ''}<table class="list tbl"><thead>${tr(p.heads, 'th')}</thead><tbody>${rows}</tbody></table>
<footer>${esc(footerText(o.generatedAt, o.dataVersion))}</footer></section>`;
}

const CSS = `
@page a4 { size: 210mm 297mm; margin: 12mm }
@page a4full { size: 210mm 297mm; margin: 0 }
@page b4 { size: ${PAPER_MM.B4.w}mm ${PAPER_MM.B4.h}mm; margin: 0 }
@page a3 { size: ${PAPER_MM.A3.w}mm ${PAPER_MM.A3.h}mm; margin: 0 }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact }
body { margin: 0; font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif; color: #111 }
.sheet { break-after: page; position: relative; box-sizing: border-box }
.sheet.a4 h1 { font-size: 16pt; text-align: center; margin: 0 0 4mm }
table.list { border-collapse: collapse; width: 100% }
table.list th, table.list td { border: 1px solid #808080; padding: 1mm 2mm; text-align: left; font-size: 10.5pt }
table.list th { background: #eee }
table.tbl td { height: 9mm }
table.tbl tr.total td { font-weight: 700; background: #f4f4f4 }
.sheet.a4 p.sub { font-size: 12pt; text-align: center; margin: 0 0 4mm }
footer { font-size: 8pt; color: #555; text-align: right; margin-top: 3mm }

/* 座位表與標籤（稿件：設計系統成品頁 #paper） */
.pp { --ink:#22201B; --navy:#1F3A5F; --gray:#6B6657; --cut:#8E8670; background:#fff; color:var(--ink); overflow:hidden }
.pp *{box-sizing:border-box}
.pp .pp-hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.8mm solid var(--navy);padding-bottom:3mm}
.pp .pp-h1{color:var(--navy);font-weight:700;font-size:15pt;letter-spacing:.04em}
.pp .pp-h2{font-family:'Noto Serif TC','PMingLiU',serif;font-weight:700;font-size:28pt;line-height:1.1;margin-top:1mm}
.pp .pp-room{display:block;background:var(--navy);color:#fff;border-radius:1.2mm;padding:1.6mm 6mm;font-weight:700;font-size:16pt}
.pp .pp-chips{display:flex;gap:2mm;flex-wrap:wrap;margin:3.5mm 0 0}
.pp .pp-chip{border:.3mm solid var(--navy);color:var(--navy);border-radius:5mm;padding:.6mm 3.5mm;font-size:12pt;font-weight:700}
.pp .pp-chip.s{background:var(--navy);color:#fff}
.pp .pp-grid{display:grid;border-top:.35mm solid var(--cut);border-left:.35mm solid var(--cut);width:max-content}
.pp.pp-seat .pp-grid{border:.7mm solid var(--ink)}
.pp .pp-c{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4mm;border-right:.35mm solid var(--cut);border-bottom:.35mm solid var(--cut);text-align:center}
.pp.pp-seat .pp-c{border-right-width:.3mm;border-bottom-width:.3mm}
.pp .pp-co{position:absolute;right:1.1mm;top:.8mm;font-style:normal;font-weight:700;color:#4A463A;font-size:6.5pt;line-height:1;font-variant-numeric:tabular-nums}
.pp .pp-no{font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.02em;line-height:1}
.pp .pp-nm{font-weight:500;line-height:1.15;white-space:nowrap}
.pp .pp-nm em{font-style:normal;font-weight:700;margin-right:1.2mm;padding-right:1.2mm;border-right:.3mm solid currentColor}
.pp .pp-nm span{color:var(--ink)}
.pp .pp-mk{display:block;font-weight:700;line-height:1.25;padding:0 1.4mm;border-radius:.6mm;white-space:nowrap}
.pp .pp-mk.x{background:var(--ink);color:#fff;border:.3mm solid var(--ink)}
.pp .pp-mk.add{background:#fff;color:var(--ink);border:.45mm double var(--ink)}
.pp .pp-c.mk{box-shadow:inset 0 0 0 .7mm var(--ink)}
.pp .pp-e{background:repeating-linear-gradient(135deg,#F1EDE0 0 1.2mm,#E2DCC8 1.2mm 2.4mm)}
.pp.pp-lab .pp-c{display:grid;grid-template-rows:1fr auto 9mm;justify-items:center;align-items:center;gap:0;padding:5mm 1mm .8mm}
.pp.pp-lab .pp-no{align-self:end;margin-bottom:2.6mm;font-size:31pt}.pp.pp-lab .pp-nm{font-size:15pt}.pp.pp-lab .pp-mk{font-size:12pt}.pp.pp-lab .pp-co{font-size:9pt}
.pp.pp-lab.b4 .pp-no{font-size:33pt}
.pp.pp-seat .pp-c{display:grid;grid-template-rows:1fr auto 5.2mm;justify-items:center;align-items:center;gap:0;padding:4.5mm .5mm .8mm}
.pp.pp-seat .pp-no{font-size:19pt}.pp.pp-seat .pp-nm{font-size:8.5pt}.pp.pp-seat .pp-mk{font-size:7.5pt}
.pp .pp-note{margin-top:8mm;font-size:20pt;line-height:1.75;border:.3mm solid var(--cut);border-left:2.4mm solid var(--navy);border-radius:1.5mm;padding:5mm 9mm;background:#FBF8EE;width:max-content;max-width:100%}
.pp .pp-note h4{margin:0 0 2mm;color:var(--navy);font-size:22pt}
.pp .pp-note b{font-weight:700}
.pp.b4 .pp-note{margin-top:5mm;font-size:13pt;padding:3mm 6mm;border-left-width:1.8mm}.pp.b4 .pp-note h4{font-size:14pt;margin-bottom:1mm}
.pp .pp-foot{position:absolute;left:0;right:0;bottom:6mm;text-align:center;font-size:9.5pt;color:var(--gray)}
.pp .pp-bottom{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin-top:3mm}
.pp .pp-bottom .l{font-size:9pt}
.pp .pp-pod{border:.5mm solid var(--ink);padding:1.2mm 12mm;font-weight:700;font-size:13pt;letter-spacing:.6em;padding-left:calc(12mm + .6em)}
.pp .pp-ax{display:grid;font-size:7pt;font-weight:700;color:var(--gray);text-align:center;margin-top:.8mm}
.pp .pp-wrapg{display:grid;grid-template-columns:5mm auto;justify-content:center;gap:0 1.5mm}
.pp .pp-ay{display:grid;font-size:7pt;font-weight:700;color:var(--gray);align-items:center;justify-items:end}
.pp .pp-st{width:100%;border-collapse:collapse;font-size:13pt;margin-top:5mm}
.pp .pp-st th,.pp .pp-st td{border:.3mm solid var(--cut);padding:.8mm 2mm;text-align:center}
.pp .pp-st th{background:#F3EEDD;font-weight:700}
.pp .pp-st td:first-child{text-align:left}
.pp .pp-st td.t{font-weight:700}
`;

export type HtmlPages = { seat?: SeatPageModel[]; label?: LabelPageModel[]; list?: ListPageModel | ListPageModel[]; table?: TablePageModel[] };

export function renderPrintHtml(pages: HtmlPages, o: HtmlOptions): string {
  const body = [
    ...(pages.seat ?? []).map((p) => seatHtml(p, o)),
    ...(pages.label ?? []).map((p) => labelHtml(p, o)),
    ...[pages.list ?? []].flat().map((l) => listHtml(l, o)),
    ...(pages.table ?? []).map((t) => tableHtml(t, o)),
  ];
  if (body.length === 0) throw new Error('沒有可輸出的頁面');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>模擬考小幫手輸出</title><style>${CSS}${o.extraCss ?? ''}</style></head><body>${body.join('\n')}</body></html>`;
}
