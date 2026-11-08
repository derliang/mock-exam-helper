import { describe, expect, it } from 'vitest';
import { describeChange } from './describeChange';
import { emptyDoc, withDefaults } from './repository';
import { addStudent, removeStudent, setClassColor } from './store';

const base = () => withDefaults(emptyDoc());

describe('describeChange 推出動作名稱', () => {
  it('新增／刪除學生、班級色', () => {
    const d = base();
    const c = d.settings.classes.find((x) => x.division === 'senior')!;
    const r = addStudent(d, 'senior', { classNo: c.no, seatNo: 1, name: '測試生' });
    if (!r.ok) throw new Error(r.error);
    expect(describeChange(d, r.doc)).toBe('新增學生');
    expect(describeChange(r.doc, removeStudent(r.doc, 'senior', r.doc.rosters.senior[0]!))).toBe('刪除學生');
    expect(describeChange(d, setClassColor(d, 'senior', c.no, (c.colorIndex + 1) % 12))).toBe('修改班級色');
  });
  it('沒差異回 undefined', () => {
    const d = base();
    expect(describeChange(d, { ...d })).toBeUndefined();
  });
});
