/**
 * 抽離分配（D5、D7、D26、D27；節次 D92、D94）：
 * - 依「節次」分組計算：同一節各科的抽離人數加總再比預備教室容量；不同節可重用預備教室；
 *   同一節的抽離考試與抽離自習用不同教室（D27）。沒有給節次（舊呼叫端）＝每科各自一節，與以前相同。
 *   一科跨兩節（學測國文＝國綜＋國寫）時，那兩節併成一組計算（整個一起標、兩節一起抽離）。
 * - 抽離考試要座位，有兩種排法（D94-4）：
 *   - proctor 監考優先（模式 2）：每一組節次各自用同一套排座引擎由第一間預備教室排起，守 D3 硬規則。
 *   - peer 同學優先（模式 1）：同一個人每一節坐同一個座位；座位夠就每人一格（同班遞增、每排輪替），
 *     不夠才讓不同節的人共用座位。共用時同班遞增是「盡量」，只回警告、不擋（對 D3 的例外）。
 *     兩種都排不下時改用監考優先的排法並警告。
 * - 抽離自習只出名單：依預備教室順序，每間再依班級、座號排（不給座位）。
 * - 單人特例（D26）：保留原座位、標註自填地點，不佔預備教室（與節次無關）。
 * - 同一人同一節被標到兩科：報錯（只有使用者把兩科改成同節才會發生）。
 */
import type { ClassInfo, Classroom, Detach, Mark, Override, SeatPos, StudentCode, Subject } from '../data/types';
import { classroomSeats, parseStudentCode, seatLabel } from '../data/helpers';
import type { SubjectPeriod } from './periods';
import { seatGroup } from './seating';
import { reserveOrderWarnings, validateSeating } from './validate';

export interface SpecialPlacement {
  code: StudentCode;
  subjectId: string;
  purpose: 'exam' | 'study';
  location: string;
}

/** 預備教室排座方式（D94-4）：peer＝① 同學優先、proctor＝② 監考優先 */
export type ReserveMode = 'peer' | 'proctor';

export interface DetachInput {
  subjects: readonly Subject[];
  marks: readonly Mark[];
  overrides: readonly Override[];
  /** 本次可用的預備教室（依清單順序） */
  reserveRooms: readonly Classroom[];
  classes: readonly ClassInfo[];
  /** 科目→節次（D94，見 periods.ts）；沒給＝每科各自一節 */
  periods?: ReadonlyMap<string, readonly SubjectPeriod[]>;
  /** 預備教室排座方式；沒給＝監考優先（與以前的排法相同）。畫面預設同學優先，由呼叫端傳入 */
  mode?: ReserveMode;
}

export type DetachResult =
  | { ok: true; detaches: Detach[]; special: SpecialPlacement[]; /** 只警告、不擋下載（同學優先的遞增例外等） */ warnings?: string[] }
  | { ok: false; errors: string[] };

/**
 * 單人特例某一科的用途（#66）：有逐科設定用逐科；舊資料只有單一 purpose，
 * 但同一人 X 與＋並存時單一值必有一科被竄改，所以混合標示者退回依標示方向。
 */
export function overridePurpose(o: Override, subjectId: string, mode: 'absent' | 'extra', mixed: boolean): 'exam' | 'study' {
  const p = o.purposes?.[subjectId];
  if (p) return p;
  if (mixed) return mode === 'extra' ? 'exam' : 'study';
  return o.purpose;
}

/** 這個人的標示是否同時有 X 與＋ */
export function mixedMarkCodes(marks: readonly { code: string; mode: 'absent' | 'extra' }[]): Set<string> {
  const a = new Set<string>(); const e = new Set<string>();
  for (const m of marks) (m.mode === 'absent' ? a : e).add(m.code);
  return new Set([...a].filter((c) => e.has(c)));
}

function byClassSeat(a: StudentCode, b: StudentCode): number {
  const x = parseStudentCode(a);
  const y = parseStudentCode(b);
  if (!x || !y) return a < b ? -1 : a > b ? 1 : 0;
  return x.classNo - y.classNo || x.seatNo - y.seatNo;
}

/** 從 start 起依序取教室，直到座位數足夠；不夠回 null */
function takeRooms(rooms: readonly Classroom[], start: number, need: number): { rooms: Classroom[]; end: number } | null {
  const picked: Classroom[] = [];
  let cap = 0;
  let i = start;
  while (cap < need && i < rooms.length) {
    const r = rooms[i++]!;
    picked.push(r);
    cap += r.seatCount;
  }
  return cap >= need ? { rooms: picked, end: i } : null;
}

