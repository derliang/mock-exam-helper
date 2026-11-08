/**
 * 學生名單解析（D62）：支援一人一列的直式表，以及六班並排的橫向寬表（每班一個區塊）。
 * 只取班級、座號、姓名、學號；不取類組、帳號等其他欄位。
 */
import type { Student, Track } from '../data/types';
import { fieldOf, findHeaderRow, mapColumns, normalizeCell, parseClassNo, parseSeatNo } from './columns';

export interface RosterResult {
  students: Student[];
  issues: { row: number; message: string }[];
  layout: 'tall' | 'wide' | 'blocks' | 'unknown';
  /** 由「類組」欄推得的班級組別（只在能判斷時才有）；不會存進 Student */
  classTracks?: Record<number, Track>;
}

export interface RosterOptions {
  /** 班名依序對應班級 1.. ，例 ['溫','良','恭','儉','勤','誠'] */
  classNames?: readonly string[];
}

function parseTall(rows: readonly (readonly string[])[], h: number, opts: RosterOptions): RosterResult {
  const col = mapColumns(rows[h] ?? []);
  const issues: RosterResult['issues'] = [];
  const students: Student[] = [];
  const seen = new Set<string>();
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = (r[col.name as number] ?? '').trim();
    const seatNo = parseSeatNo(r[col.seatNo as number] ?? '');
    const classNo = col.classNo === undefined ? null : parseClassNo(r[col.classNo] ?? '', opts.classNames);
    if (!name || seatNo === null || classNo === null) {
      if (name && (seatNo !== null || classNo !== null)) issues.push({ row: i + 1, message: '班級或座號無法辨識，已略過' });
      continue;
    }
    const key = `${classNo}-${seatNo}`;
    if (seen.has(key)) {
      issues.push({ row: i + 1, message: `班級 ${classNo} 座號 ${seatNo} 重複，已略過這一列` });
      continue;
    }
    seen.add(key);
    const s: Student = { classNo, seatNo, name };
    const id = col.schoolId === undefined ? '' : (r[col.schoolId] ?? '').trim();
    if (id) s.schoolId = id;
    students.push(s);
  }
  return { students, issues, layout: 'tall' };
}

/** 寬表：表頭列有 2 個以上「座號」；每個「座號」欄所屬區塊 = 到下一個「座號」欄之前 */
function parseWide(rows: readonly (readonly string[])[], h: number, opts: RosterOptions): RosterResult {
  const header = rows[h] ?? [];
  const seatCols = header.map((c, i) => (fieldOf(c) === 'seatNo' ? i : -1)).filter((i) => i >= 0);
  const issues: RosterResult['issues'] = [];
  const students: Student[] = [];
  seatCols.forEach((sc, bi) => {
    // 區塊起點：座號欄左邊若是「學號」則一起算入；終點是下一區塊起點之前
    const startOf = (k: number): number => {
      const c = seatCols[k] as number;
      return fieldOf(header[c - 1] ?? '') === 'schoolId' ? c - 1 : c;
    };
    const start = startOf(bi);
    const end = bi + 1 < seatCols.length ? startOf(bi + 1) - 1 : header.length;
    let nameCol = -1;
    let idCol = -1;
    for (let c = start; c <= end; c++) {
      const f = fieldOf(header[c] ?? '');
      if (f === 'name' && nameCol < 0) nameCol = c;
      if (f === 'schoolId' && idCol < 0) idCol = c;
    }
    if (nameCol < 0) {
      issues.push({ row: h + 1, message: `第 ${bi + 1} 個區塊找不到「姓名」欄，已略過` });
      return;
    }
    // 班級：表頭上方列中，落在區塊範圍內、符合班名的儲存格；找不到就用區塊順序
    let classNo = bi + 1;
    outer: for (let r = h - 1; r >= Math.max(0, h - 4); r--) {
      for (let c = start; c <= end; c++) {
        const cell = rows[r]?.[c] ?? '';
        const n = opts.classNames?.length ? parseClassNo(cell, opts.classNames) : null;
        if (n !== null && opts.classNames?.some((nm) => nm && normalizeCell(cell).startsWith(nm))) {
          classNo = n;
          break outer;
        }
      }
    }
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const name = (r[nameCol] ?? '').trim();
      const seatNo = parseSeatNo(r[sc] ?? '');
      if (!name || seatNo === null) continue;
      const s: Student = { classNo, seatNo, name };
      const id = idCol < 0 ? '' : (r[idCol] ?? '').trim();
      if (id) s.schoolId = id;
      students.push(s);
    }
  });
  students.sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);
  return { students, issues, layout: 'wide' };
}


