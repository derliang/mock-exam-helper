import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import './featureRegister/lookup';
import { enabledNav } from './features';
import { Lookup } from './pages/Lookup';
import { lookupExaminee, searchExaminees } from './lookup';
import { reseat, setMarkChoice, setOverride } from './seating';
import type { Doc } from './store';

const NOW = '2026-11-08T10:00:00.000Z';
const noop = () => undefined;

function exam(patch: Partial<ExamConfig> = {}): ExamConfig {
  return {
    id: 'e1', name: '測試考', kind: 'gsat', division: 'senior', semester: 'first', round: 3, participation: 'all',
    subjects: [{ id: 'soc', name: '社會' }, { id: 'sci', name: '自然' }, { id: 'lis', name: '英聽' }],
    markRules: [], classroomIds: ['S', 'L', 'P'], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt: NOW, ...patch,
  };
}
const entries: ExamEntry[] = [
  { classNo: 1, seatNo: 1, name: '測試甲', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
  { classNo: 1, seatNo: 2, name: '測試乙', groupCode: '6', subjectIds: ['sci', 'lis'] },
  { classNo: 1, seatNo: 3, name: '測試丙', groupCode: '6', subjectIds: ['sci', 'lis'] },
  { classNo: 1, seatNo: 4, name: '測試丁', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
  { classNo: 2, seatNo: 1, name: '測試戊', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 2, name: '同名人', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 3, name: '同名人', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
];
function doc(e = exam(), list = entries): Doc {
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
    rosters: { senior: [{ classNo: 2, seatNo: 1, name: '測試戊', schoolId: '900123' }], junior: [] },
    exams: [e],
    examFiles: { e1: { entries: list } },
  };
}
const decided = () => exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
function seated(list = entries) {
  const e = decided();
  const r = reseat(doc(e, list), e, NOW);
  if (!r.ok) throw new Error(r.error);
  return { d: r.doc, e, res: r.doc.examFiles!.e1!.result! };
}
const codes = (o: ReturnType<typeof searchExaminees>) => (o.kind === 'found' ? o.entries.map((x) => `${x.classNo}${x.seatNo}`) : o.kind);

describe('H4 查詢輸入', () => {
  const d = doc();
  const e = exam();
  it('考生編號 4 碼、3 碼、「班級 座號」、班級名稱加座號都能找到同一人', () => {
    for (const q of ['0203', '203', '2 3', '2-3', '02 03', '良3', '良-3']) expect(codes(searchExaminees(d, e, q))).toEqual(['23']);
  });
  it('只打座號：各班同座號都列出；姓名部分比對；同名多筆全列', () => {
    expect(codes(searchExaminees(d, e, '1'))).toEqual(['11', '21']);
    expect(codes(searchExaminees(d, e, '測試'))).toEqual(['11', '12', '13', '14', '21']);
    expect(codes(searchExaminees(d, e, '同名'))).toEqual(['22', '23']);
  });
  it('學號對應到學生名單的人', () => {
    expect(codes(searchExaminees(d, e, '900123'))).toEqual(['21']);
  });
  it('空白輸入＝empty；找不到給友善原因與修法', () => {
    expect(searchExaminees(d, e, '  ').kind).toBe('empty');
    const none = searchExaminees(d, e, '9999');
    expect(none.kind).toBe('none');
    expect(none.kind === 'none' && none.hint).toContain('不在這次考試名單');
    expect(none.kind === 'none' && none.hint).toContain('4 碼');
    const noList = searchExaminees(doc(exam(), []), e, '王');
    expect(noList.kind === 'none' && noList.hint).toContain('還沒有匯入考試名單');
  });
});

describe('H4 查詢結果', () => {
  it('一般考生：每科教室與座位（排－深位）', () => {
    const { d, e, res } = seated();
    const hit = lookupExaminee(d, e, res, entries[0]!);
    expect(hit.allAbsent).toBe(false);
    expect(hit.rows.map((r) => `${r.subject}:${r.kind}:${r.place}:${r.seat}`)).toEqual(['社會:class:溫:1-1', '自然:class:溫:1-1', '英聽:class:溫:1-1']);
  });
  it('抽離自習：不考社會的人到預備教室自習，無座位；其他科仍在班級教室', () => {
    const { d, e, res } = seated();
    const hit = lookupExaminee(d, e, res, entries[1]!);
    expect(hit.rows[0]).toMatchObject({ kind: 'detach-study', place: '預備一', seat: undefined });
    expect(hit.rows[1]!.kind).toBe('class');
  });
  it('抽離考試：加考自然的人在預備教室有座位', () => {
    const { d, e, res } = seated();
    const hit = lookupExaminee(d, e, res, entries[6]!);
    const sci = hit.rows.find((r) => r.subjectId === 'sci')!;
    expect(sci.kind).toBe('detach-exam');
    expect(sci.place).toBe('預備一');
    expect(sci.seat).toMatch(/^\d+-\d+$/);
  });
  it('單人特例以手動設定為準（D80），顯示自填地點', () => {
    const { d, e } = seated();
    const o = setOverride(d, e, { kind: 'single', code: '0203', location: '教務處', purpose: 'study' });
    if (!o.ok) throw new Error(o.error);
    const r = reseat(o.doc, e, NOW);
    if (!r.ok) throw new Error(r.error);
    const hit = lookupExaminee(r.doc, e, r.doc.examFiles!.e1!.result!, entries[6]!);
    const sci = hit.rows.find((x) => x.subjectId === 'sci')!;
    expect(sci).toMatchObject({ kind: 'override-study', place: '教務處' });
    expect(sci.seat).toBeUndefined();
    expect(sci.note).toContain('手動設定');
  });
  it('全科缺考：顯示未排座（D79）', () => {
    const absent: ExamEntry = { classNo: 2, seatNo: 4, name: '缺考者', subjectIds: [] };
    const { d, e, res } = seated([...entries, absent]);
    const hit = lookupExaminee(d, e, res, absent);
    expect(hit).toMatchObject({ allAbsent: true, rows: [] });
    expect(hit.absentSeat).toBeUndefined();
  });
  it('全科缺考且勾了「仍排座」：排座真的排了他，查詢要給教室與座位，不能說未排座', () => {
    const absent: ExamEntry = { classNo: 2, seatNo: 4, name: '缺考者', subjectIds: [] };
    const e = exam({ ...decided(), seatFullyAbsent: true });
    const r = reseat(doc(e, [...entries, absent]), e, NOW);
    if (!r.ok) throw new Error(r.error);
    const res = r.doc.examFiles!.e1!.result!;
    expect(res.assignments.some((a) => a.code === '0204')).toBe(true);
    const hit = lookupExaminee(r.doc, e, res, absent);
    expect(hit.absentSeat).toMatchObject({ place: '良' });
    expect(hit.absentSeat!.seat).toMatch(/^\d+-\d+$/);
  });
  it('不考的科目標示「這科不考」', () => {
    const { d, e, res } = seated();
    const hit = lookupExaminee(d, e, res, entries[4]!);
    expect(hit.rows.find((r) => r.subjectId === 'sci')).toMatchObject({ kind: 'not-taking', place: '' });
  });
});

describe('H4 畫面與開關', () => {
  it('開關關閉時導覽不出現；開啟才出現考生查詢', () => {
    expect(enabledNav({ settings: {} })).toEqual([]);
    expect(enabledNav({ settings: { features: { 'student-lookup': false } } })).toEqual([]);
    expect(enabledNav({ settings: { features: { 'student-lookup': true } } }).map((n) => n.label)).toEqual(['考生查詢']);
    expect(enabledNav({ settings: { features: { 'student-lookup': true } } })[0]!.route).toEqual({ page: 'lookup' });
  });
  it('尚未排座：空狀態引導先到 ⑤ 排座', () => {
    const html = renderToString(<Lookup doc={doc()} onGoStep={noop} onExams={noop} />);
    expect(html).toContain('還沒有排座結果');
    expect(html).toContain('先到 ⑤ 排座');
  });
  it('已排座：顯示輸入欄與說明；沒有模擬考時引導建立', () => {
    const { d } = seated();
    const html = renderToString(<Lookup doc={d} onGoStep={noop} onExams={noop} />);
    expect(html).toContain('輸入考生編號、座號、學號或姓名');
    const empty = renderToString(<Lookup doc={{ ...d, exams: [] }} onGoStep={noop} onExams={noop} />);
    expect(empty).toContain('還沒有模擬考');
  });
});
