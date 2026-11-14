/**
 * 分科方案的後處理（AST-3）：在引擎（planD99）排好之後，套用「鎖定」與「跨次座位沿用」。
 * - 鎖定三種範圍：教室用途、班級考場、單一學生座位（H-09、DESIGN 10.19）。鎖定值重排時不可改；
 *   衝突只回報（時段、教室、座位、學生、違反的規則、原因），不自行解鎖、不偷偷放寬。
 *   座位與班級考場鎖定會真的把人移過去（有人坐就互換）；教室用途鎖定只驗證（引擎沒有「指定教室用途」的輸入），
 *   與鎖定不同就回報衝突。
 * - 跨次沿用排在最後（D99 三-10）：同教室同座位優先、做不到就同教室；只做不增加標籤張數、不改排內順序的調整。
 * 全部純函式、相同輸入得相同結果（T-21）；引擎本身不動。
 */
import type { AstLocks, PrevSeat } from '../../data/types';
import { checkPlan, codeOf, computeMetrics, type ExamPlacement, type PlanInput, type PlanOutput } from './contract';

export interface LockConflict {
  kind: 'seat' | 'room' | 'class';
  slotId: string;
  roomId: string;
  /** 「排-深位」，沒有座位的衝突不填 */
  seat?: string;
  /** 牽涉的學生代號 */
  students: string[];
  /** 違反的規則 */
  rule: string;
  /** 原因（含超出人數等） */
  reason: string;
}

export interface CarrySummary {
  /** 上次座位與這次完全相同的人數 */
  same: number;
  /** 同教室、不同座位 */
  sameRoom: number;
  /** 不同教室 */
  otherRoom: number;
  /** 沒沿用（上次沒有紀錄） */
  none: number;
  /** 沒沿用到的原因（每人一筆） */
  reasons: { code: string; reason: string }[];
}

export interface Refined { out: PlanOutput; conflicts: LockConflict[]; carry?: CarrySummary }

const seatKey = (roomId: string, row: number, depth: number): string => `${roomId}:${row}-${depth}`;
const sk = (e: { roomId: string; row: number; depth: number }): string => seatKey(e.roomId, e.row, e.depth);

/** 換了座位後重算同排混科與方案指標 */
function rebuild(input: PlanInput, base: PlanOutput, exams: ExamPlacement[]): PlanOutput {
  const slotIdx = new Map(input.slots.map((s, i) => [s.id, i]));
  const rows = new Map<string, Set<string>>();
  for (const e of exams) {
    const k = `${e.slotId}|${e.roomId}|${e.row}`;
    rows.set(k, (rows.get(k) ?? new Set()).add(e.subjectId));
  }
  const mixedRows = [...rows.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([k]) => {
      const [slotId, roomId, row] = k.split('|') as [string, string, string];
      return { slotId, roomId, row: Number(row) };
    })
    .sort((a, b) => (slotIdx.get(a.slotId) ?? 0) - (slotIdx.get(b.slotId) ?? 0) || a.roomId.localeCompare(b.roomId) || a.row - b.row);
  const next: PlanOutput = { ...base, exams, mixedRows };
  return { ...next, metrics: computeMetrics(input, next) };
}

/** 套用鎖定與沿用；沒有鎖定也沒有沿用資料就原樣回傳 */
export function refinePlan(input: PlanInput, engineOut: PlanOutput): Refined {
  if (engineOut.infeasible) return { out: engineOut, conflicts: [] };
  const locks = input.locks;
  const hasLocks = !!(locks && ((locks.seats?.length ?? 0) + (locks.classes?.length ?? 0) + (locks.rooms?.length ?? 0) > 0));
  let out = engineOut;
  let conflicts: LockConflict[] = [];
  if (hasLocks) {
    const r = applyLocks(input, out, locks!);
    out = r.out;
    conflicts = r.conflicts;
  }
  if (input.carry && input.carry.length > 0) {
    const c = applyCarry(input, out, locks);
    return { out: c.out, conflicts, carry: c.summary };
  }
  return { out, conflicts };
}

// ───── 鎖定 ─────

