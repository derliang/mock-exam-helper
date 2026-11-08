/**
 * 考試名單智慧匯入（E 包）：掃描整份工作表 → 欄位、考生列、標示分群、待確認清單；
 * 使用者逐組對應、逐筆處理後 → buildEntries 才產生考試名單；diffEntries 給匯入預覽用。
 * 原則：無法判斷的列一律進「待確認」或「已略過說明列」清單，不默默丟棄、不猜測。
 */
import type { ExamEntry } from '../data/types';
import { normalizeCell, parseClassNo, type Field } from './columns';
import { groupMarks, IGNORE, markCore, tokenizeMarks, suggestSubject, type MarkGroup, type MarkRole, type RawMark } from './marks';
import { smartFindHeader, type HeaderFound } from './smartHeader';

export interface ScanOptions {
  /** 本次考試的考科（id、名稱） */
  subjects: readonly { id: string; name: string }[];
  /** 組別代碼（大寫首字）→ 科目 id；已換成本次考科表的 id */
  groupTable?: Readonly<Record<string, readonly string[]>>;
  /** 沒有組別欄時每人的預設科目 */
  defaultSubjectIds?: readonly string[];
  classNames?: readonly string[];
}

export interface ScanMark extends RawMark {
  role: MarkRole;
  /** 科目欄的格子是否為「有」；文字欄一律 true */
  present: boolean;
}

export interface ScanRow {
  row: number;
  classNo: number;
  seatNo: number;
  name: string;
  groupCode?: string;
  note?: string;
  marks: ScanMark[];
}

export type ReviewKind = 'bad-id' | 'no-name' | 'dup' | 'bad-group';
export interface ReviewItem {
  row: number;
  kind: ReviewKind;
  message: string;
  cells: string[];
  draft: { classNo?: number; seatNo?: number; name: string; groupCode?: string };
  note?: string;
  marks: ScanMark[];
}

export interface SkippedRow { row: number; cells: string[]; reason: string }

export interface ExamScan {
  header: HeaderFound | null;
  columns: Record<string, number>;
  /** 欄位 → 該欄表頭原文 */
  headers: Record<string, string>;
  /** 被當成「科目欄」的表頭（欄位索引 → 原文） */
  subjectColumns: Record<number, string>;
  rows: ScanRow[];
  review: ReviewItem[];
  skipped: SkippedRow[];
  blankRows: number;
  groups: MarkGroup[];
  /** 擋下匯入的問題（找不到表頭、沒有班級欄） */
  problems: string[];
}

const NEGATIVE = new Set(['', '×', '✗', '✘', 'X', 'N', 'NO', '否', '0', '-', '—', '無', '缺', '不', '不考']);

/** 座號寬鬆解析：全半形、「5號」「05」 */
export function smartSeat(cell: string): number | null {
  const c = normalizeCell(cell).replace(/號$/, '');
  if (!/^\d{1,2}$/.test(c)) return null;
  const n = Number(c);
  return n > 0 ? n : null;
}

const groupKeyOf = (cell: string): string => normalizeCell(cell).charAt(0).toUpperCase();

