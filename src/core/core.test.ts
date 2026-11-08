import { describe, expect, it } from 'vitest';
import { studentCode } from '../data/helpers';
import type { ClassInfo, Classroom, ExamEntry, SeatAssignment, Subject } from '../data/types';
import {
  allocateDetaches,
  applyMarks,
  dataVersion,
  fnv1a64,
  overrideWarnings,
  runSeating,
  seatingVersion,
  roomStats,
  seatExam,
  seatGroup,
  stableStringify,
  suggestMarkMode,
  suggestMarks,
  validateSeating,
} from './index';

const room = (id: string, rows: number, depth: number, seatCount = rows * depth, extra: Partial<Classroom> = {}): Classroom => ({
  id,
  name: id,
  kind: 'class',
  rows,
  depth,
  seatCount,
  ...extra,
});
const codes = (sizes: number[]): string[] =>
  sizes.flatMap((n, i) => Array.from({ length: n }, (_, s) => studentCode(i + 1, s + 1)));
const classes = (n: number, senior = false): ClassInfo[] =>
  Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    name: `班${i + 1}`,
    division: senior ? 'senior' : 'junior',
    ...(senior ? { track: i < n / 2 ? 'science' : 'liberal' } : {}),
    colorIndex: i,
  }));

/** 固定種子的亂數，讓測試可重跑 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

describe('seatGroup / seatExam', () => {
  it('隨機 500 組教室與人數都通過驗證器，且只有最後一間有空位（D73）', () => {
    const rand = rng(1);
    for (let t = 0; t < 500; t++) {
      const nClass = 1 + Math.floor(rand() * 6);
      const sizes = Array.from({ length: nClass }, () => 1 + Math.floor(rand() * 45));
      const total = sizes.reduce((a, b) => a + b, 0);
      const rooms: Classroom[] = [];
      let cap = 0;
      while (cap < total) {
        const rows = 1 + Math.floor(rand() * 8);
        const depth = 1 + Math.floor(rand() * 8);
        const seatCount = 1 + Math.floor(rand() * rows * depth);
        rooms.push(room(`R${rooms.length + 1}`, rows, depth, seatCount));
        cap += seatCount;
      }
      const list = codes(sizes);
      const r = seatExam({ division: 'junior', classes: classes(nClass), classrooms: rooms, codes: list });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (!r.ok) continue;
      rooms.slice(0, -1).forEach((c) => {
        expect(r.assignments.filter((a) => a.classroomId === c.id).length).toBe(c.seatCount);
      });
    }
  });

  it('座位不足時擋下並說明差幾個（D25）', () => {
    const r = seatExam({ division: 'junior', classes: classes(2), classrooms: [room('A', 2, 5)], codes: codes([6, 6]) });
    expect(r).toEqual({ ok: false, errors: ['全體：座位不足：考生 12 人，座位 10 個，還差 2 個'] });
  });

  it('rotation：班序跨教室延續、空位落在最後一間尾端', () => {
    const r = seatGroup([room('A', 2, 3), room('B', 2, 3)], codes([4, 4]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fmt = r.assignments.map((a) => `${a.classroomId}${a.row}-${a.depth}:${a.code}`);
    expect(fmt).toEqual([
      'A1-1:0101', 'A1-2:0102', 'A1-3:0103',
      'A2-1:0201', 'A2-2:0202', 'A2-3:0203',
      'B1-1:0104', 'B1-2:0204',
    ]);
  });

  it('某班用完時同一排接下一班，下一排從輪到的班開始', () => {
    const r = seatGroup([room('A', 3, 3)], codes([2, 4, 3]));
    expect(r.ok && r.assignments.map((a) => `${a.row}-${a.depth}:${a.code}`)).toEqual([
      '1-1:0101', '1-2:0102', '1-3:0201',
      '2-1:0202', '2-2:0203', '2-3:0204',
      '3-1:0301', '3-2:0302', '3-3:0303',
    ]);
  });

  it('高中部：理組、文組只排進同組別教室（D9/D10）', () => {
    const cls = classes(4, true);
    const rooms = [room('S', 2, 5, 10, { track: 'science' }), room('L', 2, 5, 10, { track: 'liberal' })];
    const r = seatExam({ division: 'senior', classes: cls, classrooms: rooms, codes: codes([5, 5, 4, 4]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const a of r.assignments) {
      expect(a.classroomId).toBe(Number(a.code.slice(0, 2)) <= 2 ? 'S' : 'L');
    }
    const bad = seatExam({ division: 'senior', classes: cls, classrooms: [rooms[0]!], codes: codes([5, 5, 4, 4]) });
    expect(bad).toEqual({ ok: false, errors: ['文組沒有可用的教室'] });
  });

  it('預備教室不參與主排座', () => {
    const r = seatExam({
      division: 'junior',
      classes: classes(1),
      classrooms: [room('P', 1, 5, 5, { kind: 'reserve' }), room('A', 1, 5)],
      codes: codes([3]),
    });
    expect(r.ok && r.assignments.every((a) => a.classroomId === 'A')).toBe(true);
  });
});

describe('validateSeating（D25）', () => {
  const rooms = [room('A', 2, 2)];
  const base = { classrooms: rooms, classes: classes(2), codes: ['0101', '0102', '0201'], checkTrack: false };
  const at = (code: string, row: number, depth: number, classroomId = 'A'): SeatAssignment => ({ classroomId, row, depth, code });

  it('合規的結果沒有錯誤', () => {
    expect(validateSeating({ ...base, assignments: [at('0101', 1, 1), at('0102', 1, 2), at('0201', 2, 1)] })).toEqual([]);
  });
  it('擋下編號沒有遞增', () => {
    expect(validateSeating({ ...base, assignments: [at('0102', 1, 1), at('0101', 1, 2), at('0201', 2, 1)] })[0]).toContain('沒有沿座位遞增');
  });
  it('擋下中間空位', () => {
    expect(validateSeating({ ...base, assignments: [at('0101', 1, 1), at('0102', 1, 2), at('0201', 2, 2)] })).toEqual(['A 中間有空位（空位只能在最後）']);
  });
  it('擋下同排穿插', () => {
    const v = validateSeating({
      classrooms: [room('A', 1, 3)],
      classes: classes(2),
      codes: ['0101', '0201', '0102'],
      checkTrack: false,
      assignments: [at('0101', 1, 1), at('0201', 1, 2), at('0102', 1, 3)],
    });
    expect(v).toEqual(['同一排不同班穿插：A 1-3']);
  });
  it('擋下漏排、重複、不存在的座位與名單外考生', () => {
    const v = validateSeating({ ...base, assignments: [at('0101', 1, 1), at('0101', 1, 2), at('0999', 3, 1), at('0301', 2, 1)] });
    expect(v).toEqual(
      expect.arrayContaining([
        '考生排到兩個座位：0101',
        '座位不存在：A 3-1',
        '排到不在名單上的考生：0301',
        '考生沒有座位：0102',
        '考生沒有座位：0201',
      ]),
    );
  });
  it('擋下組別不符與同座位兩人', () => {
    const v = validateSeating({
      classrooms: [room('A', 1, 2, 2, { track: 'science' })],
      classes: classes(2, true),
      codes: ['0101', '0201'],
      checkTrack: true,
      assignments: [at('0101', 1, 1), at('0201', 1, 1)],
    });
    expect(v).toEqual(expect.arrayContaining(['同一座位排了兩人：A 1-1', '考生排進其他組別的教室：0201（A）']));
  });
});

const subjects: Subject[] = [
  { id: 'soc', name: '社會' },
  { id: 'sci', name: '自然' },
  { id: 'lis', name: '英聽' },
];
const entry = (classNo: number, seatNo: number, subjectIds: string[]): ExamEntry => ({ classNo, seatNo, name: '測試', subjectIds });

describe('標示規則（D11/D12/D67）', () => {
  it('標少數；接近一半要使用者裁示（以舊表彙總人數驗證）', () => {
    expect(suggestMarkMode(68, 139)).toEqual({ suggested: 'mark-extra', needsDecision: true }); // E3 理組社會
    expect(suggestMarkMode(93, 139)).toEqual({ suggested: 'mark-absent', needsDecision: false }); // E4 理組社會
    expect(suggestMarkMode(2, 131)).toEqual({ suggested: 'mark-extra', needsDecision: false }); // 文組自然
    expect(suggestMarkMode(131, 131)).toEqual({ suggested: 'none', needsDecision: false });
    expect(suggestMarkMode(0, 131)).toEqual({ suggested: 'none', needsDecision: false });
    expect(suggestMarkMode(5, 10).needsDecision).toBe(true);
  });

  it('依組別計算建議，英聽不參與', () => {
    const cls = classes(2, true);
    const entries = [entry(1, 1, ['soc', 'sci', 'lis']), entry(1, 2, ['sci', 'lis']), entry(1, 3, ['sci', 'lis']), entry(2, 1, ['soc', 'lis'])];
    const s = suggestMarks(entries, cls, subjects);
    expect(s.map((x) => `${x.track}/${x.subjectId}/${x.suggested}`)).toEqual([
      'science/soc/mark-extra',
      'science/sci/none',
      'liberal/soc/none',
      'liberal/sci/none',
    ]);
  });

  it('套用規則產生標記，英聽規則被忽略', () => {
    const cls = classes(2, true);
    const entries = [entry(1, 1, ['soc']), entry(1, 2, []), entry(2, 1, ['sci'])];
    const marks = applyMarks(entries, cls, subjects, [
      { track: 'science', subjectId: 'soc', mode: 'mark-absent' },
      { track: 'liberal', subjectId: 'sci', mode: 'mark-extra' },
      { track: 'science', subjectId: 'lis', mode: 'mark-absent' },
    ]);
    expect(marks).toEqual([
      { code: '0102', subjectId: 'soc', mode: 'absent' },
      { code: '0201', subjectId: 'sci', mode: 'extra' },
    ]);
  });
});

describe('抽離分配（D26/D27）', () => {
  const reserve = [room('P1', 1, 3, 3, { kind: 'reserve' }), room('P2', 1, 2, 2, { kind: 'reserve' }), room('P3', 1, 5, 5, { kind: 'reserve' })];
  const cls = classes(3);

  it('同一科考試與自習用不同教室；自習依班級座號排；不同科重用教室', () => {
    const r = allocateDetaches({
      subjects,
      marks: [
        { code: '0201', subjectId: 'sci', mode: 'extra' },
        { code: '0102', subjectId: 'sci', mode: 'extra' },
        { code: '0301', subjectId: 'sci', mode: 'absent' },
        { code: '0105', subjectId: 'sci', mode: 'absent' },
        { code: '0103', subjectId: 'soc', mode: 'absent' },
      ],
      overrides: [],
      reserveRooms: reserve,
      classes: cls,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detaches).toEqual([
      { code: '0103', subjectId: 'soc', purpose: 'study', roomId: 'P1' },
      { code: '0102', subjectId: 'sci', purpose: 'exam', roomId: 'P1', seat: { row: 1, depth: 1 } },
      { code: '0201', subjectId: 'sci', purpose: 'exam', roomId: 'P1', seat: { row: 1, depth: 2 } },
      { code: '0105', subjectId: 'sci', purpose: 'study', roomId: 'P2' },
      { code: '0301', subjectId: 'sci', purpose: 'study', roomId: 'P2' },
    ]);
  });

  it('自習人數超過一間時依教室順序分下去', () => {
    const marks = ['0101', '0102', '0103', '0104', '0105', '0106'].map((code) => ({ code, subjectId: 'soc', mode: 'absent' as const }));
    const r = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: reserve, classes: cls });
    expect(r.ok && r.detaches.map((d) => `${d.code}@${d.roomId}`)).toEqual([
      '0101@P1', '0102@P1', '0103@P1', '0104@P2', '0105@P2', '0106@P3',
    ]);
  });

  it('單人特例不佔預備教室、標註地點', () => {
    const r = allocateDetaches({
      subjects,
      marks: [{ code: '0101', subjectId: 'sci', mode: 'extra' }],
      overrides: [{ kind: 'single', code: '0101', location: '教務處', purpose: 'exam' }],
      reserveRooms: reserve,
      classes: cls,
    });
    expect(r).toEqual({ ok: true, detaches: [], special: [{ code: '0101', subjectId: 'sci', purpose: 'exam', location: '教務處' }] });
  });

  it('預備教室不足時擋下', () => {
    const marks = Array.from({ length: 11 }, (_, i) => ({ code: studentCode(1, i + 1), subjectId: 'sci', mode: 'extra' as const }));
    const r = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: reserve, classes: cls });
    expect(r).toEqual({ ok: false, errors: ['自然：預備教室座位不足以容納抽離考試 11 人'] });
  });

  it('覆寫對不上名單時警告（D23）', () => {
    expect(
      overrideWarnings(
        [
          { kind: 'single', code: '0999', location: '教務處', purpose: 'study' },
          { kind: 'single', code: '0101', location: ' ', purpose: 'study' },
        ],
        ['0101'],
      ),
    ).toEqual(['單人特例的考生不在本次名單：0999', '單人特例沒有填地點：0101']);
  });
});

describe('座位表統計（D40）', () => {
  it('依該教室計算每班人數、總人數、各科人數與抽離', () => {
    const assignments: SeatAssignment[] = [
      { classroomId: 'A', row: 1, depth: 1, code: '0101' },
      { classroomId: 'A', row: 1, depth: 2, code: '0102' },
      { classroomId: 'A', row: 2, depth: 1, code: '0201' },
      { classroomId: 'B', row: 1, depth: 1, code: '0202' },
    ];
    const entries = [entry(1, 1, ['soc', 'sci']), entry(1, 2, ['sci']), entry(2, 1, ['soc']), entry(2, 2, ['soc'])];
    const s = roomStats('A', assignments, entries, subjects, [{ code: '0101', subjectId: 'sci', purpose: 'exam', roomId: 'P1' }]);
    expect(s).toEqual({
      classroomId: 'A',
      total: 3,
      perClass: [
        { classNo: 1, count: 2 },
        { classNo: 2, count: 1 },
      ],
      perSubject: [
        { subjectId: 'soc', taking: 2, detachedOut: 0, inRoom: 2, inRoomPerClass: [{ classNo: 1, count: 1 }, { classNo: 2, count: 1 }] },
        { subjectId: 'sci', taking: 2, detachedOut: 1, inRoom: 1, inRoomPerClass: [{ classNo: 1, count: 1 }] },
        { subjectId: 'lis', taking: 0, detachedOut: 0, inRoom: 0, inRoomPerClass: [] },
      ],
    });
  });

  it('單人特例到他處考試，也不算在本教室考（D26）', () => {
    const assignments: SeatAssignment[] = [{ classroomId: 'A', row: 1, depth: 1, code: '0101' }];
    const s = roomStats('A', assignments, [entry(1, 1, ['sci'])], subjects, [], [{ code: '0101', subjectId: 'sci', purpose: 'exam' }]);
    expect(s.perSubject[1]).toEqual({ subjectId: 'sci', taking: 1, detachedOut: 1, inRoom: 0, inRoomPerClass: [] });
  });
});

describe('資料版本碼（D66）', () => {
  it('FNV-1a 64 符合標準測試向量', () => {
    expect(fnv1a64('')).toBe('CBF29CE484222325');
    expect(fnv1a64('a')).toBe('AF63DC4C8601EC8C');
    expect(fnv1a64('foobar')).toBe('85944171F73967E8');
  });
  it('鍵順序不影響、內容改變就不同', () => {
    expect(stableStringify({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe('{"a":[2,{"c":3}],"b":1}');
    const v = dataVersion({ a: 1, b: '名單' });
    expect(v).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(dataVersion({ b: '名單', a: 1 })).toBe(v);
    expect(dataVersion({ a: 2, b: '名單' })).not.toBe(v);
  });
});

describe('runSeating 整合入口', () => {
  const base = {
    examId: 'E1',
    division: 'senior' as const,
    classes: classes(2, true),
    classrooms: [
      room('S', 1, 3, 3, { track: 'science' }),
      room('L', 1, 3, 3, { track: 'liberal' }),
      room('P', 1, 4, 4, { kind: 'reserve' }),
    ],
    entries: [entry(1, 1, ['soc']), entry(1, 2, []), entry(2, 1, ['soc', 'sci'])],
    subjects,
    markRules: [
      { track: 'science' as const, subjectId: 'soc', mode: 'mark-absent' as const },
      { track: 'liberal' as const, subjectId: 'sci', mode: 'mark-extra' as const },
    ],
    overrides: [],
    now: '2026-11-08T10:00:00.000Z',
  };

  it('一次產生座位、標記、抽離與版本碼', () => {
    const r = runSeating(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.assignments.map((a) => `${a.classroomId}:${a.code}`)).toEqual(['S:0101', 'S:0102', 'L:0201']);
    expect(r.result.marks).toEqual([
      { code: '0102', subjectId: 'soc', mode: 'absent' },
      { code: '0201', subjectId: 'sci', mode: 'extra' },
    ]);
    // 依科目順序（社會、自然）；不同科重用同一間預備教室
    expect(r.result.detaches).toEqual([
      { code: '0102', subjectId: 'soc', purpose: 'study', roomId: 'P' },
      { code: '0201', subjectId: 'sci', purpose: 'exam', roomId: 'P', seat: { row: 1, depth: 1 } },
    ]);
    // 產生時間不影響版本碼，名單改了就不同
    expect(r.result.dataVersion).toBe(seatingVersion({ ...base, now: '2027-01-01T00:00:00.000Z' }));
    expect(seatingVersion({ ...base, entries: base.entries.slice(0, 2) })).not.toBe(r.result.dataVersion);
  });

  it('座位不足時整體擋下', () => {
    const r = runSeating({ ...base, classrooms: base.classrooms.slice(1) });
    expect(r).toEqual({ ok: false, errors: ['理組沒有可用的教室'] });
  });
});
