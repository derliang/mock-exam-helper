/**
 * 名單比對（D42、D54、D64）：學生名單 vs 考試名單。
 * 全員參加：學生名單有、考試名單沒有 → 差異；部分參加：這類不算差異（只回報未參加人數）。
 * 每筆差異由使用者選：以考試名單為準／以學生名單為準／手動編輯；全部處理完才能繼續排座。
 */
import type { ExamEntry, Participation, RosterDiff, Student } from '../data/types';
import { studentCode } from '../data/helpers';

type Id = Pick<Student, 'classNo' | 'seatNo' | 'name'>;
const id = (x: Id): Id => ({ classNo: x.classNo, seatNo: x.seatNo, name: x.name });
const codeOf = (x: Id) => studentCode(x.classNo, x.seatNo);

export interface CompareResult {
  diffs: RosterDiff[];
  /** 部分參加時，學生名單有但沒報名的人數 */
  notParticipating: number;
}

export function compareRosters(
  roster: readonly Student[],
  entries: readonly ExamEntry[],
  participation: Participation,
): CompareResult {
  const byCode = new Map(roster.map((s) => [codeOf(s), s]));
  const matched = new Set<string>();
  const diffs: RosterDiff[] = [];
  const unmatchedEntries: ExamEntry[] = [];

  for (const e of entries) {
    const c = codeOf(e);
    const s = byCode.get(c);
    if (!s) {
      unmatchedEntries.push(e);
      continue;
    }
    matched.add(c);
    if (s.name.trim() !== e.name.trim()) {
      diffs.push({ kind: 'mismatch', code: c, exam: id(e), roster: id(s) });
    }
  }
  let leftover = roster.filter((s) => !matched.has(codeOf(s)));

  // 同名且僅一人：視為同一人換了班級或座號 → mismatch，而不是兩筆獨立差異
  for (const e of unmatchedEntries) {
    const same = leftover.filter((s) => s.name.trim() === e.name.trim());
    const dupExam = unmatchedEntries.filter((x) => x.name.trim() === e.name.trim()).length;
    if (same.length === 1 && dupExam === 1) {
      const s = same[0] as Student;
      diffs.push({ kind: 'mismatch', code: codeOf(e), exam: id(e), roster: id(s) });
      leftover = leftover.filter((x) => x !== s);
    } else {
      diffs.push({ kind: 'only-in-exam', code: codeOf(e), exam: id(e) });
    }
  }
  let notParticipating = 0;
  if (participation === 'all') {
    for (const s of leftover) diffs.push({ kind: 'only-in-roster', code: codeOf(s), roster: id(s) });
  } else notParticipating = leftover.length;

  diffs.sort((a, b) => a.code.localeCompare(b.code));
  return { diffs, notParticipating };
}

/** 全部差異都已選擇（manual 需有 edited）才能繼續排座 */
export function allResolved(diffs: readonly RosterDiff[]): boolean {
  return diffs.every((d) => d.choice !== undefined && (d.choice !== 'manual' || d.edited !== undefined));
}

export interface ResolveResult {
  students: Student[];
  entries: ExamEntry[];
}

/**
 * 依使用者的選擇產生處理後的學生名單與考試名單（輸入不被修改）。
 * - only-in-exam：use-exam→學生名單新增此人；use-roster→從考試名單移除；manual→以 edited 新增並修正考試名單
 * - only-in-roster：use-exam→從學生名單移除；use-roster→保留，並補一筆沒有科目的考試名單（subjectIds 空，需另行設定）；manual→以 edited 修正學生
 * - mismatch：use-exam→學生名單改成考試名單的值；use-roster→考試名單改成學生名單的值；manual→兩邊都改成 edited
 */
