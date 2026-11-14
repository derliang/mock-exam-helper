/**
 * D99 引擎（planD99）的針對性單元測試：驗收案例（d99.test.ts）沒涵蓋的規則、替代方案核可流程、文理組、
 * 教室資料轉換，以及大小資料的效能量測。全部匿名假資料。
 */
import { describe, expect, it } from 'vitest';
import type { ClassInfo, Classroom } from '../../data/types';
import { classroomSeats, emptySeatCount, isValidClassroom, seatSlotCount, studyCapacityOf } from '../../data/helpers';
import { seatingVersion } from '../run';
import { checkPlan, computeMetrics, type PlanInput, type PlanOutput, type PlanStudent } from './contract';
import { planD99 } from './engine';
import { classRoom, grid, makeClass, makeStudents, reserveRoom } from './fixtures';
import { toPlanRooms } from './rooms';

const PHY = { s1: 'phy' };
const examRooms = (out: PlanOutput, slot: string): string[] =>
  Object.entries(out.usage[slot] ?? {}).filter(([, u]) => u === 'exam').map(([id]) => id).sort();

describe('同分決勝（G-25；DESIGN 10.14）', () => {
  it('班級教室依班序靠前者優先、綜合教室排後', () => {
    // 兩班各 10 人全考物理，任選一間都同分 → 第 1 班教室
    const students = [...makeClass(1, 10, () => PHY), ...makeClass(2, 10, () => PHY)];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [reserveRoom('R1', grid(3, 7)), classRoom(2, grid(3, 7)), classRoom(1, grid(3, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = planD99(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(examRooms(out, 's1')).toEqual(['C1']);
    // 座位：第 1 排第 1 班、第 2 排第 2 班，班內依座號
    const row1 = out.exams.filter((e) => e.row === 1).sort((a, b) => a.depth - b.depth).map((e) => e.code);
    expect(row1).toEqual(['0101', '0102', '0103', '0104', '0105', '0106', '0107']);
  });
  it('只剩綜合教室同分時，取清單順序在前（編號小）者', () => {
    const students = makeClass(1, 10, () => PHY);
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [reserveRoom('R1', grid(3, 7)), reserveRoom('R2', grid(3, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    expect(examRooms(planD99(input), 's1')).toEqual(['R1']);
  });
});

describe('第二階段座位規則', () => {
  it('S-08：一排一班、班級交錯；同排用完接下一班，各班在一排內只有一段', () => {
    const students = [1, 2, 3].flatMap((c) => makeClass(c, 10, () => PHY));
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [reserveRoom('R1', grid(5, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = planD99(input);
    expect(checkPlan(input, out)).toEqual([]);
    const rowClasses = (row: number): number[] => out.exams.filter((e) => e.row === row).sort((a, b) => a.depth - b.depth).map((e) => Number(e.code.slice(0, 2)));
    expect([1, 2, 3].map((r) => rowClasses(r)[0])).toEqual([1, 2, 3]);
    for (let r = 1; r <= 5; r++) {
      const seq = rowClasses(r);
      const runs = seq.filter((c, i) => i === 0 || seq[i - 1] !== c);
      expect(new Set(runs).size).toBe(runs.length);
    }
    // 同班沿座位順序座號遞增
    for (const c of ['01', '02', '03']) {
      const seq = out.exams.filter((e) => e.code.startsWith(c)).sort((a, b) => a.row - b.row || a.depth - b.depth).map((e) => Number(e.code.slice(2)));
      expect(seq).toEqual([...seq].sort((a, b) => a - b));
    }
  });
  it('不規則座位圖（每排深位數不同）不會排到不存在的座位', () => {
    const seats = grid(3, 7).filter((s) => !(s.row === 1 && s.depth > 4));
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, seats)], slots: [{ id: 's1', subjectIds: ['phy'] }], students: makeClass(1, 18, () => PHY) };
    const out = planD99(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.exams.filter((e) => e.row === 1).length).toBe(4);
  });
});

describe('自習與替代方案（S-03、S-05、T-13 的核可流程）', () => {
  // 甲班被徵用為考場、15 位不考者，綜合教室只收 10 位；乙班教室 49 座只坐 30 人
  const base: PlanInput = {
    mode: 'fewest-rooms',
    rooms: [classRoom(1, grid(5, 6)), classRoom(2, grid(7, 7)), reserveRoom('R1', grid(2, 5), 10)],
    slots: [{ id: 's1', subjectIds: ['phy'] }],
    students: [...makeClass(1, 30, (n) => (n <= 15 ? PHY : {})), ...makeClass(2, 30)],
  };
  it('容量不足：排不進的人列在 unplaced，驗證器也擋下，不輸出看似成功的方案', () => {
    const out = planD99(base);
    expect(out.unplaced).toHaveLength(5);
    expect(checkPlan(base, out).length).toBeGreaterThan(0);
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]).toMatchObject({ roomId: 'C2', status: 'pending', count: 5, addsRoom: true });
    expect(out.proposals[0]!.reason).toContain('未經核可不會採用');
  });
  it('管理者核可後：方案生效、狀態改為 approved、全部合規', () => {
    const pending = planD99(base).proposals;
    const approved: PlanInput = { ...base, approvals: pending.map((p) => ({ slotId: p.slotId, roomId: p.roomId })) };
    const out = planD99(approved);
    expect(checkPlan(approved, out)).toEqual([]);
    expect(out.unplaced).toBeUndefined();
    expect(out.proposals.map((p) => p.status)).toEqual(['approved']);
    expect(out.study.filter((s) => s.roomId === 'C2' && s.code.startsWith('01'))).toHaveLength(5);
  });
  it('開啟「允許自習去他班原班教室」：直接借用、不出提示卡', () => {
    const allow: PlanInput = { ...base, allowOtherClassStudy: true };
    const out = planD99(allow);
    expect(checkPlan(allow, out)).toEqual([]);
    expect(out.proposals).toEqual([]);
  });
  it('驗證器：未經許可把人送去他班原班會被抓到', () => {
    const out = planD99({ ...base, allowOtherClassStudy: true });
    expect(checkPlan(base, out).some((m) => m.includes('未經許可'))).toBe(true);
  });
  it('S-05：被抽離的人跨節自習地點穩定（同一間）', () => {
    const students = makeClass(1, 30, (n) => (n <= 25 ? { s1: 'phy', s2: 'chem' } : {}));
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(5, 6)), reserveRoom('R1', grid(1, 5)), reserveRoom('R2', grid(1, 5))], slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['chem'] }], students };
    const out = planD99(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.metrics?.studyMoves).toBe(0);
  });
});

