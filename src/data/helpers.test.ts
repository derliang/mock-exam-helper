import { describe, expect, it } from 'vitest';
import {
  classroomSeats,
  emptySeatCount,
  isValidClassroom,
  parseStudentCode,
  seatLabel,
  studentCode,
} from './index';
import type { Classroom } from './index';

const room = (rows: number, depth: number, seatCount: number): Classroom => ({
  id: 'r',
  name: '甲',
  kind: 'class',
  rows,
  depth,
  seatCount,
});

describe('學生編號', () => {
  it('組合與反解', () => {
    expect(studentCode(1, 1)).toBe('0101');
    expect(studentCode(5, 35)).toBe('0535');
    expect(parseStudentCode('0535')).toEqual({ classNo: 5, seatNo: 35 });
    expect(parseStudentCode('535')).toBeNull();
    expect(parseStudentCode('05a5')).toBeNull();
  });
});

describe('座位', () => {
  it('座標字串為排－深位', () => {
    expect(seatLabel({ row: 1, depth: 2 })).toBe('1-2');
  });
  it('座位依排、深位連續排列，空位在最後', () => {
    const seats = classroomSeats(room(2, 3, 5));
    expect(seats).toHaveLength(5);
    expect(seats[0]).toEqual({ row: 1, depth: 1 });
    expect(seats[3]).toEqual({ row: 2, depth: 1 });
    expect(seats[4]).toEqual({ row: 2, depth: 2 });
    expect(emptySeatCount(room(2, 3, 5))).toBe(1);
  });
  it('教室設定驗證', () => {
    expect(isValidClassroom(room(2, 3, 6))).toBe(true);
    expect(isValidClassroom(room(2, 3, 7))).toBe(false);
    expect(isValidClassroom(room(0, 3, 1))).toBe(false);
    expect(isValidClassroom(room(2, 3, 2.5))).toBe(false);
  });
});
