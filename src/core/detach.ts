/**
 * 抽離分配（D5、D7、D26、D27）：
 * - 每科各自計算；不同科可重用預備教室；同一科的抽離考試與抽離自習用不同教室。
 * - 抽離考試用同一套排座引擎排進預備教室（要座位）。
 * - 抽離自習只出名單：依預備教室順序，每間再依班級、座號排（不給座位）。
 * - 單人特例（D26）：保留原座位、標註自填地點，不佔預備教室。
 */
import type { ClassInfo, Classroom, Detach, Mark, Override, StudentCode, Subject } from '../data/types';
import { parseStudentCode } from '../data/helpers';
import { seatGroup } from './seating';
import { validateSeating } from './validate';

export interface SpecialPlacement {
  code: StudentCode;
  subjectId: string;
  purpose: 'exam' | 'study';
  location: string;
}

export interface DetachInput {
  subjects: readonly Subject[];
  marks: readonly Mark[];
  overrides: readonly Override[];
  /** 本次可用的預備教室（依清單順序） */
  reserveRooms: readonly Classroom[];
  classes: readonly ClassInfo[];
  /** 科目 id → 節次（校-55）；沒給＝每科各自一節。同一節的抽離人數要加總比教室容量 */
  periods?: ReadonlyMap<string, number>;
  /** 預備教室排座方式（校-56）；沒給＝同學優先 */
  reserveMode?: 'student' | 'invigilator';
}

export type DetachResult =
  | { ok: true; detaches: Detach[]; special: SpecialPlacement[] }
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

export function allocateDetaches(input: DetachInput): DetachResult {
  const errors: string[] = [];
  const detaches: Detach[] = [];
  const special: SpecialPlacement[] = [];
  const overrideOf = new Map(input.overrides.map((o) => [o.code, o]));
  const mixed = mixedMarkCodes(input.marks);

  // 第一輪：每科的抽離考試／抽離自習名單
  const plan: { subject: Subject; exam: StudentCode[]; study: StudentCode[]; period: number }[] = [];
  let solo = 1000; // 沒給節次表的科目各自一節（與以前逐科算相同）
  for (const subject of input.subjects) {
    const exam: StudentCode[] = [];
    const study: StudentCode[] = [];
    for (const m of input.marks) {
      if (m.subjectId !== subject.id) continue;
      const o = overrideOf.get(m.code);
      // D80：有手動覆寫就以覆寫的 purpose 為準，否則依標示方向
      const purpose = o ? overridePurpose(o, subject.id, m.mode, mixed.has(m.code)) : m.mode === 'extra' ? 'exam' : 'study';
      if (o) special.push({ code: m.code, subjectId: subject.id, purpose, location: o.location });
      else (purpose === 'exam' ? exam : study).push(m.code);
    }
    if (!exam.length && !study.length) continue;
    exam.sort(byClassSeat);
    study.sort(byClassSeat);
    plan.push({ subject, exam, study, period: input.periods?.get(subject.id) ?? solo++ });
  }

  // 同學優先（校-56 模式①）：同一人跨節加考盡量同一個座位。把所有加考的人一次排好，各節用同一份座位；
  // 放不下（或排出來不合規則）就退回逐科排（模式②做法，不同節共用座位）。
  let fixed: Map<StudentCode, { roomId: string; seat: { row: number; depth: number } }> | null = null;
  let fixedEnd = 0;
  const examPlans = plan.filter((x) => x.exam.length);
  if (input.reserveMode !== 'invigilator' && examPlans.length >= 2) {
    const union = [...new Set(examPlans.flatMap((x) => x.exam))].sort(byClassSeat);
    const rooms = takeRooms(input.reserveRooms, 0, union.length);
    if (rooms) {
      const perPeriodStudy = new Map<number, number>();
      for (const x of plan) perPeriodStudy.set(x.period, (perPeriodStudy.get(x.period) ?? 0) + x.study.length);
      const needStudy = Math.max(0, ...perPeriodStudy.values());
      const studyOk = needStudy === 0 || takeRooms(input.reserveRooms, rooms.end, needStudy) !== null;
      const r = studyOk ? seatGroup(rooms.rooms, union) : null;
      if (r && r.ok && !validateSeating({ classrooms: rooms.rooms, classes: input.classes, codes: union, assignments: r.assignments, checkTrack: false, roomKind: 'reserve' }).length) {
        fixed = new Map(r.assignments.map((a) => [a.code, { roomId: a.classroomId, seat: { row: a.row, depth: a.depth } }]));
        fixedEnd = rooms.end;
      }
    }
  }

  // 同一節的各科要用不同教室：教室游標依節次累計
  const cursor = new Map<number, number>();
  for (const { subject, exam, study, period } of plan) {
    const start = cursor.get(period) ?? fixedEnd;
    const examRooms = fixed ? { rooms: [] as Classroom[], end: start } : takeRooms(input.reserveRooms, start, exam.length);
    if (!examRooms) {
      errors.push(`${subject.name}：預備教室座位不足以容納抽離考試 ${exam.length} 人`);
      continue;
    }
    const studyRooms = study.length ? takeRooms(input.reserveRooms, examRooms.end, study.length) : { rooms: [], end: examRooms.end };
    if (!studyRooms) {
      errors.push(`${subject.name}：抽離考試用掉部分預備教室後，剩下的座位不足以容納抽離自習 ${study.length} 人`);
      continue;
    }

    if (exam.length && fixed) {
      for (const code of exam) {
        const f = fixed.get(code)!;
        detaches.push({ code, subjectId: subject.id, purpose: 'exam', roomId: f.roomId, seat: { ...f.seat } });
      }
    } else if (exam.length) {
      const r = seatGroup(examRooms.rooms, exam);
      if (!r.ok) {
        errors.push(`${subject.name}抽離考試：${r.error}`);
        continue;
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
        errors.push(...problems.map((p) => `${subject.name}抽離考試：${p}`));
        continue;
      }
      for (const a of r.assignments) {
        detaches.push({ code: a.code, subjectId: subject.id, purpose: 'exam', roomId: a.classroomId, seat: { row: a.row, depth: a.depth } });
      }
    }

    let i = 0;
    for (const room of studyRooms.rooms) {
      for (const code of study.slice(i, i + room.seatCount)) {
        detaches.push({ code, subjectId: subject.id, purpose: 'study', roomId: room.id });
      }
      i += room.seatCount;
    }
    cursor.set(period, studyRooms.end);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, detaches, special };
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
