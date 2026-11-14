/**
 * 分科座位新模型（D99）的規劃介面與驗證器。
 * 這裡定「輸入／輸出長什麼樣」與「輸出合不合規則」；引擎在 engine.ts（planD99），d99.test.ts 驗收。
 * 全部假資料；不碰學測、會考。規格出處：docs/decisions.md D99、docs/ast-spec.md。
 * 欄位擴充原則（docs/ast-spec-gap-2026-11-13.md G-30）：只加選填欄位；請假、鎖定、公告狀態留給 AST-3。
 */
import type { SeatPos, Track } from '../../data/types';

export type PlanMode = 'fewest-rooms' | 'least-movement';

export interface PlanRoom {
  id: string;
  /** class＝原班教室（classNo 為所屬班）、reserve＝綜合（預備）教室 */
  kind: 'class' | 'reserve';
  classNo?: number;
  /** 實際可用座位（可不規則、可缺位） */
  seats: readonly SeatPos[];
  /** 自習容量；D99 預設等於座位數，不得自行調大 */
  studyCapacity: number;
  /** 班級教室的文理組（使用者裁決 R1：看考生組別）；有設且考生也有設時，只排同組考生考試。綜合教室不設 */
  track?: Track;
}

export interface PlanStudent {
  classNo: number;
  seatNo: number;
  name: string;
  /** 各節考的科目 id（slotId → subjectId）；沒寫＝該節不考 */
  takes: Readonly<Record<string, string>>;
  /** 考生自己的文理組（D93，依報名組別）；沒設＝不限教室文理組 */
  track?: Track;
}

export interface PlanSlot {
  id: string;
  /** 本節同時進行的科目 id */
  subjectIds: readonly string[];
}

export interface PlanInput {
  mode: PlanMode;
  rooms: readonly PlanRoom[];
  slots: readonly PlanSlot[];
  students: readonly PlanStudent[];
  /** 管理者是否允許自習者去其他未徵用的原班教室（預設 false） */
  allowOtherClassStudy?: boolean;
  /** 管理者已核可的替代方案（某時段改用某班原班教室給抽離者自習）；只有列在這裡的才生效 */
  approvals?: readonly { slotId: string; roomId: string }[];
}

export interface ExamPlacement { slotId: string; code: string; subjectId: string; roomId: string; row: number; depth: number }
export interface StudyPlacement { slotId: string; code: string; roomId: string }
export interface Proposal {
  kind: 'use-class-room';
  slotId: string;
  roomId: string;
  status: 'pending' | 'approved';
  reason: string;
  /** 這個方案能安置的自習人數 */
  count?: number;
  /** 核可後教室總數是否 +1 */
  addsRoom?: boolean;
}

/** 方案指標（DESIGN 10.14 指標定義、D103 補三項）；computeMetrics 由輸出計算，供 ④ 方案比較 */
export interface PlanMetrics {
  /** 用到的教室總數：有考試或接收抽離自習的教室，全部時段去重（留在原班自習不算） */
  roomsTotal: number;
  /** D103：考場教室數（有考試的教室，去重） */
  examRooms: number;
  /** D103：自習教室數（接收抽離自習的教室，去重；留在原班自習不算） */
  studyRooms: number;
  /** 被抽離的原班非應考者人次（原班被徵用為考場而離開的不考者） */
  displaced: number;
  /** 離開原班人次：當時段不在自己班教室的人（應考者、自習者各算 1） */
  leaveHome: number;
  /** 跨節換教室次數：每人相鄰兩個時段所在教室不同的次數加總 */
  roomChanges: number;
  /** 各考場人數最大落差：同時段同科用兩間以上考場時，人數最多與最少的差，取最大 */
  balanceGap: number;
  /** 混科考場（時段×教室）數 */
  mixedRooms: number;
  /** 同排混科排數 */
  mixedRows: number;
  /** 標籤張數（用到的座位數，一座位一張） */
  labels: number;
  /** 同一座位最多幾人用過 */
  maxSeatUsers: number;
  /** 發卷區段數：每間考場每時段的科目分段數加總（單科＝1） */
  dispatchSegments: number;
  /** D103：跨科換座位次數：每人相鄰兩次考試座位不同的次數加總 */
  seatChanges: number;
  /** D103：需跨教室學生數：至少一個時段不在自己班教室的人數 */
  crossRoomStudents: number;
  /** 自習地點不穩定：每人自習過的教室數減 1 的加總 */
  studyMoves: number;
}

