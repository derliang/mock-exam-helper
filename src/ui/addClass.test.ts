import { describe, expect, it } from 'vitest';
import type { Division, Student } from '../data';
import { describeChange } from './describeChange';
import { emptyDoc, withDefaults } from './repository';
import { applyImport, planImport } from './rosterIO';
import { addClass, classUsage, nextClassNo, removeClass, renameClass, validateClassName, type Doc } from './store';

// 固定種子的簡單亂數（不引入套件）
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const base = (): Doc => withDefaults(emptyDoc());
const ok = <T>(r: { ok: true; doc: T } | { ok: false; error: string }): T => { if (!r.ok) throw new Error(r.error); return r.doc; };

describe('新增／刪除／改名班級（D83）', () => {
  it('新增接在最後序號，預設名稱、班級色、高中部預設理組', () => {
    const d = base();
    const n = nextClassNo(d, 'senior');
    const next = ok(addClass(d, 'senior'));
    const c = next.settings.classes.find((x) => x.division === 'senior' && x.no === n)!;
    expect(c).toMatchObject({ no: n, name: `第${String(n).padStart(2, '0')}班`, track: 'science' });
    expect(c.colorIndex).toBeGreaterThanOrEqual(1);
    expect(d.settings.classes.length + 1).toBe(next.settings.classes.length); // 原文件不被改
  });
  it('國中部新增不帶文理組；可指定名稱與組別', () => {
    const j = ok(addClass(base(), 'junior', { name: '測' }));
    expect(j.settings.classes.find((c) => c.division === 'junior' && c.name === '測')!.track).toBeUndefined();
    const s = ok(addClass(base(), 'senior', { name: '測', track: 'liberal' }));
    expect(s.settings.classes.find((c) => c.name === '測' && c.division === 'senior')!.track).toBe('liberal');
  });
  it('重名、空白名稱、已存在序號、超出範圍都拒絕', () => {
    const d = base();
    const existing = d.settings.classes.find((c) => c.division === 'senior')!;
    expect(addClass(d, 'senior', { name: existing.name }).ok).toBe(false);
    expect(addClass(d, 'senior', { no: existing.no }).ok).toBe(false);
    expect(addClass(d, 'senior', { no: 100 }).ok).toBe(false);
    expect(validateClassName(d, 'senior', '  ')).not.toBeNull();
    // 不同部別可同名
    const d2 = ok(addClass(d, 'senior', { name: '甲測' }));
    expect(addClass(d2, 'junior', { name: '甲測' }).ok).toBe(true);
  });
  it('改名：可改、不可與同部別他班重名、自己改回自己的名字沒事', () => {
    const d = base();
    const [a, b] = d.settings.classes.filter((c) => c.division === 'senior');
    expect(renameClass(d, 'senior', a!.no, b!.name).ok).toBe(false);
    expect(renameClass(d, 'senior', a!.no, a!.name).ok).toBe(true);
    const r = ok(renameClass(d, 'senior', a!.no, ' 新名 '));
    expect(r.settings.classes.find((c) => c.no === a!.no && c.division === 'senior')!.name).toBe('新名');
  });
  it('刪除：沒人的班可刪；名單或考試名單還有人就拒絕且不動資料', () => {
    let d = ok(addClass(base(), 'senior', { name: '測' }));
    const no = d.settings.classes.find((c) => c.name === '測')!.no;
    expect(ok(removeClass(d, 'senior', no)).settings.classes.some((c) => c.name === '測')).toBe(false);
    d = { ...d, rosters: { ...d.rosters, senior: [{ classNo: no, seatNo: 1, name: '甲' }] } };
    const r = removeClass(d, 'senior', no);
    expect(r.ok).toBe(false);
    expect(classUsage(d, 'senior', no).roster).toBe(1);
    expect(removeClass(base(), 'senior', 99).ok).toBe(false);
  });
  it('復原名稱：新增班級、刪除班級、匯入並新增班級', () => {
    const d = base();
    const added = ok(addClass(d, 'senior'));
    expect(describeChange(d, added)).toBe('新增班級');
    expect(describeChange(added, d)).toBe('刪除班級');
    const many: Student[] = Array.from({ length: 6 }, (_, i) => ({ classNo: 40, seatNo: i + 1, name: `測${i}` }));
    const plan = planImport(d, 'senior', many);
    expect(describeChange(d, applyImport(d, 'senior', plan, 'add'))).toBe('匯入高中部學生名單並新增班級');
  });
});

