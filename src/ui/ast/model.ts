/**
 * 分科（D99）畫面的純邏輯：從 Doc 組出規劃輸入、跑引擎（planD99）、整理成 ③④⑤ 要顯示的資料。
 * 引擎契約在 src/core/astD99/contract.ts，這裡只讀、不改契約。全部純函式，可單元測試。
 * - 時段：依共用設定「節次與時長」的分科節次表；每節一個 slot（id＝`p<節次>`），同節的科目放同一 slot。
 * - 考生：本次考試名單（examEntries 去掉全缺考者）；文理組以考生自己的為準，沒有就看班級（D93）。
 * - 教室：沿用步驟③ 勾選（ExamConfig.classroomIds），預備教室＝綜合教室（D99）。
 * - 排座模式、允許他班原班自習、已核可的替代方案存在 ExamConfig（astMode／astAllowOtherStudy／astApprovals）。
 */
import type { Classroom, ExamConfig, Track } from '../../data';
import { classroomSeats, studyCapacityOf } from '../../data';
import { dayName, slotName, examSubjectPeriods } from '../../core/periods';
import { planD99 } from '../../core/astD99/engine';
import { checkPlan, codeOf, homeRoomIds, type PlanInput, type PlanMode, type PlanOutput, type PlanRoom, type PlanSlot, type PlanStudent, type Proposal } from '../../core/astD99/contract';
import { toPlanRooms } from '../../core/astD99/rooms';
import { examRooms, seatableEntries } from '../seating';
import type { Doc } from '../store';

export const MODE_LABEL: Record<PlanMode, string> = { 'fewest-rooms': '少教室優先', 'least-movement': '少移動優先' };
export const astModeOf = (exam: ExamConfig): PlanMode => exam.astMode ?? 'fewest-rooms';

export interface AstSlot extends PlanSlot {
  /** 0 起的天別、當天第幾個時段（1 起） */
  day: number;
  slot: number;
  /** 「第一天 時段一」 */
  label: string;
  /** 科目名稱（同節多科以「、」連接） */
  subjectLabel: string;
}

/** 本次考試的時段（依節次排序）。節次表沒有的科目排在最後各自一節（與 subjectPeriods 一致） */
export function astSlots(doc: Doc, exam: ExamConfig): AstSlot[] {
  const map = examSubjectPeriods(exam, doc.settings);
  const byPeriod = new Map<number, { day?: number; slot?: number; ids: string[] }>();
  for (const [id, list] of map) {
    for (const x of list) {
      const cur = byPeriod.get(x.period) ?? { ids: [] };
      cur.ids.push(id);
      if (x.day !== undefined) cur.day = x.day;
      if (x.slot !== undefined) cur.slot = x.slot;
      byPeriod.set(x.period, cur);
    }
  }
  const name = new Map(exam.subjects.map((s) => [s.id, s.name]));
  return [...byPeriod.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([period, v]) => ({
      id: `p${period}`,
      subjectIds: v.ids,
      day: v.day ?? 0,
      slot: v.slot ?? period,
      label: v.day === undefined ? `時段${period}` : `${dayName(v.day)} ${slotName(v.slot ?? 1)}`,
      subjectLabel: v.ids.map((i) => name.get(i) ?? i).join('、'),
    }));
}

/** 規劃用的考生：各節考的科目（slotId → subjectId）、文理組（考生自己的，沒有就看班級） */
export function astStudents(doc: Doc, exam: ExamConfig, slots: readonly AstSlot[]): PlanStudent[] {
  const slotOf = new Map<string, string>();
  for (const s of slots) for (const id of s.subjectIds) slotOf.set(id, s.id);
  const classTrack = new Map(doc.settings.classes.filter((c) => c.division === exam.division).map((c) => [c.no, c.track]));
  return seatableEntries(doc, exam).map((e) => {
    const takes: Record<string, string> = {};
    for (const id of e.subjectIds) {
      const sid = slotOf.get(id);
      if (sid) takes[sid] = id;
    }
    const track: Track | undefined = e.track ?? classTrack.get(e.classNo);
    return { classNo: e.classNo, seatNo: e.seatNo, name: e.name, takes, ...(track ? { track } : {}) };
  });
}

