import { describe, expect, it } from 'vitest';
import { classColorVars, colorConflicts, normColor } from './colors';

describe('班級色', () => {
  it('12 色循環且只輸出變數', () => {
    expect(normColor(1)).toBe(1);
    expect(normColor(12)).toBe(12);
    expect(normColor(13)).toBe(1);
    expect(normColor(0)).toBe(1);
    expect(classColorVars(7)).toEqual({ background: 'var(--c7-bg)', borderColor: 'var(--c7-line)', color: 'var(--c7-ink)' });
  });
  it('改色撞色提醒', () => {
    const cs = [{ no: 1, colorIndex: 1 }, { no: 2, colorIndex: 2 }];
    expect(colorConflicts(cs, 1, 2)).toEqual([2]);
    expect(colorConflicts(cs, 1, 3)).toEqual([]);
  });
});