describe('匯入遇到未知班級（D83）', () => {
  const d = base();
  const known = d.settings.classes.find((c) => c.division === 'senior')!.no;
  const students: Student[] = [
    { classNo: known, seatNo: 1, name: '甲' }, { classNo: 77, seatNo: 1, name: '乙' }, { classNo: 77, seatNo: 2, name: '丙' }, { classNo: 88, seatNo: 5, name: '丁' },
  ];
  it('規劃列出未知班級與各班人數', () => {
    const p = planImport(d, 'senior', students);
    expect(p.unknownClasses).toEqual([77, 88]);
    expect(p.unknownCounts).toEqual({ 77: 2, 88: 1 });
  });
  it('選新增：班級建立、全員匯入；選略過：不新增班級、未知班學生不進名單', () => {
    const p = planImport(d, 'senior', students);
    const a = applyImport(d, 'senior', p, 'add');
    expect(a.rosters.senior).toHaveLength(4);
    expect(a.settings.classes.filter((c) => c.division === 'senior' && (c.no === 77 || c.no === 88))).toHaveLength(2);
    const s = applyImport(d, 'senior', p);
    expect(s.rosters.senior.map((x) => x.name)).toEqual(['甲']);
    expect(s.settings.classes).toEqual(d.settings.classes);
  });
  it('性質：各種亂資料下，人數守恆（匯入＋略過＝讀到）、不重複、每位學生的班級都存在、往返一致', () => {
    const r = rng(83);
    for (let t = 0; t < 200; t++) {
      const division: Division = r() < 0.5 ? 'senior' : 'junior';
      const seen = new Set<string>();
      const input: Student[] = [];
      const n = Math.floor(r() * 40);
      for (let i = 0; i < n; i++) {
        const classNo = r() < 0.4 ? 1 + Math.floor(r() * 6) : Math.floor(r() * 130) - 5; // 含 0、負數、>99
        const seatNo = 1 + Math.floor(r() * 12);
        const k = `${classNo}-${seatNo}`;
        if (seen.has(k)) continue;
        seen.add(k);
        input.push({ classNo, seatNo, name: `測${i}` });
      }
      const doc = base();
      const plan = planImport(doc, division, input);
      for (const action of ['add', 'skip'] as const) {
        const out = applyImport(doc, division, plan, action);
        const roster = out.rosters[division];
        const classNos = new Set(out.settings.classes.filter((c) => c.division === division).map((c) => c.no));
        // 不重複
        expect(new Set(roster.map((s) => `${s.classNo}-${s.seatNo}`)).size).toBe(roster.length);
        // 每位進名單的人，班級都存在（不會有排不了座的孤兒）
        expect(roster.every((s) => classNos.has(s.classNo))).toBe(true);
        // 守恆：進名單的人＋被略過的人＝讀到的人
        const skipped = input.filter((s) => !roster.some((x) => x.classNo === s.classNo && x.seatNo === s.seatNo && x.name === s.name));
        expect(roster.length + skipped.length).toBe(input.length);
        // 已知班級的學生一個都不能被略過
        expect(skipped.every((s) => !plan.unknownClasses.length || plan.unknownClasses.includes(s.classNo))).toBe(true);
        if (action === 'skip') expect(out.settings.classes).toEqual(doc.settings.classes);
        // 另一部別不動
        const other: Division = division === 'senior' ? 'junior' : 'senior';
        expect(out.rosters[other]).toEqual(doc.rosters[other]);
        // 往返：JSON 序列化後相同；重新對結果規劃，不再有未知班級
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
        expect(planImport(out, division, roster).unknownClasses).toEqual([]);
      }
    }
  });
});