/** 一組同時進行（或因一科跨兩節而綁在一起）的節次 */
export interface PeriodGroup {
  periods: number[];
  subjectIds: string[];
}

/**
 * 依節次把科目分組：同一節的科目同組；一科跨多節（國文）就把那幾節併成一組。
 * 沒給節次＝每科各自一組（以前的「每科各自計算」）。依最早的節次排序。
 */
export function periodGroups(subjects: readonly Subject[], periods?: ReadonlyMap<string, readonly SubjectPeriod[]>): PeriodGroup[] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: number, b: number) => {
    const x = find(a);
    const y = find(b);
    if (x !== y) parent.set(Math.max(x, y), Math.min(x, y));
  };
  const of = new Map<string, number[]>();
  subjects.forEach((s, i) => {
    const ps = periods?.get(s.id)?.map((x) => x.period);
    const list = ps && ps.length ? ps : [100000 + i]; // 沒有節次的科目自成一組
    of.set(s.id, list);
    for (const p of list) if (!parent.has(p)) parent.set(p, p);
    for (const p of list.slice(1)) union(list[0]!, p);
  });
  const groups = new Map<number, PeriodGroup>();
  for (const s of subjects) {
    const list = of.get(s.id)!;
    const root = find(list[0]!);
    const g = groups.get(root) ?? { periods: [], subjectIds: [] };
    g.subjectIds.push(s.id);
    for (const p of list) if (!g.periods.includes(p)) g.periods.push(p);
    groups.set(root, g);
  }
  for (const g of groups.values()) g.periods.sort((a, b) => a - b);
  return [...groups.values()].sort((a, b) => a.periods[0]! - b.periods[0]!);
}

/** 版本碼用：節次分組若就是「一科一組」（預設節次表都是）回 undefined，讓舊結果的版本碼不變；否則回分組 */
export function periodGroupKey(subjects: readonly Subject[], periods?: ReadonlyMap<string, readonly SubjectPeriod[]>): string[][] | undefined {
  const g = periodGroups(subjects, periods);
  return g.some((x) => x.subjectIds.length > 1) ? g.map((x) => x.subjectIds) : undefined;
}

interface Unit {
  code: StudentCode;
  subjectId: string;
}
type Seat = { roomId: string; seat: SeatPos };

