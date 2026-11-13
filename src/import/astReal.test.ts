/**
 * 分科真實名單格式（114-2 學年模擬考名單確認，全部改用假資料）：
 * 名單「組別」格是大考中心代碼（1 醫學類、2 理工類、3 農學類、9 社會乙組、4 社會組），右側附代碼對照表；
 * 組別是每位考生自己報的，理組班裡也有社會組的人，所以文理組要跟著考生走、不跟班級。
 */
import { describe, expect, it } from 'vitest';
import { buildEntries, scanExamSheet } from './smartScan';
import { AST_SUBJECTS } from '../ui/subjects';
import { scanOptionsFor } from '../ui/pages/ImportWizard';
import { entryTracks, preferMarkAbsent, seatExam, suggestMarks, validateSeating } from '../core';
import type { ClassInfo, Classroom, ExamConfig, ExamEntry } from '../data';

const exam = { kind: 'ast', subjects: AST_SUBJECTS } as ExamConfig;
const opts = scanOptionsFor(exam, ['01', '02', '03', '04', '05', '06']);

// 版面照真實名單：前 8 欄是名單，右側（J、K 欄）夾著代碼對照表
const MAP = [['', '1.下列五種分科測驗報考組別', ''], ['', '填寫組別', '考試科目'], ['', '1-自然組-醫學類', '數甲、物理、化學、生物'], ['', '2-自然組-理工類', '數甲、物理、化學'], ['', '3-自然組-農學類', '數甲、化學、生物'], ['', '9-社會乙組', '數乙、歷史、地理、公民'], ['', '4-社會組', '歷史、地理、公民']];
const head = ['校代碼', '年級', '班級', '座號', '姓名', '組別', '學號', '特殊生需求註明'];
const line = (cls: string, seat: string, name: string, group: string, i: number) => ['999999', '3', cls, seat, name, group, `S${i}`, '', ...(MAP[i] ?? ['', '', ''])];
const sheet = [
  [...head, ...MAP[0]!],
  ['999999', '3', '01', '01', '甲一', '1-自然組-醫學類', 'S1', '', ...MAP[1]!],
  line('01', '02', '甲二', '2-自然組-理工類', 2),
  line('02', '05', '乙一', '3-自然組-農學類', 3),
  line('01', '03', '甲三', '4-社會組', 4), // 理組班裡的社會組考生
  line('04', '01', '丁一', '9-社會乙組', 5),
  line('04', '02', '丁二', '4-社會組', 6),
];

const map = (scan: ReturnType<typeof scanExamSheet>) => Object.fromEntries(scan.groups.map((g) => [g.id, g.suggestion ?? 'ignore']));

describe('分科：組別代碼表', () => {
  const scan = scanExamSheet(sheet, opts);
  it('五種代碼直接換成考科，右側的對照表文字不會被當成考生或標示', () => {
    expect(scan.problems).toEqual([]);
    expect(scan.groups).toEqual([]); // 沒有任何待對應的標示
    const r = buildEntries(scan, opts, { mapping: map(scan), rows: {} });
    expect(r.ready).toBe(true);
    const by = Object.fromEntries(r.entries.map((e) => [`${e.classNo}-${e.seatNo}`, e.subjectIds]));
    expect(by['1-1']).toEqual(['math-jia', 'physics', 'chemistry', 'biology']);
    expect(by['1-2']).toEqual(['math-jia', 'physics', 'chemistry']);
    expect(by['2-5']).toEqual(['math-jia', 'chemistry', 'biology']);
    expect(by['4-1']).toEqual(['math-yi', 'history', 'geography', 'civics']);
    expect(by['4-2']).toEqual(['history', 'geography', 'civics']);
  });
  it('每位考生的文理組跟著組別走，不看班級（理組班的社會組考生是文組）', () => {
    const r = buildEntries(scan, opts, { mapping: map(scan), rows: {} });
    const tr = Object.fromEntries(r.entries.map((e) => [`${e.classNo}-${e.seatNo}`, e.track]));
    expect(tr).toEqual({ '1-1': 'science', '1-2': 'science', '1-3': 'liberal', '2-5': 'science', '4-1': 'liberal', '4-2': 'liberal' });
  });
  it('「5-社會組」（只出現過一次）視為 4 社會組，不進待確認，但在處理紀錄留痕（裁決 12）', () => {
    const s = scanExamSheet([...sheet, ['999999', '3', '04', '03', '丁三', '5-社會組', 'S9', '']], opts);
    expect(s.review).toEqual([]);
    expect(s.notices.map((n) => n.message)).toEqual([expect.stringContaining('5-社會組')]);
    const r = buildEntries(s, opts, { mapping: map(s), rows: {} });
    expect(r.ready).toBe(true);
    expect(r.entries.find((e) => e.classNo === 4 && e.seatNo === 3)?.subjectIds).toEqual(['history', 'geography', 'civics']);
  });
  it('其他不在對照表的代碼仍進待確認，不猜', () => {
    const s = scanExamSheet([...sheet, ['999999', '3', '04', '03', '丁三', '7-其他', 'S9', '']], opts);
    expect(s.review.map((x) => x.kind)).toEqual(['bad-group']);
    expect(buildEntries(s, opts, { mapping: map(s), rows: {} }).ready).toBe(false);
  });
});

