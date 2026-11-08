/**
 * 座位表統計（D40、D57）：全部依該教室計算——每班考生人數、教室總人數、各科考試人數。
 * 各科：taking＝該教室考生中有考這科的人；detachedOut＝其中抽離到預備教室考的人；
 * inRoom＝在本教室考這科的人（taking − detachedOut）。
 */
import type { Detach, ExamEntry, SeatAssignment, SeatingResult, Subject } from '../data/types';
import { studentCode } from '../data/helpers';
import { mixedMarkCodes, overridePurpose } from './detach';

export interface SubjectCount {
  subjectId: string;
  taking: number;
  detachedOut: number;
  inRoom: number;
  /** inRoom 依班級拆開（座位表統計表用，D40） */
  inRoomPerClass: { classNo: number; count: number }[];
}

export interface RoomStats {
  classroomId: string;
  total: number;
  /** 班級序號 → 人數，依班級排序 */
  perClass: { classNo: number; count: number }[];
  perSubject: SubjectCount[];
}

export function roomStats(
  classroomId: string,
  assignments: readonly SeatAssignment[],
  entries: readonly ExamEntry[],
  subjects: readonly Subject[],
  detaches: readonly Detach[],
  /** 單人特例（D26）：到他處考試的人也不在本教室考該科；舊呼叫不傳時視為沒有 */
  special: readonly { code: string; subjectId: string; purpose: 'exam' | 'study' }[] = [],
): RoomStats {
  const entryByCode = new Map(entries.map((e) => [studentCode(e.classNo, e.seatNo), e]));
  const here = assignments.filter((a) => a.classroomId === classroomId);
  const perClass = new Map<number, number>();
  const people: ExamEntry[] = [];
  for (const a of here) {
    const e = entryByCode.get(a.code);
    if (!e) continue;
    people.push(e);
    perClass.set(e.classNo, (perClass.get(e.classNo) ?? 0) + 1);
  }
  const codesHere = new Set(here.map((a) => a.code));
  const perSubject = subjects.map((s) => {
    const taking = people.filter((e) => e.subjectIds.includes(s.id)).length;
    const out = new Set<string>();
    for (const d of [...detaches, ...special]) if (d.subjectId === s.id && d.purpose === 'exam' && codesHere.has(d.code)) out.add(d.code);
    const inRoomPerClass = new Map<number, number>();
    for (const e of people) {
      if (!e.subjectIds.includes(s.id) || out.has(studentCode(e.classNo, e.seatNo))) continue;
      inRoomPerClass.set(e.classNo, (inRoomPerClass.get(e.classNo) ?? 0) + 1);
    }
    return {
      subjectId: s.id, taking, detachedOut: out.size, inRoom: taking - out.size,
      inRoomPerClass: [...inRoomPerClass.entries()].sort((a, b) => a[0] - b[0]).map(([classNo, count]) => ({ classNo, count })),
    };
  });
  return {
    classroomId,
    total: here.length,
    perClass: [...perClass.entries()].sort((a, b) => a[0] - b[0]).map(([classNo, count]) => ({ classNo, count })),
    perSubject,
  };
}

/** 抽離考試的預備教室統計（D7：格式同預備教室）：每班人數與總人數 */
export function detachRoomCounts(detaches: readonly Detach[], subjectId: string, roomId: string): { total: number; perClass: { classNo: number; count: number }[] } {
  const list = detaches.filter((d) => d.subjectId === subjectId && d.roomId === roomId);
  const perClass = new Map<number, number>();
  for (const d of list) {
    const classNo = Number(d.code.slice(0, 2));
    perClass.set(classNo, (perClass.get(classNo) ?? 0) + 1);
  }
  return {
    total: list.length,
    perClass: [...perClass.entries()].sort((a, b) => a[0] - b[0]).map(([classNo, count]) => ({ classNo, count })),
  };
}

