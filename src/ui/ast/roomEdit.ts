/**
 * 分科教室編輯（稿 v2.34 ③）：每排深位數可不同、點座位停用／恢復、自習容量。純函式，回傳新教室、不改原物件。
 * 資料欄位沿用 data/types 的 rowDepths（每排深位數）、disabled（停用座位）、studyCapacity（自習容量，沒設＝可排座位）。
 * 不變條件：seatCount＝各排深位加總減停用數；depth＝最大深位數；rowDepths 全部相同時不存；沒有停用就不存 disabled。
 */
import type { Classroom } from '../../data';
import { classroomSeats, rowDepthOf, seatSlotCount, studyCapacityOf } from '../../data';

const k = (row: number, depth: number): string => `${row}-${depth}`;

/** 目前「停用」的座位集合（含舊資料用 seatCount 截掉的最後幾個） */
function offSet(r: Classroom): Set<string> {
  const usable = new Set(classroomSeats(r).map((s) => k(s.row, s.depth)));
  const off = new Set<string>();
  for (let row = 1; row <= r.rows; row++) for (let d = 1; d <= rowDepthOf(r, row); d++) if (!usable.has(k(row, d))) off.add(k(row, d));
  return off;
}

function rebuild(r: Classroom, rowDepths: number[], off: Set<string>): Classroom {
  const depth = Math.max(...rowDepths);
  const offIn = [...off].filter((key) => {
    const [a, b] = key.split('-').map(Number) as [number, number];
    return b <= (rowDepths[a - 1] ?? 0);
  });
  const slots = rowDepths.reduce((n, d) => n + d, 0);
  const { disabled: _d, rowDepths: _r, ...rest } = r;
  void _d; void _r;
  const uniform = rowDepths.every((d) => d === depth);
  return { ...rest, depth, seatCount: slots - offIn.length, ...(uniform ? {} : { rowDepths }), ...(offIn.length ? { disabled: offIn } : {}) };
}

export const rowDepthsOf = (r: Classroom): number[] => Array.from({ length: r.rows }, (_, i) => rowDepthOf(r, i + 1));

/** 第 row 排的深位數 +1／−1；深位 1..maxDepth、座位格總數不得超過 cap（標籤紙張上限），超過或不合法就原樣回傳 */
export function stepRowDepth(r: Classroom, row: number, delta: 1 | -1, limits: { depth: number; cap: number }): Classroom {
  const depths = rowDepthsOf(r);
  const cur = depths[row - 1];
  if (cur === undefined) return r;
  const next = cur + delta;
  if (next < 1) return r;
  if (delta === 1 && (next > Math.max(limits.depth, cur) || depths.reduce((n, d) => n + d, 0) + 1 > Math.max(limits.cap, seatSlotCount(r)))) return r;
  depths[row - 1] = next;
  const off = offSet(r);
  // 新增的深位預設可排（舊資料本來就沒有它）
  const out = rebuild(r, depths, off);
  return out.seatCount < 1 ? r : out;
}

/** 點一個座位：停用／恢復（至少留 1 個可排；可排座位不得超過 cap） */
export function toggleSeat(r: Classroom, row: number, depth: number, cap: number): Classroom {
  if (depth > rowDepthOf(r, row) || row > r.rows) return r;
  const off = offSet(r);
  const key = k(row, depth);
  if (off.has(key)) {
    if (r.seatCount >= cap) return r;
    off.delete(key);
  } else {
    if (r.seatCount <= 1) return r;
    off.add(key);
  }
  return rebuild(r, rowDepthsOf(r), off);
}

export const isSeatOff = (r: Classroom, row: number, depth: number): boolean => offSet(r).has(k(row, depth));

/** 自習容量 ±1（可調高也可調低，不得小於 0；與可排座位相同就不存，＝回到預設） */
export function stepStudyCapacity(r: Classroom, delta: 1 | -1): Classroom {
  const n = Math.max(0, studyCapacityOf(r) + delta);
  return setStudyCapacity(r, n);
}
export function setStudyCapacity(r: Classroom, n: number): Classroom {
  const { studyCapacity: _s, ...rest } = r;
  void _s;
  return n === r.seatCount ? rest : { ...rest, studyCapacity: n };
}
export const resetStudyCapacity = (r: Classroom): Classroom => setStudyCapacity(r, r.seatCount);

/** 手動調整狀態：raised＝比可排座位多（琥珀「已手動調高 +N」）、lowered＝比可排座位少 */
export function studyAdjust(r: Classroom): { kind: 'default' | 'raised' | 'lowered'; diff: number } {
  const d = studyCapacityOf(r) - r.seatCount;
  return { kind: d > 0 ? 'raised' : d < 0 ? 'lowered' : 'default', diff: d };
}