export interface PlanOutput {
  /** slotId → roomId → 當節用途 */
  usage: Readonly<Record<string, Readonly<Record<string, 'exam' | 'study'>>>>;
  exams: readonly ExamPlacement[];
  /** 自習只有教室、沒有座位 */
  study: readonly StudyPlacement[];
  /** 同排混科的排（要在輸出標警示） */
  mixedRows: readonly { slotId: string; roomId: string; row: number }[];
  /** 需管理者核可的替代方案；未核可不得生效 */
  proposals: readonly Proposal[];
  /** 排不進去（自習容量不足且替代方案未核可）的人；有人在這裡＝方案不能輸出 */
  unplaced?: readonly { slotId: string; code: string }[];
  /** 方案指標（引擎輸出時一併附上） */
  metrics?: PlanMetrics;
  /** 無解（例如某時段考生比可用座位多）：其他欄位皆空，請使用者先補座位 */
  infeasible?: boolean;
}

export type Planner = (input: PlanInput) => PlanOutput;

export const codeOf = (s: { classNo: number; seatNo: number }): string =>
  `${String(s.classNo).padStart(2, '0')}${String(s.seatNo).padStart(2, '0')}`;

const key = (p: { roomId: string; row: number; depth: number }): string => `${p.roomId}:${p.row}-${p.depth}`;

/** 全量硬性檢查（規格 13.1）；回傳違規說明，空陣列＝合規 */
export function checkPlan(input: PlanInput, out: PlanOutput): string[] {
  const v: string[] = [];
  const room = new Map(input.rooms.map((r) => [r.id, r]));
  const seatSet = new Map(input.rooms.map((r) => [r.id, new Set(r.seats.map((s) => `${s.row}-${s.depth}`))]));
  const byCode = new Map(input.students.map((s) => [codeOf(s), s]));
  const approved = new Set((input.approvals ?? []).map((a) => `${a.slotId}|${a.roomId}`));
  for (const slot of input.slots) {
    const usage = out.usage[slot.id] ?? {};
    const exams = out.exams.filter((e) => e.slotId === slot.id);
    const study = out.study.filter((e) => e.slotId === slot.id);
    // H-02／H-05：每人每節只出現一次（考試或自習擇一）
    const seen = new Set<string>();
    for (const c of [...exams.map((e) => e.code), ...study.map((s) => s.code)]) {
      if (seen.has(c)) v.push(`${slot.id}：${c} 同節重複安排`);
      seen.add(c);
    }
    // H-05：同節座位不重複
    const used = new Set<string>();
    for (const e of exams) {
      if (used.has(key(e))) v.push(`${slot.id}：座位 ${key(e)} 重複`);
      used.add(key(e));
      // H-04：必須是實際存在的座位
      if (!seatSet.get(e.roomId)?.has(`${e.row}-${e.depth}`)) v.push(`${slot.id}：${key(e)} 不是可用座位`);
      // H-07：考場須標記為 exam
      if (usage[e.roomId] !== 'exam') v.push(`${slot.id}：${e.roomId} 有人考試但用途不是考場`);
    }
    for (const s of study) {
      if (!room.has(s.roomId)) v.push(`${slot.id}：自習教室 ${s.roomId} 不存在`);
      // H-07：同節同教室不可考試又自習
      if (usage[s.roomId] !== 'study') v.push(`${slot.id}：${s.roomId} 有人自習但用途不是自習（考試／自習混用）`);
    }
    // S-03／D99 一-2：自習者進他班原班教室，必須管理者開啟或已核可該時段的替代方案
    for (const s of study) {
      const r = room.get(s.roomId);
      const st = byCode.get(s.code);
      if (r?.kind === 'class' && st && r.classNo !== st.classNo && !input.allowOtherClassStudy && !approved.has(`${slot.id}|${s.roomId}`)) {
        v.push(`${slot.id}：${s.code} 未經許可去他班原班教室 ${s.roomId} 自習`);
      }
    }
    // 使用者裁決 R1：教室文理組看考生組別（兩邊都有設才檢查）
    for (const e of exams) {
      const r = room.get(e.roomId);
      const st = byCode.get(e.code);
      if (r?.track && st?.track && r.track !== st.track) v.push(`${slot.id}：${e.code} 的組別與考場 ${e.roomId} 的文理組不符`);
    }
    // H-08／§13.1 第 8 條：同排混科要如實標出，且同排只准連續分區、不准逐位交錯
    const rowSubs = new Map<string, { depth: number; sub: string }[]>();
    for (const e of exams) {
      const k = `${e.roomId}|${e.row}`;
      rowSubs.set(k, [...(rowSubs.get(k) ?? []), { depth: e.depth, sub: e.subjectId }]);
    }
    const reported = new Set(out.mixedRows.filter((m) => m.slotId === slot.id).map((m) => `${m.roomId}|${m.row}`));
    for (const [k, list] of rowSubs) {
      const seq = list.sort((a, b) => a.depth - b.depth).map((x) => x.sub);
      const runs = seq.filter((c, i) => i === 0 || seq[i - 1] !== c);
      const mixed = new Set(seq).size > 1;
      if (mixed && !reported.has(k)) v.push(`${slot.id}：${k} 同排混科卻沒有標出`);
      if (!mixed && reported.has(k)) v.push(`${slot.id}：${k} 沒有混科卻標成混科`);
      if (new Set(runs).size !== runs.length) v.push(`${slot.id}：${k} 同排混科逐位交錯（只准連續分區）`);
      reported.delete(k);
    }
    for (const k of reported) v.push(`${slot.id}：${k} 標成混科但這排沒有人考試`);
    // H-06：自習容量
    const count = new Map<string, number>();
    for (const s of study) count.set(s.roomId, (count.get(s.roomId) ?? 0) + 1);
    for (const [id, n] of count) if (n > (room.get(id)?.studyCapacity ?? 0)) v.push(`${slot.id}：${id} 自習 ${n} 人超過容量`);
    // 每筆選考恰好一個座位、其他人都有自習教室（13.1）
    for (const st of input.students) {
      const c = codeOf(st);
      const sub = st.takes[slot.id];
      const e = exams.filter((x) => x.code === c);
      if (sub) {
        if (e.length !== 1) v.push(`${slot.id}：${c} 選考 ${sub} 應有 1 個座位，實際 ${e.length}`);
        else if (e[0]!.subjectId !== sub) v.push(`${slot.id}：${c} 科目不符`);
      } else if (e.length || study.filter((x) => x.code === c).length !== 1) v.push(`${slot.id}：${c} 不考卻沒有恰好 1 間自習教室`);
    }
  }
  return v;
}

