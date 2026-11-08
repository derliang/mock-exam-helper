/** 畫面層的文件狀態與純函式變更（可單元測試；復原以整份快照為單位） */
import type { ClassInfo, Division, ExamConfig, ExamKind, Semester, Settings, Student, Track } from '../data';
import { studentCode } from '../data';
import type { ExamFiles } from '../data/folder';
import { defaultLabelLayout } from '../export/model';
import { diffsStale, refreshDiffs } from '../import/compare';
import { defaultSubjects, isCustomized } from './subjects';

export interface Doc {
  settings: Settings;
  rosters: Record<Division, Student[]>;
  exams: ExamConfig[];
  /** 每次模擬考底下的其他檔案（考試名單、比對、覆寫、排座結果），以考試 id 為鍵；跟著復原 */
  examFiles?: Record<string, Partial<ExamFiles>>;
}

export type Result<T> = { ok: true; doc: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function validateStudent(doc: Doc, division: Division, s: Student, replacing?: Student): string | null {
  if (!doc.settings.classes.some((c) => c.no === s.classNo && c.division === division)) return '班級不存在，請先到「班級資料」新增';
  if (!Number.isInteger(s.seatNo) || s.seatNo < 1 || s.seatNo > 99) return '座號要是 1～99 的整數';
  if (!s.name.trim()) return '姓名不能空白';
  const dup = doc.rosters[division].find((x) => x !== replacing && x.classNo === s.classNo && x.seatNo === s.seatNo);
  if (dup) return `${studentCode(s.classNo, s.seatNo)} 已有學生，座號不可重複`;
  return null;
}

const clean = (s: Student): Student => {
  const o: Student = { classNo: s.classNo, seatNo: s.seatNo, name: s.name.trim() };
  if (s.schoolId?.trim()) o.schoolId = s.schoolId.trim();
  if (s.groupCode?.trim()) o.groupCode = s.groupCode.trim();
  if (s.special?.trim()) o.special = s.special.trim();
  return o;
};
export const sortRoster = (l: Student[]): Student[] => [...l].sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);

const withRoster = (doc: Doc, division: Division, l: Student[]): Doc => ({ ...doc, rosters: { ...doc.rosters, [division]: sortRoster(l) } });

export function addStudent(doc: Doc, division: Division, s: Student): Result<Doc> {
  const e = validateStudent(doc, division, s);
  if (e) return fail(e);
  return { ok: true, doc: withRoster(doc, division, [...doc.rosters[division], clean(s)]) };
}

export function updateStudent(doc: Doc, division: Division, old: Student, s: Student): Result<Doc> {
  const e = validateStudent(doc, division, s, old);
  if (e) return fail(e);
  return { ok: true, doc: withRoster(doc, division, doc.rosters[division].map((x) => (x === old ? clean(s) : x))) };
}

/** 刪除後空號保留（D41），所以只是移除該筆 */
export function removeStudent(doc: Doc, division: Division, s: Student): Doc {
  return withRoster(doc, division, doc.rosters[division].filter((x) => x !== s));
}

export function searchStudents(l: Student[], q: string): Student[] {
  const k = q.trim();
  if (!k) return l;
  return l.filter((s) => s.name.includes(k) || studentCode(s.classNo, s.seatNo).includes(k) || (s.schoolId ?? '').includes(k));
}

function mapClass(doc: Doc, no: number, division: Division, f: (c: ClassInfo) => ClassInfo): Doc {
  return { ...doc, settings: { ...doc.settings, classes: doc.settings.classes.map((c) => (c.no === no && c.division === division ? f(c) : c)) } };
}
export const setClassColor = (doc: Doc, division: Division, no: number, colorIndex: number): Doc =>
  mapClass(doc, no, division, (c) => ({ ...c, colorIndex }));

/** 國中部不分文理組（UI-08）：對國中部班級無效 */
export function setClassTrack(doc: Doc, division: Division, no: number, track: Track): Doc {
  if (division === 'junior') return doc;
  return mapClass(doc, no, division, (c) => ({ ...c, track }));
}

/**
 * 共用名單、班級或參加方式改動後，重算每次考試的名單比對（#60）。
 * 沒有變動的考試維持原物件（不會被蓋上修改時間）；已處理的差異只在內容相同時保留選擇。
 */
export function syncDiffs(doc: Doc): Doc {
  if (!doc.examFiles) return doc;
  let files = doc.examFiles;
  for (const e of doc.exams) {
    const f = files[e.id];
    if (!f?.entries) continue;
    const fresh = refreshDiffs(doc.rosters[e.division], f.entries, e.participation, f.diffs ?? []);
    if (!diffsStale(f.diffs ?? [], fresh)) continue;
    files = { ...files, [e.id]: { ...f, diffs: fresh } };
  }
  return files === doc.examFiles ? doc : { ...doc, examFiles: files };
}