const TITLE_RE = /^[初高國][一二三123]?(.{1,3}?)班?$/;
const SCIENCE_RE = /工程|生醫|醫|理|自然|數理|資訊|電機|化工|科學/;
const LIBERAL_RE = /社會|文|商|管理|法|語|藝|社/;

/** 類組文字 → 組別；無法判斷回 null */
export function trackOfText(text: string): Track | null {
  const t = normalizeCell(text);
  if (!t) return null;
  if (SCIENCE_RE.test(t)) return 'science';
  if (LIBERAL_RE.test(t)) return 'liberal';
  return null;
}

/**
 * 區塊標題版式：某一列有 2 個以上「(初|高|國)[一二三]?班名」的儲存格，視為各班區塊起點；
 * 每區塊 5 欄：[學號][座號][姓名][註或類組][帳號]，欄位標籤不在表頭，依位置取值。帳號不讀取（個資）。
 */
function findTitleRow(rows: readonly (readonly string[])[]): { row: number; cols: number[] } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols = (rows[i] ?? []).map((c, j) => (TITLE_RE.test(normalizeCell(c)) ? j : -1)).filter((j) => j >= 0);
    if (cols.length >= 2) return { row: i, cols };
  }
  return null;
}

function parseBlocks(rows: readonly (readonly string[])[], title: { row: number; cols: number[] }, opts: RosterOptions): RosterResult {
  const students: Student[] = [];
  const issues: RosterResult['issues'] = [];
  const tally: Record<number, Record<Track, number>> = {};
  const header = rows[title.row] ?? [];
  title.cols.forEach((start, bi) => {
    const label = TITLE_RE.exec(normalizeCell(header[start] ?? ''))?.[1] ?? '';
    const idx = opts.classNames ? opts.classNames.findIndex((n) => n && n === label) : -1;
    const classNo = idx >= 0 ? idx + 1 : bi + 1;
    for (let i = title.row + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const name = (r[start + 2] ?? '').trim();
      const seatNo = parseSeatNo(r[start + 1] ?? '');
      if (!name || seatNo === null) continue;
      const s: Student = { classNo, seatNo, name };
      const id = normalizeCell(r[start] ?? '');
      if (/^\d+$/.test(id)) s.schoolId = id;
      students.push(s);
      const tr = trackOfText(r[start + 3] ?? '');
      if (tr) (tally[classNo] ??= { science: 0, liberal: 0 })[tr]++;
    }
  });
  const classTracks: Record<number, Track> = {};
  for (const [k, v] of Object.entries(tally)) {
    if (v.science !== v.liberal) classTracks[Number(k)] = v.science > v.liberal ? 'science' : 'liberal';
  }
  students.sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);
  const dup = new Set<string>();
  for (const s of students) {
    const k = `${s.classNo}-${s.seatNo}`;
    if (dup.has(k)) issues.push({ row: 0, message: `班級 ${s.classNo} 座號 ${s.seatNo} 重複` });
    dup.add(k);
  }
  const res: RosterResult = { students, issues, layout: 'blocks' };
  if (Object.keys(classTracks).length) res.classTracks = classTracks;
  return res;
}

export function parseRoster(rows: readonly (readonly string[])[], opts: RosterOptions = {}): RosterResult {
  const title = findTitleRow(rows);
  if (title && !rows.slice(0, 10).some((r) => r.some((c) => fieldOf(c) === 'seatNo'))) return parseBlocks(rows, title, opts);
  // 寬表：某一列有 2 個以上「座號」
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const n = (rows[i] ?? []).filter((c) => fieldOf(c) === 'seatNo').length;
    if (n >= 2) return parseWide(rows, i, opts);
  }
  const h = findHeaderRow(rows);
  if (h >= 0) return parseTall(rows, h, opts);
  return { students: [], issues: [{ row: 0, message: '找不到表頭（需有「座號」與「姓名」欄）' }], layout: 'unknown' };
}
