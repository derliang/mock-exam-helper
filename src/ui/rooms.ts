/** 教室編輯的純函式（D56、D69②：座位只多不少；使用者可任意指定哪些座位不排，排座時人由前往後連續坐、跳過不排的座位）。 */
import type { Classroom, Division, LabelPaper, SeatPos, Track } from '../data';
import { classroomSeats, roomDivision, seatLabel, type RoomDivisionContext } from '../data';
import { defaultLabelLayout } from '../export/model';

/** 一間教室的座位上限＝一張標籤紙的格數（B4 6×8＝48、A3 7×7＝49，D74） */
export function seatCap(paper: LabelPaper): number {
  const l = defaultLabelLayout(paper);
  return l.cols * l.rows;
}

export const roomCapacity = (r: Classroom): number => r.rows * r.depth;

/** 座標在教室可用座位順序中的序號（0 起）：第 1 排深位 1→depth，再第 2 排 */
export const seatIndex = (r: Classroom, pos: SeatPos): number => (pos.row - 1) * r.depth + (pos.depth - 1);

export const isSeatActive = (r: Classroom, pos: SeatPos): boolean => classroomSeats(r).some((s) => s.row === pos.row && s.depth === pos.depth);

/** 指定「可用座位」集合後回存：seatCount＝可用數，disabled＝其餘座位（全開就不留 disabled） */
function withUsable(r: Classroom, usable: Set<string>): Classroom {
  const off: string[] = [];
  for (let row = 1; row <= r.rows; row++) for (let d = 1; d <= r.depth; d++) if (!usable.has(`${row}-${d}`)) off.push(`${row}-${d}`);
  const { disabled: _drop, ...rest } = r;
  void _drop;
  return { ...rest, seatCount: usable.size, ...(off.length ? { disabled: off } : {}) };
}

const usableSet = (r: Classroom): Set<string> => new Set(classroomSeats(r).map(seatLabel));

/**
 * 改橫排數或深位數：總格數不得超過 cap，也不得小於 1。
 * 原本座位全開就維持全開；否則保留原本不排的座位（超出新範圍的丟掉），其餘可用。
 */
export function resize(r: Classroom, patch: { rows?: number; depth?: number }, cap: number): Classroom {
  const rows = Math.max(1, Math.trunc(patch.rows ?? r.rows));
  const depth = Math.max(1, Math.trunc(patch.depth ?? r.depth));
  if (rows * depth > Math.max(cap, r.seatCount) && rows * depth > roomCapacity(r)) return r; // 超過上限：擋下
  const wasFull = r.seatCount === roomCapacity(r);
  const total = rows * depth;
  if (wasFull) return withUsable({ ...r, rows, depth }, new Set(Array.from({ length: Math.min(total, cap) }, (_, i) => `${Math.floor(i / depth) + 1}-${(i % depth) + 1}`)));
  const off = new Set(r.disabled ?? []);
  const usable = new Set<string>();
  // 沒有 disabled 的舊資料：不排的是順序最後那幾個，縮放後座位數不超過新的總格數
  const legacy = !r.disabled || r.disabled.length === 0;
  let n = 0;
  for (let row = 1; row <= rows; row++) for (let d = 1; d <= depth; d++) {
    const k = `${row}-${d}`;
    if (off.has(k)) continue;
    if (legacy && n >= r.seatCount) continue;
    usable.add(k); n++;
  }
  if (usable.size === 0) usable.add('1-1');
  return withUsable({ ...r, rows, depth }, usable);
}

/**
 * 點一個座位＝切換這個座位排或不排（2026-11-08 使用者裁示：使用者可以任意點哪些位子不能排；
 * 「空位只在最後」是排座結果的規則，不限制使用者標示）。至少留 1 個可用；可用座位不得超過 cap。
 */
export function clickSeat(r: Classroom, pos: SeatPos, cap: number): Classroom {
  const i = seatIndex(r, pos);
  if (i < 0 || i >= roomCapacity(r)) return r;
  const usable = usableSet(r);
  const k = seatLabel(pos);
  if (usable.has(k)) { if (usable.size <= 1) return r; usable.delete(k); } else { if (usable.size >= cap) return r; usable.add(k); }
  return withUsable(r, usable);
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

/** 新增教室：一律標上所屬部別（校-33）；國中部沒有預備教室，要求新增就當沒做（回傳原陣列） */
export function addRoom(rooms: Classroom[], kind: Classroom['kind'], division: Division = 'senior', ctx?: RoomDivisionContext): Classroom[] {
  if (kind === 'reserve' && division === 'junior') return rooms;
  let n = rooms.length + 1;
  while (rooms.some((r) => r.id === `room-${n}`)) n++;
  const base = kind === 'class' ? '試場' : '預備教室';
  const same = roomsOfDivision(rooms, division, ctx).filter((r) => r.kind === kind).length + 1;
  return [...rooms, { id: `room-${n}`, name: `${base}${same}`, kind, rows: 5, depth: 6, seatCount: 30, division }];
}

/** 屬於某部別的教室（保留原順序）；沒給推斷資料時，沒標部別的教室當高中部 */
export const roomsOfDivision = (rooms: Classroom[], division: Division, ctx: RoomDivisionContext = { classes: [], exams: [] }): Classroom[] =>
  rooms.filter((r) => roomDivision(r, ctx) === division);

/** 新增後多出來的班級教室 id（預備教室預設不列入，故不回傳）；步驟③新增時用來預設列入 */
export const newClassRoomIds = (before: Classroom[], after: Classroom[]): string[] =>
  after.filter((r) => r.kind === 'class' && !before.some((b) => b.id === r.id)).map((r) => r.id);

export const removeRoom = (rooms: Classroom[], id: string): Classroom[] => rooms.filter((r) => r.id !== id);
export const patchRoom = (rooms: Classroom[], id: string, f: (r: Classroom) => Classroom): Classroom[] => rooms.map((r) => (r.id === id ? f(r) : r));

/** 指定教室屬於理組／文組（高中部班級教室必填；預備教室不用，會清掉） */
export const setRoomTrack = (r: Classroom, track: Track | undefined): Classroom => {
  const { track: _drop, ...rest } = r;
  void _drop;
  return track && r.kind === 'class' ? { ...rest, track } : rest;
};

/** 高中部排座要用的班級教室裡，還沒指定理／文組的（缺它排座會報「理組沒有可用的教室」，驗收 D-1） */
export const roomsMissingTrack = (rooms: Classroom[], division: 'senior' | 'junior'): Classroom[] =>
  division === 'senior' ? rooms.filter((r) => r.kind === 'class' && !r.track) : [];

/**
 * 預設組別：高中部班級教室還沒指定理／文組、而教室名稱與某個高中部班級同名時，
 * 就帶入該班的組別（例：教室「溫」→ 理組、「儉」→ 文組）。已指定的不動；回傳原陣列表示沒有變動。
 */
export function fillDefaultTracks(rooms: Classroom[], classes: { name: string; division?: string; track?: Track }[]): Classroom[] {
  const byName = new Map(classes.filter((c) => c.division === 'senior' && c.track).map((c) => [c.name, c.track as Track]));
  let changed = false;
  const out = rooms.map((r) => {
    const t = r.kind === 'class' && !r.track && r.division !== 'junior' ? byName.get(r.name) : undefined;
    if (!t) return r;
    changed = true;
    return { ...r, track: t };
  });
  return changed ? out : rooms;
}