export function scanExamSheet(rows: readonly (readonly string[])[], opts: ScanOptions): ExamScan {
  const empty = (problems: string[]): ExamScan => ({ header: null, columns: {}, headers: {}, subjectColumns: {}, rows: [], review: [], skipped: [], blankRows: 0, groups: [], problems });
  const header = smartFindHeader(rows);
  if (!header) return empty(['找不到表頭：需要有「座號」與「姓名」兩欄（上方有標題或空列、欄名有錯字都沒關係）']);
  const col = header.map as Partial<Record<Field, number>>;
  const problems: string[] = [];
  if (col.classNo === undefined) problems.push('找不到「班級」欄，無法判斷考生屬於哪一班');

  const known = new Set(Object.values(col));
  const subjectColumns: Record<number, string> = {};
  header.headers.forEach((h, i) => {
    if (known.has(i)) return;
    const { key } = markCore(h);
    if (key && suggestSubject([key], opts.subjects)) subjectColumns[i] = h.trim();
  });

  const out: ExamScan = {
    header,
    columns: Object.fromEntries(Object.entries(col).filter(([, v]) => v !== undefined)) as Record<string, number>,
    headers: Object.fromEntries(Object.entries(col).filter(([, v]) => v !== undefined).map(([f, i]) => [f, (header.headers[i as number] ?? '').trim()])),
    subjectColumns, rows: [], review: [], skipped: [], blankRows: 0, groups: [], problems,
  };
  const get = (r: readonly string[], f: Field): string => (col[f] === undefined ? '' : (r[col[f] as number] ?? '').trim());
  const seen = new Set<string>();

  for (let i = header.row + header.span; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const cells = r.map((c) => c.trim());
    const filled = cells.filter(Boolean).length;
    if (filled === 0) { out.blankRows++; continue; }
    const name = get(r, 'name');
    const seatNo = smartSeat(get(r, 'seatNo'));
    const classNo = col.classNo === undefined ? null : parseClassNo(get(r, 'classNo'), opts.classNames);
    const rowNo = i + 1;

    // 標示：備註欄（預設為缺考）、加考欄、科目欄
    const marks: ScanMark[] = [];
    const noteCell = get(r, 'note');
    let note = noteCell;
    for (const [field, role] of [['note', 'absent'], ['extra', 'extra']] as const) {
      const t = tokenizeMarks(get(r, field));
      for (const m of t.marks) marks.push({ ...m, role: m.prefixRole ?? role, present: true });
      if (field === 'note' && t.marks.length === 0) note = noteCell; // 純說明文字原樣保留
    }
    for (const [ci, h] of Object.entries(subjectColumns)) {
      const v = normalizeCell(r[Number(ci)] ?? '').toUpperCase();
      if (!v) continue;
      const { key } = markCore(h);
      marks.push({ raw: h, key, prefixRole: null, role: 'taking', present: !NEGATIVE.has(v) });
    }

    if (!name) {
      if (filled === 1 || (seatNo === null && classNo === null)) out.skipped.push({ row: rowNo, cells, reason: filled === 1 ? '只有一格有字，像是標題或說明' : '沒有姓名也沒有班級座號，不像考生列' });
      else out.review.push({ row: rowNo, kind: 'no-name', message: '有班級或座號但沒有姓名', cells, draft: { name: '', ...(classNo !== null ? { classNo } : {}), ...(seatNo !== null ? { seatNo } : {}) }, marks });
      continue;
    }
    if (filled === 1) { out.skipped.push({ row: rowNo, cells, reason: '只有一格有字，像是標題或說明' }); continue; }
    const base = { name, ...(classNo !== null ? { classNo } : {}), ...(seatNo !== null ? { seatNo } : {}), ...(get(r, 'group') ? { groupCode: get(r, 'group') } : {}) };
    if (classNo === null || seatNo === null) {
      out.review.push({ row: rowNo, kind: 'bad-id', message: `${classNo === null ? '班級' : '座號'}無法辨識`, cells, draft: base, marks, ...(note ? { note } : {}) });
      continue;
    }
    const key = `${classNo}-${seatNo}`;
    if (seen.has(key)) {
      out.review.push({ row: rowNo, kind: 'dup', message: `班級 ${classNo} 座號 ${seatNo} 重複`, cells, draft: base, marks, ...(note ? { note } : {}) });
      continue;
    }
    const gk = groupKeyOf(get(r, 'group'));
    if (col.group !== undefined && gk && opts.groupTable && !opts.groupTable[gk]) {
      out.review.push({ row: rowNo, kind: 'bad-group', message: `組別「${get(r, 'group')}」不在對照表中`, cells, draft: base, marks, ...(note ? { note } : {}) });
      seen.add(key);
      continue;
    }
    seen.add(key);
    out.rows.push({ row: rowNo, classNo, seatNo, name, ...(get(r, 'group') ? { groupCode: get(r, 'group') } : {}), ...(note ? { note } : {}), marks });
  }
  const all = [...out.rows, ...out.review].flatMap((x) => x.marks.filter((m) => m.present));
  out.groups = groupMarks(all, opts.subjects);
  return out;
}

export type RowDecision =
  | { action: 'skip' }
  | { action: 'fix'; classNo: number; seatNo: number; name: string; groupCode?: string };

export interface Decisions {
  /** 標示群組 id → 科目 id 或 "ignore" */
  mapping: Readonly<Record<string, string>>;
  /** 待確認列號 → 處理方式 */
  rows: Readonly<Record<number, RowDecision>>;
}

export interface BuildResult {
  entries: ExamEntry[];
  /** 還沒對應的標示群組 */
  pendingGroups: MarkGroup[];
  /** 還沒處理的待確認列 */
  pendingReview: ReviewItem[];
  /** 使用者明確選擇略過的列數 */
  skippedByUser: number;
  ready: boolean;
}

