/** 畫面層的文件狀態與純函式變更（可單元測試；復原以整份快照為單位） */
import type { ClassInfo, Division, ExamConfig, ExamKind, Settings, Student, Track } from '../data';
import { studentCode } from '../data';
import type { ExamFiles } from '../data/folder';
import { defaultSubjects } from './subjects';

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

export function newExam(doc: Doc, kind: ExamKind, name: string, now: Date): Result<Doc> {
  const n = name.trim();
  if (!n) return fail('請輸入考試名稱');
  if (kind === 'ast') return fail('分科即將推出');
  if (doc.exams.some((e) => e.name === n)) return fail('已有同名的模擬考');
  const division: Division = kind === 'bcct' ? 'junior' : 'senior';
  const exam: ExamConfig = {
    id: `exam-${now.getTime()}`, name: n, kind, division, semester: 'first', round: kind === 'gsat' ? 1 : undefined,
    participation: 'all', subjects: defaultSubjects(kind, kind === 'gsat' ? 1 : undefined), markRules: [], classroomIds: [],
    // 標籤格數待使用者定案（D72），這裡只是預設值，一律由參數帶
    labelLayout: { paper: doc.settings.defaultLabelPaper, cols: 6, rows: 8 }, createdAt: now.toISOString(),
  };
  return { ok: true, doc: { ...doc, exams: [...doc.exams, exam] } };
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