export function astRooms(doc: Doc, exam: ExamConfig): PlanRoom[] {
  return toPlanRooms(doc.settings.classrooms, exam.classroomIds, doc.settings.classes.filter((c) => c.division === exam.division));
}

export function astInput(doc: Doc, exam: ExamConfig, mode: PlanMode = astModeOf(exam)): PlanInput {
  const slots = astSlots(doc, exam);
  return {
    mode,
    rooms: astRooms(doc, exam),
    slots: slots.map((s) => ({ id: s.id, subjectIds: s.subjectIds })),
    students: astStudents(doc, exam, slots),
    ...(exam.astAllowOtherStudy ? { allowOtherClassStudy: true } : {}),
    ...(exam.astApprovals?.length ? { approvals: exam.astApprovals } : {}),
  };
}

export interface AstPlan {
  input: PlanInput;
  out: PlanOutput;
  /** 硬性限制不通過的說明（空＝通過） */
  errors: string[];
  pending: Proposal[];
  approved: Proposal[];
  unplaced: number;
  /** 引擎排不出方案（例如某時段考生比座位多）：out 是空的，畫面請使用者先回 ③ */
  infeasible?: boolean;
}

const cache = new Map<string, AstPlan>();

/** 跑引擎（同一份輸入只算一次）；沒有考生或沒有教室時回 undefined */
export function runAstPlan(input: PlanInput): AstPlan | undefined {
  if (input.students.length === 0 || input.rooms.length === 0 || input.slots.length === 0) return undefined;
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;
  let out: PlanOutput;
  try {
    out = planD99(input);
  } catch {
    // 座位比考生少等無解情況：引擎沒有可選的方案；畫面改請使用者先回 ③ 補座位（回報調度員：引擎對無解輸入應回報而不是丟例外）
    const empty: AstPlan = { input, out: { usage: {}, exams: [], study: [], mixedRows: [], proposals: [] }, errors: ['座位不夠，排不出方案'], pending: [], approved: [], unplaced: 0, infeasible: true };
    cache.set(key, empty);
    return empty;
  }
  const plan: AstPlan = {
    input,
    out,
    errors: checkPlan(input, out),
    pending: out.proposals.filter((p) => p.status === 'pending'),
    approved: out.proposals.filter((p) => p.status === 'approved'),
    unplaced: out.unplaced?.length ?? 0,
  };
  if (cache.size > 24) cache.clear();
  cache.set(key, plan);
  return plan;
}

export const astPlan = (doc: Doc, exam: ExamConfig, mode: PlanMode = astModeOf(exam)): AstPlan | undefined => runAstPlan(astInput(doc, exam, mode));

// ───── ③ 狀態檢核 ─────

export interface AstCapacity {
  /** 理組／文組考場座位（班級教室依組別）與最多一個時段的考生數 */
  science: { seats: number; need: number };
  liberal: { seats: number; need: number };
  /** 綜合教室：已勾幾間、共幾間、自習容量合計、最多一個時段的自習人數 */
  study: { on: number; total: number; capacity: number; need: number; slotsShort: number };
  hasList: boolean;
}

export function astCapacity(doc: Doc, exam: ExamConfig, plan: AstPlan | undefined = astPlan(doc, exam)): AstCapacity {
  const slots = astSlots(doc, exam);
  const students = astStudents(doc, exam, slots);
  const rooms = examRooms(doc, exam);
  const classRooms = rooms.filter((r) => r.kind === 'class');
  const trackOf = (r: Classroom): Track | undefined => r.track ?? doc.settings.classes.find((c) => c.name === r.name && c.division === exam.division)?.track;
  const seatsOf = (t: Track) => classRooms.filter((r) => trackOf(r) === t).reduce((n, r) => n + classroomSeats(r).length, 0);
  const need = (t: Track) => slots.reduce((m, s) => Math.max(m, students.filter((x) => x.track === t && x.takes[s.id]).length), 0);
  const reservesAll = doc.settings.classrooms.filter((r) => r.kind === 'reserve' && (r.division ?? 'senior') === 'senior');
  const reserveOn = rooms.filter((r) => r.kind === 'reserve');
  const reserveIds = new Set(reserveOn.map((r) => r.id));
  let needStudy = 0;
  let slotsShort = 0;
  if (plan) {
    for (const s of slots) {
      const n = plan.out.study.filter((p) => p.slotId === s.id && reserveIds.has(p.roomId)).length + (plan.out.unplaced?.filter((u) => u.slotId === s.id).length ?? 0);
      needStudy = Math.max(needStudy, n);
      if (plan.pending.some((p) => p.slotId === s.id) || plan.out.unplaced?.some((u) => u.slotId === s.id)) slotsShort++;
    }
  }
  return {
    science: { seats: seatsOf('science'), need: need('science') },
    liberal: { seats: seatsOf('liberal'), need: need('liberal') },
    study: { on: reserveOn.length, total: reservesAll.length, capacity: reserveOn.reduce((n, r) => n + studyCapacityOf(r), 0), need: needStudy, slotsShort },
    hasList: students.length > 0,
  };
}

