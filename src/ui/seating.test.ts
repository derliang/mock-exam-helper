import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import type { Doc } from './store';
import {
  afterOverrideChange,
  chartModel,
  detachChartModel,
  detachPreview,
  detachSummary,
  markRows,
  overrideNotes,
  roomStatTable,
  effectiveMarkRules,
  groupTable,
  isStale,
  removeOverride,
  reseat,
  seatingBlockers,
  setMarkChoice,
  setOverride,
  validationChecks,
} from './seating';

const NOW = '2026-11-08T10:00:00.000Z';

function exam(patch: Partial<ExamConfig> = {}): ExamConfig {
  return {
    id: 'e1', name: '測試考', kind: 'gsat', division: 'senior', semester: 'first', round: 3, participation: 'all',
    subjects: [{ id: 'soc', name: '社會' }, { id: 'sci', name: '自然' }, { id: 'lis', name: '英聽' }],
    markRules: [], classroomIds: ['S', 'L', 'P'], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt: NOW, ...patch,
  };
}

/** 假資料：理組 1 班 4 人（2 人不考社會＝接近一半）、文組 2 班 3 人（1 人加考自然） */
const entries: ExamEntry[] = [
  { classNo: 1, seatNo: 1, name: '測試甲', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
  { classNo: 1, seatNo: 2, name: '測試乙', groupCode: '6', subjectIds: ['sci', 'lis'] },
  { classNo: 1, seatNo: 3, name: '測試丙', groupCode: '6', subjectIds: ['sci', 'lis'] },
  { classNo: 1, seatNo: 4, name: '測試丁', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
  { classNo: 2, seatNo: 1, name: '測試戊', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 2, name: '測試己', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 3, name: '測試庚', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
];

function doc(e = exam()): Doc {
  return {
    settings: {
      schoolName: '範例高中', headerText: '模擬考', defaultLabelPaper: 'B4',
      classes: [
        { no: 1, name: '溫', division: 'senior', track: 'science', colorIndex: 1 },
        { no: 2, name: '良', division: 'senior', track: 'liberal', colorIndex: 2 },
      ],
      classrooms: [
        { id: 'S', name: '溫', kind: 'class', rows: 2, depth: 3, seatCount: 5, track: 'science' },
        { id: 'L', name: '良', kind: 'class', rows: 2, depth: 2, seatCount: 4, track: 'liberal' },
        { id: 'P', name: '預備一', kind: 'reserve', rows: 1, depth: 4, seatCount: 4 },
      ],
    },
    rosters: { senior: [], junior: [] },
    exams: [e],
    examFiles: { e1: { entries } },
  };
}

describe('④ 標示規則', () => {
  it('接近一半的要使用者選，其餘照標少數；選了就鎖定', () => {
    const d = doc();
    const { rules, undecided } = effectiveMarkRules(d, exam());
    expect(undecided.map((u) => `${u.track}/${u.subjectId}`)).toEqual(['science/soc']);
    expect(rules).toEqual([{ track: 'liberal', subjectId: 'sci', mode: 'mark-extra' }]);
    const e2 = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    expect(effectiveMarkRules(doc(e2), e2).undecided).toEqual([]);
    expect(e2.markRules).toEqual([{ track: 'science', subjectId: 'soc', mode: 'mark-absent', locked: true }]);
    expect(setMarkChoice(e2, 'science', 'soc', undefined)).toEqual([]);
  });

  it('組別對照表', () => {
    expect(groupTable(doc(), exam())).toEqual([
      { code: '0', count: 3, subjectIds: ['soc', 'sci', 'lis'] },
      { code: '6', count: 2, subjectIds: ['sci', 'lis'] },
      { code: '8', count: 2, subjectIds: ['soc', 'lis'] },
    ]);
  });

  it('抽離預覽：自然加考 1 人進預備教室；社會不考 2 人自習', () => {
    const e2 = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const r = detachPreview(doc(e2), e2);
    expect(r.ok && r.detaches.map((x) => `${x.subjectId}:${x.purpose}:${x.code}@${x.roomId}`)).toEqual([
      'soc:study:0102@P', 'soc:study:0103@P', 'sci:exam:0203@P',
    ]);
  });
});

describe('⑤ 排座', () => {
  it('擋下：名單未匯入、沒教室、接近一半未選', () => {
    const d = doc(exam({ classroomIds: [] }));
    d.examFiles = {};
    expect(seatingBlockers(d, d.exams[0]!).map((b) => b.step)).toEqual([2, 3]);
    expect(seatingBlockers(doc(), exam()).map((b) => b.step)).toEqual([4]);
    const r = reseat(doc(), exam(), NOW);
    expect(r.ok).toBe(false);
    expect(r.ok || r.error).toBe('④ 有 1 項標示接近一半，要先選標「不考」或「加考」');
  });

  it('排座後存結果、驗證全過；改名單就過期，重排後恢復', () => {
    const e2 = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const r = reseat(doc(e2), e2, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d1 = r.doc;
    const res = d1.examFiles!.e1!.result!;
    expect(res.assignments.map((a) => `${a.classroomId}${a.row}-${a.depth}:${a.code}`)).toEqual([
      'S1-1:0101', 'S1-2:0102', 'S1-3:0103', 'S2-1:0104', 'L1-1:0201', 'L1-2:0202', 'L2-1:0203',
    ]);
    expect(isStale(d1, e2)).toBe(false);
    expect(validationChecks(d1, e2, res).every((c) => c.ok)).toBe(true);
    const changed: Doc = { ...d1, examFiles: { e1: { ...d1.examFiles!.e1!, entries: entries.slice(0, 6) } } };
    expect(isStale(changed, e2)).toBe(true);
  });

  it('驗證器抓到被改壞的結果', () => {
    const e2 = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const r = reseat(doc(e2), e2, NOW);
    if (!r.ok) throw new Error(r.error);
    const res = r.doc.examFiles!.e1!.result!;
    const broken = { ...res, assignments: res.assignments.map((a) => (a.code === '0102' ? { ...a, code: '0104' } : a.code === '0104' ? { ...a, code: '0102' } : a)) };
    const bad = validationChecks(r.doc, e2, broken).filter((c) => !c.ok).map((c) => c.title);
    expect(bad).toEqual(['同班編號沿座位遞增']);
  });

  it('個別覆寫：設定後自動重排、不佔預備教室；移除後回到預備教室', () => {
    const e2 = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const r = reseat(doc(e2), e2, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(setOverride(r.doc, e2, { kind: 'single', code: '0203', location: ' ', purpose: 'exam' })).toEqual({ ok: false, error: '請填地點' });
    const o = setOverride(r.doc, e2, { kind: 'single', code: '0203', location: '教務處', purpose: 'exam' });
    if (!o.ok) throw new Error(o.error);
    const d2 = afterOverrideChange(o.doc, e2, NOW);
    expect(isStale(d2, e2)).toBe(false);
    expect(d2.examFiles!.e1!.result!.detaches.some((x) => x.code === '0203')).toBe(false);
    const d3 = afterOverrideChange(removeOverride(d2, e2, '0203'), e2, NOW);
    expect(d3.examFiles!.e1!.result!.detaches.some((x) => x.code === '0203' && x.roomId === 'P')).toBe(true);
  });
});

describe('⑤ 座位表與統計', () => {
  const e2 = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
  const seated = () => {
    const r = reseat(doc(e2), e2, NOW);
    if (!r.ok) throw new Error(r.error);
    return r.doc;
  };

  it('④ 標示表：接近一半的列鎖定後標 locked', () => {
    expect(markRows(doc(), exam()).map((r) => `${r.track}/${r.subjectId}:${r.state}:${r.taking}/${r.notTaking}`)).toEqual([
      'science/soc:undecided:2/2', 'science/sci:none:4/0', 'liberal/soc:none:3/0', 'liberal/sci:auto:1/2',
    ]);
    expect(markRows(doc(e2), e2)[0]).toMatchObject({ state: 'locked', mode: 'mark-absent', nearHalf: true });
  });

  it('講臺在下：最上一列是最深位；尾端沒有的座位是 off', () => {
    const d = seated();
    const room = d.settings.classrooms[0]!; // 2 排 × 3 深位、5 座
    const m = chartModel(d, e2, d.examFiles!.e1!.result!, room);
    expect(m.lines.map((l) => l.map((c) => (c.kind === 'student' ? c.code : c.kind)))).toEqual([
      ['0103', 'off'], ['0102', 'free'], ['0101', '0104'],
    ]);
    const c = m.lines[1]![0]!;
    expect(c.kind === 'student' && [c.co, c.className, c.marks, c.markKind]).toEqual(['1-2', '溫', ['X社會'], 'x']);
  });

  it('抽離考試座位表與總覽；統計扣掉抽離與到他處考試的人', () => {
    const d = seated();
    const res = d.examFiles!.e1!.result!;
    const p = detachChartModel(d, e2, res, d.settings.classrooms[2]!, 'sci');
    expect(p.count).toBe(1);
    expect(detachSummary(e2, res)).toEqual([
      { subjectId: 'soc', name: '社會', examRooms: [], study: 2, special: 0 },
      { subjectId: 'sci', name: '自然', examRooms: [{ roomId: 'P', count: 1 }], study: 0, special: 0 },
    ]);
    expect(roomStatTable(d, e2, res, 'L')).toEqual({
      classes: [{ no: 2, name: '良' }],
      rows: [
        { label: '本教室考生人數', per: [3], total: 3 },
        { label: '在本教室考社會', per: [3], total: 3 },
        { label: '在本教室考自然', per: [0], total: 0 },
        { label: '在本教室考英聽', per: [3], total: 3 },
      ],
    });
    // 0203 加考自然，覆寫到教務處考：不佔預備教室，也不在本教室考自然
    const o = setOverride(d, e2, { kind: 'single', code: '0203', location: '教務處', purpose: 'exam' });
    if (!o.ok) throw new Error(o.error);
    const d2 = afterOverrideChange(o.doc, e2, NOW);
    const res2 = d2.examFiles!.e1!.result!;
    expect(roomStatTable(d2, e2, res2, 'L').rows[2]).toEqual({ label: '在本教室考自然', per: [0], total: 0 });
    expect(detachSummary(e2, res2)[1]).toMatchObject({ examRooms: [], special: 1 });
    expect(overrideNotes(d2, e2, res2).size).toBe(0);
    const o2 = setOverride(d2, e2, { kind: 'single', code: '0201', location: '圖書館', purpose: 'study' });
    if (!o2.ok) throw new Error(o2.error);
    expect(overrideNotes(o2.doc, e2, res2).get('0201')).toMatch(/不會生效/);
  });
});
