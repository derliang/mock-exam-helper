/**
 * 分科時程推薦（AST-3，D101④、DESIGN 10.19）：純函式。
 * 先比時程指標（天數、時段數、同時考場峰值、監考人力），選定時程後才排座；不用 CP-SAT。
 * 規則：兩科有共同考生就不可同節（H-02）；不可行的候選不提供調整方案、不虛構（D101④）。
 * 候選：A 基準（呼叫端給的節次表順序，不寫死）、B 調整順序（指標與基準相同，如實標「無改善」）、
 *      C 文理同節考不同科（沒有共同考生的科目兩兩同節，天數不變）、D 縮成一天（時段數取基準每天最多的那天）。
 * 分科每科時長不鎖（R3），這裡完全不看分鐘數。
 */

export type CandId = 'A' | 'B' | 'C' | 'D';
/** 一份時程：天 → 時段 → 同時進行的科目 id */
export type Days = string[][][];

export interface SchedMetrics {
  days: number;
  slots: number;
  /** 同時考場峰值：同一時段各科所需考場數加總的最大值 */
  peakRooms: number;
  /** 監考人力峰值（＝峰值考場 × 每間人數） */
  invigPeak: number;
  /** 監考人力總人次（各時段考場數 × 每間人數，加總） */
  invigTotal: number;
}

export interface Candidate {
  id: CandId;
  title: string;
  days: Days;
  verdict: 'baseline' | 'same' | 'ok' | 'costly' | 'infeasible';
  /** 與基準的差異與理由（誠實寫） */
  note: string;
  metrics?: SchedMetrics;
  /** 不可行時列出擋住的科目對與共同考生數（不提供調整方案） */
  blockers: { a: string; b: string; count: number }[];
}

export interface ScheduleInput {
  /** 基準時程（內建大考順序或管理者改過的節次表），不寫死 */
  base: Days;
  /** 每位考生考的科目 id */
  subjectSets: readonly (readonly string[])[];
  /** 每間考場約幾個座位（算同時考場峰值用）；預設 45 */
  seatsPerRoom?: number;
  /** 每間考場監考人數（預設 1，1～6） */
  invigilators?: number;
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 每對科目的共同考生數（兩科都考的人數）與各科人數 */
export function commonCounts(sets: readonly (readonly string[])[]): { pair: Map<string, number>; size: Map<string, number> } {
  const pair = new Map<string, number>();
  const size = new Map<string, number>();
  for (const raw of sets) {
    const ids = [...new Set(raw)].sort();
    for (const id of ids) size.set(id, (size.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i]!, ids[j]!);
        pair.set(k, (pair.get(k) ?? 0) + 1);
      }
    }
  }
  return { pair, size };
}

/** 某份時程裡「同一時段兩科有共同考生」的衝突（T-19、T-20）；空陣列＝時程可行 */
export function scheduleConflicts(days: Days, sets: readonly (readonly string[])[]): { slot: string; a: string; b: string; count: number }[] {
  const { pair } = commonCounts(sets);
  const out: { slot: string; a: string; b: string; count: number }[] = [];
  let n = 0;
  for (const d of days) {
    for (const slot of d) {
      n++;
      for (let i = 0; i < slot.length; i++) {
        for (let j = i + 1; j < slot.length; j++) {
          const c = pair.get(pairKey(slot[i]!, slot[j]!)) ?? 0;
          if (c > 0) out.push({ slot: `第 ${n} 時段`, a: slot[i]!, b: slot[j]!, count: c });
        }
      }
    }
  }
  return out;
}

export function scheduleMetrics(days: Days, size: ReadonlyMap<string, number>, seatsPerRoom = 45, invigilators = 1): SchedMetrics {
  const per = Math.max(1, seatsPerRoom);
  const inv = Math.min(6, Math.max(1, invigilators));
  let peak = 0;
  let total = 0;
  let slots = 0;
  for (const d of days) {
    for (const slot of d) {
      slots++;
      const rooms = slot.reduce((n, id) => n + Math.ceil((size.get(id) ?? 0) / per), 0);
      peak = Math.max(peak, rooms);
      total += rooms;
    }
  }
  return { days: days.length, slots, peakRooms: peak, invigPeak: peak * inv, invigTotal: total * inv };
}

/** 把一串科目分成最多 maxSlots 個時段：同時段不可有共同考生；分不完回 null（回溯，科目數很小） */
function partition(ids: readonly string[], pair: ReadonlyMap<string, number>, maxSlots: number, maxPerSlot: number): string[][] | null {
  const groups: string[][] = [];
  const place = (i: number): boolean => {
    if (i === ids.length) return true;
    const id = ids[i]!;
    for (const g of groups) {
      if (g.length >= maxPerSlot) continue;
      if (g.some((x) => (pair.get(pairKey(x, id)) ?? 0) > 0)) continue;
      g.push(id);
      if (place(i + 1)) return true;
      g.pop();
    }
    if (groups.length < maxSlots) {
      groups.push([id]);
      if (place(i + 1)) return true;
      groups.pop();
    }
    return false;
  };
  return place(0) ? groups.map((g) => [...g]) : null;
}

