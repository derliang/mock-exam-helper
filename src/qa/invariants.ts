/**
 * 不變式檢查（獨立於 src/core/validate.ts 重新實作，避免「用同一把尺量自己」）。
 * 回傳違反的描述；空陣列＝全部成立。編號對應 docs/archive/dispatch/完工-F.md 的不變式清單。
 */
import { classroomSeats, parseStudentCode, seatLabel, studentCode } from '../data/helpers';
import type { Classroom, SeatingResult } from '../data/types';
import { isListeningSubject, type RunSeatingInput } from '../core';
import { mixedMarkCodes, overridePurpose, type SpecialPlacement } from '../core/detach';

const codeOfEntry = (e: { classNo: number; seatNo: number }) => studentCode(e.classNo, e.seatNo);
/** D79：實際應排座的名單（預設排除全科缺考者） */
export const seatableEntries = <E extends { classNo: number; seatNo: number; subjectIds: string[] }>(input: { entries: readonly E[]; seatFullyAbsent?: boolean }): E[] =>
  input.entries.filter((e) => input.seatFullyAbsent || e.subjectIds.length > 0);

/** 主座位表不變式（INV-1～INV-6） */
export function checkMainSeating(input: RunSeatingInput, r: SeatingResult): string[] {
  const bad: string[] = [];
  const rooms = new Map(input.classrooms.map((c) => [c.id, c]));
  const classTrack = new Map(input.classes.map((c) => [c.no, c.track]));
  const expected = seatableEntries(input).map(codeOfEntry);

  // INV-1 每位考生恰一座：人數相等、無重複、無遺漏、無多餘
  const seenCode = new Map<string, number>();
  for (const a of r.assignments) seenCode.set(a.code, (seenCode.get(a.code) ?? 0) + 1);
  if (r.assignments.length !== expected.length) bad.push(`INV-1 人數 ${r.assignments.length} ≠ 名單 ${expected.length}`);
  for (const c of expected) if (seenCode.get(c) !== 1) bad.push(`INV-1 ${c} 座位數 ${seenCode.get(c) ?? 0}`);
  const expSet = new Set(expected);
  for (const c of seenCode.keys()) if (!expSet.has(c)) bad.push(`INV-1 多餘考生 ${c}`);

  // INV-2 只在合法座位：教室存在、是班級教室、座標在可用座位內、座位不重複
  // INV-3 高中部只坐同組別教室
  const seats = new Set<string>();
  const order = new Map<string, number>();
  for (const c of input.classrooms) classroomSeats(c).forEach((s, i) => order.set(`${c.id}/${seatLabel(s)}`, i));
  for (const a of r.assignments) {
    const room = rooms.get(a.classroomId);
    const key = `${a.classroomId}/${seatLabel(a)}`;
    if (!room) bad.push(`INV-2 教室不存在 ${a.classroomId}`);
    else if (room.kind !== 'class') bad.push(`INV-2 主排座進預備教室 ${a.code}`);
    if (!order.has(key)) bad.push(`INV-2 非法座位 ${key}`);
    if (seats.has(key)) bad.push(`INV-2 座位重複 ${key}`);
    seats.add(key);
    if (input.division === 'senior') {
      const p = parseStudentCode(a.code);
      if (p && room && room.track !== classTrack.get(p.classNo)) bad.push(`INV-3 組別不符 ${a.code}`);
    }
  }

  // INV-4 同班連續學號：沿座位順序嚴格遞增，且恰是該班名單
  const roomIdx = new Map(input.classrooms.map((c, i) => [c.id, i]));
  const byClass = new Map<number, { room: number; ord: number; seatNo: number }[]>();
  for (const a of r.assignments) {
    const p = parseStudentCode(a.code);
    if (!p) continue;
    const l = byClass.get(p.classNo) ?? [];
    l.push({ room: roomIdx.get(a.classroomId) ?? -1, ord: order.get(`${a.classroomId}/${seatLabel(a)}`) ?? -1, seatNo: p.seatNo });
    byClass.set(p.classNo, l);
  }
  for (const [cls, l] of byClass) {
    l.sort((x, y) => x.room - y.room || x.ord - y.ord);
    for (let i = 1; i < l.length; i++) if (l[i - 1]!.seatNo >= l[i]!.seatNo) bad.push(`INV-4 班 ${cls} 學號沒有遞增`);
    const want = seatableEntries(input).filter((e) => e.classNo === cls).map((e) => e.seatNo).sort((a, b) => a - b);
    if (JSON.stringify(l.map((x) => x.seatNo)) !== JSON.stringify(want)) bad.push(`INV-4 班 ${cls} 學號集合與名單不同`);
  }

  // INV-5 空位只在最後：每間教室已坐座位是座位順序的前段；同組別中，最後一間有人的教室之前都坐滿、之後都空
  const used = new Map<string, Set<number>>();
  for (const a of r.assignments) {
    const s = used.get(a.classroomId) ?? new Set<number>();
    s.add(order.get(`${a.classroomId}/${seatLabel(a)}`) ?? -1);
    used.set(a.classroomId, s);
  }
  const groups = new Map<string, Classroom[]>();
  for (const c of input.classrooms.filter((x) => x.kind === 'class')) {
    const k = input.division === 'senior' ? (c.track ?? '') : 'all';
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const list of groups.values()) {
    let lastUsed = -1;
    list.forEach((c, i) => {
      if ((used.get(c.id)?.size ?? 0) > 0) lastUsed = i;
    });
    list.forEach((c, i) => {
      const s = used.get(c.id) ?? new Set<number>();
      for (let k = 0; k < s.size; k++) {
        if (!s.has(k)) {
          bad.push(`INV-5 ${c.name} 中間有空位`);
          break;
        }
      }
      if (i < lastUsed && s.size !== c.seatCount) bad.push(`INV-5 ${c.name} 後面還有教室有人，這間卻沒坐滿`);
      if (i > lastUsed && s.size !== 0) bad.push(`INV-5 ${c.name} 應為空`);
    });
  }

  // INV-6 同一排內各班各自連續、不穿插
  const rowSeq = new Map<string, number[]>();
  const sorted = [...r.assignments].sort(
    (a, b) => (roomIdx.get(a.classroomId) ?? 0) - (roomIdx.get(b.classroomId) ?? 0) || a.row - b.row || a.depth - b.depth,
  );
  for (const a of sorted) {
    const p = parseStudentCode(a.code);
    if (!p) continue;
    const k = `${a.classroomId}/${a.row}`;
    rowSeq.set(k, [...(rowSeq.get(k) ?? []), p.classNo]);
  }
  for (const [k, l] of rowSeq) {
    const seen = new Set<number>();
    l.forEach((c, i) => {
      if (i > 0 && l[i - 1] !== c && seen.has(c)) bad.push(`INV-6 ${k} 班 ${c} 穿插`);
      seen.add(c);
    });
  }
  return bad;
}

