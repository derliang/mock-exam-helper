/**
 * 分科座位新模型（D99）排座引擎：每節各自排、兩階段、兩種模式。純函式、可重現（同輸入永遠同結果），不碰畫面。
 *
 * 第一階段（有權衡）：每個時段列出候選「考場組合」，逐一算出誰去哪間考場、不考的人去哪裡自習，
 *   再以所選模式的順位（詞典序）挑組合；跨時段的指標（教室總數去重、跨節換教室、自習地點穩定）
 *   用「逐時段輪流改選」到不再變好為止。不用求解器（D99 第二輪第 3 點）。
 * 第二階段（順序固定，不權衡）：每間考場內 ①同班依座號、一排一班輪流、用完同排接下一班（D73）
 *   ②不同科分排，排不下才同排連續分區 ③跨科盡量同座位（輸給 ①）。
 *
 * 順位（D99 一-4、三-1；DESIGN 10.14）——第 0 項一律是「排不進去的人數」（硬性：不得靜默超收）：
 *   少教室優先：教室總數、被抽離非應考者人次、各考場人數平均、同排混科、自習地點穩定、標籤張數
 *   少移動優先：離開原班人次、跨節換教室、教室總數、各考場人數平均、同排混科、標籤張數
 * 同分決勝（DESIGN 10.14，使用者 2026-11-12 確認）：班級教室依班序靠前者優先、綜合教室排後；
 *   同時段考場編號小者先排；再比學號（班座號）小者。
 */
import type { SeatPos } from '../../data/types';
import {
  codeOf,
  computeMetrics,
  type ExamPlacement,
  type PlanInput,
  type PlanOutput,
  type PlanRoom,
  type PlanSlot,
  type PlanStudent,
  type Proposal,
  type StudyPlacement,
} from './contract';

interface Stu {
  idx: number;
  code: string;
  classNo: number;
  seatNo: number;
  track?: string;
}

interface Room {
  idx: number;
  id: string;
  kind: 'class' | 'reserve';
  classNo?: number;
  track?: string;
  /** 依排、深位排序的可用座位 */
  seats: SeatPos[];
  rows: { row: number; depths: number[] }[];
  studyCap: number;
  /** 同分決勝用：班級教室依班序在前、綜合教室在後 */
  rank: number;
}

interface Group {
  classNo: number;
  subject: string;
  track?: string;
  students: Stu[];
}

/** 一個時段、一個考場組合的完整第一階段結果 */
interface SlotPlan {
  key: string;
  rankKey: number[];
  /** 每人所在教室索引（考試或自習；-1＝不考也排不進） */
  examRoom: Int32Array;
  studyRoom: Int32Array;
  /** 考場索引 → 科目 → 考生（科目依時段順序） */
  rooms: Map<number, Map<string, Stu[]>>;
  unplaced: number[];
  /** 有考試或接收抽離自習的教室 */
  used: Set<number>;
  displaced: number;
  leave: number;
  balance: number;
  mixed: number;
  /** 各考場考生數 */
  examCount: Map<number, number>;
  usedApprovals: Set<number>;
}

type Vec = number[];
const cmpVec = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

/** 候選組合數上限（每個時段）；超過就只取快速評分最好的前幾名完整試算 */
const TOP_CANDIDATES = 48;
const MAX_ENUM = 200_000;
const MAX_PASSES = 4;

export function planD99(input: PlanInput): PlanOutput {
  const ctx = new Ctx(input);
  return ctx.run();
}

class Ctx {
  readonly input: PlanInput;
  readonly stus: Stu[];
  readonly rooms: Room[];
  readonly home = new Map<number, Room>();
  readonly subjectOrder: Map<string, number>[];
  readonly approved: Set<number>[];
  private cache: Map<string, SlotPlan | null>[] = [];