export function buildEntries(scan: ExamScan, opts: ScanOptions, dec: Decisions): BuildResult {
  const groupOf = new Map<string, string>();
  for (const g of scan.groups) for (const m of g.members) groupOf.set(m.key, g.id);
  const used = new Set<string>();
  for (const x of [...scan.rows, ...scan.review]) for (const m of x.marks) if (m.present) used.add(groupOf.get(m.key) ?? '');
  const pendingGroups = scan.groups.filter((g) => used.has(g.id) && dec.mapping[g.id] === undefined);

  const toEntry = (r: Pick<ScanRow, 'classNo' | 'seatNo' | 'name' | 'groupCode' | 'note' | 'marks'>): { e: ExamEntry; badGroup: boolean } => {
    const gk = r.groupCode ? groupKeyOf(r.groupCode) : '';
    const table = opts.groupTable?.[gk];
    let subjects = [...(gk ? (table ?? []) : (opts.defaultSubjectIds ?? []))];
    for (const m of r.marks) {
      const target = dec.mapping[groupOf.get(m.key) ?? ''];
      if (!m.present || !target || target === IGNORE) continue;
      if (m.role === 'absent') subjects = subjects.filter((s) => s !== target);
      else if (!subjects.includes(target)) subjects.push(target);
    }
    const e: ExamEntry = { classNo: r.classNo, seatNo: r.seatNo, name: r.name, subjectIds: subjects };
    if (r.groupCode) e.groupCode = r.groupCode;
    if (r.note) e.note = r.note;
    return { e, badGroup: !!gk && !!opts.groupTable && !table };
  };

  const entries: ExamEntry[] = [];
  const seen = new Set<string>();
  const add = (e: ExamEntry): boolean => {
    const k = `${e.classNo}-${e.seatNo}`;
    if (seen.has(k)) return false;
    seen.add(k);
    entries.push(e);
    return true;
  };
  for (const r of scan.rows) add(toEntry(r).e);
  const pendingReview: ReviewItem[] = [];
  let skippedByUser = 0;
  for (const it of scan.review) {
    const d = dec.rows[it.row];
    if (!d) { pendingReview.push(it); continue; }
    if (d.action === 'skip') { skippedByUser++; continue; }
    const valid = Number.isInteger(d.classNo) && d.classNo > 0 && Number.isInteger(d.seatNo) && d.seatNo > 0 && d.name.trim() !== '';
    if (!valid) { pendingReview.push(it); continue; }
    const t = toEntry({ classNo: d.classNo, seatNo: d.seatNo, name: d.name.trim(), ...(d.groupCode ? { groupCode: d.groupCode } : it.draft.groupCode ? { groupCode: it.draft.groupCode } : {}), ...(it.note ? { note: it.note } : {}), marks: it.marks });
    if (t.badGroup || !add(t.e)) pendingReview.push(it);
  }
  entries.sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);
  return { entries, pendingGroups, pendingReview, skippedByUser, ready: pendingGroups.length === 0 && pendingReview.length === 0 && scan.problems.length === 0 };
}

export interface EntryChange {
  code: string;
  before: ExamEntry;
  after: ExamEntry;
  /** 哪些欄位不同 */
  fields: ('name' | 'subjects' | 'group')[];
}
export interface EntryDiff {
  added: ExamEntry[];
  removed: ExamEntry[];
  changed: EntryChange[];
  unchanged: number;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** 匯入預覽：新名單相對於目前名單的差異 */
export function diffEntries(prev: readonly ExamEntry[] | undefined, next: readonly ExamEntry[]): EntryDiff {
  const key = (e: ExamEntry) => `${e.classNo}-${e.seatNo}`;
  const old = new Map((prev ?? []).map((e) => [key(e), e]));
  const cur = new Map(next.map((e) => [key(e), e]));
  const d: EntryDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const [k, e] of cur) {
    const b = old.get(k);
    if (!b) { d.added.push(e); continue; }
    const fields: EntryChange['fields'] = [];
    if (b.name !== e.name) fields.push('name');
    if (!same(b.subjectIds, e.subjectIds)) fields.push('subjects');
    if ((b.groupCode ?? '') !== (e.groupCode ?? '')) fields.push('group');
    if (fields.length) d.changed.push({ code: k, before: b, after: e, fields });
    else d.unchanged++;
  }
  for (const [k, e] of old) if (!cur.has(k)) d.removed.push(e);
  return d;
}
