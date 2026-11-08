import { describe, expect, it } from 'vitest';
import { backLabel, goBack, goTo, initialNav, pushTo, stepTitle } from './nav';

describe('回原頁導覽', () => {
  const ex = { page: 'step', examId: 'e1', step: 2 } as const;
  it('pushTo 後可回到原位置並帶出名稱', () => {
    const s = pushTo(initialNav({ ...ex }), { page: 'settings' }, { route: ex, label: '「學測第三次」② 考試名單' });
    expect(s.route.page).toBe('settings');
    expect(backLabel(s)).toBe('「學測第三次」② 考試名單');
    expect(goBack(s).route).toEqual(ex);
    expect(goBack(s).back).toEqual([]);
  });
  it('一般導覽清空堆疊；堆疊空時 goBack 不動', () => {
    const s = pushTo(initialNav(ex), { page: 'settings' }, { route: ex, label: 'x' });
    expect(goTo(s, { page: 'exams' }).back).toEqual([]);
    const e = initialNav();
    expect(goBack(e)).toBe(e);
  });
  it('可連續兩層回去', () => {
    let s = pushTo(initialNav(ex), { page: 'reconcile', examId: 'e1' }, { route: ex, label: 'A' });
    s = pushTo(s, { page: 'settings' }, { route: s.route, label: 'B' });
    expect(goBack(s).route.page).toBe('reconcile');
    expect(goBack(goBack(s)).route).toEqual(ex);
  });
  it('步驟標題', () => expect(stepTitle(5)).toBe('⑤ 排座與預覽'));
});