  constructor(input: PlanInput) {
    this.input = input;
    const sorted = [...input.students].sort((a, b) => a.classNo - b.classNo || a.seatNo - b.seatNo);
    this.stus = sorted.map((s, idx) => ({ idx, code: codeOf(s), classNo: s.classNo, seatNo: s.seatNo, track: s.track }));
    this.studentsIn = sorted;
    const ranked = input.rooms
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const ka = a.r.kind === 'class' ? 0 : 1;
        const kb = b.r.kind === 'class' ? 0 : 1;
        return ka - kb || (a.r.kind === 'class' ? (a.r.classNo ?? 1e9) - (b.r.classNo ?? 1e9) : 0) || a.i - b.i;
      });
    this.rooms = ranked.map(({ r }, idx) => toRoom(r, idx));
    for (const r of this.rooms) if (r.kind === 'class' && r.classNo !== undefined && !this.home.has(r.classNo)) this.home.set(r.classNo, r);
    this.subjectOrder = input.slots.map((s) => new Map(s.subjectIds.map((id, i) => [id, i])));
    const byId = new Map(this.rooms.map((r) => [r.id, r.idx]));
    this.approved = input.slots.map((s) => new Set((input.approvals ?? []).filter((a) => a.slotId === s.id).map((a) => byId.get(a.roomId)).filter((x): x is number => x !== undefined)));
    this.cache = input.slots.map(() => new Map());
  }
  readonly studentsIn: PlanStudent[];

  run(): PlanOutput {
    const slots = this.input.slots;
    const chosen: (SlotPlan | undefined)[] = slots.map(() => undefined);
    // 初排：依時段順序，每次考慮已選時段用到的教室
    for (let s = 0; s < slots.length; s++) {
      const first = this.bestFor(s, chosen);
      // 某時段考生比可用座位多、沒有任何候選：回報無解，不丟例外
      if (!first) return { usage: {}, exams: [], study: [], mixedRows: [], proposals: [], infeasible: true };
      chosen[s] = first;
    }
    // 逐時段輪流改選，直到不再變好
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let changed = false;
      for (let s = 0; s < slots.length; s++) {
        const best = this.bestFor(s, chosen)!;
        if (best.key !== chosen[s]!.key) {
          chosen[s] = best;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return this.output(chosen as SlotPlan[]);
  }

  /** 第 s 時段的最佳候選（其他時段固定） */
  private bestFor(s: number, chosen: readonly (SlotPlan | undefined)[]): SlotPlan | undefined {
    const usedElsewhere = new Set<number>();
    chosen.forEach((p, i) => {
      if (p && i !== s) for (const r of p.used) usedElsewhere.add(r);
    });
    const cands = this.candidates(s, usedElsewhere);
    const cur = chosen[s];
    if (cur && !cands.some((c) => c.key === cur.key)) cands.push(cur);
    let best: SlotPlan | undefined;
    let bestVec: Vec = [];
    for (const c of cands) {
      const trial = chosen.map((p, i) => (i === s ? c : p));
      const v = this.globalVec(trial);
      const d = best ? cmpVec(v, bestVec) || cmpVec(c.rankKey, best.rankKey) : -1;
      if (d < 0) {
        best = c;
        bestVec = v;
      }
    }
    return best;
  }

  /** 全部時段的順位向量（未選的時段略過） */
  private globalVec(plans: readonly (SlotPlan | undefined)[]): Vec {
    const used = new Set<number>();
    let unplaced = 0;
    let displaced = 0;
    let leave = 0;
    let balance = 0;
    let mixed = 0;
    for (const p of plans) {
      if (!p) continue;
      for (const r of p.used) used.add(r);
      unplaced += p.unplaced.length;
      displaced += p.displaced;
      leave += p.leave;
      balance += p.balance;
      mixed += p.mixed;
    }
    let changes = 0;
    let studyMoves = 0;
    const n = this.stus.length;
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) {
      let prev = -1;
      seen.clear();
      for (const p of plans) {
        if (!p) continue;
        const r = p.examRoom[i]! >= 0 ? p.examRoom[i]! : p.studyRoom[i]!;
        if (r < 0) continue;
        if (prev >= 0 && prev !== r) changes++;
        prev = r;
        if (p.studyRoom[i]! >= 0) seen.add(p.studyRoom[i]!);
      }
      if (seen.size > 1) studyMoves += seen.size - 1;
    }
    // 標籤張數的估計：每間考場各時段考生數的最大值加總（座位由前往後坐，所以跨時段重疊）
    const maxIn = new Map<number, number>();
    for (const p of plans) if (p) for (const [r, c] of p.examCount) maxIn.set(r, Math.max(maxIn.get(r) ?? 0, c));
    let labels = 0;
    for (const c of maxIn.values()) labels += c;
    return this.input.mode === 'least-movement'
      ? [unplaced, leave, changes, used.size, balance, mixed, labels]
      : [unplaced, used.size, displaced, balance, mixed, studyMoves, labels];
  }

  // ───────────── 候選考場組合 ─────────────

  private candidates(s: number, usedElsewhere: Set<number>): SlotPlan[] {
    const slot = this.input.slots[s]!;
    const groups = this.groupsOf(slot);
    const examinees = groups.reduce((a, g) => a + g.students.length, 0);
    if (examinees === 0) {
      const p = this.build(s, []);
      return p ? [p] : [];
    }
    const nonExamByClass = new Map<number, number>();
    const examByClass = new Map<number, number>();
    for (const g of groups) examByClass.set(g.classNo, (examByClass.get(g.classNo) ?? 0) + g.students.length);
    for (const st of this.stus) if (!slot || !this.takes(st, slot)) nonExamByClass.set(st.classNo, (nonExamByClass.get(st.classNo) ?? 0) + 1);
    const R = this.rooms.filter((r) => r.seats.length > 0);
    const caps = R.map((r) => r.seats.length).sort((a, b) => b - a);
    let kmin = 0;
    for (let acc = 0; acc < examinees && kmin < caps.length; kmin++) acc += caps[kmin]!;
    // 快速評分
    const allowOther = !!this.input.allowOtherClassStudy;
    const approved = this.approved[s]!;
    const reserveStudy = R.filter((r) => r.kind === 'reserve');
    const homeOverflow = (r: Room): number => Math.max(0, (nonExamByClass.get(r.classNo!) ?? 0) - r.studyCap);
    const spare = (r: Room): number => Math.max(0, r.studyCap - (nonExamByClass.get(r.classNo!) ?? 0));
    let homeless = 0;
    for (const [c, n] of nonExamByClass) if (!this.home.has(c)) homeless += n;
    const quick = (S: Room[]): Vec => {
      const inS = new Set(S.map((r) => r.idx));
      let displaced = 0;
      let need = homeless;
      let homeExam = 0;
      for (const r of this.home.values()) {
        if (inS.has(r.idx)) {
          displaced += nonExamByClass.get(r.classNo!) ?? 0;
          homeExam += Math.min(examByClass.get(r.classNo!) ?? 0, r.seats.length);
        } else need += homeOverflow(r);
      }
      need += displaced;
      let room = 0;
      for (const r of reserveStudy) if (!inS.has(r.idx)) room += r.studyCap;
      for (const r of this.home.values()) if (!inS.has(r.idx) && (allowOther || approved.has(r.idx))) room += spare(r);
      const overflow = Math.max(0, need - room);
      const fresh = S.filter((r) => !usedElsewhere.has(r.idx)).length;
      const leave = examinees - homeExam + displaced;
      return this.input.mode === 'least-movement' ? [overflow, leave, fresh, displaced, S.length] : [overflow, fresh, displaced, S.length];
    };
    const top: { v: Vec; S: Room[]; rk: number[] }[] = [];
    let enumerated = 0;
    const consider = (S: Room[]): void => {
      enumerated++;
      const v = quick(S);
      const rk = S.map((r) => r.rank);
      const pos = top.findIndex((t) => (cmpVec(v, t.v) || cmpVec(rk, t.rk)) < 0);
      if (pos < 0) {
        if (top.length < TOP_CANDIDATES) top.push({ v, S: [...S], rk });
      } else {
        top.splice(pos, 0, { v, S: [...S], rk });
        if (top.length > TOP_CANDIDATES) top.pop();
      }
    };
    const suffixCap: number[] = [];
    for (let i = R.length - 1, acc = 0; i >= 0; i--) suffixCap[i] = acc += R[i]!.seats.length;
    const kmax = Math.min(R.length, kmin + 2);
    for (let k = Math.max(1, kmin); k <= kmax && enumerated < MAX_ENUM; k++) {
      const pick: Room[] = [];
      const dfs = (start: number, cap: number): void => {
        if (enumerated >= MAX_ENUM) return;
        if (pick.length === k) {
          if (cap >= examinees) consider(pick);
          return;
        }
        for (let i = start; i <= R.length - (k - pick.length); i++) {
          if (cap + suffixCap[i]! < examinees) return; // 後面全選也不夠
          pick.push(R[i]!);
          dfs(i + 1, cap + R[i]!.seats.length);
          pick.pop();
        }
      };
      dfs(0, 0);
    }
    const out: SlotPlan[] = [];
    for (const t of top) {
      const p = this.build(s, t.S.map((r) => r.idx));
      if (p) out.push(p);
    }
    return out;
  }

  private takes(st: Stu, slot: PlanSlot): string | undefined {
    return this.studentsIn[st.idx]!.takes[slot.id];
  }

  private groupsOf(slot: PlanSlot): Group[] {
    const m = new Map<string, Group>();
    for (const st of this.stus) {
      const sub = this.takes(st, slot);
      if (!sub) continue;
      const k = `${st.classNo}|${sub}|${st.track ?? ''}`;
      const g = m.get(k) ?? { classNo: st.classNo, subject: sub, track: st.track, students: [] };
      g.students.push(st);
      m.set(k, g);
    }
    return [...m.values()];
  }

  // ───────────── 一個候選的第一階段結果 ─────────────

  private build(s: number, S: number[]): SlotPlan | null {
    const key = S.join(',');
    const hit = this.cache[s]!.get(key);
    if (hit !== undefined) return hit;
    const p = this.buildRaw(s, S);
    this.cache[s]!.set(key, p);
    return p;
  }

  private buildRaw(s: number, S: number[]): SlotPlan | null {
    const slot = this.input.slots[s]!;
    const mode = this.input.mode;
    const order = this.subjectOrder[s]!;
    const n = this.stus.length;
    const examRoom = new Int32Array(n).fill(-1);
    const studyRoom = new Int32Array(n).fill(-1);
    const rooms = new Map<number, Map<string, Stu[]>>();
    const remaining = new Map(S.map((r) => [r, this.rooms[r]!.seats.length]));
    const eligible = (r: number, g: Group): boolean => {
      const t = this.rooms[r]!.track;
      return !(t && g.track && t !== g.track);
    };
    const isHome = (r: number, g: Group): boolean => this.home.get(g.classNo)?.idx === r;
    const groups = this.groupsOf(slot);
    const bySubject = new Map<string, Group[]>();
    for (const g of groups) bySubject.set(g.subject, [...(bySubject.get(g.subject) ?? []), g]);
    const subjects = [...bySubject.entries()]
      .map(([sub, gs]) => ({ sub, gs, total: gs.reduce((a, g) => a + g.students.length, 0) }))
      .sort((a, b) => b.total - a.total || (order.get(a.sub) ?? 99) - (order.get(b.sub) ?? 99) || (a.sub < b.sub ? -1 : 1));
    const subsIn = new Map<number, Set<string>>(S.map((r) => [r, new Set<string>()]));
    const load = new Map<string, number>(); // room|subject
    const put = (r: number, g: Group, list: Stu[]): void => {
      remaining.set(r, remaining.get(r)! - list.length);
      subsIn.get(r)!.add(g.subject);
      load.set(`${r}|${g.subject}`, (load.get(`${r}|${g.subject}`) ?? 0) + list.length);
      const m = rooms.get(r) ?? new Map<string, Stu[]>();
      m.set(g.subject, [...(m.get(g.subject) ?? []), ...list]);
      rooms.set(r, m);
      for (const st of list) examRoom[st.idx] = r;
    };
    for (const { sub, gs, total } of subjects) {
      gs.sort((a, b) => b.students.length - a.students.length || a.classNo - b.classNo || (a.track ?? '').localeCompare(b.track ?? ''));
      const okRooms = S.filter((r) => gs.some((g) => eligible(r, g)));
      const homeCount = (r: number): number => gs.filter((g) => isHome(r, g)).reduce((a, g) => a + g.students.length, 0);
      const pref = [...okRooms].sort((a, b) => {
        const oa = subsIn.get(a)!.size > 0 ? 1 : 0;
        const ob = subsIn.get(b)!.size > 0 ? 1 : 0;
        const ha = mode === 'least-movement' ? -homeCount(a) : 0;
        const hb = mode === 'least-movement' ? -homeCount(b) : 0;
        return oa - ob || ha - hb || remaining.get(b)! - remaining.get(a)! || this.rooms[a]!.rank - this.rooms[b]!.rank;
      });
      // 這一科最少要幾間（依剩餘座位）
      const Ru: number[] = [];
      for (let acc = 0; acc < total && Ru.length < pref.length; ) {
        const r = pref[Ru.length]!;
        Ru.push(r);
        acc += remaining.get(r)!;
      }
      const ldOf = (r: number): number => load.get(`${r}|${sub}`) ?? 0;
      const score = (r: number, g: Group): number[] =>
        mode === 'least-movement'
          ? [isHome(r, g) ? 0 : 1, ldOf(r), this.rooms[r]!.rank]
          : [ldOf(r), isHome(r, g) ? 0 : 1, this.rooms[r]!.rank];
      for (const g of gs) {
        const k = g.students.length;
        const pickFrom = (pool: number[]): number | undefined => {
          let best: number | undefined;
          for (const r of pool) {
            if (!eligible(r, g) || remaining.get(r)! < k) continue;
            if (best === undefined || cmpVec(score(r, g), score(best, g)) < 0) best = r;
          }
          return best;
        };
        const r = pickFrom(Ru) ?? pickFrom(S.filter((x) => !Ru.includes(x)));
        if (r !== undefined) {
          put(r, g, g.students);
          continue;
        }
        // 整班放不下：只好拆班（依座號切），先放剩餘座位多的
        const pool = [...Ru, ...S.filter((x) => !Ru.includes(x))]
          .filter((x) => eligible(x, g) && remaining.get(x)! > 0)
          .sort((a, b) => remaining.get(b)! - remaining.get(a)! || this.rooms[a]!.rank - this.rooms[b]!.rank);
        let rest = g.students;
        for (const x of pool) {
          if (!rest.length) break;
          const take = rest.slice(0, remaining.get(x)!);
          put(x, g, take);
          rest = rest.slice(take.length);
        }
        if (rest.length) return null;
      }
    }
    // 不用的考場不算（組合裡有，但沒人坐）
    const examSet = new Set([...rooms.keys()]);
    if (examSet.size !== S.length) return null; // 有空考場的組合由較小的組合代表
    // 自習
    const studyLoad = new Map<number, number>();
    const addStudy = (r: number, st: Stu): void => {
      studyRoom[st.idx] = r;
      studyLoad.set(r, (studyLoad.get(r) ?? 0) + 1);
    };
    const free = (r: Room): number => r.studyCap - (studyLoad.get(r.idx) ?? 0);
    const pending: Stu[] = [];
    let displaced = 0;
    for (const st of this.stus) {
      if (examRoom[st.idx]! >= 0) continue;
      const h = this.home.get(st.classNo);
      if (h && examSet.has(h.idx)) {
        displaced++;
        pending.push(st);
      } else if (h && free(h) > 0) addStudy(h.idx, st);
      else pending.push(st);
    }
    const reserves = this.rooms
      .filter((r) => r.kind === 'reserve' && !examSet.has(r.idx))
      .sort((a, b) => b.studyCap - a.studyCap || a.rank - b.rank);
    const others = this.rooms
      .filter((r) => r.kind === 'class' && !examSet.has(r.idx) && (this.input.allowOtherClassStudy || this.approved[s]!.has(r.idx)));
    const unplaced: number[] = [];
    const usedApprovals = new Set<number>();
    for (const st of pending) {
      const r = reserves.find((x) => free(x) > 0) ?? [...others].sort((a, b) => free(b) - free(a) || a.rank - b.rank).find((x) => free(x) > 0);
      if (!r) {
        unplaced.push(st.idx);
        continue;
      }
      addStudy(r.idx, st);
      if (r.kind === 'class' && !this.input.allowOtherClassStudy) usedApprovals.add(r.idx);
    }
    // 指標
    const used = new Set(examSet);
    let leave = 0;
    for (const st of this.stus) {
      const h = this.home.get(st.classNo)?.idx;
      const e = examRoom[st.idx]!;
      const r = studyRoom[st.idx]!;
      if (e >= 0 && e !== h) leave++;
      if (r >= 0 && r !== h) {
        leave++;
        used.add(r);
      }
    }
    let balance = 0;
    for (const { sub } of subjects) {
      const ns = S.map((r) => load.get(`${r}|${sub}`) ?? 0).filter((x) => x > 0);
      if (ns.length > 1) balance += Math.max(...ns) - Math.min(...ns);
    }
    let mixed = 0;
    const examCount = new Map<number, number>();
    for (const [r, m] of rooms) {
      const lay = layoutRoom(this.rooms[r]!, this.orderedSubjects(m, order));
      mixed += lay.mixedRows.length;
      examCount.set(r, [...m.values()].reduce((a, l) => a + l.length, 0));
    }
    const rankKey = [...S].map((r) => this.rooms[r]!.rank).sort((a, b) => a - b);
    return { key: S.join(','), rankKey, examRoom, studyRoom, rooms, unplaced, used, displaced, leave, balance, mixed, examCount, usedApprovals };
  }

  private orderedSubjects(m: Map<string, Stu[]>, order: Map<string, number>): { subject: string; students: Stu[] }[] {
    return [...m.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99) || (a[0] < b[0] ? -1 : 1))
      .map(([subject, students]) => ({ subject, students }));
  }

  // ───────────── 輸出（第二階段）─────────────

  private output(plans: SlotPlan[]): PlanOutput {
    const slots = this.input.slots;
    const usage: Record<string, Record<string, 'exam' | 'study'>> = {};
    const exams: ExamPlacement[] = [];
    const study: StudyPlacement[] = [];
    const mixedRows: { slotId: string; roomId: string; row: number }[] = [];
    const proposals: Proposal[] = [];
    const unplaced: { slotId: string; code: string }[] = [];
    /** 跨科同座位：記每人上一次在某考場的座位 */
    const lastSeat = new Map<string, string>();
    plans.forEach((p, s) => {
      const slot = slots[s]!;
      const u: Record<string, 'exam' | 'study'> = {};
      const order = this.subjectOrder[s]!;
      for (const r of [...p.rooms.keys()].sort((a, b) => a - b)) {
        const room = this.rooms[r]!;
        u[room.id] = 'exam';
        const lay = layoutRoom(room, this.orderedSubjects(p.rooms.get(r)!, order));
        const placed = alignSeats(lay.placed, room, lastSeat);
        for (const x of placed) {
          exams.push({ slotId: slot.id, code: x.st.code, subjectId: x.subject, roomId: room.id, row: x.row, depth: x.depth });
          lastSeat.set(`${x.st.code}|${room.id}`, `${x.row}-${x.depth}`);
        }
        for (const row of lay.mixedRows) mixedRows.push({ slotId: slot.id, roomId: room.id, row });
      }
      for (const st of this.stus) {
        const r = p.studyRoom[st.idx]!;
        if (r < 0) continue;
        const room = this.rooms[r]!;
        u[room.id] = 'study';
        study.push({ slotId: slot.id, code: st.code, roomId: room.id });
      }
      usage[slot.id] = u;
      for (const r of [...p.usedApprovals].sort((a, b) => a - b)) {
        const room = this.rooms[r]!;
        const n = p.studyRoom.reduce((a, x, i) => a + (x === r && this.stus[i]!.classNo !== room.classNo ? 1 : 0), 0);
        proposals.push({ kind: 'use-class-room', slotId: slot.id, roomId: room.id, status: 'approved', reason: `已核可：${room.id} 在此時段收 ${n} 位抽離自習`, count: n });
      }
      for (const i of p.unplaced) unplaced.push({ slotId: slot.id, code: this.stus[i]!.code });
      if (p.unplaced.length && !this.input.allowOtherClassStudy) proposals.push(...this.propose(s, p, plans));
    });
    const out: PlanOutput = { usage, exams, study, mixedRows, proposals, ...(unplaced.length ? { unplaced } : {}) };
    return { ...out, metrics: computeMetrics(this.input, out) };
  }

  /** 綜合教室自習容量不足：建議改用哪幾間原班教室（該時段沒當考場、還有空位），待管理者核可 */
  private propose(s: number, p: SlotPlan, plans: readonly SlotPlan[]): Proposal[] {
    const slot = this.input.slots[s]!;
    const usedAll = new Set<number>();
    for (const q of plans) for (const r of q.used) usedAll.add(r);
    const stayLoad = new Map<number, number>();
    p.studyRoom.forEach((r) => {
      if (r >= 0) stayLoad.set(r, (stayLoad.get(r) ?? 0) + 1);
    });
    const cands = this.rooms
      .filter((r) => r.kind === 'class' && !p.rooms.has(r.idx) && !this.approved[s]!.has(r.idx))
      .map((r) => ({ r, spare: r.studyCap - (stayLoad.get(r.idx) ?? 0) }))
      .filter((x) => x.spare > 0)
      .sort((a, b) => b.spare - a.spare || a.r.rank - b.r.rank);
    let need = p.unplaced.length;
    const out: Proposal[] = [];
    for (const { r, spare } of cands) {
      if (need <= 0) break;
      const take = Math.min(need, spare);
      const stay = stayLoad.get(r.idx) ?? 0;
      const addsRoom = !usedAll.has(r.idx);
      out.push({
        kind: 'use-class-room',
        slotId: slot.id,
        roomId: r.id,
        status: 'pending',
        count: take,
        addsRoom,
        reason: `綜合教室自習容量不足，還缺 ${need} 位；建議改用 ${r.id}（此時段沒當考場，原班留在那裡 ${stay} 人，加入 ${take} 人後共 ${stay + take} 人，自習容量 ${r.studyCap}）。影響：教室總數${addsRoom ? ' +1' : '不變'}、${take} 位要離開原班，只影響這個時段。未經核可不會採用。`,
      });
      need -= take;
    }
    return out;
  }
}