describe('分科：校內整理過的版本（組別代碼＋考科文字欄＋各科 1／- 欄）', () => {
  const rows = [
    ['班級', '座號', '姓名', '組別', '考科', '數甲', '物理', '化學', '生物', '數乙', '歷史', '地理', '公民'],
    ['01', '01', '甲一', '2-自然組-理工類', '數甲.物理.化學', '1', '1', '1', '-', '-', '-', '-', '-'],
    ['04', '01', '丁一', '9-社會乙組', '數乙.歷史.地理.公民', '-', '-', '-', '-', '1', '1', '1', '1'],
  ];
  it('考科文字欄不會被當成缺考標示；各科欄與代碼一致', () => {
    const scan = scanExamSheet(rows, opts);
    const r = buildEntries(scan, opts, { mapping: map(scan), rows: {} });
    expect(r.entries.map((e) => e.subjectIds)).toEqual([['math-jia', 'physics', 'chemistry'], ['math-yi', 'history', 'geography', 'civics']]);
  });
});

describe('分科：排座、驗證、標示以考生自己的文理組為準', () => {
  const classes: ClassInfo[] = [
    { no: 1, name: 'A', division: 'senior', track: 'science', colorIndex: 1 },
    { no: 4, name: 'D', division: 'senior', track: 'liberal', colorIndex: 2 },
  ];
  const room = (id: string, track: 'science' | 'liberal'): Classroom => ({ id, name: id, kind: 'class', rows: 2, depth: 2, seatCount: 4, track });
  const rooms = [room('理組教室', 'science'), room('文組教室', 'liberal')];
  const codes = ['0101', '0102', '0103', '0401'];
  const trackOf = new Map<string, 'science' | 'liberal'>([['0101', 'science'], ['0102', 'science'], ['0103', 'liberal'], ['0401', 'liberal']]);

  it('理組班的社會組考生排進文組教室', () => {
    const r = seatExam({ division: 'senior', classes, classrooms: rooms, codes, trackOf });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const where = Object.fromEntries(r.assignments.map((a) => [a.code, a.classroomId]));
    expect(where).toEqual({ '0101': '理組教室', '0102': '理組教室', '0103': '文組教室', '0401': '文組教室' });
    expect(validateSeating({ classrooms: rooms, classes, codes, assignments: r.assignments, checkTrack: true, trackOf })).toEqual([]);
  });
  it('沒有逐人文理組時行為與以前相同（學測：整班跟班級）', () => {
    const r = seatExam({ division: 'senior', classes, classrooms: rooms, codes });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assignments.filter((a) => a.classroomId === '理組教室').map((a) => a.code).sort()).toEqual(['0101', '0102', '0103']);
  });
  it('標示建議依考生自己的文理組分組', () => {
    const entries: ExamEntry[] = [
      { classNo: 1, seatNo: 1, name: 'a', subjectIds: ['math-jia', 'physics'], track: 'science' },
      { classNo: 1, seatNo: 2, name: 'b', subjectIds: ['math-jia'], track: 'science' },
      { classNo: 1, seatNo: 3, name: 'c', subjectIds: ['history'], track: 'liberal' },
    ];
    const s = suggestMarks(entries, classes, AST_SUBJECTS);
    expect(s.find((x) => x.track === 'science' && x.subjectId === 'physics')).toMatchObject({ total: 2, taking: 1 });
    expect(s.find((x) => x.track === 'liberal' && x.subjectId === 'history')).toMatchObject({ total: 1, taking: 1 });
    expect(entryTracks(entries)?.get('0103')).toBe('liberal');
    expect(entryTracks([{ classNo: 1, seatNo: 1, name: 'x', subjectIds: [] }])).toBeUndefined();
  });
});

describe('分科：標示一律標「不考」的人（含多數），不問接近一半', () => {
  const mk = (taking: number, total: number) => suggestMarks(
    Array.from({ length: total }, (_, i): ExamEntry => ({ classNo: 4, seatNo: i + 1, name: `生${i}`, subjectIds: i < taking ? ['math-yi'] : ['history'], track: 'liberal' })),
    [{ no: 4, name: 'D', division: 'senior', track: 'liberal', colorIndex: 1 }], AST_SUBJECTS,
  ).find((x) => x.subjectId === 'math-yi')!;
  it('數乙 16 人考、25 人不考（真實第 7 次）：標不考，不再要使用者選', () => {
    expect(mk(16, 41)).toMatchObject({ suggested: 'mark-extra' }); // 學測的標少數會標「加考」
    const r = preferMarkAbsent([mk(16, 41)])[0]!;
    expect(r).toMatchObject({ suggested: 'mark-absent', needsDecision: false });
  });
  it('全考或全不考的科仍不標', () => {
    expect(preferMarkAbsent([mk(0, 5), mk(5, 5)]).map((x) => x.suggested)).toEqual(['none', 'none']);
  });
});