/** 單人特例由結果的標示與覆寫推回（結果只存覆寫，不存 special）：被覆寫的人，他每個被標示的科目都改去自填地點 */
export function specialOf(result: SeatingResult): { code: string; subjectId: string; purpose: 'exam' | 'study'; location: string }[] {
  const o = new Map(result.overrides.map((x) => [x.code, x]));
  const mixed = mixedMarkCodes(result.marks);
  return result.marks.filter((m) => o.has(m.code)).map((m) => ({
    code: m.code, subjectId: m.subjectId, purpose: overridePurpose(o.get(m.code)!, m.subjectId, m.mode, mixed.has(m.code)), location: o.get(m.code)!.location,
  }));
}

/* ---------- 領卷清單（H3）：每間教室每科試卷、答案卡應有份數 ---------- */

export interface PickupSubject {
  subjectId: string;
  /** 本教室要領的份數（試卷與答案卡相同）：班級教室＝在這裡考的人；預備教室＝抽離到這裡考試的人 */
  count: number;
  /** 班級教室：這科抽離到預備教室考試的人數（不計入本教室份數，由預備教室領） */
  detachedOut: number;
  /** 單人特例（D26）：這間教室的人到他處考試的人數（不計入本教室份數） */
  elsewhere: number;
  /** 單人特例的自填地點（去重） */
  locations: string[];
}

export interface PickupRoom {
  classroomId: string;
  kind: 'class' | 'reserve';
  subjects: PickupSubject[];
  /** 本教室各科份數合計 */
  total: number;
}

/**
 * 份數＝實際會拿到這份試卷的人數。規則：
 * - 班級教室：該教室座位上、這科有考（考試名單的科目含此科）的人；全科缺考者沒有科目，自然不計（D79）。
 * - 抽離考試（D27）的人改到預備教室領，不計本教室；抽離自習不考試，兩邊都不計。
 * - 單人特例（D26、D80，以覆寫為準）：到他處考試或自習，都不計本教室；考試者另記在「到他處」。
 * - 預備教室：抽離考試且去這間的人數（每節科目各自計算，D27）。
 */
export function pickupCounts(i: {
  rooms: readonly { id: string; kind: 'class' | 'reserve' }[];
  assignments: readonly SeatAssignment[];
  entries: readonly ExamEntry[];
  subjects: readonly Subject[];
  detaches: readonly Detach[];
  special?: readonly { code: string; subjectId: string; purpose: 'exam' | 'study'; location?: string }[];
}): PickupRoom[] {
  const special = i.special ?? [];
  const entryByCode = new Map(i.entries.map((e) => [studentCode(e.classNo, e.seatNo), e]));
  return i.rooms.map((room) => {
    const here = room.kind === 'class' ? i.assignments.filter((a) => a.classroomId === room.id) : [];
    const subjects = i.subjects.map((s): PickupSubject => {
      if (room.kind === 'reserve') {
        const count = i.detaches.filter((d) => d.roomId === room.id && d.subjectId === s.id && d.purpose === 'exam').length;
        return { subjectId: s.id, count, detachedOut: 0, elsewhere: 0, locations: [] };
      }
      const sp = new Map(special.filter((x) => x.subjectId === s.id).map((x) => [x.code, x]));
      const dt = new Map(i.detaches.filter((d) => d.subjectId === s.id).map((d) => [d.code, d]));
      let count = 0;
      let detachedOut = 0;
      let elsewhere = 0;
      const locations = new Set<string>();
      for (const a of here) {
        const sx = sp.get(a.code);
        if (sx) {
          if (sx.purpose === 'exam') {
            elsewhere++;
            if (sx.location) locations.add(sx.location);
          }
          continue;
        }
        const d = dt.get(a.code);
        if (d) {
          if (d.purpose === 'exam') detachedOut++;
          continue;
        }
        if (entryByCode.get(a.code)?.subjectIds.includes(s.id)) count++;
      }
      return { subjectId: s.id, count, detachedOut, elsewhere, locations: [...locations] };
    });
    return { classroomId: room.id, kind: room.kind, subjects, total: subjects.reduce((n, x) => n + x.count, 0) };
  });
}
