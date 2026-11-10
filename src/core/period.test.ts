import { describe, expect, it } from 'vitest';
import { studentCode } from '../data/helpers';
import type { ClassInfo, Classroom, Subject } from '../data/types';
import { allocateDetaches, defaultSchedule, examPeriods, hasSharedPeriod, periodMap, scheduleKey } from './index';

const room = (id: string, rows: number, depth: number): Classroom => ({ id, name: id, kind: 'reserve', rows, depth, seatCount: rows * depth });
const cls = (n: number): ClassInfo[] => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: `C${i + 1}`, division: 'senior', track: 'science', colorIndex: i }));
const subjects: Subject[] = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }];
const extra = (c: string, s: string) => ({ code: c, subjectId: s, mode: 'extra' as const });

describe('節次表（校-55）', () => {
  it('預設表依類型與次別；一節一科', () => {
    expect(scheduleKey('gsat', 2)).toBe('gsat12');
    expect(scheduleKey('gsat', 3)).toBe('gsat34');
    const m = periodMap([{ id: 'english' }, { id: 'science' }, { id: 'chinese' }, { id: 'en-listen' }, { id: 'math' }, { id: 'social' }], defaultSchedule('gsat12'));
    expect([...m.values()]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hasSharedPeriod(m)).toBe(false);
  });
  it('勾「與上一科同節」才同節；表上沒有的科目接在後面各自一節', () => {
    const m = periodMap([{ id: 'x' }, { id: 'y' }, { id: 'z' }], [{ subjectId: 'x', day: 1 }, { subjectId: 'y', day: 1, same: true }]);
    expect(m.get('x')).toBe(1); expect(m.get('y')).toBe(1); expect(m.get('z')).toBe(2);
    expect(hasSharedPeriod(m)).toBe(true);
  });
  it('設定改過就用設定的表', () => {
    const p = examPeriods({ schedules: { bcct: [{ subjectId: 'math', day: 1 }, { subjectId: 'social', day: 1, same: true }] } }, { kind: 'bcct', subjects: [{ id: 'math' }, { id: 'social' }] });
    expect(p.get('math')).toBe(p.get('social'));
  });
});

describe('預備教室依節次與排座方式（校-56）', () => {
  const reserve = [room('P1', 1, 3), room('P2', 1, 3)];
  it('同一節的兩科抽離考試不能共用教室（同節加總）', () => {
    const marks = [extra('0101', 'a'), extra('0102', 'a'), extra('0201', 'b'), extra('0202', 'b')];
    const same = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: reserve, classes: cls(2), periods: new Map([['a', 1], ['b', 1], ['c', 2]]), reserveMode: 'invigilator' });
    expect(same.ok && same.detaches.map((d) => `${d.subjectId}${d.code}@${d.roomId}`)).toEqual(['a0101@P1', 'a0102@P1', 'b0201@P2', 'b0202@P2']);
    const diff = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: reserve, classes: cls(2), periods: new Map([['a', 1], ['b', 2], ['c', 3]]), reserveMode: 'invigilator' });
    expect(diff.ok && new Set(diff.detaches.map((d) => d.roomId))).toEqual(new Set(['P1'])); // 不同節重用教室
  });
  it('同節加總超過容量時擋下並說明', () => {
    const marks = [0, 1, 2, 3].map((i) => extra(studentCode(1, i + 1), 'a')).concat([0, 1, 2, 3].map((i) => extra(studentCode(2, i + 1), 'b')));
    const r = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: [room('P1', 1, 3), room('P2', 1, 3)], classes: cls(2), periods: new Map([['a', 1], ['b', 1], ['c', 2]]), reserveMode: 'invigilator' });
    expect(r.ok).toBe(false);
  });
  it('同學優先：同一人跨節加考是同一個座位', () => {
    const marks = [extra('0101', 'a'), extra('0102', 'a'), extra('0101', 'b'), extra('0103', 'b')];
    const r = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: reserve, classes: cls(1), periods: new Map([['a', 1], ['b', 2], ['c', 3]]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const seat = (s: string, c: string) => { const d = r.detaches.find((x) => x.subjectId === s && x.code === c)!; return `${d.roomId}:${d.seat!.row}-${d.seat!.depth}`; };
    expect(seat('a', '0101')).toBe(seat('b', '0101'));
  });
  it('監考優先：每科各自集中排，不保證同位', () => {
    const marks = [extra('0102', 'a'), extra('0101', 'b'), extra('0102', 'b')];
    const r = allocateDetaches({ subjects, marks, overrides: [], reserveRooms: reserve, classes: cls(1), periods: new Map([['a', 1], ['b', 2], ['c', 3]]), reserveMode: 'invigilator' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.detaches.find((d) => d.subjectId === 'a')!;
    expect(a.seat).toEqual({ row: 1, depth: 1 }); // a 科只有一人，排第一個座位
  });
});
