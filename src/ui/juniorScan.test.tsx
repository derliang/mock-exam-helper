/** 國中部（會考）不該出現、不該被擋、不該計算的高中部專屬內容（全站掃描回歸）。測試只用假資料。 */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import { buildAttendancePages } from '../export/attendance';
import { prepareExport } from './exportInput';
import { StepNav } from './components';
import { examProgress } from './examList';
import { flowOf } from './flow';
import { Step1 } from './pages/Step1';
import { Step4 } from './pages/Step4';
import { Step5 } from './pages/Step5';
import { Step6 } from './pages/Step6';
import { examResult, reseat, seatingBlockers, validationChecks } from './seating';
import type { Doc } from './store';

const NOW = '2026-11-08T10:00:00.000Z';
const noop = () => undefined;
const SUBJ = [{ id: 'chinese', name: '國文' }, { id: 'math', name: '數學' }];
const entries: ExamEntry[] = [1, 2, 3, 4].map((n) => ({ classNo: 1, seatNo: n, name: `測試${n}`, subjectIds: ['chinese', 'math'] }));
const exam: ExamConfig = {
  id: 'j1', name: '測試會考', kind: 'bcct', division: 'junior', semester: 'first', round: 1, participation: 'all',
  subjects: SUBJ, markRules: [], classroomIds: ['A'], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt: NOW,
};
// 班級教室刻意不指定組別（國中部不該因此被擋）
const base: Doc = {
  settings: {
    schoolName: '範例中學', headerText: '模擬考', defaultLabelPaper: 'B4',
    classes: [{ no: 1, name: '一', division: 'junior', colorIndex: 1 }],
    classrooms: [{ id: 'A', name: '甲教室', kind: 'class', rows: 2, depth: 3, seatCount: 6 }],
  },
  rosters: { senior: [], junior: entries.map((e) => ({ classNo: e.classNo, seatNo: e.seatNo, name: e.name })) },
  exams: [exam],
  examFiles: { j1: { entries } },
};
const seatedDoc = (): Doc => { const r = reseat(base, exam, NOW); if (!r.ok) throw new Error(r.error); return r.doc; };
const SENIOR_ONLY = /文理組|理組|文組|組別|預備教室|抽離|標示|尚未匯入|加考/;

describe('國中部會考：進度與驗證不要求高中部才有的步驟', () => {
  it('教室沒指定組別也不擋排座、不在常駐問題裡', () => {
    expect(seatingBlockers(base, exam)).toEqual([]);
    expect(flowOf(base, exam, 1).issues.map((i) => i.text).join('')).not.toMatch(/理組|文組/);
  });
  it('步驟④ 標為「不需要」，不算未完成也不計入總步數', () => {
    const f = flowOf(seatedDoc(), exam, 5);
    expect(f.steps[3]!.state).toBe('skip');
    const html = renderToString(<StepNav steps={flowOf(base, exam, 0 as never).steps} onGo={noop} />);
    expect(html).toContain('不需要');
    expect(html).toContain('共 5 步');
    expect(html).not.toMatch(/共 6 步/);
  });
  it('列表進度：五步全完成就是「已完成」', () => {
    const p = examProgress(seatedDoc(), exam);
    expect(p.total).toBe(5);
    expect(p.cells[3]).toBe('n');
  });
  it('⑤ 驗證項目沒有「理組、文組排進同組別的教室」', () => {
    const d = seatedDoc();
    const titles = validationChecks(d, exam, examResult(d, exam)!).map((c) => c.title).join('｜');
    expect(titles).not.toMatch(/理組|文組/);
    expect(validationChecks(d, exam, examResult(d, exam)!).every((c) => c.ok)).toBe(true);
  });
});

describe('國中部會考：畫面不出現高中部專屬內容', () => {
  const d = seatedDoc();
  it('① 考科表', () => {
    const html = renderToString(<Step1 doc={d} exam={exam} onChange={noop} />);
    expect(html).not.toMatch(/文理組/);
  });
  it('④ 只說會考不需要，沒有組別對照表', () => {
    const html = renderToString(<Step4 doc={d} exam={exam} onChange={noop} onStep={noop} />);
    expect(html).toContain('不需要');
    expect(html).not.toMatch(/組別|理組|文組/);
  });
  it('⑤ 沒有預備教室與抽離、沒有 X／＋ 圖例、沒有組別驗證', () => {
    const html = renderToString(<Step5 doc={d} exam={exam} onChange={noop} onStep={noop} />);
    expect(html).not.toMatch(/預備教室與抽離|理組、文組|組別|X 科目|＋ 科目/);
  });
  it('⑥ 沒有抽離自習名單、預備教室座位表', () => {
    const html = renderToString(<Step6 doc={d} exam={exam} stale={false} onGoStep={noop} />);
    expect(html).not.toMatch(/抽離自習|預備教室/);
  });
  it('出缺席記錄表沒有「不考的科目」欄', () => {
    const p = prepareExport(d, exam);
    if (!p.ok) throw new Error('prepare failed');
    const pages = buildAttendancePages(p.input);
    expect(pages.length).toBeGreaterThan(0);
    expect(JSON.stringify(pages)).not.toContain('不考的科目');
  });
  it('整體：①④⑤⑥ 與導覽沒有高中部專屬字樣（④ 的「不需要」說明除外）', () => {
    const all = [
      renderToString(<Step1 doc={d} exam={exam} onChange={noop} />),
      renderToString(<Step5 doc={d} exam={exam} onChange={noop} onStep={noop} />),
      renderToString(<Step6 doc={d} exam={exam} stale={false} onGoStep={noop} />),
    ].join('').replace(/<[^>]+>/g, ' ');
    expect(all).not.toMatch(SENIOR_ONLY);
  });
});