export interface NewExamOptions {
  /** 學測次別（使用者選擇）；沒給就依學年度＋學期推算，不是歷史筆數 */
  round?: number;
  semester?: Semester;
  /** 沿用上一次同類型模擬考的設定（教室、標示規則、參加方式、標籤格式、自訂考科） */
  prev?: ExamConfig;
}

export function newExam(doc: Doc, kind: ExamKind, name: string, now: Date, opts: NewExamOptions = {}): Result<Doc> {
  const n = name.trim();
  if (!n) return fail('請輸入考試名稱');
  if (kind === 'ast') return fail('分科尚未開放');
  if (doc.exams.some((e) => e.name === n)) return fail('已有同名的模擬考');
  const division: Division = kind === 'bcct' ? 'junior' : 'senior';
  const semester = opts.semester ?? 'first';
  if (opts.round !== undefined && (!Number.isInteger(opts.round) || opts.round < 1)) return fail('次別要是 1 以上的整數');
  const round = kind === 'gsat' ? opts.round ?? nextRound(doc, kind, now) : undefined;
  const prev = opts.prev && opts.prev.kind === kind ? opts.prev : undefined;
  const exam: ExamConfig = {
    id: `exam-${now.getTime()}`, name: n, kind, division, semester, round,
    participation: prev?.participation ?? 'all',
    subjects: prev && isCustomized(prev.subjects) ? structuredClone(prev.subjects) : defaultSubjects(kind, round),
    markRules: prev ? structuredClone(prev.markRules) : [], classroomIds: prev ? [...prev.classroomIds] : [],
    // 標籤格數待使用者定案（D72），這裡只是預設值，一律由參數帶
    labelLayout: prev ? structuredClone(prev.labelLayout) : defaultLabelLayout(doc.settings.defaultLabelPaper),
    ...(prev?.seatFullyAbsent ? { seatFullyAbsent: true } : {}),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  return { ok: true, doc: { ...doc, exams: [...doc.exams, exam] } };
}

/** 同一學年度、同類型已有幾次，下一次就是第幾次（新學年從第 1 次重新開始，#68） */
export function nextRound(doc: Doc, kind: ExamKind, now: Date): number {
  const year = schoolYear(now);
  return doc.exams.filter((e) => e.kind === kind && schoolYear(new Date(e.createdAt)) === year).length + 1;
}

/** 新增頁預設的名稱：「學測第三次」「會考第一次」，已被用掉就往後找（資料夾名稱會用它） */
export function suggestExamName(doc: Doc, kind: ExamKind, now: Date = new Date()): string {
  const cn = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const base = KIND_LABEL[kind].replace(/（.*）/, '');
  for (let i = nextRound(doc, kind, now); i < 100; i++) {
    const name = `${base}第${cn[i] ?? i}次`;
    if (!doc.exams.some((e) => e.name === name)) return name;
    // 同名的是舊學年的考試：新學年的「第一次」改加學年度前綴，次別仍是正確的 i
    const withYear = `${schoolYear(now)}學年度${name}`;
    if (doc.exams.some((e) => e.name === name && schoolYear(new Date(e.createdAt)) !== schoolYear(now)) && !doc.exams.some((e) => e.name === withYear)) return withYear;
  }
  return base;
}

/** 台灣學年度：8 月起算新學年（與原型一致） */
export function schoolYear(d: Date): number {
  const y = d.getFullYear() - 1911;
  return d.getMonth() >= 7 ? y : y - 1;
}

/** 這次沿用的對象：同類型最近一次修改的模擬考（新增考試與會考快速模式共用這個定義；accept 可再加條件） */
export function previousExam(doc: Doc, kind: ExamKind, accept: (e: ExamConfig) => boolean = () => true): ExamConfig | undefined {
  return doc.exams.filter((e) => e.kind === kind && accept(e)).sort((a, b) => lastModified(b).localeCompare(lastModified(a)))[0];
}

export const lastModified = (e: ExamConfig): string => e.updatedAt ?? e.createdAt;

/** 比較前後兩份文件，有變動的模擬考（本體或底下的檔案）蓋上最後修改時間 */
export function stampModified(prev: Doc, next: Doc, now: Date): Doc {
  const iso = now.toISOString();
  const before = new Map(prev.exams.map((e) => [e.id, e]));
  let changed = false;
  const exams = next.exams.map((e) => {
    const old = before.get(e.id);
    const same = old && old === e && prev.examFiles?.[e.id] === next.examFiles?.[e.id];
    if (!old || same || e.updatedAt !== old.updatedAt) return e;
    changed = true;
    return { ...e, updatedAt: iso };
  });
  return changed ? { ...next, exams } : next;
}

/** 「高中部・學測」「國中部・會考」：頁首與列表用，一眼看出是哪個部別、哪種考試 */
export function examLabel(e: Pick<ExamConfig, 'division' | 'kind'>): string {
  return `${e.division === 'senior' ? '高中部' : '國中部'}・${KIND_LABEL[e.kind].replace(/（.*）/, '')}`;
}

export const KIND_LABEL: Record<ExamKind, string> = { gsat: '學測', ast: '分科（尚未開放）', bcct: '會考' };

/** 更新某次模擬考的欄位（名稱同名檢查） */
export function updateExam(doc: Doc, id: string, patch: Partial<ExamConfig>): Result<Doc> {
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return fail('名稱不能空白');
    if (doc.exams.some((e) => e.id !== id && e.name === n)) return fail('已有同名的模擬考');
    patch = { ...patch, name: n };
  }
  return { ok: true, doc: { ...doc, exams: doc.exams.map((e) => (e.id === id ? { ...e, ...patch } : e)) } };
}

