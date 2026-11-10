import type { Classroom, Division, ExamConfig, Settings, SeatPos, StudentCode } from './types';

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

/** 依序列出可用座位：第 1 排深位 1→depth，再第 2 排…，跳過使用者指定不排的座位，取前 seatCount 個 */
export function classroomSeats(c: Classroom): SeatPos[] {
  const seats: SeatPos[] = [];
  const off = new Set(c.disabled ?? []);
  for (let row = 1; row <= c.rows; row++) {
    for (let depth = 1; depth <= c.depth; depth++) {
      if (seats.length >= c.seatCount) return seats;
      if (off.has(`${row}-${depth}`)) continue;
      seats.push({ row, depth });
    }
  }
  return seats;
}

/** 不排的座位數 */
export function emptySeatCount(c: Classroom): number {
  return c.rows * c.depth - c.seatCount;
}

/** 推斷教室部別要看的既有資訊：班級資料（名稱對得上哪個部別）與各次考試選用了哪些教室 */
export interface RoomDivisionContext {
  classes: { name: string; division?: string }[];
  exams: Pick<ExamConfig, 'division' | 'classroomIds'>[];
}

/**
 * 教室所屬部別（校-33）。有明確 `division` 就用它；舊資料沒有時依序推斷，推不出來就當高中部：
 * ① 預備教室（國中部會考沒有抽離）→ 高中；② 有指定文理組 → 高中；
 * ③ 名稱只對得上國中部班級（高中部沒有同名班）→ 國中，只對得上高中部班級 → 高中；
 * ④ 只被會考（國中部）模擬考選用、沒被任何高中部模擬考選用 → 國中；⑤ 其餘 → 高中。
 */
export function roomDivision(r: Classroom, ctx: RoomDivisionContext): Division {
  if (r.division) return r.division;
  if (r.kind === 'reserve' || r.track) return 'senior';
  const inSenior = ctx.classes.some((c) => c.division === 'senior' && c.name === r.name);
  const inJunior = ctx.classes.some((c) => c.division === 'junior' && c.name === r.name);
  if (inJunior && !inSenior) return 'junior';
  if (inSenior && !inJunior) return 'senior';
  const used = ctx.exams.filter((e) => e.classroomIds.includes(r.id));
  if (used.length > 0 && used.every((e) => e.division === 'junior')) return 'junior';
  return 'senior';
}

/**
 * 讀檔遷移：替沒有 `division` 的舊教室補上推斷出來的部別。只加欄位，不動其他資料；
 * 已有 `division` 的原樣保留（所以重複執行結果相同），沒有任何變動時回傳原物件。
 */
export function withRoomDivisions(settings: Settings, exams: Pick<ExamConfig, 'division' | 'classroomIds'>[]): Settings {
  if (settings.classrooms.every((r) => r.division)) return settings;
  const ctx: RoomDivisionContext = { classes: settings.classes, exams };
  return { ...settings, classrooms: settings.classrooms.map((r) => (r.division ? r : { ...r, division: roomDivision(r, ctx) })) };
}