/** 標示與抽離不變式（INV-8～INV-12） */
export function checkMarksAndDetach(input: RunSeatingInput, r: SeatingResult, special: SpecialPlacement[]): string[] {
  const bad: string[] = [];
  const classTrack = new Map(input.classes.map((c) => [c.no, c.track]));
  const listening = new Set(input.subjects.filter(isListeningSubject).map((s) => s.id));
  const override = new Map(input.overrides.map((o) => [o.code, o]));

  // INV-8 標示完全由規則決定：不考→absent、加考→extra；英聽永不標；沒有重複
  const want = new Set<string>();
  for (const e of seatableEntries(input)) {
    const code = codeOfEntry(e);
    for (const rule of input.markRules) {
      if (rule.track !== classTrack.get(e.classNo) || listening.has(rule.subjectId)) continue;
      const takes = e.subjectIds.includes(rule.subjectId);
      if (rule.mode === 'mark-absent' && !takes) want.add(`${code}/${rule.subjectId}/absent`);
      if (rule.mode === 'mark-extra' && takes) want.add(`${code}/${rule.subjectId}/extra`);
    }
  }
  const got = r.marks.map((m) => `${m.code}/${m.subjectId}/${m.mode}`);
  if (new Set(got).size !== got.length) bad.push('INV-8 標示重複');
  if ([...want].sort().join() !== [...new Set(got)].sort().join()) bad.push(`INV-8 標示與規則不符（應 ${want.size}，實 ${got.length}）`);

  // INV-9 抽離守恆：每筆標示恰好去一處（抽離考試／抽離自習／單人特例），沒有多出的
  const place = new Map<string, number>();
  for (const d of r.detaches) {
    const m = r.marks.find((x) => x.code === d.code && x.subjectId === d.subjectId);
    if (!m) bad.push(`INV-9 抽離沒有對應標示 ${d.code}/${d.subjectId}`);
    else if (!override.has(d.code) && (m.mode === 'extra' ? 'exam' : 'study') !== d.purpose) bad.push(`INV-9 抽離目的與標示不符 ${d.code}/${d.subjectId}`);
    if (override.has(d.code)) bad.push(`INV-9 單人特例又被抽離 ${d.code}`);
    const k = `${d.code}/${d.subjectId}`;
    place.set(k, (place.get(k) ?? 0) + 1);
  }
  for (const s of special) {
    const k = `${s.code}/${s.subjectId}`;
    place.set(k, (place.get(k) ?? 0) + 1);
    if (s.location !== override.get(s.code)?.location) bad.push(`INV-9 特例地點不符 ${s.code}`);
    if (s.purpose !== overridePurpose(override.get(s.code)!, s.subjectId, r.marks.find((x) => x.code === s.code && x.subjectId === s.subjectId)!.mode, mixedMarkCodes(r.marks).has(s.code))) bad.push(`INV-9b 特例歸類沒有依手動設定 ${s.code}`); // D80
  }
  for (const m of r.marks) {
    const n = place.get(`${m.code}/${m.subjectId}`) ?? 0;
    if (n !== 1) bad.push(`INV-9 標示 ${m.code}/${m.subjectId} 去處數 ${n}`);
  }
  if (place.size !== r.marks.length) bad.push('INV-9 去處總數與標示數不同');

  // INV-10 抽離只進預備教室、座位合法且同科同教室不重複；考試有座位、自習沒有；自習不超載
  const rooms = new Map(input.classrooms.map((c) => [c.id, c]));
  const seatUse = new Set<string>();
  const studyUse = new Map<string, number>();
  const examRooms = new Map<string, Set<string>>();
  const studyRooms = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => m.set(k, (m.get(k) ?? new Set<string>()).add(v));
  for (const d of r.detaches) {
    const room = rooms.get(d.roomId);
    if (!room || room.kind !== 'reserve') {
      bad.push(`INV-10 抽離進非預備教室 ${d.code}`);
      continue;
    }
    if (d.purpose === 'exam') {
      if (!d.seat) {
        bad.push(`INV-10 抽離考試沒有座位 ${d.code}`);
        continue;
      }
      const seat = d.seat;
      if (!classroomSeats(room).some((s) => s.row === seat.row && s.depth === seat.depth)) bad.push(`INV-10 抽離座位非法 ${d.roomId}/${seatLabel(seat)}`);
      const k = `${d.subjectId}/${d.roomId}/${seatLabel(seat)}`;
      if (seatUse.has(k)) bad.push(`INV-10 抽離座位重複 ${k}`);
      seatUse.add(k);
      add(examRooms, d.subjectId, d.roomId);
    } else {
      if (d.seat) bad.push(`INV-10 抽離自習不該有座位 ${d.code}`);
      const k = `${d.subjectId}/${d.roomId}`;
      studyUse.set(k, (studyUse.get(k) ?? 0) + 1);
      if (studyUse.get(k)! > room.seatCount) bad.push(`INV-10 自習教室超載 ${k}`);
      add(studyRooms, d.subjectId, d.roomId);
    }
  }
  // INV-11 同科的考試教室與自習教室不重疊
  for (const [sid, ex] of examRooms) for (const rm of studyRooms.get(sid) ?? []) if (ex.has(rm)) bad.push(`INV-11 ${sid} 考試與自習共用教室 ${rm}`);

  // INV-12 抽離考試座位：每科每間教室已坐座位為前段（空位只在最後）；整科同班學號沿座位遞增
  const perSubject = new Map<string, { code: string; room: number; ord: number }[]>();
  const perRoom = new Map<string, Set<number>>();
  for (const d of r.detaches) {
    if (d.purpose !== 'exam' || !d.seat) continue;
    const room = rooms.get(d.roomId);
    if (!room) continue;
    const seat = d.seat;
    const ord = classroomSeats(room).findIndex((s) => s.row === seat.row && s.depth === seat.depth);
    perSubject.set(d.subjectId, [...(perSubject.get(d.subjectId) ?? []), { code: d.code, room: input.classrooms.findIndex((c) => c.id === d.roomId), ord }]);
    const k = `${d.subjectId}/${d.roomId}`;
    perRoom.set(k, (perRoom.get(k) ?? new Set<number>()).add(ord));
  }
  for (const [k, s] of perRoom) for (let i = 0; i < s.size; i++) if (!s.has(i)) { bad.push(`INV-12 ${k} 抽離座位中間有空位`); break; }
  for (const [sid, l] of perSubject) {
    l.sort((a, b) => a.room - b.room || a.ord - b.ord);
    const last = new Map<number, number>();
    for (const x of l) {
      const p = parseStudentCode(x.code);
      if (!p) continue;
      if ((last.get(p.classNo) ?? 0) >= p.seatNo) bad.push(`INV-12 ${sid} 抽離考試班 ${p.classNo} 學號沒有遞增`);
      last.set(p.classNo, p.seatNo);
    }
  }
  return bad;
}
