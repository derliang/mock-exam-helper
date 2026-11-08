/** 畫面層的文件狀態與純函式變更（可單元測試；復原以整份快照為單位） */
import type { ClassInfo, Division, ExamConfig, ExamKind, Semester, Settings, Student, Track } from '../data';
import { studentCode } from '../data';
import type { ExamFiles } from '../data/folder';
import { defaultLabelLayout } from '../export/model';
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

export interface NewExamOptions {
  semester?: Semester;
  /** 沿用上一次同類型模擬考的設定（教室、標示規則、參加方式、標籤格式、自訂考科） */
  prev?: ExamConfig;
}

export function newExam(doc: Doc, kind: ExamKind, name: string, now: Date, opts: NewExamOptions = {}): Result<Doc> {
  const n = name.trim();
  if (!n) return fail('請輸入考試名稱');
  if (kind === 'ast') return fail('分科即將推出');
  if (doc.exams.some((e) => e.name === n)) return fail('已有同名的模擬考');
  const division: Division = kind === 'bcct' ? 'junior' : 'senior';
  const round = kind === 'gsat' ? doc.exams.filter((e) => e.kind === 'gsat').length + 1 : undefined;
  const prev = opts.prev && opts.prev.kind === kind ? opts.prev : undefined;
  const exam: ExamConfig = {
    id: `exam-${now.getTime()}`, name: n, kind, division, semester: opts.semester ?? 'first', round,
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

/** 新增頁預設的名稱：「學測第三次」「會考第一次」，已被用掉就往後找（資料夾名稱會用它） */
export function suggestExamName(doc: Doc, kind: ExamKind): string {
  const cn = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const base = KIND_LABEL[kind].replace(/（.*）/, '');
  for (let i = doc.exams.filter((e) => e.kind === kind).length + 1; i < 100; i++) {
    const name = `${base}第${cn[i] ?? i}次`;
    if (!doc.exams.some((e) => e.name === name)) return name;
  }
  return base;
}

/** 台灣學年度：8 月起算新學年（與原型一致） */
export function schoolYear(d: Date): number {
  const y = d.getFullYear() - 1911;
  return d.getMonth() >= 7 ? y : y - 1;
}

/** 這次沿用的對象：同類型最近一次修改的模擬考 */
export function previousExam(doc: Doc, kind: ExamKind): ExamConfig | undefined {
  return doc.exams.filter((e) => e.kind === kind).sort((a, b) => lastModified(b).localeCompare(lastModified(a)))[0];
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

export const KIND_LABEL: Record<ExamKind, string> = { gsat: '學測', ast: '分科（即將推出）', bcct: '會考' };

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
