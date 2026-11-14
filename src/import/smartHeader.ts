/**
 * 表頭偵測（容錯版，E 包）：欄名同義詞／錯字（差一字）／全半形／括號註記／英文欄名；
 * 表頭可能被拆成兩列（合併儲存格造成上下各半）、前面有標題與空列。
 * 既有的 columns.ts 維持嚴格比對不動；這裡是寬鬆的第二道。
 */
import { fieldOf, normalizeCell, type ColumnMap, type Field } from './columns';

/** 去全半形、空白、星號、冒號、括號註記（如「學號(選填)」「姓名＊」） */
export function normalizeHeader(s: string): string {
  return normalizeCell(s)
    .replace(/[*＊:：.、]/g, '')
    .replace(/[(（[【][^)）\]】]*[)）\]】]/g, '')
    .toUpperCase();
}

const CONTAINS: [Field, RegExp][] = [
  ['seatNo', /座號|座位號|號數/],
  ['name', /姓名|名字/],
  ['examNo', /應試編號|應試號|准考證|准考號/],
  ['schoolId', /學號|學籍/],
  ['group', /組別/],
  ['extra', /加考/],
  ['note', /特殊|備註|缺考|註記|說明/],
  ['school', /校代碼|學校代碼|校碼/],
  ['grade', /年級/],
  ['classNo', /班級|班別/],
];

const ENGLISH: [Field, RegExp][] = [
  ['seatNo', /^(SEAT|SEATNO|SEATNUMBER|NO|NUM)$/],
  ['name', /^(NAME|STUDENTNAME)$/],
  ['classNo', /^(CLASS|CLASSNO)$/],
  ['schoolId', /^(ID|STUDENTID|SID)$/],
  ['group', /^(GROUP)$/],
  ['note', /^(NOTE|NOTES|REMARK|REMARKS)$/],
];

/** 代表詞：只用於「差一個字」的錯字比對 */
const CANON: [Field, string][] = [
  ['seatNo', '座號'], ['classNo', '班級'], ['name', '姓名'], ['schoolId', '學號'],
  ['group', '組別'], ['note', '備註'], ['extra', '加考'], ['grade', '年級'],
];

function oneOff(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return d === 1;
}

/** 表頭文字 → 欄位；先嚴格、再包含關鍵字、再英文、最後差一字的錯字 */
export function smartField(header: string): Field | null {
  const n = normalizeHeader(header);
  if (!n) return null;
  const strict = fieldOf(n);
  if (strict) return strict;
  // 同時含「班級」與「座號」的組合欄（如「班級座號」）無法當單一欄位用
  if (/班級|班別/.test(n) && /座號/.test(n)) return null;
  for (const [f, re] of CONTAINS) if (re.test(n)) return f;
  for (const [f, re] of ENGLISH) if (re.test(n)) return f;
  if (n.length === 2) {
    const hit = CANON.filter(([, w]) => oneOff(n, w));
    if (hit.length === 1) return (hit[0] as [Field, string])[0];
    if (hit.some(([f]) => f === 'seatNo')) return 'seatNo'; // 「坐號」同時像座號與學號，座號較常見
  }
  return null;
}

export function smartMapColumns(header: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((h, i) => {
    const f = smartField(h);
    if (f && map[f] === undefined) map[f] = i;
  });
  return map;
}

export interface HeaderFound {
  /** 表頭（第一列）索引，0 起 */
  row: number;
  /** 表頭占幾列（1 或 2：上下兩列合併儲存格拆開的情形） */
  span: 1 | 2;
  map: ColumnMap;
  /** 各欄合併後的表頭原文 */
  headers: string[];
}

const mergeRows = (a: readonly string[], b: readonly string[]): string[] => {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => `${(a[i] ?? '').trim()}${(b[i] ?? '').trim()}`);
};

/** 在前 limit 列找表頭：要同時有座號與姓名；分數＝辨識到的欄位數，同分取較早、較少列者 */
export function smartFindHeader(rows: readonly (readonly string[])[], limit = 60): HeaderFound | null {
  let best: HeaderFound | null = null;
  let bestScore = 0;
  const upto = Math.min(rows.length, limit);
  for (let i = 0; i < upto; i++) {
    const cands: { span: 1 | 2; cells: string[] }[] = [{ span: 1, cells: [...(rows[i] ?? [])] }];
    if (i + 1 < rows.length) cands.push({ span: 2, cells: mergeRows(rows[i] ?? [], rows[i + 1] ?? []) });
    for (const c of cands) {
      // 合併後的結果若與下一列單獨作表頭相同（上一列只是空列），不算兩列表頭
      if (c.span === 2 && smartMapColumns(rows[i + 1] ?? []).name !== undefined && smartMapColumns(rows[i] ?? []).name === undefined && Object.keys(smartMapColumns(c.cells)).length <= Object.keys(smartMapColumns(rows[i + 1] ?? [])).length) continue;
      const m = smartMapColumns(c.cells);
      if (m.seatNo === undefined || m.name === undefined) continue;
      const score = Object.keys(m).length;
      // 同分時已有的（較早、較少列）優先；兩列合併必須嚴格更好才採用
      if (score > bestScore) {
        best = { row: i, span: c.span, map: m, headers: c.cells };
        bestScore = score;
      }
    }
  }
  return best;
}
