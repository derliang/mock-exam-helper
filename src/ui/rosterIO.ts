/** 學生名單的 Excel 範本／匯出／匯入合併（純函式，可單元測試；不碰 DOM） */
import type { Division, Student } from '../data';
import { studentCode } from '../data';
import type { Doc } from './store';
import { addClass, sortRoster } from './store';

export const TEMPLATE_HEADER = ['班級', '座號', '姓名', '學號（選填）'];

/** 範本：只有表頭；考生編號自動產生，高中部的組別來自考試名單，不用填（DESIGN 10.3） */
export const templateRows = (): string[][] => [TEMPLATE_HEADER];

export function exportRows(students: readonly Student[]): string[][] {
  return [TEMPLATE_HEADER, ...sortRoster([...students]).map((s) => [String(s.classNo).padStart(2, '0'), String(s.seatNo), s.name, s.schoolId ?? ''])];
}

export interface ImportPlan {
  /** 會寫入的名單 */
  students: Student[];
  /** 班級資料裡沒有的班級序號（D83：匯入時可選「新增這些班級」或「略過這些學生」） */
  unknownClasses: number[];
  /** 各未知班級在名單裡的人數 */
  unknownCounts: Record<number, number>;
  /** 與目前名單相比 */
  before: number;
  after: number;
}

export function planImport(doc: Doc, division: Division, students: readonly Student[]): ImportPlan {
  const known = new Set(doc.settings.classes.filter((c) => c.division === division).map((c) => c.no));
  const unknown = [...new Set(students.filter((s) => !known.has(s.classNo)).map((s) => s.classNo))].sort((a, b) => a - b);
  const list = sortRoster([...students]);
  const unknownCounts: Record<number, number> = {};
  for (const s of list) if (!known.has(s.classNo)) unknownCounts[s.classNo] = (unknownCounts[s.classNo] ?? 0) + 1;
  return { students: list, unknownClasses: unknown, unknownCounts, before: doc.rosters[division].length, after: list.length };
}

/** 未知班級的處理方式（D83）：add＝新增這些班級；skip＝略過這些班的學生（他們無法排座）；預設 skip，不默默新增 */
export type UnknownClassAction = 'add' | 'skip';

/** 無法新增（序號超出 1～99）的班級，只能略過 */
const addable = (no: number): boolean => Number.isInteger(no) && no >= 1 && no <= 99;

/** 套用匯入：取代該部別整份名單（匯入的是「整年一份」名單，D35/D62）；學號不合法者忽略 */
export function applyImport(doc: Doc, division: Division, plan: ImportPlan, unknown: UnknownClassAction = 'skip'): Doc {
  let base = doc;
  const unknownSet = new Set(plan.unknownClasses);
  let kept = plan.students;
  if (unknownSet.size > 0) {
    const added = new Set<number>();
    if (unknown === 'add') {
      for (const no of plan.unknownClasses) {
        if (!addable(no)) continue;
        const r = addClass(base, division, { no });
        if (r.ok) { base = r.doc; added.add(no); }
      }
    }
    kept = plan.students.filter((s) => !unknownSet.has(s.classNo) || added.has(s.classNo));
  }
  doc = base;
  plan = { ...plan, students: kept };
  // 範本沒有組別與特殊生需求欄：同班同座號的舊紀錄沿用，避免匯入後被清空
  const old = new Map(doc.rosters[division].map((s) => [`${s.classNo}-${s.seatNo}`, s]));
  const students = plan.students.map((s) => {
    const o = old.get(`${s.classNo}-${s.seatNo}`);
    if (!o || o.name !== s.name) return s;
    return { ...s, ...(s.groupCode === undefined && o.groupCode ? { groupCode: o.groupCode } : {}), ...(s.special === undefined && o.special ? { special: o.special } : {}) };
  });
  return { ...doc, rosters: { ...doc.rosters, [division]: students } };
}

/** 依「新增班級／略過」的最終選擇，算出實際會寫入的人數（#71）：與 applyImport 同一套邏輯，不另行估算 */
export function importOutcome(doc: Doc, division: Division, plan: ImportPlan, unknown: UnknownClassAction): { count: number; skipped: number } {
  const count = applyImport(doc, division, plan, unknown).rosters[division].length;
  return { count, skipped: plan.after - count };
}

export const codeLabel = (s: Pick<Student, 'classNo' | 'seatNo'>): string => studentCode(s.classNo, s.seatNo);
