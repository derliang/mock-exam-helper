import { describe, expect, it } from 'vitest';
import type { Classroom } from '../data';
import { addRoom, checkSeats, clickSeat, isSeatActive, patchRoom, removeRoom, resize, seatCap, seatIndex, seatTotals } from './rooms';

const room = (o: Partial<Classroom> = {}): Classroom => ({ id: 'r', name: 'A', kind: 'class', rows: 5, depth: 6, seatCount: 30, ...o });

describe('教室座位編輯', () => {
  it('座位上限＝一張標籤紙：B4 48、A3 49', () => {
    expect(seatCap('B4')).toBe(48);
    expect(seatCap('A3')).toBe(49);
  });
  it('座位序號：第 1 排深位 1→depth，再第 2 排', () => {
    const r = room({ rows: 2, depth: 3, seatCount: 4 });
    expect(seatIndex(r, { row: 1, depth: 1 })).toBe(0);
    expect(seatIndex(r, { row: 1, depth: 3 })).toBe(2);
    expect(seatIndex(r, { row: 2, depth: 1 })).toBe(3);
    expect(isSeatActive(r, { row: 2, depth: 1 })).toBe(true);
    expect(isSeatActive(r, { row: 2, depth: 2 })).toBe(false);
  });
  it('點可用座位：它和它之後都不排；點不排的座位：恢復到它為止；至少留 1 個；不能超過上限', () => {
    const r = room({ rows: 2, depth: 3, seatCount: 6 });
    const a = clickSeat(r, { row: 2, depth: 1 }, 48);
    expect(a.seatCount).toBe(3);
    expect(clickSeat(a, { row: 2, depth: 2 }, 48).seatCount).toBe(5);
    expect(clickSeat(r, { row: 1, depth: 1 }, 48).seatCount).toBe(1);
    expect(clickSeat(a, { row: 2, depth: 3 }, 4).seatCount).toBe(4);
  });
  it('改橫排／深位：超過上限擋下；全開維持全開；縮小時座位數不超過總格數', () => {
    const r = room({ rows: 6, depth: 8, seatCount: 48 });
    expect(resize(r, { rows: 7 }, 48)).toBe(r);
    const s = resize(room({ rows: 5, depth: 6, seatCount: 30 }), { rows: 6 }, 48);
    expect(s).toMatchObject({ rows: 6, seatCount: 36 });
    const t = resize(room({ rows: 5, depth: 6, seatCount: 20 }), { rows: 2 }, 48);
    expect(t).toMatchObject({ rows: 2, seatCount: 12 });
    expect(resize(r, { rows: 0 }, 48).rows).toBe(1);
  });
  it('座位總數：預備教室另計', () => {
    const l = [room({ seatCount: 30 }), room({ id: 'p', kind: 'reserve', seatCount: 10 })];
    expect(seatTotals(l)).toEqual({ classSeats: 30, reserveSeats: 10 });
  });
  it('狀態檢核：少於考生擋下、多於允許並提示空位在最後', () => {
    expect(checkSeats(29, 30).level).toBe('block');
    expect(checkSeats(31, 30)).toMatchObject({ level: 'ok' });
    expect(checkSeats(31, 30).message).toContain('最後面');
    expect(checkSeats(30, 30).level).toBe('ok');
  });
  it('新增／刪除／改教室', () => {
    let l = addRoom([], 'class');
    l = addRoom(l, 'reserve');
    expect(l.map((r) => r.name)).toEqual(['試場1', '預備教室1']);
    expect(new Set(l.map((r) => r.id)).size).toBe(2);
    l = patchRoom(l, l[0]!.id, (r) => ({ ...r, name: '改名' }));
    expect(l[0]!.name).toBe('改名');
    expect(removeRoom(l, l[0]!.id)).toHaveLength(1);
  });
});
