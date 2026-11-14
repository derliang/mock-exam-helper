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

export interface CompareOptions {
  /** 班級資料裡有的班級序號；有給時，考試名單裡不在其中的班級整班歸為 new-class（一班一筆） */
  classNos?: ReadonlySet<number>;
  /** 偵測「組別不同」（只用於學測類的高中部：分科的組別是考科文字、國中部不分組） */
  groups?: boolean;
}

/** 組別代碼取首字大寫（與匯入時 groupKey 同一寫法），兩邊任一沒填就不比 */
const groupKeyOf = (g?: string): string => (g ?? '').trim().charAt(0).toUpperCase();

export function compareRosters(
  roster: readonly Student[],
  entries: readonly ExamEntry[],
  participation: Participation,
  opts: CompareOptions = {},
): CompareResult {
  const byCode = new Map(roster.map((s) => [codeOf(s), s]));
  const matched = new Set<string>();
  const diffs: RosterDiff[] = [];
  const unmatchedEntries: ExamEntry[] = [];

  // 班級資料沒有的班級：整班一筆（新增班級／改成既有班級／不匯入這班），不再逐人列為差異
  const unknown = new Map<number, ExamEntry[]>();
  const known: ExamEntry[] = [];
  for (const e of entries) {
    if (opts.classNos && !opts.classNos.has(e.classNo)) {
      unknown.set(e.classNo, [...(unknown.get(e.classNo) ?? []), e]);
    } else known.push(e);
  }
  for (const [no, list] of unknown) {
    diffs.push({ kind: 'new-class', code: `new-class-${no}`, members: list.map(id).sort((a, b) => a.seatNo - b.seatNo) });
  }

  for (const e of known) {
    const c = codeOf(e);
    const s = byCode.get(c);
    if (!s) {
      unmatchedEntries.push(e);
      continue;
    }
    matched.add(c);
    if (s.name.trim() !== e.name.trim()) {
      diffs.push({ kind: 'mismatch', code: c, exam: id(e), roster: id(s) });
    } else if (opts.groups) {
      const ge = groupKeyOf(e.groupCode), gs = groupKeyOf(s.groupCode);
      if (ge && gs && ge !== gs) diffs.push({ kind: 'group-diff', code: c, exam: id(e), roster: id(s), groups: { exam: ge, roster: gs } });
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
  return diffs.every(isResolved);
}

/** 單筆是否已處理：手動要有編輯結果；改成既有班級要有選定的班級 */
export function isResolved(d: RosterDiff): boolean {
  if (d.choice === undefined) return false;
  if (d.choice === 'manual') return d.edited !== undefined;
  if (d.choice === 'remap-class') return d.targetClassNo !== undefined;
  return true;
}

export interface ResolveResult {
  students: Student[];
  entries: ExamEntry[];
  /** 選了「新增班級」的班級序號：呼叫端要在班級資料新增這些班（applyDiffs 只處理名單） */
  addedClasses: number[];
}

export interface ApplyOptions {
  /** 組別首字 → 該組別考的科目 id；「組別不同」選以學生名單為準時，用它重算這位考生的考科 */
  subjectsOfGroup?: (groupKey: string) => readonly string[] | undefined;
}

/**
 * 依使用者的選擇產生處理後的學生名單與考試名單（輸入不被修改）。
 * - only-in-exam：use-exam→學生名單新增此人；use-roster→從考試名單移除；manual→以 edited 新增並修正考試名單
 * - only-in-roster：use-exam→從學生名單移除；use-roster→保留，並補一筆沒有科目的考試名單（subjectIds 空，需另行設定）；manual→以 edited 修正學生
 * - mismatch：use-exam→學生名單改成考試名單的值；use-roster→考試名單改成學生名單的值；manual→兩邊都改成 edited
 * - group-diff：use-exam→學生名單的組別改成考試名單的；use-roster→考試名單的組別（與考科，查得到才改）改成學生名單的
 * - new-class：add-class→這班的人加進學生名單（班級由呼叫端新增，見 addedClasses）；remap-class→這班的人改到 targetClassNo（學生名單沒有該編號的人就補上）；skip-class→這班的人從考試名單移除
 */
export function applyDiffs(
  roster: readonly Student[],
  entries: readonly ExamEntry[],
  diffs: readonly RosterDiff[],
  opts: ApplyOptions = {},
): ResolveResult {
  if (!allResolved(diffs)) throw new Error('還有差異尚未處理');
  let students = roster.map((s) => ({ ...s }));
  let list = entries.map((e) => ({ ...e }));
  const addedClasses: number[] = [];
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
  const hasStudent = (x: Id) => students.some((y) => y.classNo === x.classNo && y.seatNo === x.seatNo);
  for (const d of diffs) {
    const choice = d.choice;
    if (d.kind === 'new-class') {
      const members = d.members ?? [];
      if (choice === 'add-class') {
        for (const x of members) if (!hasStudent(x)) setStudent(undefined, x);
        if (members[0]) addedClasses.push(members[0].classNo);
      } else if (choice === 'remap-class' && d.targetClassNo !== undefined) {
        const target = d.targetClassNo;
        for (const x of members) {
          const to = { ...x, classNo: target };
          setEntry(x, to);
          if (!hasStudent(to)) setStudent(undefined, to);
        }
      } else if (choice === 'skip-class') {
        for (const x of members) list = rm(list, x);
      }
      continue;
    }
    if (d.kind === 'group-diff' && d.exam && d.groups) {
      const at = d.exam;
      if (choice === 'use-exam') {
        students = students.map((s) => (s.classNo === at.classNo && s.seatNo === at.seatNo ? { ...s, groupCode: d.groups?.exam } : s));
      } else if (choice === 'use-roster') {
        const subj = opts.subjectsOfGroup?.(d.groups.roster);
        list = list.map((e) => (e.classNo === at.classNo && e.seatNo === at.seatNo ? { ...e, groupCode: d.groups?.roster, ...(subj ? { subjectIds: [...subj] } : {}) } : e));
      }
      continue;
    }
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
  return { students, entries: list, addedClasses };
}

const label = (x: Id): string => `${String(x.classNo).padStart(2, '0')} 班 ${x.seatNo} 號「${x.name}」`;

/**
 * 套用前驗整份結果（#67）：班級存在、座號 1–99、姓名非空、班級＋座號不重複。
 * 有問題就回傳訊息（指出哪兩人衝突），呼叫端不可寫入任何一份名單。
 */
export function validateResolved(res: Pick<ResolveResult, 'students' | 'entries'>, classNos: ReadonlySet<number>): string | null {
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
  const extra = d.kind === 'group-diff' ? `|${d.groups?.exam}/${d.groups?.roster}` : d.kind === 'new-class' ? `|${(d.members ?? []).map(f).join(',')}` : '';
  return `${d.kind}|${d.code}|${f(d.exam)}|${f(d.roster)}${extra}`;
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
  opts: CompareOptions = {},
): RosterDiff[] {
  const old = new Map(stored.map((d) => [sig(d), d]));
  return compareRosters(roster, entries, participation, opts).diffs.map((d) => {
    const o = old.get(sig(d));
    return o?.choice !== undefined ? { ...d, choice: o.choice, ...(o.edited ? { edited: o.edited } : {}), ...(o.targetClassNo !== undefined ? { targetClassNo: o.targetClassNo } : {}) } : d;
  });
}

/** 已存的差異和重算結果是否為同一批差異（不看選擇） */
export function diffsStale(stored: readonly RosterDiff[], fresh: readonly RosterDiff[]): boolean {
  if (stored.length !== fresh.length) return true;
  const a = new Set(stored.map(sig));
  return fresh.some((d) => !a.has(sig(d)));
}
