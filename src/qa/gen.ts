/**
 * 性質測試用的固定種子隨機產生器與資料產生器（只產生虛構資料，姓名一律「甲生NNNN」）。
 * 同一個種子永遠得到同一組資料，失敗時印出種子即可重現。
 */
import type { ClassInfo, Classroom, Division, ExamEntry, MarkRule, Override, Subject, Track } from '../data/types';
import type { RunSeatingInput } from '../core/run';

/** mulberry32：小而快、結果固定的偽隨機數 */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p: number): boolean => next() < p,
    pick: <T>(l: readonly T[]): T => l[Math.floor(next() * l.length)]!,
  };
}
export type Rng = ReturnType<typeof makeRng>;

export interface GenOptions {
  /** 強制學部 */
  division?: Division;
  /** true＝座位一定夠；false＝刻意不夠；省略＝夠 */
  enough?: boolean;
}

const SUBJECT_POOL: Subject[] = [
  { id: 'chi', name: '國文' },
  { id: 'eng', name: '英文' },
  { id: 'lis', name: '英聽' },
  { id: 'math', name: '數學' },
  { id: 'sci', name: '自然' },
  { id: 'soc', name: '社會' },
  { id: 'wri', name: '寫作測驗' },
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function genCase(rng: Rng, o: GenOptions = {}): RunSeatingInput {
  const division: Division = o.division ?? (rng.chance(0.5) ? 'senior' : 'junior');
  const nClasses = rng.int(1, 8);
  const classes: ClassInfo[] = [];
  for (let no = 1; no <= nClasses; no++) {
    const c: ClassInfo = { no, name: `班${no}`, division, colorIndex: no % 12 };
    if (division === 'senior') c.track = rng.chance(0.5) ? 'science' : 'liberal';
    classes.push(c);
  }
  const subjects = SUBJECT_POOL.filter(() => rng.chance(0.7));
  if (subjects.length === 0) subjects.push(SUBJECT_POOL[0]!);

  const entries: ExamEntry[] = [];
  for (const c of classes) {
    const n = rng.int(0, 50);
    // 座號可能跳號（缺人），但仍遞增且 ≤ 99
    let seatNo = 0;
    for (let i = 0; i < n; i++) {
      seatNo += rng.chance(0.9) ? 1 : rng.int(2, 3);
      if (seatNo > 99) break;
      const rate = rng.pick([0, 0.1, 0.5, 0.9, 1]);
      entries.push({
        classNo: c.no,
        seatNo,
        name: `甲生${pad2(c.no)}${pad2(seatNo)}`,
        subjectIds: subjects.filter(() => rng.chance(rate)).map((s) => s.id),
      });
    }
  }

  const groups: (Track | undefined)[] = division === 'senior' ? ['science', 'liberal'] : [undefined];
  const classrooms: Classroom[] = [];
  let id = 0;
  for (const g of groups) {
    const need = entries.filter((e) => (g ? classes.find((c) => c.no === e.classNo)?.track === g : true)).length;
    let cap = 0;
    const target = o.enough === false ? Math.floor(need * rng.next() * 0.9) : need + rng.int(0, 15);
    while (cap < target && classrooms.length < 80) {
      const rows = rng.int(1, 8);
      const depth = rng.int(1, 8);
      const seatCount = rng.chance(0.5) ? rows * depth : rng.int(1, rows * depth);
      const room: Classroom = { id: `R${++id}`, name: `教室${id}`, kind: 'class', rows, depth, seatCount };
      if (g) room.track = g;
      classrooms.push(room);
      cap += seatCount;
    }
  }
  const nReserve = rng.int(3, 10);
  for (let i = 0; i < nReserve; i++) {
    const rows = rng.int(2, 8);
    const depth = rng.int(2, 8);
    classrooms.push({ id: `P${i + 1}`, name: `預備${i + 1}`, kind: 'reserve', rows, depth, seatCount: rng.chance(0.5) ? rows * depth : rng.int(1, rows * depth) });
  }

  const markRules: MarkRule[] = [];
  for (const t of groups) {
    for (const s of subjects) {
      const mode = rng.pick(['none', 'mark-absent', 'mark-extra'] as const);
      markRules.push({ ...(t ? { track: t } : {}), subjectId: s.id, mode });
    }
  }
  const overrides: Override[] = [];
  const nOv = rng.int(0, 3);
  for (let i = 0; i < nOv && entries.length; i++) {
    const e = rng.pick(entries);
    const code = pad2(e.classNo) + pad2(e.seatNo);
    if (overrides.some((x) => x.code === code)) continue;
    overrides.push({ kind: 'single', code, location: '教務處', purpose: rng.pick(['exam', 'study'] as const) });
  }
  return { examId: 'E1', division, classes, classrooms, entries, subjects, markRules, overrides, now: '2026-11-08T08:00:00Z' };
}