export function allocateDetaches(input: DetachInput): DetachResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const special: SpecialPlacement[] = [];
  const overrideOf = new Map(input.overrides.map((o) => [o.code, o]));
  const mixed = mixedMarkCodes(input.marks);
  const subjectName = new Map(input.subjects.map((s) => [s.id, s.name]));
  const groups = periodGroups(input.subjects, input.periods);
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => g.subjectIds.forEach((id) => groupOf.set(id, gi)));

  // 同一人同一節被標到兩科（D94-3）
  if (input.periods) {
    const seen = new Map<string, string>();
    const reported = new Set<string>();
    for (const m of input.marks) {
      for (const p of input.periods.get(m.subjectId) ?? []) {
        const k = `${m.code}|${p.period}`;
        const prev = seen.get(k);
        if (!prev) seen.set(k, m.subjectId);
        else if (prev !== m.subjectId && !reported.has(k)) {
          reported.add(k);
          errors.push(`同一人同一節被標到兩科：${m.code} 第 ${p.period} 節（${subjectName.get(prev) ?? prev}、${subjectName.get(m.subjectId) ?? m.subjectId}）`);
        }
      }
    }
    if (errors.length) return { ok: false, errors };
  }

  // 每一組：抽離考試、抽離自習各是哪些人
  const examUnits = groups.map(() => [] as Unit[]);
  const studyUnits = groups.map(() => [] as Unit[]);
  for (const subject of input.subjects) {
    const gi = groupOf.get(subject.id)!;
    for (const m of input.marks) {
      if (m.subjectId !== subject.id) continue;
      const o = overrideOf.get(m.code);
      // D80：有手動覆寫就以覆寫的 purpose 為準，否則依標示方向
      const purpose = o ? overridePurpose(o, subject.id, m.mode, mixed.has(m.code)) : m.mode === 'extra' ? 'exam' : 'study';
      if (o) special.push({ code: m.code, subjectId: subject.id, purpose, location: o.location });
      else (purpose === 'exam' ? examUnits : studyUnits)[gi]!.push({ code: m.code, subjectId: subject.id });
    }
  }
  const codesOf = (l: Unit[]) => [...new Set(l.map((u) => u.code))].sort(byClassSeat);
  const examCodes = examUnits.map(codesOf);
  const studyCodes = studyUnits.map(codesOf);
  /** 錯誤訊息的開頭：一科一組就寫科目（與以前相同），否則寫節次與各科 */
  const labelOf = (gi: number) => {
    const g = groups[gi]!;
    const ids = g.subjectIds.filter((id) => [...examUnits[gi]!, ...studyUnits[gi]!].some((u) => u.subjectId === id));
    const names = ids.map((id) => subjectName.get(id) ?? id).join('、');
    return ids.length === 1 || !input.periods ? names : `第 ${g.periods.join('、')} 節（${names}）`;
  };

  let seatOf: Map<string, Seat>[] | null = null;
  const studyRoomsOf: Classroom[][] = groups.map(() => []);
  if ((input.mode ?? 'proctor') === 'peer' && examCodes.some((l) => l.length)) {
    const r = peerSeating(input, groups, examCodes, studyCodes);
    if (r.ok) {
      seatOf = groups.map(() => r.seats);
      warnings.push(...r.warnings);
      groups.forEach((_, gi) => { studyRoomsOf[gi] = r.studyRooms[gi]!; });
    } else {
      warnings.push('預備教室座位不夠讓每位加考同學每一節都坐同一格，已改用「監考優先」的排法（同學不保證每節同一個座位）。');
    }
  }
  if (!seatOf) {
    seatOf = groups.map(() => new Map<string, Seat>());
    groups.forEach((_, gi) => {
      const exam = examCodes[gi]!;
      const study = studyCodes[gi]!;
      if (!exam.length && !study.length) return;
      const label = labelOf(gi);
      const examRooms = takeRooms(input.reserveRooms, 0, exam.length);
      if (!examRooms) {
        errors.push(`${label}：預備教室座位不足以容納抽離考試 ${exam.length} 人`);
        return;
      }
      const studyRooms = study.length ? takeRooms(input.reserveRooms, examRooms.end, study.length) : { rooms: [], end: examRooms.end };
      if (!studyRooms) {
        errors.push(`${label}：抽離考試用掉部分預備教室後，剩下的座位不足以容納抽離自習 ${study.length} 人`);
        return;
      }
      studyRoomsOf[gi] = studyRooms.rooms;
      if (!exam.length) return;
      const r = seatGroup(examRooms.rooms, exam);
      if (!r.ok) {
        errors.push(`${label}抽離考試：${r.error}`);
        return;
      }
      const problems = validateSeating({
        classrooms: examRooms.rooms,
        classes: input.classes,
        codes: exam,
        assignments: r.assignments,
        checkTrack: false,
        roomKind: 'reserve',
      });
      if (problems.length) {
        errors.push(...problems.map((p) => `${label}抽離考試：${p}`));
        return;
      }
      for (const a of r.assignments) seatOf![gi]!.set(a.code, { roomId: a.classroomId, seat: { row: a.row, depth: a.depth } });
    });
  }
  if (errors.length) return { ok: false, errors };

  // 自習：依教室順序，每間再依班級、座號
  const studyRoomOf = groups.map(() => new Map<string, string>());
  groups.forEach((_, gi) => {
    let i = 0;
    const study = studyCodes[gi]!;
    for (const room of studyRoomsOf[gi]!) {
      for (const code of study.slice(i, i + room.seatCount)) studyRoomOf[gi]!.set(code, room.id);
      i += room.seatCount;
    }
  });

  // 依科目順序輸出：先抽離考試（依座位順序），再抽離自習
  const roomIdx = new Map(input.reserveRooms.map((r, i) => [r.id, i]));
  const cmpSeat = (a: Seat, b: Seat) => (roomIdx.get(a.roomId) ?? 0) - (roomIdx.get(b.roomId) ?? 0) || a.seat.row - b.seat.row || a.seat.depth - b.seat.depth;
  const detaches: Detach[] = [];
  for (const subject of input.subjects) {
    const gi = groupOf.get(subject.id)!;
    const ex = examUnits[gi]!.filter((u) => u.subjectId === subject.id).map((u) => ({ code: u.code, s: seatOf![gi]!.get(u.code)! }));
    ex.sort((a, b) => cmpSeat(a.s, b.s));
    for (const { code, s } of ex) detaches.push({ code, subjectId: subject.id, purpose: 'exam', roomId: s.roomId, seat: s.seat });
    const st = studyUnits[gi]!.filter((u) => u.subjectId === subject.id).map((u) => u.code).sort(byClassSeat);
    for (const code of st) detaches.push({ code, subjectId: subject.id, purpose: 'study', roomId: studyRoomOf[gi]!.get(code)! });
  }
  return warnings.length ? { ok: true, detaches, special, warnings: [...new Set(warnings)] } : { ok: true, detaches, special };
}

