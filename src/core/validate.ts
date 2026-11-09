/**
 * 驗證器（D25）：排座結果不合硬規則就擋下，絕不輸出。
 * 檢查與排座演算法無關，任何策略（含未來的覆寫）都要通過。
 */
import type { ClassInfo, Classroom, SeatAssignment, Track } from '../data/types';
import { classroomSeats, parseStudentCode, seatLabel } from '../data/helpers';

export interface ValidationInput {
  /** 本次排座使用的教室（依清單順序，即座位順序） */
  classrooms: readonly Classroom[];
  classes: readonly ClassInfo[];
  /** 應該排到座位的考生編號 */
  codes: readonly string[];
  assignments: readonly SeatAssignment[];
  /** 高中部檢查教室組別；國中部不分組（D9/D69） */
  checkTrack: boolean;
  /** 逐人指定文理組（分科）：有的人以它為準，沒有的看班級 */
  trackOf?: ReadonlyMap<string, Track>;
  /** 允許的教室種類：主排座為 class（預設），抽離考試為 reserve（D27） */
  roomKind?: Classroom['kind'];
}

export function validateSeating(input: ValidationInput): string[] {
  const errors: string[] = [];
  const roomIndex = new Map(input.classrooms.map((c, i) => [c.id, i]));
  const classByNo = new Map(input.classes.map((c) => [c.no, c]));
  const expected = new Set(input.codes);
  const seenCode = new Set<string>();
  const seenSeat = new Set<string>();
  /** 每間教室已坐的座位序號（教室內順序） */
  const occupied = input.classrooms.map(() => new Set<number>());
  const seatOrder = input.classrooms.map((c) => {
    const m = new Map<string, number>();
    classroomSeats(c).forEach((s, i) => m.set(seatLabel(s), i));
    return m;
  });

  type Placed = { classNo: number; seatNo: number; room: number; row: number; order: number; label: string };
  const placed: Placed[] = [];

  for (const a of input.assignments) {
    const r = roomIndex.get(a.classroomId);
    const where = `${a.classroomId} ${seatLabel(a)}`;
    if (r === undefined) {
      errors.push(`座位在未選用的教室：${a.code}（${a.classroomId}）`);
      continue;
    }
    const room = input.classrooms[r]!;
    const order = seatOrder[r]!.get(seatLabel(a));
    if (order === undefined) {
      errors.push(`座位不存在：${where}`);
      continue;
    }
    if (seenSeat.has(where)) errors.push(`同一座位排了兩人：${where}`);
    seenSeat.add(where);
    occupied[r]!.add(order);
    if (!expected.has(a.code)) errors.push(`排到不在名單上的考生：${a.code}`);
    if (seenCode.has(a.code)) errors.push(`考生排到兩個座位：${a.code}`);
    seenCode.add(a.code);
    const p = parseStudentCode(a.code);
    if (!p) {
      errors.push(`考生編號格式不正確：${a.code}`);
      continue;
    }
    if (room.kind !== (input.roomKind ?? 'class')) {
      errors.push(`考生排進錯誤種類的教室：${a.code}（${room.name}）`);
    }
    if (input.checkTrack) {
      const track = input.trackOf?.get(a.code) ?? classByNo.get(p.classNo)?.track;
      if (!track) errors.push(`第 ${p.classNo} 班沒有設定組別`);
      else if (room.track !== track) errors.push(`考生排進其他組別的教室：${a.code}（${room.name}）`);
    }
    placed.push({ ...p, room: r, row: a.row, order, label: `${room.name} ${seatLabel(a)}` });
  }

  for (const code of expected) if (!seenCode.has(code)) errors.push(`考生沒有座位：${code}`);

  // 空位只在每間教室最後（D69、D72）：已坐座位必須是教室座位順序的前段
  occupied.forEach((set, r) => {
    for (let i = 0; i < set.size; i++) {
      if (!set.has(i)) {
        errors.push(`${input.classrooms[r]!.name} 中間有空位（空位只能在最後）`);
        break;
      }
    }
  });

  // 同班編號沿座位順序嚴格遞增
  placed.sort((x, y) => x.room - y.room || x.order - y.order);
  const lastSeat = new Map<number, Placed>();
  for (const p of placed) {
    const prev = lastSeat.get(p.classNo);
    if (prev && prev.seatNo >= p.seatNo) {
      errors.push(`第 ${p.classNo} 班編號沒有沿座位遞增：${prev.label} 之後的 ${p.label}`);
    }
    lastSeat.set(p.classNo, p);
  }

  // 同一排內各班連續、不穿插
  let key = '';
  let seen = new Set<number>();
  let prevClass = -1;
  for (const p of placed) {
    const k = `${p.room}/${p.row}`;
    if (k !== key) {
      key = k;
      seen = new Set();
      prevClass = -1;
    }
    if (p.classNo !== prevClass) {
      if (seen.has(p.classNo)) errors.push(`同一排不同班穿插：${p.label}`);
      seen.add(p.classNo);
      prevClass = p.classNo;
    }
  }
  return errors;
}
