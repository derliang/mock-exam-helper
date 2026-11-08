/**
 * 最小 .xlsx 讀取器（只讀、不依賴 DOM，Node 與瀏覽器都能跑）。
 * 只取每個工作表的儲存格文字，回傳 string[][]（列 × 欄，空格為 ""）。
 * 不處理公式計算與樣式；公式儲存格取其快取值。
 */
import JSZip from 'jszip';

export interface Sheet {
  name: string;
  rows: string[][];
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** 取出 <t>…</t> 文字（含 rich text 多段） */
const textOf = (xml: string): string =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? '')).join('');

/** "AB12" → 欄索引 27（0 起） */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => textOf(m[1] ?? ''));
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowTag = rm[0];
    const rn = /\br="(\d+)"/.exec(rowTag);
    const idx = rn ? Number(rn[1]) - 1 : rows.length;
    const cells: string[] = [];
    for (const cm of (rm[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] ?? '';
      const body = cm[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
      const col = ref ? colIndex(ref[1] ?? 'A1') : cells.length;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      let v = '';
      if (type === 'inlineStr') v = textOf(body);
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        v = type === 's' ? (shared[Number(raw)] ?? '') : decodeXml(raw);
      }
      while (cells.length < col) cells.push('');
      cells[col] = v;
    }
    while (rows.length < idx) rows.push([]);
    rows[idx] = cells;
  }
  return rows;
}

export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(data);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  if (!wb) throw new Error('不是有效的 Excel 檔（找不到 workbook.xml）');
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = m[1] ?? '';
    const id = /\bId="([^"]+)"/.exec(a)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(a)?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const sstXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = sstXml ? parseSharedStrings(sstXml) : [];
  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = m[1] ?? '';
    const name = decodeXml(/\bname="([^"]*)"/.exec(a)?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(a)?.[1];
    const path = rid ? rels.get(rid) : undefined;
    const xml = path ? await zip.file(path)?.async('string') : undefined;
    if (xml) sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  return sheets;
}
