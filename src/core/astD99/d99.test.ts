/**
 * 分科座位新模型驗收測試（D99；規格案例 T-01～T-14、T-21～T-23）。全部匿名假資料。
 *
 * 狀態：排座引擎尚未重寫（docs/todo.md「D99 新模型待辦」）。
 * - 「驗證器」區（checkPlan、labelsOf）已經是真的程式，用手工組出的方案實測，現在就綠。
 * - 「引擎」區用 it.fails 標記：斷言是真的，引擎接上（設 PLANNER）後會轉成「it.fails 意外通過」報錯，
 *   提醒把 it.fails 改成 it。T-02 依 D99 第三輪改寫（平均分配取代 40＋2）。
 * - 少移動優先模式的案例只有 it.todo：該模式的細節要等引擎設計。
 */
import { describe, expect, it } from 'vitest';
import { checkPlan, codeOf, labelsOf, type PlanInput, type PlanOutput, type Planner } from './contract';
import { classRoom, grid, makeClass, makeStudents, reserveRoom } from './fixtures';

/** 引擎接上後把這裡換成真的函式，並把下面的 it.fails 改回 it */
const PLANNER: Planner | undefined = undefined as Planner | undefined;
const plan = (input: PlanInput): PlanOutput => {
  if (!PLANNER) throw new Error('D99 排座引擎尚未實作');
  return PLANNER(input);
};

const PHY = { s1: 'phy' };
const examRooms = (out: PlanOutput, slot: string): string[] =>
  Object.entries(out.usage[slot] ?? {}).filter(([, u]) => u === 'exam').map(([id]) => id);
/** 某考場某節，依排、深位順序的班號序列 */
const classSeq = (out: PlanOutput, slot: string, roomId: string): number[][] => {
  const rows = new Map<number, { depth: number; cls: number }[]>();
  for (const e of out.exams.filter((x) => x.slotId === slot && x.roomId === roomId)) {
    rows.set(e.row, [...(rows.get(e.row) ?? []), { depth: e.depth, cls: Number(e.code.slice(0, 2)) }]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.sort((a, b) => a.depth - b.depth).map((x) => x.cls));
};

// ───────────────────────── 驗證器（真測試）─────────────────────────
describe('D99 驗證器：硬性限制（T-22、T-23、T-11 的判定邏輯）', () => {
  const input: PlanInput = {
    mode: 'fewest-rooms',
    rooms: [classRoom(1, grid(1, 2)), classRoom(2, grid(1, 2))],
    slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['his'] }],
    students: [
      ...makeStudents(1, [1], { s1: 'phy' }),
      ...makeStudents(2, [1], { s2: 'his' }),
    ],
  };
  const good: PlanOutput = {
    usage: { s1: { C1: 'exam', C2: 'study' }, s2: { C1: 'study', C2: 'exam' } },
    exams: [
      { slotId: 's1', code: '0101', subjectId: 'phy', roomId: 'C1', row: 1, depth: 1 },
      { slotId: 's2', code: '0201', subjectId: 'his', roomId: 'C2', row: 1, depth: 1 },
    ],
    study: [{ slotId: 's1', code: '0201', roomId: 'C2' }, { slotId: 's2', code: '0101', roomId: 'C1' }],
    mixedRows: [],
    proposals: [],
  };
  it('T-23：同一間教室第一節考試、第二節自習是合法的', () => {
    expect(checkPlan(input, good)).toEqual([]);
  });
  it('T-22：同一節同一間教室同時考試與自習要拒絕', () => {
    const bad: PlanOutput = { ...good, usage: { ...good.usage, s1: { C1: 'exam', C2: 'exam' } } };
    expect(checkPlan(input, bad).some((m) => m.includes('混用'))).toBe(true);
  });
  it('座位不存在、同節座位重複、自習超過容量都會被抓到', () => {
    const noSeat = { ...good, exams: [{ ...good.exams[0]!, depth: 9 }, good.exams[1]!] };
    expect(checkPlan(input, noSeat).some((m) => m.includes('不是可用座位'))).toBe(true);
    const dup = { ...good, exams: [good.exams[0]!, { ...good.exams[1]!, slotId: 's1', roomId: 'C1', subjectId: 'phy' }] };
    expect(checkPlan(input, dup).some((m) => m.includes('重複'))).toBe(true);
    const small: PlanInput = { ...input, rooms: [classRoom(1, grid(1, 2), 0), classRoom(2, grid(1, 2), 0)] };
    expect(checkPlan(small, good).some((m) => m.includes('超過容量'))).toBe(true);
  });
  it('漏排：選考沒有座位、不考的沒有自習教室都會被抓到', () => {
    expect(checkPlan(input, { ...good, exams: [good.exams[0]!] }).length).toBeGreaterThan(0);
    expect(checkPlan(input, { ...good, study: [] }).length).toBeGreaterThan(0);
  });
  it('T-11：同一座位不同節換人不算衝突，整合標籤一座位一張並列出各節考生', () => {
    const shared: PlanInput = { ...input, rooms: [classRoom(1, grid(1, 2)), classRoom(2, grid(1, 2))] };
    const out: PlanOutput = {
      ...good,
      exams: [
        { slotId: 's1', code: '0101', subjectId: 'phy', roomId: 'C1', row: 1, depth: 1 },
        { slotId: 's2', code: '0201', subjectId: 'his', roomId: 'C1', row: 1, depth: 1 },
      ],
      usage: { s1: { C1: 'exam', C2: 'study' }, s2: { C1: 'exam', C2: 'study' } },
      study: [{ slotId: 's1', code: '0201', roomId: 'C2' }, { slotId: 's2', code: '0101', roomId: 'C2' }],
    };
    expect(checkPlan(shared, out)).toEqual([]);
    const labels = labelsOf(out);
    expect(labels.size).toBe(1);
    expect(labels.get('C1:1-1')).toEqual([
      { slotId: 's1', code: '0101', subjectId: 'phy' },
      { slotId: 's2', code: '0201', subjectId: 'his' },
    ]);
  });
});