// ───── ⑤ 教室用途表 ─────

export type CellKind = 'exam' | 'study' | 'borrow' | 'pending' | 'home' | 'none';
export interface UsageCell { kind: CellKind; count: number; subjectLabel?: string }

/** 一間教室在一個時段的用途；原班沒被徵用＝home（同學留在原班）。borrow＝原班教室被借來給抽離者自習 */
export function usageCell(plan: AstPlan, slot: AstSlot, room: PlanRoom): UsageCell {
  const u = plan.out.usage[slot.id]?.[room.id];
  if (u === 'exam') return { kind: 'exam', count: plan.out.exams.filter((e) => e.slotId === slot.id && e.roomId === room.id).length, subjectLabel: slot.subjectLabel };
  if (u === 'study') {
    const here = plan.out.study.filter((e) => e.slotId === slot.id && e.roomId === room.id);
    // 原班教室裡只有自己班的人在自習＝同學留在原班（沒被徵用），不算借用；有別班的人來自習才是借用（需核可，或已允許他班原班自習）
    if (room.kind === 'class' && here.every((e) => Number(e.code.slice(0, 2)) === room.classNo)) return { kind: 'home', count: 0 };
    return { kind: room.kind === 'class' ? 'borrow' : 'study', count: here.length };
  }
  const pend = plan.pending.find((p) => p.slotId === slot.id && p.roomId === room.id);
  if (pend) return { kind: 'pending', count: pend.count ?? 0 };
  return { kind: room.kind === 'class' ? 'home' : 'none', count: 0 };
}

/** 這個時段誰在哪間教室：來源班級人數（例 { 1: 20, 2: 5 }） */
export function slotRoster(plan: AstPlan, slotId: string): { exam: Map<string, Map<number, number>>; study: Map<string, Map<number, number>> } {
  const exam = new Map<string, Map<number, number>>();
  const study = new Map<string, Map<number, number>>();
  const add = (m: Map<string, Map<number, number>>, room: string, code: string) => {
    const cls = Number(code.slice(0, 2));
    const per = m.get(room) ?? new Map<number, number>();
    per.set(cls, (per.get(cls) ?? 0) + 1);
    m.set(room, per);
  };
  for (const e of plan.out.exams) if (e.slotId === slotId) add(exam, e.roomId, e.code);
  for (const s of awayStudy(plan, slotId)) add(study, s.roomId, s.code);
  return { exam, study };
}

/** 這個時段離開原班去自習的人（留在自己班教室自習的不算）；自習地點＝綜合教室或借用的他班原班教室 */
export function awayStudy(plan: AstPlan, slotId: string): { code: string; roomId: string }[] {
  const home = homeRoomIds(plan.input.rooms);
  return plan.out.study.filter((s) => s.slotId === slotId && home.get(Number(s.code.slice(0, 2))) !== s.roomId);
}

export { codeOf, homeRoomIds };

// ───── 存回 ExamConfig ─────

export const withApproval = (exam: ExamConfig, slotId: string, roomId: string): { slotId: string; roomId: string }[] =>
  [...(exam.astApprovals ?? []).filter((a) => !(a.slotId === slotId && a.roomId === roomId)), { slotId, roomId }];
export const withoutApproval = (exam: ExamConfig, slotId: string, roomId?: string): { slotId: string; roomId: string }[] =>
  (exam.astApprovals ?? []).filter((a) => !(a.slotId === slotId && (roomId === undefined || a.roomId === roomId)));
