/** 教室編輯的純函式（D56、D69②、D72：座位只多不少、空位只在最後、由前往後連續）。 */
import type { Classroom, LabelPaper, SeatPos } from '../data';
import { defaultLabelLayout } from '../export/model';

/** 一間教室的座位上限＝一張標籤紙的格數（B4 6×8＝48、A3 7×7＝49，D74） */
export function seatCap(paper: LabelPaper): number {
  const l = defaultLabelLayout(paper);
  return l.cols * l.rows;
}

export const roomCapacity = (r: Classroom): number => r.rows * r.depth;

/** 座標在教室可用座位順序中的序號（0 起）：第 1 排深位 1→depth，再第 2 排 */
export const seatIndex = (r: Classroom, pos: SeatPos): number => (pos.row - 1) * r.depth + (pos.depth - 1);

export const isSeatActive = (r: Classroom, pos: SeatPos): boolean => seatIndex(r, pos) < r.seatCount;

/**
 * 改橫排數或深位數：總格數不得超過 cap，也不得小於 1。
 * 原本座位全開就維持全開，否則座位數不超過新的總格數。
 */
export function resize(r: Classroom, patch: { rows?: number; depth?: number }, cap: number): Classroom {
  const rows = Math.max(1, Math.trunc(patch.rows ?? r.rows));
  const depth = Math.max(1, Math.trunc(patch.depth ?? r.depth));
  if (rows * depth > Math.max(cap, r.seatCount) && rows * depth > roomCapacity(r)) return r; // 超過上限：擋下
  const wasFull = r.seatCount === roomCapacity(r);
  const total = rows * depth;
  return { ...r, rows, depth, seatCount: wasFull ? Math.min(total, cap) : Math.min(r.seatCount, total) };
}

/**
 * 點一個座位（D72）：點可用座位＝它和它之後都改成「不排」（至少留 1 個）；
 * 點不排的座位＝恢復到它為止（不得超過上限）。不能在中間挖洞。
 */
export function clickSeat(r: Classroom, pos: SeatPos, cap: number): Classroom {
  const i = seatIndex(r, pos);
  if (i < 0 || i >= roomCapacity(r)) return r;
  if (i < r.seatCount) return { ...r, seatCount: Math.max(1, i) };
  return { ...r, seatCount: Math.min(i + 1, cap) };
}

/** 座位總數統計（D6：預備教室座位另計，不計入班級教室合計） */
export function seatTotals(rooms: Classroom[]): { classSeats: number; reserveSeats: number } {
  let classSeats = 0;
  let reserveSeats = 0;
  for (const r of rooms) {
    if (r.kind === 'class') classSeats += r.seatCount;
    else reserveSeats += r.seatCount;
  }
  return { classSeats, reserveSeats };
}

export type SeatCheck = { level: 'block' | 'ok' | 'warn'; message: string };

/** 狀態檢核（DESIGN 10.4）：少於考生＝擋下；多於考生＝允許並提示空位留在最後 */
export function checkSeats(classSeats: number, students: number): SeatCheck {
  if (students === 0) return { level: 'warn', message: '還沒有考生，請先建立學生名單。' };
  if (classSeats < students) return { level: 'block', message: `座位 ${classSeats} 少於考生 ${students}，還差 ${students - classSeats} 個，不能排座。` };
  if (classSeats > students) return { level: 'ok', message: `座位 ${classSeats}、考生 ${students}：空位 ${classSeats - students} 個，會留在最後面（由前往後連續排，中間不空位）。` };
  return { level: 'ok', message: `座位 ${classSeats} 等於考生 ${students}，剛好。` };
}

export function addRoom(rooms: Classroom[], kind: Classroom['kind']): Classroom[] {
  let n = rooms.length + 1;
  while (rooms.some((r) => r.id === `room-${n}`)) n++;
  const base = kind === 'class' ? '試場' : '預備教室';
  const same = rooms.filter((r) => r.kind === kind).length + 1;
  return [...rooms, { id: `room-${n}`, name: `${base}${same}`, kind, rows: 5, depth: 6, seatCount: 30 }];
}

export const removeRoom = (rooms: Classroom[], id: string): Classroom[] => rooms.filter((r) => r.id !== id);
export const patchRoom = (rooms: Classroom[], id: string, f: (r: Classroom) => Classroom): Classroom[] => rooms.map((r) => (r.id === id ? f(r) : r));
