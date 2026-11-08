import { describe, expect, it } from 'vitest';
import { demoDoc } from './repository';
import { addStudent, newExam, removeStudent, searchStudents, setClassColor, setClassTrack, updateStudent } from './store';

describe('學生名單', () => {
  it('新增：重複座號、班級不存在、座號越界、姓名空白都擋下', () => {
    const d = demoDoc();
    expect(addStudent(d, 'senior', { classNo: 1, seatNo: 1, name: '某人' }).ok).toBe(false);
    expect(addStudent(d, 'senior', { classNo: 9, seatNo: 1, name: '某人' }).ok).toBe(false);
    expect(addStudent(d, 'senior', { classNo: 1, seatNo: 100, name: '某人' }).ok).toBe(false);
    expect(addStudent(d, 'senior', { classNo: 1, seatNo: 5, name: ' ' }).ok).toBe(false);
  });
  it('新增後依班級座號排序；學號空白不存', () => {
    const r = addStudent(demoDoc(), 'senior', { classNo: 1, seatNo: 10, name: '新生', schoolId: ' ' });
    if (!r.ok) throw new Error(r.error);
    const l = r.doc.rosters.senior.filter((s) => s.classNo === 1);
    expect(l.map((s) => s.seatNo)).toEqual([1, 2, 3, 10]);
    expect(l[3]).not.toHaveProperty('schoolId');
  });
  it('編輯可保留原座號；改成別人的座號會被擋；刪除保留空號', () => {
    const d = demoDoc();
    const s = d.rosters.senior[0]!;
    expect(updateStudent(d, 'senior', s, { ...s, name: '改名' }).ok).toBe(true);
    expect(updateStudent(d, 'senior', s, { ...s, seatNo: 2 }).ok).toBe(false);
    const after = removeStudent(d, 'senior', s);
    expect(after.rosters.senior.some((x) => x.classNo === 1 && x.seatNo === 1)).toBe(false);
    expect(after.rosters.senior).toHaveLength(d.rosters.senior.length - 1);
  });
  it('可依姓名、考生編號搜尋', () => {
    const l = demoDoc().rosters.senior;
    expect(searchStudents(l, '小明')).toHaveLength(1);
    expect(searchStudents(l, '0102')).toHaveLength(1);
    expect(searchStudents(l, '')).toHaveLength(l.length);
  });
});

describe('班級與考試', () => {
  it('國中部不能設文理組；高中部可以', () => {
    const d = demoDoc();
    expect(setClassTrack(d, 'junior', 1, 'liberal')).toBe(d);
    const s = setClassTrack(d, 'senior', 1, 'liberal');
    expect(s.settings.classes.find((c) => c.no === 1 && c.division === 'senior')?.track).toBe('liberal');
  });
  it('改色只動指定班級與部別', () => {
    const d = setClassColor(demoDoc(), 'senior', 1, 9);
    expect(d.settings.classes.filter((c) => c.colorIndex === 9 && c.division === 'senior')).toHaveLength(1);
  });
  it('新增考試：學測高中部、會考國中部、分科擋下、同名擋下', () => {
    const now = new Date('2026-11-08T00:00:00Z');
    const g = newExam(demoDoc(), 'gsat', '學測第三次', now);
    if (!g.ok) throw new Error(g.error);
    expect(g.doc.exams[0]).toMatchObject({ division: 'senior', kind: 'gsat' });
    expect(newExam(g.doc, 'gsat', '學測第三次', now).ok).toBe(false);
    expect(newExam(demoDoc(), 'ast', 'x', now).ok).toBe(false);
    const b = newExam(demoDoc(), 'bcct', '會考第一次', now);
    if (!b.ok) throw new Error(b.error);
    expect(b.doc.exams[0]?.division).toBe('junior');
  });
});

describe('預設班級', () => {
  it('全新資料夾（空 Doc）帶入高中國中預設班級；已有班級就不動', async () => {
    const { emptyDoc, withDefaults, demoDoc } = await import('./repository');
    const d = withDefaults(emptyDoc());
    expect(d.settings.classes.filter((c) => c.division === 'senior').map((c) => c.track)).toEqual(['science', 'science', 'science', 'liberal', 'liberal', 'liberal']);
    expect(d.settings.classes.filter((c) => c.division === 'junior').every((c) => c.track === undefined)).toBe(true);
    const demo = demoDoc();
    expect(withDefaults(demo)).toBe(demo);
  });
});