/** 整合標籤：同一座位跨節的所有考生（規格 8.1）；一座位一張 */
export function labelsOf(out: PlanOutput): Map<string, { slotId: string; code: string; subjectId: string }[]> {
  const m = new Map<string, { slotId: string; code: string; subjectId: string }[]>();
  for (const e of out.exams) {
    const k = key(e);
    m.set(k, [...(m.get(k) ?? []), { slotId: e.slotId, code: e.code, subjectId: e.subjectId }]);
  }
  return m;
}

/** 某班的原班教室（第一間 kind＝class 且 classNo 相同）；沒有就 undefined */
export function homeRoomIds(rooms: readonly PlanRoom[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of rooms) if (r.kind === 'class' && r.classNo !== undefined && !m.has(r.classNo)) m.set(r.classNo, r.id);
  return m;
}

/** 由方案輸出計算 ④ 方案比較的指標（定義見 PlanMetrics 各欄註解；DESIGN 10.14、D103） */
export function computeMetrics(input: PlanInput, out: PlanOutput): PlanMetrics {
  const home = homeRoomIds(input.rooms);
  const classOf = new Map(input.students.map((s) => [codeOf(s), s.classNo]));
  const slotIdx = new Map(input.slots.map((s, i) => [s.id, i]));
  const examRooms = new Set<string>();
  const studyRooms = new Set<string>();
  const examBySlot = new Map<string, Set<string>>();
  for (const e of out.exams) {
    examRooms.add(e.roomId);
    examBySlot.set(e.slotId, (examBySlot.get(e.slotId) ?? new Set()).add(e.roomId));
  }
  let displaced = 0;
  let leaveHome = 0;
  const loc = new Map<string, (string | undefined)[]>();
  const setLoc = (code: string, slotId: string, roomId: string): void => {
    const arr = loc.get(code) ?? Array<string | undefined>(input.slots.length).fill(undefined);
    arr[slotIdx.get(slotId) ?? 0] = roomId;
    loc.set(code, arr);
  };
  const studySets = new Map<string, Set<string>>();
  for (const s of out.study) {
    const h = home.get(classOf.get(s.code) ?? -1);
    if (h !== s.roomId) {
      studyRooms.add(s.roomId);
      leaveHome++;
    }
    if (h !== undefined && examBySlot.get(s.slotId)?.has(h)) displaced++;
    setLoc(s.code, s.slotId, s.roomId);
    studySets.set(s.code, (studySets.get(s.code) ?? new Set()).add(s.roomId));
  }
  for (const e of out.exams) {
    if (home.get(classOf.get(e.code) ?? -1) !== e.roomId) leaveHome++;
    setLoc(e.code, e.slotId, e.roomId);
  }
  let roomChanges = 0;
  let crossRoomStudents = 0;
  for (const [code, arr] of loc) {
    const h = home.get(classOf.get(code) ?? -1);
    let prev: string | undefined;
    for (const r of arr) {
      if (r === undefined) continue;
      if (prev !== undefined && prev !== r) roomChanges++;
      prev = r;
    }
    if (arr.some((r) => r !== undefined && r !== h)) crossRoomStudents++;
  }
  // 各考場人數落差、混科、發卷區段
  const perRoomSub = new Map<string, Map<string, number>>(); // slot|subject → room → n
  const perRoomSeq = new Map<string, ExamPlacement[]>(); // slot|room → 考生
  for (const e of out.exams) {
    const k = `${e.slotId}|${e.subjectId}`;
    const m = perRoomSub.get(k) ?? new Map<string, number>();
    m.set(e.roomId, (m.get(e.roomId) ?? 0) + 1);
    perRoomSub.set(k, m);
    const k2 = `${e.slotId}|${e.roomId}`;
    perRoomSeq.set(k2, [...(perRoomSeq.get(k2) ?? []), e]);
  }
  let balanceGap = 0;
  for (const m of perRoomSub.values()) {
    if (m.size < 2) continue;
    const ns = [...m.values()];
    balanceGap = Math.max(balanceGap, Math.max(...ns) - Math.min(...ns));
  }
  let mixedRooms = 0;
  let dispatchSegments = 0;
  for (const list of perRoomSeq.values()) {
    const seq = [...list].sort((a, b) => a.row - b.row || a.depth - b.depth).map((e) => e.subjectId);
    if (new Set(seq).size > 1) mixedRooms++;
    dispatchSegments += seq.filter((c, i) => i === 0 || seq[i - 1] !== c).length;
  }
  const labels = labelsOf(out);
  let maxSeatUsers = 0;
  for (const l of labels.values()) maxSeatUsers = Math.max(maxSeatUsers, new Set(l.map((x) => x.code)).size);
  let seatChanges = 0;
  const examsOf = new Map<string, ExamPlacement[]>();
  for (const e of out.exams) examsOf.set(e.code, [...(examsOf.get(e.code) ?? []), e]);
  for (const list of examsOf.values()) {
    const sorted = [...list].sort((a, b) => (slotIdx.get(a.slotId) ?? 0) - (slotIdx.get(b.slotId) ?? 0));
    for (let i = 1; i < sorted.length; i++) if (key(sorted[i]!) !== key(sorted[i - 1]!)) seatChanges++;
  }
  let studyMoves = 0;
  for (const s of studySets.values()) studyMoves += s.size - 1;
  return {
    roomsTotal: new Set([...examRooms, ...studyRooms]).size,
    examRooms: examRooms.size,
    studyRooms: studyRooms.size,
    displaced,
    leaveHome,
    roomChanges,
    balanceGap,
    mixedRooms,
    mixedRows: out.mixedRows.length,
    labels: labels.size,
    maxSeatUsers,
    dispatchSegments,
    seatChanges,
    crossRoomStudents,
    studyMoves,
  };
}