/**
 * 同學優先（模式 1）：每人一格、各節都坐同一格。
 * A. 座位夠每人一格：用排座引擎排全部加考的人（同班遞增、每排輪替），不共用。
 * B. 不夠：只用同一節最多人數所需的教室，先依序坐滿，其餘的人坐進「他考的節次都沒人用」的座位（共用）。
 * 自習用「這一節沒有人在考試」的預備教室。都排不下回 ok:false，由呼叫端改用監考優先。
 */
function peerSeating(input: DetachInput, groups: PeriodGroup[], examCodes: string[][], studyCodes: string[][]):
  | { ok: true; seats: Map<string, Seat>; studyRooms: Classroom[][]; warnings: string[] }
  | { ok: false } {
  const all = [...new Set(examCodes.flat())].sort(byClassSeat);
  const groupsOf = new Map<string, Set<number>>();
  examCodes.forEach((l, gi) => l.forEach((c) => groupsOf.set(c, (groupsOf.get(c) ?? new Set<number>()).add(gi))));
  const studyRooms = (seats: Map<string, Seat>): Classroom[][] | null => {
    const out: Classroom[][] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const study = studyCodes[gi]!.length;
      if (!study) { out.push([]); continue; }
      const used = new Set(examCodes[gi]!.map((c) => seats.get(c)!.roomId));
      const t = takeRooms(input.reserveRooms.filter((r) => !used.has(r.id)), 0, study);
      if (!t) return null;
      out.push(t.rooms);
    }
    return out;
  };
  const finish = (seats: Map<string, Seat>) => {
    const sr = studyRooms(seats);
    if (!sr) return null;
    const warnings = examCodes.flatMap((l) => reserveOrderWarnings(input.reserveRooms, input.classes, l.map((code) => ({ code, ...seats.get(code)! }))));
    return { ok: true as const, seats, studyRooms: sr, warnings };
  };

  // A. 每人一格
  const a = takeRooms(input.reserveRooms, 0, all.length);
  if (a) {
    const r = seatGroup(a.rooms, all);
    if (r.ok) {
      const done = finish(new Map(r.assignments.map((x) => [x.code, { roomId: x.classroomId, seat: { row: x.row, depth: x.depth } }])));
      if (done) return done;
    }
  }
  // B. 共用座位
  const maxNeed = Math.max(...examCodes.map((l) => l.length));
  const b = takeRooms(input.reserveRooms, 0, maxNeed);
  if (!b) return { ok: false };
  const slots = b.rooms.flatMap((room) => classroomSeats(room).map((seat) => ({ roomId: room.id, seat, used: new Set<number>() })));
  const idx = new Map(slots.map((s, i) => [`${s.roomId}|${seatLabel(s.seat)}`, i]));
  const seats = new Map<string, Seat>();
  const put = (code: string, i: number) => {
    const s = slots[i]!;
    for (const g of groupsOf.get(code)!) s.used.add(g);
    seats.set(code, { roomId: s.roomId, seat: s.seat });
  };
  const r = seatGroup(b.rooms, all.slice(0, slots.length));
  if (!r.ok) return { ok: false };
  for (const x of r.assignments) put(x.code, idx.get(`${x.classroomId}|${seatLabel(x)}`)!);
  for (const code of all.slice(slots.length)) {
    const mine = [...groupsOf.get(code)!];
    const i = slots.findIndex((s) => !mine.some((g) => s.used.has(g)));
    if (i < 0) return { ok: false };
    put(code, i);
  }
  return finish(seats) ?? { ok: false };
}

/** 覆寫檢查（D23）：重排後重新套用，對不上的覆寫警告，不丟棄 */
export function overrideWarnings(overrides: readonly Override[], codes: readonly StudentCode[]): string[] {
  const set = new Set(codes);
  const warn: string[] = [];
  const seen = new Set<string>();
  for (const o of overrides) {
    if (!set.has(o.code)) warn.push(`單人特例的考生不在本次名單：${o.code}`);
    if (seen.has(o.code)) warn.push(`單人特例重複：${o.code}`);
    if (!o.location.trim()) warn.push(`單人特例沒有填地點：${o.code}`);
    seen.add(o.code);
  }
  return warn;
}