function applyLocks(input: PlanInput, start: PlanOutput, locks: AstLocks): { out: PlanOutput; conflicts: LockConflict[] } {
  const conflicts: LockConflict[] = [];
  const room = new Map(input.rooms.map((r) => [r.id, r]));
  const studentOf = new Map(input.students.map((s) => [codeOf(s), s]));
  const seatLocks = (locks.seats ?? []).filter((l) => input.slots.some((s) => s.id === l.slotId));
  const classLocks = locks.classes ?? [];
  const bad = new Set<string>(); // 衝突中、不套用的座位鎖定（slot|code）

  // 1. 同時段同座位兩人、同一人同時段兩個座位：明確報錯，兩邊都不套用、也不自己解鎖（T-17）
  const bySeat = new Map<string, typeof seatLocks>();
  const byWho = new Map<string, typeof seatLocks>();
  for (const l of seatLocks) {
    const a = `${l.slotId}|${sk(l)}`;
    bySeat.set(a, [...(bySeat.get(a) ?? []), l]);
    const b = `${l.slotId}|${l.code}`;
    byWho.set(b, [...(byWho.get(b) ?? []), l]);
  }
  for (const list of bySeat.values()) {
    const who = [...new Set(list.map((l) => l.code))];
    if (who.length > 1) {
      const l = list[0]!;
      conflicts.push({ kind: 'seat', slotId: l.slotId, roomId: l.roomId, seat: `${l.row}-${l.depth}`, students: who, rule: '同一時段同一座位只能坐一個人', reason: `${who.join('、')} 都被鎖定在這個座位。系統不會自行解鎖，請取消其中一筆鎖定。` });
      for (const w of who) bad.add(`${l.slotId}|${w}`);
    }
  }
  for (const list of byWho.values()) {
    const seats = new Set(list.map((l) => sk(l)));
    if (seats.size > 1) {
      const l = list[0]!;
      conflicts.push({ kind: 'seat', slotId: l.slotId, roomId: l.roomId, students: [l.code], rule: '同一人同一時段只能有一個座位', reason: `${l.code} 在這個時段被鎖定了 ${seats.size} 個不同座位。系統不會自行解鎖，請取消多餘的鎖定。` });
      bad.add(`${l.slotId}|${l.code}`);
    }
  }

  // 2. 容量：座位鎖定＋班級鎖定的應考者 > 教室座位數（T-18）；有問題的班級鎖定不套用
  const examSlot = (slotId: string) => start.exams.filter((e) => e.slotId === slotId);
  const demand = new Map<string, { seat: Set<string>; cls: Map<number, string[]> }>();
  for (const l of seatLocks) {
    if (bad.has(`${l.slotId}|${l.code}`)) continue;
    const d = demand.get(`${l.slotId}|${l.roomId}`) ?? { seat: new Set<string>(), cls: new Map<number, string[]>() };
    d.seat.add(l.code);
    demand.set(`${l.slotId}|${l.roomId}`, d);
  }
  for (const l of classLocks) {
    const d = demand.get(`${l.slotId}|${l.roomId}`) ?? { seat: new Set<string>(), cls: new Map<number, string[]>() };
    d.cls.set(l.classNo, examSlot(l.slotId).filter((e) => Number(e.code.slice(0, 2)) === l.classNo).map((e) => e.code));
    demand.set(`${l.slotId}|${l.roomId}`, d);
  }
  for (const [k, d] of demand) {
    if (d.cls.size === 0) continue;
    const [slotId, roomId] = k.split('|') as [string, string];
    const people = new Set<string>(d.seat);
    for (const list of d.cls.values()) for (const c of list) people.add(c);
    const cap = room.get(roomId)?.seats.length ?? 0;
    if (people.size > cap) {
      const cn = [...d.cls.keys()].sort((a, b) => a - b);
      conflicts.push({ kind: 'class', slotId, roomId, students: [...people].sort(), rule: '考場人數不超過可排座位', reason: `教室 ${roomId} 只有 ${cap} 個座位，鎖定了 ${people.size} 人（座位鎖定 ${d.seat.size} 人、班級鎖定 ${cn.map((c) => `${c} 班 ${d.cls.get(c)!.length} 人`).join('、')}），超出 ${people.size - cap} 人。系統不會自行解鎖。` });
    }
  }
  const capBad = new Set(conflicts.filter((c) => c.kind === 'class').map((c) => `${c.slotId}|${c.roomId}`));

  let out = start;
  const baseViolations = new Set(checkPlan(input, start));
  const trial = (exams: ExamPlacement[]): { out: PlanOutput; fresh: string[] } => {
    const cand = rebuild(input, out, exams);
    return { out: cand, fresh: checkPlan(input, cand).filter((x) => !baseViolations.has(x)) };
  };
  const lockedSeat = new Set(seatLocks.filter((l) => !bad.has(`${l.slotId}|${l.code}`)).map((l) => `${l.slotId}|${l.code}`));

  // 3. 班級考場鎖定：把該班應考者移進那間教室的空位（座號小者先、排與深位小者先）
  for (const l of classLocks) {
    if (capBad.has(`${l.slotId}|${l.roomId}`)) continue;
    if (out.usage[l.slotId]?.[l.roomId] !== 'exam') {
      conflicts.push({ kind: 'class', slotId: l.slotId, roomId: l.roomId, students: [], rule: '同一時段同一間教室只能是考場或自習其中一種', reason: `${l.classNo} 班被鎖定在 ${l.roomId} 考試，但這個時段 ${l.roomId} 不是考場；系統不會自行改教室用途或解鎖。` });
      continue;
    }
    const r = room.get(l.roomId);
    const mine = out.exams.filter((e) => e.slotId === l.slotId && Number(e.code.slice(0, 2)) === l.classNo).sort((a, b) => a.code.localeCompare(b.code));
    const away = mine.filter((e) => e.roomId !== l.roomId && !lockedSeat.has(`${l.slotId}|${e.code}`));
    if (!r || away.length === 0) continue;
    const taken = new Set(out.exams.filter((e) => e.slotId === l.slotId && e.roomId === l.roomId).map((e) => `${e.row}-${e.depth}`));
    for (const sl of seatLocks) if (sl.slotId === l.slotId && sl.roomId === l.roomId) taken.add(`${sl.row}-${sl.depth}`);
    const free = [...r.seats].filter((s) => !taken.has(`${s.row}-${s.depth}`)).sort((a, b) => a.row - b.row || a.depth - b.depth);
    if (free.length < away.length) {
      conflicts.push({ kind: 'class', slotId: l.slotId, roomId: l.roomId, students: away.map((e) => e.code), rule: '考場人數不超過可排座位', reason: `${l.roomId} 這個時段只剩 ${free.length} 個空位，${l.classNo} 班還有 ${away.length} 人要移進來，超出 ${away.length - free.length} 人。` });
      continue;
    }
    const moved = new Map(away.map((e, i) => [e.code, free[i]!]));
    const exams = out.exams.map((e) => (e.slotId === l.slotId && moved.has(e.code) ? { ...e, roomId: l.roomId, row: moved.get(e.code)!.row, depth: moved.get(e.code)!.depth } : e));
    const t = trial(exams);
    if (t.fresh.length) conflicts.push({ kind: 'class', slotId: l.slotId, roomId: l.roomId, students: away.map((e) => e.code), rule: '硬性規則（文理組、座位、混科分區…）', reason: `鎖定 ${l.classNo} 班進 ${l.roomId} 會違反：${t.fresh.slice(0, 3).join('；')}。系統不會自行解鎖。` });
    else out = t.out;
  }

  // 4. 座位鎖定：把人換到指定座位（有人坐就互換）
  for (const l of seatLocks) {
    if (bad.has(`${l.slotId}|${l.code}`)) continue;
    const mine = out.exams.find((e) => e.slotId === l.slotId && e.code === l.code);
    const where = `${l.row}-${l.depth}`;
    const fail = (rule: string, reason: string) => conflicts.push({ kind: 'seat', slotId: l.slotId, roomId: l.roomId, seat: where, students: [l.code], rule, reason });
    if (!studentOf.has(l.code)) { fail('鎖定的學生要在考試名單裡', `名單裡找不到 ${l.code}。`); continue; }
    if (!mine) { fail('只有這個時段要考試的人才有座位', `${l.code} 這個時段不考試（自習或不在名單），不能鎖座位。`); continue; }
    const r = room.get(l.roomId);
    if (!r || !r.seats.some((s) => s.row === l.row && s.depth === l.depth)) { fail('必須是實際存在的座位', `${l.roomId} 沒有 ${where} 這個座位（停用或不存在）。`); continue; }
    if (out.usage[l.slotId]?.[l.roomId] !== 'exam') { fail('同一時段同一間教室只能是考場或自習其中一種', `${l.roomId} 這個時段不是考場；系統不會自行改教室用途或解鎖。`); continue; }
    if (mine.roomId === l.roomId && mine.row === l.row && mine.depth === l.depth) continue;
    const occ = out.exams.find((e) => e.slotId === l.slotId && sk(e) === sk(l));
    if (occ && lockedSeat.has(`${l.slotId}|${occ.code}`)) { fail('同一時段同一座位只能坐一個人', `${occ.code} 也被鎖定在這個座位。`); continue; }
    const exams = out.exams.map((e) => {
      if (e === mine) return { ...e, roomId: l.roomId, row: l.row, depth: l.depth };
      if (occ && e === occ) return { ...e, roomId: mine.roomId, row: mine.row, depth: mine.depth };
      return e;
    });
    const t = trial(exams);
    if (t.fresh.length) fail('硬性規則（文理組、座位、混科分區…）', `鎖定 ${l.code} 坐 ${l.roomId} ${where} 會違反：${t.fresh.slice(0, 3).join('；')}。系統不會自行解鎖。`);
    else out = t.out;
  }

  // 5. 教室用途鎖定：只驗證
  for (const l of locks.rooms ?? []) {
    const u = out.usage[l.slotId]?.[l.roomId];
    if (u !== l.use) conflicts.push({ kind: 'room', slotId: l.slotId, roomId: l.roomId, students: [], rule: '教室用途鎖定', reason: `${l.roomId} 被鎖定為${l.use === 'exam' ? '考場' : '自習'}，但目前方案這個時段的用途是${u === 'exam' ? '考場' : u === 'study' ? '自習' : '沒有使用'}。系統不會自行改用途或解鎖。` });
  }
  return { out, conflicts };
}

