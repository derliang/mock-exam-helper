import type { Classroom, SeatPos, StudentCode } from './types';

/** 學生編號：第 1 班 1 號＝0101，第 5 班 35 號＝0535 */
export function studentCode(classNo: number, seatNo: number): StudentCode {
  return String(classNo).padStart(2, '0') + String(seatNo).padStart(2, '0');
}

/** 反解學生編號；格式不符回 null */
export function parseStudentCode(code: string): { classNo: number; seatNo: number } | null {
  const m = /^(\d{2})(\d{2})$/.exec(code);
  if (!m) return null;
  return { classNo: Number(m[1]), seatNo: Number(m[2]) };
}

/** 座標字串「排－深位」，例 1-2（D49） */
export function seatLabel(pos: SeatPos): string {
  return `${pos.row}-${pos.depth}`;
}

/** 教室設定是否合法：整數、座位數 1..rows*depth（D72：空位只在最後） */
export function isValidClassroom(c: Classroom): boolean {
  return (
    Number.isInteger(c.rows) &&
    Number.isInteger(c.depth) &&
    Number.isInteger(c.seatCount) &&
    c.rows >= 1 &&
    c.depth >= 1 &&
    c.seatCount >= 1 &&
    c.seatCount <= c.rows * c.depth
  );
}

/** 依序列出可用座位：第 1 排深位 1→depth，再第 2 排…，取前 seatCount 個 */
export function classroomSeats(c: Classroom): SeatPos[] {
  const seats: SeatPos[] = [];
  for (let row = 1; row <= c.rows; row++) {
    for (let depth = 1; depth <= c.depth; depth++) {
      if (seats.length >= c.seatCount) return seats;
      seats.push({ row, depth });
    }
  }
  return seats;
}

/** 空位數（都在最後） */
export function emptySeatCount(c: Classroom): number {
  return c.rows * c.depth - c.seatCount;
}