/** 把時段平均分到 n 天（前面的天多一個） */
function spread(slots: string[][], n: number): Days {
  const days: Days = Array.from({ length: Math.max(1, n) }, () => []);
  const base = Math.floor(slots.length / days.length);
  let extra = slots.length % days.length;
  let at = 0;
  for (const d of days) {
    const take = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    d.push(...slots.slice(at, at + take));
    at += take;
  }
  return days.filter((d) => d.length > 0);
}

function topPairs(pair: ReadonlyMap<string, number>, ids: readonly string[]): { a: string; b: string; count: number }[] {
  const set = new Set(ids);
  return [...pair.entries()]
    .filter(([k, c]) => c > 0 && k.split('|').every((x) => set.has(x)))
    .map(([k, count]) => {
      const [a, b] = k.split('|') as [string, string];
      return { a, b, count };
    })
    .sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
    .slice(0, 6);
}

/** 四個候選時程（A 基準、B 調序、C 文理同節、D 縮成一天）；不可行的只列原因與共同考生數 */
export function buildCandidates(inp: ScheduleInput): Candidate[] {
  const { pair, size } = commonCounts(inp.subjectSets);
  const m = (d: Days) => scheduleMetrics(d, size, inp.seatsPerRoom, inp.invigilators);
  const base: Days = inp.base.map((d) => d.map((s) => [...s]));
  const bm = m(base);
  const ids = base.flat(2);
  const out: Candidate[] = [{ id: 'A', title: '基準（目前的分科節次表）', days: base, verdict: 'baseline', note: '依共用設定「節次與時長」的順序，不寫死、管理者可改。', metrics: bm, blockers: [] }];

  // B：每天把第一科移到最後（只是調順序，指標不變）
  const reorder: Days = base.map((d) => (d.length > 1 ? [...d.slice(1), d[0]!] : d.map((s) => [...s])));
  const rm = m(reorder);
  const noGain = rm.peakRooms === bm.peakRooms && rm.slots === bm.slots && rm.days === bm.days && rm.invigTotal === bm.invigTotal;
  out.push({ id: 'B', title: '調整順序', days: reorder, verdict: noGain ? 'same' : rm.peakRooms > bm.peakRooms ? 'costly' : 'ok', note: noGain ? '只換每天的科目順序，天數、時段數、同時考場峰值與基準相同，沒有改善。' : '調整順序後指標與基準不同。', metrics: rm, blockers: [] });

  // C：沒有共同考生的兩科同節，天數不變
  const used = new Set<string>();
  const merged: string[][] = [];
  for (const id of ids) {
    if (used.has(id)) continue;
    used.add(id);
    const mate = ids.find((x) => !used.has(x) && (pair.get(pairKey(id, x)) ?? 0) === 0);
    if (mate) {
      used.add(mate);
      merged.push([id, mate]);
    } else merged.push([id]);
  }
  if (merged.length < ids.length) {
    const cDays = spread(merged, Math.min(base.length, merged.length));
    const cm = m(cDays);
    out.push({ id: 'C', title: '文理同節考不同科', days: cDays, verdict: cm.peakRooms > bm.peakRooms ? 'costly' : 'ok', note: `把沒有共同考生的兩科排在同一節，時段數由 ${bm.slots} 減為 ${cm.slots}；同時考場峰值 ${bm.peakRooms}→${cm.peakRooms}。${cm.peakRooms > bm.peakRooms ? '可行但代價較高，需人工確認。' : ''}`, metrics: cm, blockers: [] });
  } else {
    out.push({ id: 'C', title: '文理同節考不同科', days: base, verdict: 'infeasible', note: '每兩科之間都有共同考生，沒有任何兩科可以同節；不提供調整方案。', blockers: topPairs(pair, ids) });
  }

  // D：縮成一天（時段數＝基準每天最多的那天）
  const perDay = Math.max(1, ...base.map((d) => d.length));
  const dGroups = base.length <= 1 ? null : partition(ids, pair, perDay, Math.ceil(ids.length / perDay));
  if (dGroups) {
    const dd: Days = [dGroups];
    const dm = m(dd);
    out.push({ id: 'D', title: '縮短成一天', days: dd, verdict: dm.peakRooms > bm.peakRooms ? 'costly' : 'ok', note: `考試由 ${bm.days} 天縮成 1 天，時段數 ${bm.slots}→${dm.slots}；同時考場峰值 ${bm.peakRooms}→${dm.peakRooms}，監考人力峰值 ${bm.invigPeak}→${dm.invigPeak}。需人工確認。`, metrics: dm, blockers: [] });
  } else {
    out.push({ id: 'D', title: '縮短成一天', days: base, verdict: 'infeasible', note: base.length <= 1 ? '基準已經只有一天。' : `一天只有 ${perDay} 個時段，要把 ${ids.length} 科擠進去，必有兩科有共同考生同節；不可行，不提供調整方案。`, blockers: topPairs(pair, ids) });
  }
  return out;
}

/** 非基準候選必須經管理者核准才能定案（「設為草案」與「核准」分開；未核准不得公告） */
export function scheduleNeedsApproval(s: { cand: CandId; approved?: boolean } | undefined): boolean {
  return !!s && s.cand !== 'A' && !s.approved;
}
