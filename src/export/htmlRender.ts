/**
 * PDF 輸出（D29：PDF 為輔）：產生列印用 HTML，由瀏覽器「列印成 PDF」。
 * 內容與 Word 共用 model.ts 的版面模型。紙張用 @page 具名頁面（Chrome 支援）：座位表、名單 A4，標籤 B4 或 A3。
 */
import { footerText, labelCellMm, PAPER_MM, type CellModel, type LabelPageModel, type ListPageModel, type SeatPageModel } from './model';

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

const DETACH = { bg: '#E6EBF7', line: '#274690', fg: '#274690' };

function tagHtml(c: CellModel): string {
  return c.tags.map((t) => `<div class="tag ${t.kind}">${esc(t.text)}</div>`).join('');
}

function seatHtml(p: SeatPageModel, o: HtmlOptions): string {
  const rowsHtml: string[] = [];
  for (let d = p.depth; d >= 1; d--) {
    const tds = [`<th class="axis">${d}</th>`];
    for (let r = 1; r <= p.rows; r++) {
      const key = `${r}-${d}`;
      const c = p.cells.get(key);
      if (c) {
        const pal = p.detachStyle ? DETACH : { bg: `#${c.colorBg}`, line: `#${c.colorLine}`, fg: `#${c.colorFg}` };
        tds.push(
          `<td class="seat" style="background:${pal.bg};border-color:${pal.line};color:${pal.fg}"><div class="coord">${esc(c.coord)}</div><div class="code">${esc(c.code)}</div><div class="who">${esc(c.classLabel)}｜${esc(c.name)}</div>${tagHtml(c)}</td>`,
        );
      } else {
        tds.push(p.usable.has(key) ? '<td class="seat blank"></td>' : '<td class="seat void">空位</td>');
      }
    }
    rowsHtml.push(`<tr>${tds.join('')}</tr>`);
  }
  const axis = `<tr><th></th>${Array.from({ length: p.rows }, (_, i) => `<th class="axis">第${i + 1}排</th>`).join('')}</tr>`;
  const s = p.stats;
  return `<section class="sheet a4" style="page:a4"><h1>${esc(p.title)}</h1><table class="grid">${rowsHtml.join('')}${axis}</table>
<p class="note">▲ 講臺在座位表下方（0101 在左下角）　座標＝排－深位</p>
<p>各班人數：${esc(s.perClass.map((c) => `${c.className} ${c.count}`).join('　') || '無')}</p>
<p>本教室考生合計：${s.total} 人</p>
<p>各科考試人數：${esc(s.perSubject.map((c) => `${c.subjectName} ${c.count}`).join('　'))}</p>
<footer>${esc(footerText(o.generatedAt, o.dataVersion))}</footer></section>`;
}

function labelHtml(p: LabelPageModel, o: HtmlOptions): string {
  const margin = o.labelMarginMm ?? 10;
  const { layout } = p;
  const cell = labelCellMm(layout, margin);
  const cells: string[] = [];
  for (let i = 0; i < layout.cols * layout.rows; i++) {
    const m = p.cells[i];
    cells.push(
      m
        ? `<div class="lab"><div class="coord">${esc(m.coord)}</div><div class="code" style="font-size:${(cell.w * 0.8).toFixed(1)}pt">${esc(m.code)}</div><div class="who" style="font-size:${(cell.w * 0.4).toFixed(1)}pt">${esc(m.classLabel)}｜${esc(m.name)}</div>${tagHtml(m)}</div>`
        : '<div class="lab"></div>',
    );
  }
  return `<section class="sheet" style="page:${layout.paper.toLowerCase()};padding:${margin}mm;"><div class="labels" style="grid-template-columns:repeat(${layout.cols},${cell.w.toFixed(2)}mm);grid-auto-rows:${(cell.h - 3 / layout.rows).toFixed(2)}mm">${cells.join('')}</div>
<footer>${esc(p.title)}　${esc(footerText(o.generatedAt, o.dataVersion))}</footer></section>`;
}

function listHtml(p: ListPageModel, o: HtmlOptions): string {
  const rows = p.rows.map((r) => `<tr><td>${esc(r.subject)}</td><td>${esc(r.code)}</td><td>${esc(r.className)}</td><td>${esc(r.name)}</td><td>${esc(r.place)}</td><td>${esc(r.purpose)}</td></tr>`).join('');
  return `<section class="sheet a4" style="page:a4"><h1>${esc(p.title)}</h1><table class="list"><thead><tr><th>科目</th><th>考生編號</th><th>班級</th><th>姓名</th><th>去處（教室／座位）</th><th>用途</th></tr></thead><tbody>${rows}</tbody></table>
<footer>${esc(footerText(o.generatedAt, o.dataVersion))}</footer></section>`;
}

const CSS = `
@page a4 { size: 210mm 297mm; margin: 12mm }
@page b4 { size: ${PAPER_MM.B4.w}mm ${PAPER_MM.B4.h}mm; margin: 0 }
@page a3 { size: ${PAPER_MM.A3.w}mm ${PAPER_MM.A3.h}mm; margin: 0 }
body { margin: 0; font-family: 'Noto Sans TC', sans-serif; color: #111 }
.sheet { break-after: page; position: relative; box-sizing: border-box }
.sheet.a4 h1 { font-size: 16pt; text-align: center; margin: 0 0 4mm }
table.grid { border-collapse: collapse; width: 100%; table-layout: fixed }
table.grid td.seat { border: 1px solid; height: 20mm; text-align: center; vertical-align: middle; padding: 1mm; font-size: 8pt }
table.grid td.void { background: #eee; border: 1px dashed #999; color: #999; font-size: 7pt }
table.grid td.blank { border: 1px solid #bbb }
table.grid th.axis { font-size: 10pt }
.coord { text-align: right; font-size: 7pt }
.code { font-weight: 700; font-size: 16pt }
.tag { font-weight: 700; font-size: 7pt }
.tag.absent { background: #000; color: #fff }
.tag.extra { border: 3px double #000 }
.labels { display: grid }
.lab { border: 1px solid #666; text-align: center; display: flex; flex-direction: column; justify-content: center; overflow: hidden }
.lab .coord { font-size: 7pt; padding-right: 1mm }
table.list { border-collapse: collapse; width: 100% }
table.list th, table.list td { border: 1px solid #808080; padding: 1mm 2mm; text-align: left; font-size: 10.5pt }
table.list th { background: #eee }
footer { font-size: 8pt; color: #555; text-align: right; margin-top: 3mm }
.note { font-size: 8pt; color: #555; text-align: center }
`;

export type HtmlPages = { seat?: SeatPageModel[]; label?: LabelPageModel[]; list?: ListPageModel };

export function renderPrintHtml(pages: HtmlPages, o: HtmlOptions): string {
  const body = [
    ...(pages.seat ?? []).map((p) => seatHtml(p, o)),
    ...(pages.label ?? []).map((p) => labelHtml(p, o)),
    ...(pages.list ? [listHtml(pages.list, o)] : []),
  ];
  if (body.length === 0) throw new Error('沒有可輸出的頁面');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>模擬考小幫手輸出</title><style>${CSS}${o.extraCss ?? ''}</style></head><body>${body.join('\n')}</body></html>`;
}
