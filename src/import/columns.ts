/**
 * 欄位智慧對應：表頭文字 → 內部欄位。寬鬆比對（去空白、全半形、常見同義詞）。
 */
export type Field = 'school' | 'grade' | 'classNo' | 'seatNo' | 'name' | 'group' | 'schoolId' | 'examNo' | 'note' | 'extra';

const SYNONYMS: [Field, RegExp][] = [
  ['seatNo', /^(座號|座位號|座位號碼|號數|號碼)$/],
  ['classNo', /^(班級|班別|班|班級代碼)$/],
  ['name', /^(姓名|學生姓名|考生姓名|名字|名稱)$/],
  ['group', /^(組別|組別代碼|考試組別|科目組別|組)$/],
  // 應試編號（分科輸出用，選填）：不把「學號」當它（R2：兩者是不同概念）
  ['examNo', /^(應試編號|應試號碼|應試號|准考證號碼|准考證號|准考證編號|准考證)$/],
  ['schoolId', /^(學號|學生學號|學籍號碼)(\(選填\))?$/],
  ['note', /^(特殊生需求註明|特殊生需求|特殊需求註明|特殊需求|缺考科目|備註|註記)$/],
  ['extra', /^(加考|加考科目)$/],
  ['school', /^(校代碼|學校代碼|校碼)$/],
  ['grade', /^(年級)$/],
];

/** 全形轉半形、去所有空白 */
export function normalizeCell(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

export function fieldOf(header: string): Field | null {
  const h = normalizeCell(header);
  for (const [f, re] of SYNONYMS) if (re.test(h)) return f;
  return null;
}

export type ColumnMap = Partial<Record<Field, number>>;

/** 對一列表頭做對應；同一欄位出現多次取第一個 */
export function mapColumns(header: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((h, i) => {
    const f = fieldOf(h);
    if (f && map[f] === undefined) map[f] = i;
  });
  return map;
}

/** 找表頭列：前 limit 列中，同時有座號與姓名、且辨識欄位最多的一列 */
export function findHeaderRow(rows: readonly (readonly string[])[], limit = 40): number {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, limit).forEach((r, i) => {
    const m = mapColumns(r);
    if (m.seatNo === undefined || m.name === undefined) return;
    const score = Object.keys(m).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** 班級儲存格正規化：01、"1"、1、"01班"、"3年1班"→ 取最後一段數字 */
export function parseClassNo(cell: string, classNames: readonly string[] = []): number | null {
  const c = normalizeCell(cell);
  if (!c) return null;
  const byName = classNames.findIndex((n) => n && c.startsWith(n));
  if (byName >= 0) return byName + 1;
  const m = c.match(/(\d+)(?!.*\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 100 ? n : null;
}

export function parseSeatNo(cell: string): number | null {
  const c = normalizeCell(cell);
  if (!/^\d{1,2}$/.test(c)) return null;
  const n = Number(c);
  return n > 0 ? n : null;
}