// ── 新增／刪除／改名班級（D83）──────────────────────────────────────────

const classesOf = (doc: Doc, division: Division): ClassInfo[] => doc.settings.classes.filter((c) => c.division === division);

/** 下一個班級序號：該部別最大序號＋1 */
export const nextClassNo = (doc: Doc, division: Division): number => Math.max(0, ...classesOf(doc, division).map((c) => c.no)) + 1;

/** 班級名稱檢查：不可空白、同部別不可重名；回傳錯誤訊息或 null */
export function validateClassName(doc: Doc, division: Division, name: string, exceptNo?: number): string | null {
  const n = name.trim();
  if (!n) return '班級名稱不可空白';
  if (classesOf(doc, division).some((c) => c.no !== exceptNo && c.name === n)) return `已有名為「${n}」的班級，名稱不可重複`;
  return null;
}

/** 目前最少人用的班級色（同數量取序號小者），新班級預設用它 */
function leastUsedColor(list: ClassInfo[]): number {
  const count = new Map<number, number>();
  for (let i = 1; i <= 12; i++) count.set(i, 0);
  for (const c of list) { const k = ((c.colorIndex - 1) % 12 + 12) % 12 + 1; count.set(k, (count.get(k) ?? 0) + 1); }
  let best = 1;
  for (let i = 2; i <= 12; i++) if ((count.get(i) ?? 0) < (count.get(best) ?? 0)) best = i;
  return best;
}

export interface NewClassInput { name?: string; track?: Track; no?: number }

/**
 * 新增班級。no 不給就用下一個序號；給了但已存在則失敗。
 * name 不給用「第NN班」；國中部不設文理組，高中部預設理組。
 */
export function addClass(doc: Doc, division: Division, input: NewClassInput = {}): Result<Doc> {
  const no = input.no ?? nextClassNo(doc, division);
  if (!Number.isInteger(no) || no < 1 || no > 99) return fail('班級序號要在 1～99');
  if (classesOf(doc, division).some((c) => c.no === no)) return fail(`班級 ${String(no).padStart(2, '0')} 已存在`);
  const name = (input.name ?? '').trim() || `第${String(no).padStart(2, '0')}班`;
  const bad = validateClassName(doc, division, name);
  if (bad) return fail(bad);
  const c: ClassInfo = { no, name, division, colorIndex: leastUsedColor(classesOf(doc, division)), ...(division === 'senior' ? { track: input.track ?? 'science' } : {}) };
  const classes = [...doc.settings.classes, c].sort((a, b) => (a.division === b.division ? a.no - b.no : a.division === 'senior' ? -1 : 1));
  return { ok: true, doc: { ...doc, settings: { ...doc.settings, classes } } };
}

/** 這個班級目前有多少東西用到它（名單人數、各次考試名單人數） */
export function classUsage(doc: Doc, division: Division, no: number): { roster: number; examEntries: number } {
  const roster = doc.rosters[division].filter((s) => s.classNo === no).length;
  let examEntries = 0;
  for (const e of doc.exams) {
    if (e.division !== division) continue;
    examEntries += (doc.examFiles?.[e.id]?.entries ?? []).filter((x) => x.classNo === no).length;
  }
  return { roster, examEntries };
}

/** 刪除班級：班上還有學生（名單或任何一次考試名單）就拒絕，不連帶刪人 */
export function removeClass(doc: Doc, division: Division, no: number): Result<Doc> {
  if (!classesOf(doc, division).some((c) => c.no === no)) return fail('找不到這個班級');
  const u = classUsage(doc, division, no);
  if (u.roster > 0) return fail(`這班在學生名單裡還有 ${u.roster} 人，請先刪除或搬走他們，才能刪除班級`);
  if (u.examEntries > 0) return fail(`這班在模擬考的考試名單裡還有 ${u.examEntries} 筆，刪除後這些人會找不到班級`);
  return { ok: true, doc: { ...doc, settings: { ...doc.settings, classes: doc.settings.classes.filter((c) => !(c.no === no && c.division === division)) } } };
}

export function renameClass(doc: Doc, division: Division, no: number, name: string): Result<Doc> {
  const bad = validateClassName(doc, division, name, no);
  if (bad) return fail(bad);
  return { ok: true, doc: mapClass(doc, no, division, (c) => ({ ...c, name: name.trim() })) };
}
