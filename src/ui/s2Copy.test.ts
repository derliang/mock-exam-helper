/** S2 文案稽核：Q5 名單比對「以…為準」預告（Issue #185）、Q2 考生人數口徑（Issue #184） */
import { describe, expect, it } from 'vitest';
import type { RosterDiff } from '../data';
import { applyDiffs } from '../import';
import { previewChoice } from './step2';
import { checkSeats } from './rooms';

const A = { classNo: 1, seatNo: 5, name: '甲' };
const B = { classNo: 1, seatNo: 5, name: '乙' };

describe('Q5：以…為準的預告', () => {
  it('只在考試名單：以考試名單為準＝學生名單新增；以學生名單為準＝考試名單移除並丟掉考科與標示', () => {
    const d: RosterDiff = { kind: 'only-in-exam', code: '0105', exam: A };
    expect(previewChoice(d, 'use-exam')).toContain('學生名單會新增');
    const t = previewChoice(d, 'use-roster')!;
    expect(t).toContain('考試名單會移除');
    expect(t).toContain('X／＋');
  });
  it('只在學生名單：以考試名單為準＝學生名單移除；以學生名單為準＝補一筆沒有考科的考試名單', () => {
    const d: RosterDiff = { kind: 'only-in-roster', code: '0105', roster: A };
    expect(previewChoice(d, 'use-exam')).toContain('學生名單會移除');
    expect(previewChoice(d, 'use-roster')).toContain('沒有任何考科');
  });
  it('姓名或班座不同：預告改哪一邊，且與 applyDiffs 實際結果一致', () => {
    const d: RosterDiff = { kind: 'mismatch', code: '0105', exam: A, roster: B };
    expect(previewChoice(d, 'use-exam')).toContain('學生名單會改成考試名單');
    expect(previewChoice(d, 'use-roster')).toContain('考試名單會改成學生名單');
    const r = applyDiffs([B], [{ ...A, subjectIds: ['x'] }], [{ ...d, choice: 'use-roster' }]);
    expect(r.entries[0]).toMatchObject({ name: '乙', subjectIds: ['x'] }); // 預告寫「考科維持」
    const r2 = applyDiffs([B], [{ ...A, subjectIds: ['x'] }], [{ ...d, choice: 'use-exam' }]);
    expect(r2.students[0]?.name).toBe('甲');
  });
  it('組別不同：預告組別與標示的影響；新增班級類不預告', () => {
    const g: RosterDiff = { kind: 'group-diff', code: '0105', exam: A, roster: A, groups: { exam: '1', roster: '2' } };
    expect(previewChoice(g, 'use-exam')).toContain('「1」');
    expect(previewChoice(g, 'use-roster')).toContain('X／＋');
    expect(previewChoice({ kind: 'new-class', code: 'new-class-9', members: [A] }, 'use-exam')).toBeUndefined();
  });
});

describe('Q2：考生口徑', () => {
  it('沒有本次考生時說明去 ② 匯入，不叫人去建學生名單', () => {
    expect(checkSeats(30, 0).message).toContain('② 考試名單');
  });
});