export function applyDiffs(
  roster: readonly Student[],
  entries: readonly ExamEntry[],
  diffs: readonly RosterDiff[],
): ResolveResult {
  if (!allResolved(diffs)) throw new Error('還有差異尚未處理');
  let students = roster.map((s) => ({ ...s }));
  let list = entries.map((e) => ({ ...e }));
  const rm = <T extends Id>(l: T[], x: Id) => l.filter((y) => !(y.classNo === x.classNo && y.seatNo === x.seatNo && y.name === x.name));
  const setStudent = (old: Id | undefined, to: Id) => {
    // 保留原學生的學號／類組／特殊註記（#59）；只改班級、座號、姓名
    const cur = old && students.find((y) => y.classNo === old.classNo && y.seatNo === old.seatNo && y.name === old.name);
    if (old) students = rm(students, old);
    students.push({
      ...(cur?.schoolId !== undefined ? { schoolId: cur.schoolId } : {}),
      ...(cur?.groupCode !== undefined ? { groupCode: cur.groupCode } : {}),
      ...(cur?.special !== undefined ? { special: cur.special } : {}),
      classNo: to.classNo, seatNo: to.seatNo, name: to.name,
    });
  };
  const setEntry = (old: Id | undefined, to: Id) => {
    const cur = old && list.find((y) => y.classNo === old.classNo && y.seatNo === old.seatNo && y.name === old.name);
    list = old ? rm(list, old) : list;
    list.push({ ...(cur ?? { subjectIds: [] }), classNo: to.classNo, seatNo: to.seatNo, name: to.name });
  };
  for (const d of diffs) {
    const choice = d.choice;
    if (choice === 'manual' && d.edited) {
      setStudent(d.roster, d.edited);
      setEntry(d.exam, d.edited);
      if (d.kind === 'only-in-roster') list = rm(list, d.edited); // 學生名單單邊：不憑空新增考試名單
      continue;
    }
    if (d.kind === 'only-in-exam') {
      if (choice === 'use-exam' && d.exam) setStudent(undefined, d.exam);
      else if (choice === 'use-roster' && d.exam) list = rm(list, d.exam);
    } else if (d.kind === 'only-in-roster') {
      if (choice === 'use-exam' && d.roster) students = rm(students, d.roster);
      else if (choice === 'use-roster' && d.roster) list.push({ ...id(d.roster), subjectIds: [] });
    } else if (d.exam && d.roster) {
      if (choice === 'use-exam') setStudent(d.roster, d.exam);
      else if (choice === 'use-roster') setEntry(d.exam, d.roster);
    }
  }
  students.sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);
  list.sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);
  return { students, entries: list };
}

const label = (x: Id): string => `${String(x.classNo).padStart(2, '0')} 班 ${x.seatNo} 號「${x.name}」`;

/**
 * 套用前驗整份結果（#67）：班級存在、座號 1–99、姓名非空、班級＋座號不重複。
 * 有問題就回傳訊息（指出哪兩人衝突），呼叫端不可寫入任何一份名單。
 */
export function validateResolved(res: ResolveResult, classNos: ReadonlySet<number>): string | null {
  const check = (list: readonly Id[], where: string): string | null => {
    const seen = new Map<string, Id>();
    for (const x of list) {
      if (!classNos.has(x.classNo)) return `${where}：${label(x)}的班級不存在，請先到「班級資料」新增`;
      if (!Number.isInteger(x.seatNo) || x.seatNo < 1 || x.seatNo > 99) return `${where}：${label(x)}的座號要是 1～99 的整數`;
      if (!x.name.trim()) return `${where}：${String(x.classNo).padStart(2, '0')} 班 ${x.seatNo} 號姓名不能空白`;
      const k = codeOf(x);
      const other = seen.get(k);
      if (other) return `${where}：${label(other)}與${label(x)}編號重複（${k}），請重新選擇`;
      seen.set(k, x);
    }
    return null;
  };
  return check(res.students, '共用學生名單') ?? check(res.entries, '考試名單');
}

const sig = (d: RosterDiff): string => {
  const f = (x?: Id) => (x ? `${x.classNo}/${x.seatNo}/${x.name.trim()}` : '-');
  return `${d.kind}|${d.code}|${f(d.exam)}|${f(d.roster)}`;
};

/**
 * 依目前輸入（共用名單、考試名單、參加方式）重算差異（#60）。
 * 只有「種類、編號、兩邊內容」完全相同的舊差異才沿用先前的選擇，不會把選擇套到不同考生。
 */
export function refreshDiffs(
  roster: readonly Student[],
  entries: readonly ExamEntry[],
  participation: Participation,
  stored: readonly RosterDiff[],
): RosterDiff[] {
  const old = new Map(stored.map((d) => [sig(d), d]));
  return compareRosters(roster, entries, participation).diffs.map((d) => {
    const o = old.get(sig(d));
    return o?.choice !== undefined ? { ...d, choice: o.choice, ...(o.edited ? { edited: o.edited } : {}) } : d;
  });
}

/** 已存的差異和重算結果是否為同一批差異（不看選擇） */
export function diffsStale(stored: readonly RosterDiff[], fresh: readonly RosterDiff[]): boolean {
  if (stored.length !== fresh.length) return true;
  const a = new Set(stored.map(sig));
  return fresh.some((d) => !a.has(sig(d)));
}
