/**
 * 排座引擎（D24、D49、D72）。純函式，不碰畫面。
 *
 * 座位順序：教室依清單順序；教室內第 1 排深位 1→depth，再第 2 排…，取前 seatCount 個（helpers.classroomSeats）。
 * 硬規則：同班編號沿座位順序嚴格遞增；同一排內各班各自連續、不穿插；空位只在每間教室最後。
 *
 * 兩種策略（待調度員裁示預設值，見 docs/dispatch/完工-B.md）：
 * - rotation（舊座位表驗證吻合者）：班序跨教室延續，每排給輪到的下一班；該班用完就在同一排接下一班。
 * - proportional（D24 原文）：先以最大餘數法決定各教室人數與各班名額，教室內再輪流佔排、名額用完跳過。
 */
import type { Classroom, SeatAssignment, SeatPos } from '../data/types';
import { classroomSeats, parseStudentCode } from '../data/helpers';

export type SeatingStrategy = 'rotation' | 'proportional';

export type SeatGroupResult =
  | { ok: true; assignments: SeatAssignment[] }
  | { ok: false; error: string };

interface ClassQueue {
  classNo: number;
  codes: string[];
}

/** 依班級分組並依座號排序；班級依序號遞增 */
function buildQueues(codes: readonly string[]): ClassQueue[] | string {
  const map = new Map<number, { seatNo: number; code: string }[]>();
  const seen = new Set<string>();
  for (const code of codes) {
    const p = parseStudentCode(code);
    if (!p) return `考生編號格式不正確：${code}`;
    if (seen.has(code)) return `考生編號重複：${code}`;
    seen.add(code);
    const list = map.get(p.classNo) ?? [];
    list.push({ seatNo: p.seatNo, code });
    map.set(p.classNo, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([classNo, list]) => ({
      classNo,
      codes: list.sort((a, b) => a.seatNo - b.seatNo).map((x) => x.code),
    }));
}

/** 一間教室的可用座位，依座位順序；一般由 Classroom 產生，舊座位表驗證可直接給版面 */
export interface SeatLayout {
  id: string;
  seats: readonly SeatPos[];
}

export function layoutOf(room: Classroom): SeatLayout {
  return { id: room.id, seats: classroomSeats(room) };
}

/** 把教室座位依排分組（只含可用座位） */
function seatsByRow(room: SeatLayout): { row: number; depths: number[] }[] {
  const rows: { row: number; depths: number[] }[] = [];
  for (const s of room.seats) {
    const last = rows[rows.length - 1];
    if (last && last.row === s.row) last.depths.push(s.depth);
    else rows.push({ row: s.row, depths: [s.depth] });
  }
  return rows;
}

/** 最大餘數法：把 total 依 weights 比例分成整數，總和恰為 total；同餘數時序號小者優先 */
export function largestRemainder(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left--;
  }
  return out;
}

/**
 * 在一組教室中依輪流規則排座。quota 為 null 時不限名額（rotation）；
 * 否則 quota[r][k] 為第 r 間教室第 k 班可排人數（proportional）。
 */
function fill(
  rooms: readonly SeatLayout[],
  queues: ClassQueue[],
  quota: number[][] | null,
): SeatAssignment[] {
  const out: SeatAssignment[] = [];
  const taken = queues.map(() => 0);
  const n = queues.length;
  let next = 0; // 下一排輪到的班（索引）
  rooms.forEach((room, r) => {
    const used = queues.map(() => 0);
    if (quota) next = 0; // 比例分配：每間教室重新輪
    const avail = (k: number): boolean => {
      const q = queues[k]!;
      if (taken[k]! >= q.codes.length) return false;
      return quota ? used[k]! < quota[r]![k]! : true;
    };
    const findFrom = (start: number): number => {
      for (let i = 0; i < n; i++) {
        const k = (start + i) % n;
        if (avail(k)) return k;
      }
      return -1;
    };
    for (const { row, depths } of seatsByRow(room)) {
      const start = findFrom(next);
      if (start < 0) break;
      next = (start + 1) % n;
      let cur = start;
      for (const depth of depths) {
        if (!avail(cur)) {
          cur = findFrom(cur + 1);
          if (cur < 0) break;
        }
        out.push({ classroomId: room.id, row, depth, code: queues[cur]!.codes[taken[cur]!]! });
        taken[cur]!++;
        used[cur]!++;
      }
    }
  });
  return out;
}

/**
 * 把一組考生排進一組教室（同一組別或國中部全體）。
 * 座位總數不足時擋下（D25），不輸出部分結果。
 */
export function seatGroup(
  classrooms: readonly Classroom[],
  codes: readonly string[],
  strategy: SeatingStrategy,
): SeatGroupResult {
  return seatLayouts(classrooms.map(layoutOf), codes, strategy);
}

/** 同 seatGroup，但直接給座位版面（供舊座位表驗證與測試） */
export function seatLayouts(
  layouts: readonly SeatLayout[],
  codes: readonly string[],
  strategy: SeatingStrategy,
): SeatGroupResult {
  const queues = buildQueues(codes);
  if (typeof queues === 'string') return { ok: false, error: queues };
  const total = codes.length;
  const rooms = layouts.map((l) => ({ ...l, seatCount: l.seats.length }));
  const capacity = rooms.reduce((a, c) => a + c.seatCount, 0);
  if (capacity < total) {
    return { ok: false, error: `座位不足：考生 ${total} 人，座位 ${capacity} 個，還差 ${total - capacity} 個` };
  }
  let quota: number[][] | null = null;
  if (strategy === 'proportional') {
    const perRoom = largestRemainder(total, rooms.map((c) => c.seatCount));
    // 若某間教室分到的人數超過座位數（只可能因進位），把多的移到後面有空的教室
    for (let r = 0; r < rooms.length; r++) {
      const over = perRoom[r]! - rooms[r]!.seatCount;
      if (over > 0) {
        perRoom[r] = rooms[r]!.seatCount;
        let left = over;
        for (let s = 0; s < rooms.length && left > 0; s++) {
          const room = rooms[s]!;
          const space = room.seatCount - perRoom[s]!;
          const add = Math.min(space, left);
          perRoom[s] = perRoom[s]! + add;
          left -= add;
        }
      }
    }
    const remaining = queues.map((q) => q.codes.length);
    let remainingTotal = total;
    quota = perRoom.map((count, r) => {
      const q =
        r === rooms.length - 1 || remainingTotal === 0
          ? [...remaining]
          : largestRemainder(count, remaining);
      q.forEach((x, k) => (remaining[k] = remaining[k]! - x));
      remainingTotal -= count;
      return q;
    });
  }
  const assignments = fill(rooms, queues, quota);
  if (assignments.length !== total) {
    return { ok: false, error: `排座失敗：只排入 ${assignments.length}／${total} 人` };
  }
  return { ok: true, assignments };
}