// ───── 跨次座位沿用 ─────

function applyCarry(input: PlanInput, start: PlanOutput, locks: AstLocks | undefined): { out: PlanOutput; summary: CarrySummary } {
  const prev = new Map((input.carry ?? []).map((p) => [p.code, p]));
  const lockedSeat = new Set((locks?.seats ?? []).map((l) => `${l.slotId}|${l.code}`));
  const room = new Map(input.rooms.map((r) => [r.id, r]));
  const exams = start.exams.map((e) => ({ ...e }));
  const slotIdx = new Map(input.slots.map((s, i) => [s.id, i]));
  const occ = new Map<string, ExamPlacement>(); // slot|座位 → 人
  const uses = new Map<string, number>(); // 座位 → 幾個時段在用（標籤張數＝有人用的座位數）
  for (const e of exams) {
    occ.set(`${e.slotId}|${sk(e)}`, e);
    uses.set(sk(e), (uses.get(sk(e)) ?? 0) + 1);
  }
  let labels = uses.size;
  const moveTo = (e: ExamPlacement, row: number, depth: number): void => {
    occ.delete(`${e.slotId}|${sk(e)}`);
    const o = sk(e);
    uses.set(o, (uses.get(o) ?? 1) - 1);
    if (uses.get(o) === 0) { uses.delete(o); labels--; }
    e.row = row;
    e.depth = depth;
    const n = sk(e);
    if (!uses.has(n)) labels++;
    uses.set(n, (uses.get(n) ?? 0) + 1);
    occ.set(`${e.slotId}|${n}`, e);
  };
  const byCode = new Map<string, ExamPlacement[]>();
  for (const e of exams) byCode.set(e.code, [...(byCode.get(e.code) ?? []), e]);
  const codes = [...byCode.keys()].sort();
  for (const code of codes) {
    const p = prev.get(code);
    if (!p) continue;
    for (const e of [...byCode.get(code)!].sort((a, b) => (slotIdx.get(a.slotId) ?? 0) - (slotIdx.get(b.slotId) ?? 0))) {
      if (e.roomId !== p.roomId || (e.row === p.row && e.depth === p.depth) || lockedSeat.has(`${e.slotId}|${code}`)) continue;
      if (e.row !== p.row) continue; // 換排會動到「一排一班」，不做
      if (!room.get(p.roomId)?.seats.some((s) => s.row === p.row && s.depth === p.depth)) continue;
      if (occ.has(`${e.slotId}|${sk(p)}`)) continue;
      // 不越過同排鄰座（不改排內順序，所以不破壞同班連續與混科分區）
      const sameRow = exams.filter((q) => q.slotId === e.slotId && q.roomId === e.roomId && q.row === e.row && q !== e).sort((a, b) => a.depth - b.depth);
      const before = sameRow.filter((q) => q.depth < e.depth).pop();
      const after = sameRow.find((q) => q.depth > e.depth);
      if (p.depth <= (before?.depth ?? 0) || p.depth >= (after?.depth ?? Infinity)) continue;
      const was = labels;
      const oldRow = e.row;
      const oldDepth = e.depth;
      moveTo(e, p.row, p.depth);
      if (labels > was) moveTo(e, oldRow, oldDepth); // 標籤張數優先，不能因沿用多印標籤
    }
  }
  let candidate = rebuild(input, start, exams);
  if (checkPlan(input, candidate).length > checkPlan(input, start).length) candidate = start; // 保險：不得破壞硬性規則
  const s: CarrySummary = { same: 0, sameRoom: 0, otherRoom: 0, none: 0, reasons: [] };
  const finalBy = new Map<string, ExamPlacement[]>();
  for (const e of candidate.exams) finalBy.set(e.code, [...(finalBy.get(e.code) ?? []), e]);
  for (const code of codes) {
    const p = prev.get(code);
    const list = finalBy.get(code) ?? [];
    if (!p) { s.none++; s.reasons.push({ code, reason: '上次沒有座位紀錄' }); continue; }
    if (list.some((e) => e.roomId === p.roomId && e.row === p.row && e.depth === p.depth)) s.same++;
    else if (list.some((e) => e.roomId === p.roomId)) {
      s.sameRoom++;
      s.reasons.push({ code, reason: lockedSeat.size && list.some((e) => lockedSeat.has(`${e.slotId}|${code}`)) ? '座位被鎖定' : '上次的座位這次被別人坐，或換過去會改變排內順序、多印標籤' });
    } else {
      s.otherRoom++;
      s.reasons.push({ code, reason: `上次在 ${p.roomId}，這次沒有安排在同一間教室（教室用途由引擎決定，沿用排在最後）` });
    }
  }
  return { out: candidate, summary: s };
}

/** 由一份方案取出「每個人的座位」（沿用的來源：每人取最早時段的座位；同一人換過座位時以最常坐的為準） */
export function seatsOfPlan(out: PlanOutput, slotOrder: readonly string[]): PrevSeat[] {
  const idx = new Map(slotOrder.map((s, i) => [s, i]));
  const per = new Map<string, Map<string, { n: number; first: number; seat: PrevSeat }>>();
  for (const e of out.exams) {
    const m = per.get(e.code) ?? new Map<string, { n: number; first: number; seat: PrevSeat }>();
    const k = sk(e);
    const cur = m.get(k);
    const at = idx.get(e.slotId) ?? 0;
    m.set(k, cur ? { ...cur, n: cur.n + 1, first: Math.min(cur.first, at) } : { n: 1, first: at, seat: { code: e.code, roomId: e.roomId, row: e.row, depth: e.depth } });
    per.set(e.code, m);
  }
  return [...per.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, m]) => [...m.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0]!.seat);
}
