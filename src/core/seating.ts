/**
 * 排座引擎（D73 全域輪流，取代 D24 原文的比例分配；座標 D49、空位 D72）。純函式，不碰畫面。
 *
 * 座位順序：教室依清單順序；教室內第 1 排深位 1→depth，再第 2 排…，取前 seatCount 個（helpers.classroomSeats）。
 * 規則：各教室依序、每排給輪到的下一班（班序跨教室延續，不每間重來）；該班用完就在同一排接下一班。
 * 結果：同班編號沿座位順序嚴格遞增；同一排內各班各自連續、不穿插；空位只出現在該組最後一間的尾端。
 * 以舊座位表驗證：重現高三 E2 理組三間、國三第 1～5 間（golden.test.ts）。
 */
import type { Classroom, SeatAssignment, SeatPos } from '../data/types';
import { classroomSeats, parseStudentCode } from '../data/helpers';

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

function fill(rooms: readonly SeatLayout[], queues: ClassQueue[]): SeatAssignment[] {
  const out: SeatAssignment[] = [];
  const taken = queues.map(() => 0);
  const n = queues.length;
  const avail = (k: number): boolean => taken[k]! < queues[k]!.codes.length;
  /** 從 start 起找下一個還有人的班；都沒有回 -1 */
  const findFrom = (start: number): number => {
    for (let i = 0; i < n; i++) {
      const k = (start + i) % n;
      if (avail(k)) return k;
    }
    return -1;
  };
  let next = 0; // 下一排輪到的班（索引），跨教室延續
  for (const room of rooms) {
    for (const { row, depths } of seatsByRow(room)) {
      const start = findFrom(next);
      if (start < 0) return out;
      next = (start + 1) % n;
      let cur = start;
      for (const depth of depths) {
        if (!avail(cur)) {
          cur = findFrom(cur + 1);
          if (cur < 0) return out;
        }
        out.push({ classroomId: room.id, row, depth, code: queues[cur]!.codes[taken[cur]!]! });
        taken[cur]!++;
      }
    }
  }
  return out;
}

/**
 * 把一組考生排進一組教室（同一組別或國中部全體）。
 * 座位總數不足時擋下（D25），不輸出部分結果。
 */
export function seatGroup(classrooms: readonly Classroom[], codes: readonly string[]): SeatGroupResult {
  return seatLayouts(classrooms.map(layoutOf), codes);
}

/** 同 seatGroup，但直接給座位版面（供舊座位表驗證與測試） */
export function seatLayouts(layouts: readonly SeatLayout[], codes: readonly string[]): SeatGroupResult {
  const queues = buildQueues(codes);
  if (typeof queues === 'string') return { ok: false, error: queues };
  const total = codes.length;
  const capacity = layouts.reduce((a, l) => a + l.seats.length, 0);
  if (capacity < total) {
    return { ok: false, error: `座位不足：考生 ${total} 人，座位 ${capacity} 個，還差 ${total - capacity} 個` };
  }
  const assignments = fill(layouts, queues);
  if (assignments.length !== total) {
    return { ok: false, error: `排座失敗：只排入 ${assignments.length}／${total} 人` };
  }
  return { ok: true, assignments };
}
