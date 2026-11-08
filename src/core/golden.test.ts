/**
 * 黃金測試：舊座位表的去識別化版面結構（只有班級人數、每排可用的深位、各排的班級編號區段；
 * 編號＝班級 2 碼＋座號 2 碼，無姓名學號）。舊表上的空格是實體桌位缺口，所以這裡用 seatLayouts 直接給版面。
 * 結論見 docs/dispatch/完工-B.md〈D24 驗證〉。
 */
import { describe, expect, it } from 'vitest';
import { studentCode } from '../data/helpers';
import type { SeatAssignment, SeatPos } from '../data/types';
import { seatLayouts, type SeatLayout } from './seating';

/** 版面：每排一個字串，由深位 1（講臺）往後，1＝有座位、0＝缺口 */
function layout(id: string, rows: string[]): SeatLayout {
  const seats: SeatPos[] = [];
  rows.forEach((pattern, i) => {
    [...pattern].forEach((ch, d) => {
      if (ch === '1') seats.push({ row: i + 1, depth: d + 1 });
    });
  });
  return { id, seats };
}

function codesOf(sizes: Record<number, number>): string[] {
  return Object.entries(sizes).flatMap(([c, n]) => Array.from({ length: n }, (_, i) => studentCode(Number(c), i + 1)));
}

/** 把排座結果寫成「班:起-迄」區段，每排以 | 分隔 */
function describeRoom(id: string, a: readonly SeatAssignment[]): string {
  const here = a.filter((x) => x.classroomId === id).sort((x, y) => x.row - y.row || x.depth - y.depth);
  const rows: string[][] = [];
  let lastRow = 0;
  let seg: { c: string; s: number; e: number } | null = null;
  for (const x of here) {
    const c = x.code.slice(0, 2);
    const s = Number(x.code.slice(2));
    if (x.row !== lastRow) {
      rows.push([]);
      lastRow = x.row;
      seg = null;
    }
    const cur = rows[rows.length - 1]!;
    if (seg && seg.c === c && seg.e === s - 1) {
      seg.e = s;
      cur[cur.length - 1] = `${c}:${seg.s}-${s}`;
    } else {
      seg = { c, s, e: s };
      cur.push(`${c}:${s}-${s}`);
    }
  }
  return rows.map((r) => r.join(' ')).join(' | ');
}

describe('D24 舊座位表驗證（rotation 策略）', () => {
  it('高三 E2 理組三間教室完全吻合', () => {
    const rooms = [
      layout('R1', ['1111110', '1111111', '1111111', '1111111', '1111111', '1111111', '1111110']),
      layout('R2', ['1111110', '1111111', '1111111', '1111111', '1111111', '1111110', '1111110']),
      layout('R3', ['0111110', '1111111', '1111111', '1111111', '1111111', '1111111', '0111111']),
    ];
    const r = seatLayouts(rooms, codesOf({ 1: 47, 2: 46, 3: 46 }), 'rotation');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(describeRoom('R1', r.assignments)).toBe(
      '01:1-6 | 02:1-7 | 03:1-7 | 01:7-13 | 02:8-14 | 03:8-14 | 01:14-19',
    );
    expect(describeRoom('R2', r.assignments)).toBe(
      '02:15-20 | 03:15-21 | 01:20-26 | 02:21-27 | 03:22-28 | 01:27-32 | 02:28-33',
    );
    expect(describeRoom('R3', r.assignments)).toBe(
      '03:29-33 | 01:33-39 | 02:34-40 | 03:34-40 | 01:40-46 | 02:41-46 03:41-41 | 03:42-46 01:47-47',
    );
  });

  it('國三第 1～5 間吻合；第 6 間舊表是依編號連續排，rotation 不同（已回報調度員）', () => {
    const rooms = [
      layout('J1', ['1111110', '1111111', '1111111', '1111111', '1111111', '1111110']),
      layout('J2', ['0111111', '1111111', '1111111', '1111111', '1111111', '0111111']),
      layout('J3', ['1111111', '1111111', '1111111', '1111111', '1111111', '1111110']),
      layout('J4', ['1111110', '1111111', '1111111', '1111111', '1111110', '1111110']),
      layout('J5', ['1111110', '1111111', '1111111', '1111111', '1111110', '1111110']),
      layout('J6', ['1111110', '1111110', '1111110', '1111111', '1111111', '1111111']),
    ];
    const r = seatLayouts(rooms, codesOf({ 1: 40, 2: 40, 3: 41, 4: 39, 5: 39, 6: 39 }), 'rotation');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(describeRoom('J1', r.assignments)).toBe('01:1-6 | 02:1-7 | 03:1-7 | 04:1-7 | 05:1-7 | 06:1-6');
    expect(describeRoom('J2', r.assignments)).toBe('01:7-12 | 02:8-14 | 03:8-14 | 04:8-14 | 05:8-14 | 06:7-12');
    expect(describeRoom('J3', r.assignments)).toBe('01:13-19 | 02:15-21 | 03:15-21 | 04:15-21 | 05:15-21 | 06:13-18');
    expect(describeRoom('J4', r.assignments)).toBe('01:20-25 | 02:22-28 | 03:22-28 | 04:22-28 | 05:22-27 | 06:19-24');
    expect(describeRoom('J5', r.assignments)).toBe('01:26-31 | 02:29-35 | 03:29-35 | 04:29-35 | 05:28-33 | 06:25-30');
    // 舊表第 6 間：01:32-37 | 01:38-40 02:36-38 | 02:39-40 03:36-39 | 03:40-41 04:36-39 05:34 | 05:35-39 06:31-32 | 06:33-39
    expect(describeRoom('J6', r.assignments)).not.toBe(
      '01:32-37 | 01:38-40 02:36-38 | 02:39-40 03:36-39 | 03:40-41 04:36-39 05:34-34 | 05:35-39 06:31-32 | 06:33-39',
    );
  });
});