describe('教室文理組看考生組別（使用者裁決 R1）', () => {
  // 理組班教室 C1 只排理組考生；乙班 5 位文組考生加考物理，只能去綜合教室
  const students: PlanStudent[] = [
    ...makeClass(1, 30, () => PHY).map((s) => ({ ...s, track: 'science' as const })),
    ...makeClass(2, 30, (n) => (n <= 5 ? PHY : {})).map((s) => ({ ...s, track: 'liberal' as const })),
  ];
  const rooms = [{ ...classRoom(1), track: 'science' as const }, { ...classRoom(2), track: 'liberal' as const }, reserveRoom('R1', grid(1, 5))];
  it('有設組別：文組考生不進理組班教室考試', () => {
    const input: PlanInput = { mode: 'fewest-rooms', rooms, slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = planD99(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.exams.filter((e) => e.code.startsWith('02')).every((e) => e.roomId === 'R1')).toBe(true);
  });
  it('沒設組別（舊資料）：不限制，35 人集中一間', () => {
    const plain = students.map(({ track: _t, ...s }) => s);
    const input: PlanInput = { mode: 'fewest-rooms', rooms: rooms.map(({ track: _t, ...r }) => r), slots: [{ id: 's1', subjectIds: ['phy'] }], students: plain };
    expect(examRooms(planD99(input), 's1')).toEqual(['C1']);
  });
  it('驗證器：組別不符會被抓到', () => {
    const input: PlanInput = { mode: 'fewest-rooms', rooms, slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = planD99(input);
    const bad = { ...out, exams: out.exams.map((e) => (e.code === '0201' ? { ...e, roomId: 'C1', row: 7, depth: 7 } : e)), usage: out.usage };
    expect(checkPlan(input, bad).some((m) => m.includes('文理組不符'))).toBe(true);
  });
});

describe('驗證器：混科標示（H-08）', () => {
  it('同排混科沒標出、或逐位交錯都會被抓到', () => {
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(1, 4))], slots: [{ id: 's1', subjectIds: ['phy', 'his'] }], students: [...makeStudents(1, [1, 2], { s1: 'phy' }), ...makeStudents(1, [3, 4], { s1: 'his' })] };
    const ex = (code: string, sub: string, depth: number) => ({ slotId: 's1', code, subjectId: sub, roomId: 'C1', row: 1, depth });
    const out: PlanOutput = { usage: { s1: { C1: 'exam' } }, exams: [ex('0101', 'phy', 1), ex('0102', 'phy', 2), ex('0103', 'his', 3), ex('0104', 'his', 4)], study: [], mixedRows: [], proposals: [] };
    expect(checkPlan(input, out).some((m) => m.includes('沒有標出'))).toBe(true);
    const ok = { ...out, mixedRows: [{ slotId: 's1', roomId: 'C1', row: 1 }] };
    expect(checkPlan(input, ok)).toEqual([]);
    const zigzag = { ...ok, exams: [ex('0101', 'phy', 1), ex('0103', 'his', 2), ex('0102', 'phy', 3), ex('0104', 'his', 4)] };
    expect(checkPlan(input, zigzag).some((m) => m.includes('逐位交錯'))).toBe(true);
  });
});

