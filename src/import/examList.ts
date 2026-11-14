/**
 * 考試名單（大考中心格式，D15）解析：欄位智慧對應、組別代碼 → 考科、
 * 寬鬆解析「特殊生需求註明」的缺考科目、「加考」欄、略過說明區。
 * 科目 id 約定：chi 國文、eng 英文、math 數學（第 1、2 次）、mathA 數 A、mathB 數 B、sci 自然、soc 社會。
 * 英聽人人都考，不參與標示與抽離（D67），不在此處理。
 */
import type { ExamEntry } from '../data/types';
import { findHeaderRow, mapColumns, normalizeCell, parseClassNo, parseSeatNo } from './columns';

export type SubjectId = 'chi' | 'eng' | 'math' | 'mathA' | 'mathB' | 'sci' | 'soc';

/** 組別代碼表（sample-analysis 第一節）。first＝第 1、2 次（數學不分），second＝第 3、4 次 */
export const GROUP_TABLES: Record<'first' | 'second', Record<string, SubjectId[]>> = {
  first: {
    '0': ['chi', 'eng', 'math', 'sci', 'soc'],
    D: ['chi', 'eng', 'math', 'sci'],
    E: ['chi', 'eng', 'math', 'soc'],
  },
  second: {
    '0': ['chi', 'eng', 'mathA', 'mathB', 'sci', 'soc'],
    D: ['chi', 'eng', 'mathA', 'mathB', 'sci'],
    E: ['chi', 'eng', 'mathA', 'mathB', 'soc'],
    F: ['chi', 'eng', 'mathA', 'sci', 'soc'],
    '6': ['chi', 'eng', 'mathA', 'sci'],
    '7': ['chi', 'eng', 'mathA', 'soc'],
    '8': ['chi', 'eng', 'mathB', 'soc'],
  },
};

/** "0-全科"、"D-自然組"、"d" → "0"、"D"、"D" */
export function groupKey(cell: string): string {
  return normalizeCell(cell).charAt(0).toUpperCase();
}

/**
 * 從文字找出提到的科目。數學寫法：數A/數Ａ/數 B/數學；單寫「數」在第 3、4 次視為數 A 與數 B 皆指。
 * 例：「x數A」、「數A、社」、「X自然社會」、「缺國英」。
 */
export function parseSubjects(text: string, second: boolean): SubjectId[] {
  const t = normalizeCell(text).toUpperCase();
  const out = new Set<SubjectId>();
  if (/數A/.test(t)) out.add('mathA');
  if (/數B/.test(t)) out.add('mathB');
  const bare = t.replace(/數[AB]/g, '');
  if (/數/.test(bare)) {
    if (second) {
      out.add('mathA');
      out.add('mathB');
    } else out.add('math');
  }
  if (/國/.test(t)) out.add('chi');
  if (/英(?!聽)/.test(t)) out.add('eng');
  if (/自/.test(t)) out.add('sci');
  if (/社/.test(t)) out.add('soc');
  return [...out];
}

export interface ExamListIssue {
  /** 工作表列號（1 起） */
  row: number;
  message: string;
}

export interface ExamListResult {
  entries: ExamEntry[];
  issues: ExamListIssue[];
  /** 欄位對應結果（給畫面讓使用者確認） */
  columns: Record<string, number>;
  /** 欄位 → 該欄表頭原文（給畫面讓使用者確認對應是否正確） */
  headers: Record<string, string>;
}

export interface ExamListOptions {
  /** 學測第幾次：決定組別表與數學是否分 A/B；預設 1 */
  round?: number;
  classNames?: readonly string[];
  /** 沒有組別欄時（如會考）每人的預設科目 id */
  defaultSubjectIds?: readonly string[];
}

export function parseExamList(rows: readonly (readonly string[])[], opts: ExamListOptions = {}): ExamListResult {
  const second = (opts.round ?? 1) >= 3;
  const table = GROUP_TABLES[second ? 'second' : 'first'];
  const issues: ExamListIssue[] = [];
  const h = findHeaderRow(rows);
  if (h < 0) {
    return { entries: [], issues: [{ row: 0, message: '找不到表頭（需有「座號」與「姓名」欄）' }], columns: {}, headers: {} };
  }
  const col = mapColumns(rows[h] ?? []);
  const get = (r: readonly string[], f: keyof typeof col): string => (col[f] === undefined ? '' : (r[col[f] as number] ?? ''));
  const entries: ExamEntry[] = [];
  const seen = new Set<string>();
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => !c.trim())) continue;
    const name = get(r, 'name').trim();
    const seatNo = parseSeatNo(get(r, 'seatNo'));
    const classNo = col.classNo === undefined ? null : parseClassNo(get(r, 'classNo'), opts.classNames);
    // 說明區、統計區：缺班級、座號或姓名的列一律略過（只在像是學生列時才警告）
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
    let subjects: string[];
    const gk = col.group === undefined ? '' : groupKey(get(r, 'group'));
    if (col.group !== undefined && gk) {
      const base = table[gk];
      if (!base) {
        issues.push({ row: i + 1, message: `組別「${get(r, 'group').trim()}」不在對照表中` });
        subjects = [];
      } else subjects = [...base];
    } else subjects = [...(opts.defaultSubjectIds ?? [])];
    const absent = parseSubjects(get(r, 'note'), second);
    const extra = parseSubjects(get(r, 'extra'), second);
    subjects = subjects.filter((s) => !absent.includes(s as SubjectId));
    for (const s of extra) if (!subjects.includes(s)) subjects.push(s);
    const e: ExamEntry = { classNo, seatNo, name, subjectIds: subjects };
    if (gk) e.groupCode = get(r, 'group').trim();
    const note = get(r, 'note').trim();
    if (note) e.note = note;
    const examNo = get(r, 'examNo').trim();
    if (examNo) e.examNo = examNo;
    entries.push(e);
  }
  const columns = Object.fromEntries(Object.entries(col).filter(([, v]) => v !== undefined)) as Record<string, number>;
  const headers = Object.fromEntries(Object.entries(columns).map(([f, i]) => [f, (rows[h]?.[i] ?? '').trim()]));
  return { entries, issues, columns, headers };
}