function toRoom(r: PlanRoom, idx: number): Room {
  const seats = [...r.seats].sort((a, b) => a.row - b.row || a.depth - b.depth);
  const rows: { row: number; depths: number[] }[] = [];
  for (const s of seats) {
    const last = rows[rows.length - 1];
    if (last && last.row === s.row) last.depths.push(s.depth);
    else rows.push({ row: s.row, depths: [s.depth] });
  }
  const rank = r.kind === 'class' ? (r.classNo ?? 500) * 1 + idx / 1000 : 1000 + idx;
  return { idx, id: r.id, kind: r.kind, classNo: r.classNo, track: r.track, seats, rows, studyCap: r.studyCapacity, rank };
}

interface Placed {
  st: Stu;
  subject: string;
  row: number;
  depth: number;
}

/**
 * 第二階段：一間考場的座位（順序固定、不權衡）。
 * 各科依時段科目順序成段；若剩下的排還夠每科從新的一排開始就分排（容許留空），不夠才同排接續（連續分區）。
 * 每科段內沿用 D73：每排給輪到的下一班，該班用完就在同一排接下一班；同班依座號由小到大。
 */
export function layoutRoom(room: Pick<Room, 'rows'>, subjects: readonly { subject: string; students: readonly Stu[] }[]): { placed: Placed[]; mixedRows: number[] } {
  const rows = room.rows;
  const placed: Placed[] = [];
  let ri = 0;
  let off = 0;
  const list = subjects.filter((x) => x.students.length > 0);
  /** 從第 start 排開始、每科都從新的一排起，排得下嗎 */
  const alignedFits = (start: number, from: number): boolean => {
    let r = start;
    for (let i = from; i < list.length; i++) {
      let need = list[i]!.students.length;
      while (need > 0) {
        if (r >= rows.length) return false;
        need -= rows[r]!.depths.length;
        r++;
      }
    }
    return true;
  };
  for (let si = 0; si < list.length; si++) {
    const { subject, students } = list[si]!;
    if (off > 0 && alignedFits(ri + 1, si)) {
      ri++;
      off = 0;
    }
    // 班級佇列（班序、座號）
    const byClass = new Map<number, Stu[]>();
    for (const st of students) byClass.set(st.classNo, [...(byClass.get(st.classNo) ?? []), st]);
    const queues = [...byClass.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.sort((a, b) => a.seatNo - b.seatNo));
    const taken = queues.map(() => 0);
    const avail = (k: number): boolean => taken[k]! < queues[k]!.length;
    const findFrom = (start: number): number => {
      for (let i = 0; i < queues.length; i++) {
        const k = (start + i) % queues.length;
        if (avail(k)) return k;
      }
      return -1;
    };
    let left = students.length;
    let next = 0;
    while (left > 0 && ri < rows.length) {
      const row = rows[ri]!;
      let cur = findFrom(next);
      next = (cur + 1) % queues.length;
      while (off < row.depths.length && left > 0) {
        if (!avail(cur)) cur = findFrom(cur + 1);
        placed.push({ st: queues[cur]![taken[cur]!]!, subject, row: row.row, depth: row.depths[off]! });
        taken[cur]!++;
        left--;
        off++;
      }
      if (off >= row.depths.length) {
        ri++;
        off = 0;
      }
    }
    if (left > 0) throw new Error(`考場座位不足（第二階段）：還有 ${left} 人`);
  }
  const subsByRow = new Map<number, Set<string>>();
  for (const p of placed) subsByRow.set(p.row, (subsByRow.get(p.row) ?? new Set()).add(p.subject));
  const mixedRows = [...subsByRow.entries()].filter(([, s]) => s.size > 1).map(([r]) => r).sort((a, b) => a - b);
  return { placed, mixedRows };
}

