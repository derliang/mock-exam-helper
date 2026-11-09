/**
 * 一次模擬考的主排座（D9、D10、D24、D25）：
 * 國中部全體一組、排進全部班級教室；高中部理組、文組各自一組，只排進同組別的班級教室。
 * 預備教室不參與主排座（D6）。排完一律走驗證器，不合規則就擋下。
 */
import type { ClassInfo, Classroom, Division, SeatAssignment, StudentCode, Track } from '../data/types';
import { parseStudentCode } from '../data/helpers';
import { seatGroup } from './seating';
import { validateSeating } from './validate';

export interface SeatExamInput {
  division: Division;
  classes: readonly ClassInfo[];
  /** 本次勾選的教室（依清單順序）；預備教室會被略過 */
  classrooms: readonly Classroom[];
  codes: readonly StudentCode[];
  /** 逐人指定文理組（分科）：有的人以它為準，沒有的看班級 */
  trackOf?: ReadonlyMap<StudentCode, Track>;
}

export type SeatExamResult =
  | { ok: true; assignments: SeatAssignment[] }
  | { ok: false; errors: string[] };

const TRACK_NAME: Record<Track, string> = { science: '理組', liberal: '文組' };

export function seatExam(input: SeatExamInput): SeatExamResult {
  const rooms = input.classrooms.filter((c) => c.kind === 'class');
  const errors: string[] = [];
  const groups: { label: string; rooms: Classroom[]; codes: StudentCode[] }[] = [];

  if (input.division === 'junior') {
    groups.push({ label: '全體', rooms, codes: [...input.codes] });
  } else {
    const classTrack = new Map(input.classes.map((c) => [c.no, c.track]));
    const byTrack: Record<Track, StudentCode[]> = { science: [], liberal: [] };
    for (const code of input.codes) {
      const p = parseStudentCode(code);
      const track = input.trackOf?.get(code) ?? (p ? classTrack.get(p.classNo) : undefined);
      if (!p) errors.push(`考生編號格式不正確：${code}`);
      else if (!track) errors.push(`第 ${p.classNo} 班沒有設定組別`);
      else byTrack[track].push(code);
    }
    for (const t of ['science', 'liberal'] as const) {
      if (byTrack[t].length === 0) continue;
      groups.push({ label: TRACK_NAME[t], rooms: rooms.filter((r) => r.track === t), codes: byTrack[t] });
    }
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  const assignments: SeatAssignment[] = [];
  for (const g of groups) {
    if (g.codes.length && g.rooms.length === 0) {
      errors.push(`${g.label}沒有可用的教室`);
      continue;
    }
    const r = seatGroup(g.rooms, g.codes);
    if (r.ok) assignments.push(...r.assignments);
    else errors.push(`${g.label}：${r.error}`);
  }
  if (errors.length) return { ok: false, errors };

  const problems = validateSeating({
    classrooms: rooms,
    classes: input.classes,
    codes: input.codes,
    assignments,
    checkTrack: input.division === 'senior',
    ...(input.trackOf ? { trackOf: input.trackOf } : {}),
  });
  if (problems.length) return { ok: false, errors: problems };
  return { ok: true, assignments };
}