// ───────────────────────── 引擎（待實作）─────────────────────────
describe('D99 引擎驗收（尚未實作：it.fails）', () => {
  const rooms3 = [classRoom(1), classRoom(2), classRoom(3)];

  it.fails('T-01：三班共 150 人、物理 40 人、單室足夠 → 集中成一間考場，不徵用全部三間原班', () => {
    // 預備教室 60 座；物理 14＋13＋13＝40 人
    const students = [
      ...makeClass(1, 50, (n) => (n <= 14 ? PHY : {})),
      ...makeClass(2, 50, (n) => (n <= 13 ? PHY : {})),
      ...makeClass(3, 50, (n) => (n <= 13 ? PHY : {})),
    ];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [...rooms3, reserveRoom('R1', grid(6, 10))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(examRooms(out, 's1')).toHaveLength(1);
  });

  it.fails('T-02（D99 改寫）：同科 42 人、常規教室 40 座 → 兩間考場人數盡量平均、以整班為單位，不出現 40＋2', () => {
    const students = [...makeClass(1, 40, (n) => (n <= 21 ? PHY : {})), ...makeClass(2, 40, (n) => (n <= 21 ? PHY : {})), ...makeClass(3, 40)];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(5, 8)), classRoom(2, grid(5, 8)), classRoom(3, grid(5, 8)), reserveRoom('R1', grid(5, 6))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    const sizes = examRooms(out, 's1').map((r) => out.exams.filter((e) => e.roomId === r).length);
    expect(sizes).toHaveLength(2);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2);
    // 整班為單位：同一班的應考者在同一間
    for (const cls of [1, 2]) {
      const where = new Set(out.exams.filter((e) => e.code.startsWith(String(cls).padStart(2, '0'))).map((e) => e.roomId));
      expect(where.size).toBe(1);
    }
  });
  it.todo('T-02（少移動優先）：同一資料在少移動優先下，離開原班人次最少者優先，平均分配排在其後（D99 第三輪第 1 點）');

  it.fails('T-03：同科含文理跨組加考者 → 所有實際選考者都有位置', () => {
    const students = [
      ...makeClass(1, 30, (n) => ({ s1: 'phy', ...(n <= 3 ? { s2: 'his' } : {}) })), // 理組班，前 3 人加考歷史
      ...makeClass(2, 30, (n) => ({ s2: n <= 25 ? 'his' : 'geo' })),
    ];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1), classRoom(2), reserveRoom('R1', grid(7, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['his', 'geo'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.exams.filter((e) => e.slotId === 's2')).toHaveLength(30 + 3);
  });

  it.fails('T-04：一班多數考、一班少數考 → 以整體成本決定誰留原班；少數者集中，多數留原班的班不被徵用', () => {
    // 甲班 36 人中 30 人考化學；乙班 36 人中 4 人考化學。只需一間考場
    const students = [...makeClass(1, 36, (n) => (n <= 30 ? { s1: 'chem' } : {})), ...makeClass(2, 36, (n) => (n <= 4 ? { s1: 'chem' } : {}))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(6, 7)), classRoom(2, grid(6, 7)), reserveRoom('R1', grid(6, 7))], slots: [{ id: 's1', subjectIds: ['chem'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(examRooms(out, 's1')).toHaveLength(1);
    // 乙班沒被徵用時，其 32 位不考者全在乙班原班教室自習
    if (out.usage['s1']?.['C2'] === 'study') {
      expect(out.study.filter((s) => s.code.startsWith('02') && s.roomId === 'C2')).toHaveLength(32);
    }
  });

  it.fails('T-05：同班選考座號 01、03、08、12、15、22、35 → 座位依選考者座號排序，不要求連號', () => {
    const students = [...makeStudents(1, [1, 3, 8, 12, 15, 22, 35], PHY), ...makeClass(1, 40).filter((s) => ![1, 3, 8, 12, 15, 22, 35].includes(s.seatNo))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1), reserveRoom('R1', grid(7, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    const ordered = [...out.exams].sort((a, b) => a.row - b.row || a.depth - b.depth).map((e) => e.code);
    expect(ordered).toEqual(['0101', '0103', '0108', '0112', '0115', '0122', '0135']);
  });

  it.fails('T-06：不規則座位圖（有排只有 5 位、有停用座位）→ 不假設一排 7 位，不排在不存在的座位', () => {
    const irregular = grid(4, 7).filter((s) => !(s.row === 2 && s.depth > 5) && !(s.row === 3 && s.depth === 4));
    const students = makeClass(1, 20, () => PHY);
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, irregular)], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]); // 含 H-04：座位必須存在
    expect(out.exams).toHaveLength(20);
  });

  it.fails('T-07：同排班級不足排滿 → 另一班以連續區段接續，不逐身位交錯', () => {
    // 一排 7 位：甲班 9 人、乙班 5 人，同一間考場
    const students = [...makeClass(1, 9, () => PHY), ...makeClass(2, 5, () => PHY)];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(2, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    for (const row of classSeq(out, 's1', 'C1')) {
      // 每個班在一排內只出現一段連續區間
      const runs = row.filter((c, i) => i === 0 || row[i - 1] !== c);
      expect(new Set(runs).size).toBe(runs.length);
    }
  });

  it.fails('T-08：兩科同時段、座位充足 → 不同科分排（同排不混科），容許留空', () => {
    const students = [...makeClass(1, 20, () => ({ s1: 'phy' })), ...makeClass(2, 20, () => ({ s1: 'his' }))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(6, 7)), classRoom(2), reserveRoom('R1', grid(7, 7))], slots: [{ id: 's1', subjectIds: ['phy', 'his'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.mixedRows).toEqual([]);
    const byRow = new Map<string, Set<string>>();
    for (const e of out.exams) byRow.set(`${e.roomId}:${e.row}`, (byRow.get(`${e.roomId}:${e.row}`) ?? new Set()).add(e.subjectId));
    for (const subs of byRow.values()) expect(subs.size).toBe(1);
  });

  it.fails('T-09：兩科同時段、分排就必須增開一室 → 同排連續分區，標出混科的排', () => {
    // 只有一間 4 排×5 位的教室：12 人＋8 人，分排需 3＋2＝5 排 > 4 排
    const students = [...makeClass(1, 12, () => ({ s1: 'phy' })), ...makeClass(2, 8, () => ({ s1: 'his' }))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(4, 5)), classRoom(2, grid(1, 1))], slots: [{ id: 's1', subjectIds: ['phy', 'his'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.mixedRows.length).toBeGreaterThan(0);
    for (const m of out.mixedRows) {
      const seq = out.exams.filter((e) => e.roomId === m.roomId && e.row === m.row).sort((a, b) => a.depth - b.depth).map((e) => e.subjectId);
      const runs = seq.filter((c, i) => i === 0 || seq[i - 1] !== c);
      expect(new Set(runs).size).toBe(runs.length); // 連續分區、不逐位交錯
    }
  });

  it.fails('T-10：一名考生三節都在綜合教室 → 盡量同座位', () => {
    const takes = { s1: 'phy', s2: 'chem', s3: 'bio' };
    const students = [...makeStudents(1, [5], takes), ...makeClass(1, 10).filter((s) => s.seatNo !== 5)];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(1, 3)), reserveRoom('R1', grid(2, 5))], slots: ['s1', 's2', 's3'].map((id, i) => ({ id, subjectIds: [['phy', 'chem', 'bio'][i]!] })), students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    const seats = new Set(out.exams.filter((e) => e.code === '0105').map((e) => `${e.roomId}:${e.row}-${e.depth}`));
    expect(seats.size).toBe(1);
  });
  it.todo('T-10（衝突時）：跨科同座位與座號依序／試務安全衝突時，後者優先（要等引擎有座號依序規則後構造衝突資料）');

  it.fails('T-11（引擎）：同一座位不同節換人 → 無衝突，每個座位只需一張整合標籤', () => {
    const students = [...makeClass(1, 10, (n) => (n <= 5 ? { s1: 'phy' } : { s2: 'his' }))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(2, 5)), reserveRoom('R1', grid(2, 5))], slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['his'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(labelsOf(out).size).toBeLessThanOrEqual(5);
  });

  it.fails('T-12：被徵用原班的部分學生不考 → 只分配自習教室、不分配座位，且容量合規', () => {
    const students = makeClass(1, 30, (n) => (n <= 20 ? PHY : {}));
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(5, 6)), reserveRoom('R1', grid(5, 6))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    expect(out.study).toHaveLength(10);
    expect(out.exams.every((e) => out.study.every((s) => s.code !== e.code))).toBe(true);
  });

  it.fails('T-13：綜合教室自習容量不足 → 不靜默超收，提出「改用某班原班教室」待核准的替代方案', () => {
    const students = [...makeClass(1, 30, (n) => (n <= 5 ? PHY : {})), ...makeClass(2, 30)];
    // 甲班被徵用為考場，25 位不考者要去綜合教室，但綜合教室自習容量只有 10
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(5, 6)), classRoom(2, grid(5, 6)), reserveRoom('R1', grid(2, 5), 10)], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    const out = plan(input);
    expect(out.study.filter((s) => s.roomId === 'R1').length).toBeLessThanOrEqual(10);
    expect(out.proposals.length).toBeGreaterThan(0);
    expect(out.proposals.every((p) => p.status === 'pending')).toBe(true);
    // 未經核可，不得自動把人送進他班原班教室
    expect(out.study.some((s) => s.roomId === 'C2' && s.code.startsWith('01'))).toBe(false);
  });

  it.fails('T-14：一天完全沒考試的學生 → 預設仍要安排自習教室', () => {
    const students = [...makeClass(1, 10, (n) => (n <= 4 ? { s1: 'phy', s2: 'chem' } : {}))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(2, 5)), reserveRoom('R1', grid(2, 5))], slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['chem'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
    for (const slot of ['s1', 's2']) for (let n = 5; n <= 10; n++) expect(out.study.filter((s) => s.slotId === slot && s.code === codeOf({ classNo: 1, seatNo: n }))).toHaveLength(1);
  });

  it.fails('T-21：相同輸入與設定 → 結果完全相同（可重現）', () => {
    const students = [...makeClass(1, 30, (n) => (n % 3 === 0 ? PHY : {})), ...makeClass(2, 30, (n) => (n % 2 === 0 ? PHY : {}))];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1), classRoom(2), reserveRoom('R1', grid(7, 7))], slots: [{ id: 's1', subjectIds: ['phy'] }], students };
    expect(plan(input)).toEqual(plan(input));
  });

  it.fails('T-22／T-23（引擎）：任何輸入都不得同節混用考試與自習，但可跨節切換用途', () => {
    const students = [...makeClass(1, 20, (n) => (n <= 10 ? { s1: 'phy' } : { s2: 'his' })), ...makeClass(2, 20)];
    const input: PlanInput = { mode: 'fewest-rooms', rooms: [classRoom(1, grid(4, 6)), classRoom(2, grid(4, 6)), reserveRoom('R1', grid(4, 6))], slots: [{ id: 's1', subjectIds: ['phy'] }, { id: 's2', subjectIds: ['his'] }], students };
    const out = plan(input);
    expect(checkPlan(input, out)).toEqual([]);
  });
});
