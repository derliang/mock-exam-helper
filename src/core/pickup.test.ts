import { describe, expect, it } from 'vitest';
import type { Detach, ExamEntry, SeatAssignment } from '../data/types';
import { pickupCounts } from './stats';

// 全部是假資料：兩間班級教室（A、B）、一間預備教室（P）、兩科
const SUBJECTS = [{ id: 'zh', name: '國文' }, { id: 'ma', name: '數學' }];
const ROOMS = [{ id: 'A', kind: 'class' as const }, { id: 'B', kind: 'class' as const }, { id: 'P', kind: 'reserve' as const }];
const entry = (n: number, subjectIds: string[]): ExamEntry => ({ classNo: 1, seatNo: n, name: `甲${n}`, subjectIds });
const code = (n: number) => `01${String(n).padStart(2, '0')}`;
const seat = (roomId: string, n: number, i: number): SeatAssignment => ({ classroomId: roomId, row: 1, depth: i + 1, code: code(n) });

// 1～4 在 A；5～6 在 B。1 國數、2 國、3 國數（數學抽離考試到 P）、4 全科缺考、5 國數（國文到他處考）、6 國數（數學抽離自習）
const entries = [entry(1, ['zh', 'ma']), entry(2, ['zh']), entry(3, ['zh', 'ma']), entry(4, []), entry(5, ['zh', 'ma']), entry(6, ['zh', 'ma'])];
const assignments = [seat('A', 1, 0), seat('A', 2, 1), seat('A', 3, 2), seat('A', 4, 3), seat('B', 5, 0), seat('B', 6, 1)];
const detaches: Detach[] = [
  { code: code(3), subjectId: 'ma', purpose: 'exam', roomId: 'P', seat: { row: 1, depth: 1 } },
  { code: code(6), subjectId: 'ma', purpose: 'study', roomId: 'P' },
];
const special = [{ code: code(5), subjectId: 'zh', purpose: 'exam' as const, location: '教務處' }];

describe('領卷清單份數（H3）', () => {
  const r = pickupCounts({ rooms: ROOMS, assignments, entries, subjects: SUBJECTS, detaches, special });
  const pick = (room: string, sub: string) => r.find((x) => x.classroomId === room)!.subjects.find((s) => s.subjectId === sub)!;

  it('班級教室：全科缺考者不計（D79）；抽離考試的人不計本教室', () => {
    expect(pick('A', 'zh').count).toBe(3); // 1、2、3；4 全科缺考不計
    expect(pick('A', 'ma').count).toBe(1); // 只有 1；3 抽離考試
    expect(pick('A', 'ma').detachedOut).toBe(1);
  });
  it('抽離自習不考試：兩邊都不計', () => {
    expect(pick('B', 'ma').count).toBe(1); // 5；6 抽離自習
    expect(pick('P', 'ma').count).toBe(1); // 預備教室只算抽離考試的 3
  });
  it('個別覆寫到他處考試：不計本教室，另記地點', () => {
    expect(pick('B', 'zh').count).toBe(1); // 只有 6
    expect(pick('B', 'zh').elsewhere).toBe(1);
    expect(pick('B', 'zh').locations).toEqual(['教務處']);
  });
  it('預備教室（備用）：只算抽離到這間且考試的人，沒有人的科目是 0', () => {
    expect(pick('P', 'zh').count).toBe(0);
  });
  it('教室合計＝各科份數相加', () => {
    expect(r.map((x) => [x.classroomId, x.total])).toEqual([['A', 4], ['B', 2], ['P', 1]]);
  });
  it('守恆：每位考生每科恰好在一處領卷（教室＋預備＋他處）', () => {
    for (const s of SUBJECTS) {
      const taking = entries.filter((e) => e.subjectIds.includes(s.id)).length;
      const study = detaches.filter((d) => d.subjectId === s.id && d.purpose === 'study').length;
      const placed = r.reduce((n, x) => n + x.subjects.find((y) => y.subjectId === s.id)!.count, 0)
        + r.reduce((n, x) => n + x.subjects.find((y) => y.subjectId === s.id)!.elsewhere, 0);
      expect(placed + study).toBe(taking);
    }
  });
  it('個別覆寫選自習：不計本教室、也不算到他處考', () => {
    const r2 = pickupCounts({ rooms: ROOMS, assignments, entries, subjects: SUBJECTS, detaches, special: [{ code: code(5), subjectId: 'zh', purpose: 'study' }] });
    const b = r2.find((x) => x.classroomId === 'B')!.subjects.find((s) => s.subjectId === 'zh')!;
    expect(b).toMatchObject({ count: 1, elsewhere: 0 });
  });
});
