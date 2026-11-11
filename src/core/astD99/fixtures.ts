/** D99 測試用匿名假資料：班號 1～3＝甲乙丙班，姓名「學生＋編號」，不含任何真實資料 */
import type { SeatPos } from '../../data/types';
import { codeOf, type PlanRoom, type PlanStudent } from './contract';

/** rows 排 × depth 深位的矩形座位 */
export const grid = (rows: number, depth: number): SeatPos[] =>
  Array.from({ length: rows * depth }, (_, i) => ({ row: Math.floor(i / depth) + 1, depth: (i % depth) + 1 }));

export const classRoom = (classNo: number, seats: readonly SeatPos[] = grid(7, 7), studyCapacity = seats.length): PlanRoom =>
  ({ id: `C${classNo}`, kind: 'class', classNo, seats, studyCapacity });

export const reserveRoom = (id: string, seats: readonly SeatPos[], studyCapacity = seats.length): PlanRoom =>
  ({ id, kind: 'reserve', seats, studyCapacity });

/** 一班 count 人（座號 1～count）；takes 依座號決定各節考什麼 */
export const makeClass = (classNo: number, count: number, takes: (seatNo: number) => Partial<Record<string, string>> = () => ({})): PlanStudent[] =>
  Array.from({ length: count }, (_, i) => ({
    classNo,
    seatNo: i + 1,
    name: `學生${codeOf({ classNo, seatNo: i + 1 })}`,
    takes: Object.fromEntries(Object.entries(takes(i + 1)).filter((kv): kv is [string, string] => kv[1] !== undefined)),
  }));

/** 指定座號的學生（座號可不連續） */
export const makeStudents = (classNo: number, seatNos: readonly number[], takes: Record<string, string>): PlanStudent[] =>
  seatNos.map((seatNo) => ({ classNo, seatNo, name: `學生${codeOf({ classNo, seatNo })}`, takes }));
