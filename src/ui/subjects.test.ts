import { describe, expect, it } from 'vitest';
import { addSubject, defaultSubjects, isCustomized, removeSubject, renameSubject } from './subjects';

describe('考科表', () => {
  it('學測第 1、2 次：數學單一科＋英聽；第 3、4 次：數學A／B、無英聽', () => {
    expect(defaultSubjects('gsat', 1).map((x) => x.name)).toEqual(['國文', '英文', '數學', '社會', '自然', '英聽']);
    expect(defaultSubjects('gsat', 3).map((x) => x.name)).toEqual(['國文', '英文', '數學A', '數學B', '社會', '自然']);
  });
  it('會考固定七科', () => {
    expect(defaultSubjects('bcct').map((x) => x.name)).toEqual(['國文', '英語閱讀', '英語聽力', '數學', '社會', '自然', '寫作測驗']);
  });
  it('改名、新增標已自訂；重名與空白不新增；刪除', () => {
    let l = defaultSubjects('gsat', 3);
    expect(isCustomized(l)).toBe(false);
    l = renameSubject(l, 'chinese', '國語文');
    expect(isCustomized(l)).toBe(true);
    const n = addSubject(l, '作文');
    expect(n).toHaveLength(l.length + 1);
    expect(addSubject(n, '作文')).toBe(n);
    expect(addSubject(n, ' ')).toBe(n);
    expect(removeSubject(n, 'chinese').some((x) => x.id === 'chinese')).toBe(false);
  });
});