describe('方案指標（D103 三項＋DESIGN 10.14）', () => {
  it('引擎附上的指標與由輸出重算的一致；三項新指標有值', () => {
    const students = [...makeClass(1, 30, (n) => ({ s1: 'phy', ...(n <= 3 ? { s2: 'his' } : {}) })), ...makeClass(2, 30, (n) => ({ s2: n <= 25 ? 'his' : 'geo' }))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1), classRoom(2), reserveRoom('R1', grid(7, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['his', 'geo'] }], students };
    const out = planD99(input);
    expect(out.metrics).toEqual(computeMetrics(input, out));
    const m = out.metrics!;
    expect(m.examRooms + m.studyRooms).toBeGreaterThanOrEqual(m.roomsTotal);
    expect(m.crossRoomStudents).toBeGreaterThanOrEqual(0);
    expect(m.dispatchSegments).toBeGreaterThanOrEqual(2); // s2 至少兩科
  });
});

describe('教室資料：每排深位數、停用座位、自習容量（向下相容）', () => {
  const room = (over: Partial<Classroom> = {}): Classroom => ({ id: 'r', name: '溫', kind: 'class', rows: 3, depth: 4, seatCount: 12, ...over });
  it('舊資料（沒有新欄位）行為不變', () => {
    const c = room();
    expect(classroomSeats(c)).toHaveLength(12);
    expect(seatSlotCount(c)).toBe(12);
    expect(emptySeatCount(c)).toBe(0);
    expect(studyCapacityOf(c)).toBe(12);
    expect(isValidClassroom(c)).toBe(true);
  });
  it('每排深位數不同＋停用座位：只列實際存在且可用的座位', () => {
    const c = room({ rowDepths: [4, 2, 3], disabled: ['3-2'], seatCount: 8 });
    expect(classroomSeats(c).map((s) => `${s.row}-${s.depth}`)).toEqual(['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '3-1', '3-3']);
    expect(seatSlotCount(c)).toBe(9);
    expect(emptySeatCount(c)).toBe(1);
    expect(isValidClassroom(c)).toBe(true);
    expect(isValidClassroom({ ...c, rowDepths: [4, 2] })).toBe(false); // 長度要等於 rows
    expect(isValidClassroom({ ...c, rowDepths: [5, 2, 3] })).toBe(false); // 不可超過 depth
    expect(isValidClassroom({ ...c, seatCount: 10 })).toBe(false); // 超過座位格數
  });
  it('自習容量可手動設定；不影響現行排座版本碼', () => {
    const c = room({ studyCapacity: 20 });
    expect(studyCapacityOf(c)).toBe(20);
    const base = { examId: 'e', division: 'senior' as const, classes: [], entries: [], subjects: [], markRules: [] };
    expect(seatingVersion({ ...base, classrooms: [c] } as never)).toBe(seatingVersion({ ...base, classrooms: [room()] } as never));
    expect(seatingVersion({ ...base, classrooms: [room({ rowDepths: [4, 2, 3], seatCount: 9 })] } as never)).not.toBe(seatingVersion({ ...base, classrooms: [room({ seatCount: 9 })] } as never));
  });
  it('toPlanRooms：只取本次勾選、多間綜合教室、原班以名稱對應、文理組沿用班級', () => {
    const classes: ClassInfo[] = [
      { no: 1, name: '溫', division: 'senior', track: 'science', colorIndex: 0 },
      { no: 2, name: '良', division: 'senior', track: 'liberal', colorIndex: 1 },
    ];
    const rooms: Classroom[] = [
      room({ id: 'a', name: '溫' }),
      room({ id: 'b', name: '良', studyCapacity: 15 }),
      { id: 'p1', name: '綜合一', kind: 'reserve', rows: 2, depth: 5, seatCount: 10 },
      { id: 'p2', name: '綜合二', kind: 'reserve', rows: 2, depth: 5, seatCount: 9, disabled: ['2-5'] },
      { id: 'p3', name: '綜合三', kind: 'reserve', rows: 2, depth: 5, seatCount: 10 },
    ];
    const pr = toPlanRooms(rooms, ['a', 'b', 'p1', 'p2'], classes);
    expect(pr.map((r) => r.id)).toEqual(['a', 'b', 'p1', 'p2']);
    expect(pr[0]).toMatchObject({ kind: 'class', classNo: 1, track: 'science', studyCapacity: 12 });
    expect(pr[1]).toMatchObject({ classNo: 2, track: 'liberal', studyCapacity: 15 });
    expect(pr[3]!.seats).toHaveLength(9);
    expect(pr[2]!.track).toBeUndefined();
  });
});

// ───────────── 效能量測（結果記在 docs/dispatch/完工-AST-1.md）─────────────
/** 分科常態：兩天 8 時段；五種組別依 ast-spec 第二節（假資料） */
function bigInput(classes: number, perClass: number, mode: PlanInput['mode']): PlanInput {
  const SCI = [['phy', 'chem', 'mathA', 'bio'], ['phy', 'chem', 'mathA'], ['chem', 'mathA', 'bio']];
  const SOC = [['mathB', 'his', 'geo', 'civ'], ['his', 'geo', 'civ']];
  const day = ['phy', 'chem', 'mathA', 'bio', 'his', 'geo', 'mathB', 'civ'];
  const students: PlanStudent[] = [];
  for (let c = 1; c <= classes; c++) {
    const sci = c <= classes / 2;
    for (let n = 1; n <= perClass; n++) {
      const set = sci ? SCI[(n + c) % 3]! : SOC[(n + c) % 2]!;
      const takes: Record<string, string> = {};
      day.forEach((sub, i) => {
        if (set.includes(sub)) takes[`t${i + 1}`] = sub;
      });
      // 少數跨組加考
      if (sci && n % 17 === 0) takes['t6'] = 'geo';
      students.push({ classNo: c, seatNo: n, name: `學生${c}-${n}`, takes, track: sci ? 'science' : 'liberal' });
    }
  }
  const rooms = [
    ...Array.from({ length: classes }, (_, i) => ({ ...classRoom(i + 1, grid(7, 7)), track: (i + 1 <= classes / 2 ? 'science' : 'liberal') as 'science' | 'liberal' })),
    ...Array.from({ length: Math.max(2, Math.ceil(classes / 3)) }, (_, i) => reserveRoom(`R${i + 1}`, grid(6, 8))),
  ];
  return { mode, rooms, slots: day.map((sub, i) => ({ id: `t${i + 1}`, subjectIds: [sub] })), students };
}

describe('效能量測', () => {
  for (const [label, classes, perClass] of [['小（6 班 266 人上下）', 6, 44], ['大（12 班 540 人）', 12, 45]] as const) {
    for (const mode of ['fewest-rooms', 'least-movement'] as const) {
      it(`${label}／${mode}：合規且在時限內`, () => {
        const input = bigInput(classes, perClass, mode);
        const t0 = performance.now();
        const out = planD99(input);
        const ms = performance.now() - t0;
        console.log(`[D99 效能] ${label} ${mode}：${input.students.length} 人、${input.rooms.length} 間、${input.slots.length} 時段 → ${ms.toFixed(0)} ms；教室總數 ${out.metrics?.roomsTotal}、離開原班 ${out.metrics?.leaveHome}、標籤 ${out.metrics?.labels}`);
        expect(checkPlan(input, out)).toEqual([]);
        expect(planD99(input)).toEqual(out); // 可重現
        expect(ms).toBeLessThan(15_000);
      }, 60_000);
    }
  }
});
