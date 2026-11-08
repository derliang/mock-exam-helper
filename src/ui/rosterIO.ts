/** 學生名單的 Excel 範本／匯出／匯入合併（純函式，可單元測試；不碰 DOM） */
import type { Division, Student } from '../data';
import { studentCode } from '../data';
import type { Doc } from './store';
import { sortRoster } from './store';

export const TEMPLATE_HEADER = ['班級', '座號', '姓名', '學號（選填）'];

/** 範本：只有表頭；考生編號自動產生，高中部的組別來自考試名單，不用填（DESIGN 10.3） */
export const templateRows = (): string[][] => [TEMPLATE_HEADER];

export function exportRows(students: readonly Student[]): string[][] {
  return [TEMPLATE_HEADER, ...sortRoster([...students]).map((s) => [String(s.classNo).padStart(2, '0'), String(s.seatNo), s.name, s.schoolId ?? ''])];
}

export interface ImportPlan {
  /** 會寫入的名單 */
  students: Student[];
  /** 班級資料裡沒有的班級序號（匯入後無法排座，需先到班級資料新增） */
  unknownClasses: number[];
  /** 與目前名單相比 */
  before: number;
  after: number;
}

export function planImport(doc: Doc, division: Division, students: readonly Student[]): ImportPlan {
  const known = new Set(doc.settings.classes.filter((c) => c.division === division).map((c) => c.no));
  const unknown = [...new Set(students.filter((s) => !known.has(s.classNo)).map((s) => s.classNo))].sort((a, b) => a - b);
  const list = sortRoster([...students]);
  return { students: list, unknownClasses: unknown, before: doc.rosters[division].length, after: list.length };
}

/** 套用匯入：取代該部別整份名單（匯入的是「整年一份」名單，D35/D62）；學號不合法者忽略 */
export function applyImport(doc: Doc, division: Division, plan: ImportPlan): Doc {
  // 範本沒有組別與特殊生需求欄：同班同座號的舊紀錄沿用，避免匯入後被清空
  const old = new Map(doc.rosters[division].map((s) => [`${s.classNo}-${s.seatNo}`, s]));
  const students = plan.students.map((s) => {
    const o = old.get(`${s.classNo}-${s.seatNo}`);
    if (!o || o.name !== s.name) return s;
    return { ...s, ...(s.groupCode === undefined && o.groupCode ? { groupCode: o.groupCode } : {}), ...(s.special === undefined && o.special ? { special: o.special } : {}) };
  });
  return { ...doc, rosters: { ...doc.rosters, [division]: students } };
}

export const codeLabel = (s: Pick<Student, 'classNo' | 'seatNo'>): string => studentCode(s.classNo, s.seatNo);