/**
 * 第二階段 ③：跨科盡量同座位，但輸給 ①（座號依序、同排同班）。
 * 只做不會破壞 ① 的調整：某人上次在這間考場坐過的座位，這次若空著、且在同一排內他前後同班同學之間（不改變排內順序），就移過去。
 */
function alignSeats(placed: Placed[], room: Pick<Room, 'id'>, lastSeat: ReadonlyMap<string, string>): Placed[] {
  if (!placed.length) return placed;
  const roomId = room.id;
  const occupied = new Set(placed.map((p) => `${p.row}-${p.depth}`));
  const out = placed.map((p) => ({ ...p }));
  for (const p of out) {
    const want = lastSeat.get(`${p.st.code}|${roomId}`);
    if (!want || want === `${p.row}-${p.depth}` || occupied.has(want)) continue;
    const [wr, wd] = want.split('-').map(Number) as [number, number];
    if (wr !== p.row) continue; // 換排會動到「一排一班、輪流」，不做
    const sameRow = out.filter((q) => q.row === p.row && q !== p).sort((a, b) => a.depth - b.depth);
    const before = sameRow.filter((q) => q.depth < p.depth).pop();
    const after = sameRow.find((q) => q.depth > p.depth);
    const lo = before ? before.depth : 0;
    const hi = after ? after.depth : Infinity;
    if (wd <= lo || wd >= hi) continue; // 會越過鄰座，排內順序就變了
    occupied.delete(`${p.row}-${p.depth}`);
    p.depth = wd;
    occupied.add(want);
  }
  return out;
}
