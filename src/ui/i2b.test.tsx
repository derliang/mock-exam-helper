/** I-2b：步驟⑤⑥ 合併區塊、預備教室與抽離子頁（H-9）、A4 預備教室時段版、其餘頁合併區塊、#147 核實。全部假資料 */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import { examResult, reseat, setMarkChoice } from './seating';
import type { Doc } from './store';
import { Exams } from './pages/Exams';
import { Init } from './pages/Init';
import { NewExam } from './pages/NewExam';
import { ReservePage, reserveSlots } from './pages/ReservePage';
import { Step5 } from './pages/Step5';
import { Step6 } from './pages/Step6';
import { createMemoryRepository } from './repository';

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
  { classNo: 2, seatNo: 2, name: '測試己', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 3, name: '測試庚', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
];
const students = entries.map(({ classNo, seatNo, name }) => ({ classNo, seatNo, name }));

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
    rosters: { senior: students, junior: [] },
    exams: [e],
    examFiles: { e1: { entries } },
  };
}

/** 理組社會不考（X 抽離自習）、文組自然加考（＋ 抽離考試） */
function seated(): { d: Doc; e: ExamConfig } {
  const base = exam();
  const rules = [...setMarkChoice(base, 'science', 'soc', 'mark-absent')];
  const e = exam({ markRules: rules });
  const e2 = exam({ markRules: setMarkChoice(e, 'liberal', 'sci', 'mark-extra') });
  const r = reseat(doc(e2), e2, NOW);
  if (!r.ok) throw new Error(r.error);
  return { d: r.doc, e: e2 };
}

describe('步驟⑤ 合併區塊（稿 v2.31）', () => {
  const { d, e } = seated();
  const html = renderToString(<Step5 doc={d} exam={e} onChange={noop} onStep={noop} onReserve={noop} />);
  it('統計列併進座位表預覽卡（不再是卡外獨立一列）', () => {
    const i = html.indexOf('class="stats"');
    expect(i).toBeGreaterThan(html.indexOf('class="card stack"'));
    expect(html.indexOf('座位表預覽')).toBeGreaterThan(i);
  });
  it('驗證預設收合，只顯示「N／N 項通過」', () => {
    expect(html).toMatch(/\d+／\d+ 項通過/);
    expect(html).toContain('全部通過；看');
    expect(html).not.toMatch(/<details class="more" open/);
  });
  it('個別覆寫與預備教室與抽離併成「進階」一卡兩區，「查看」進子頁', () => {
    expect(html).toContain('進階');
    expect(html).toContain('預備教室與抽離');
    expect(html).toContain('>查看<');
    expect(html).not.toContain('抽離考試座位表');
  });
});

describe('預備教室與抽離子頁（H-9）', () => {
  const { d, e } = seated();
  it('每節分頁、容量四格、抽離考試與抽離自習分區', () => {
    const slots = reserveSlots(d, e);
    expect(slots.map((s) => s.name)).toEqual(['社會', '自然', '英聽']);
    expect(slots.find((s) => s.name === '社會')!.studyN).toBeGreaterThan(0);
    expect(slots.find((s) => s.name === '自然')!.examN).toBeGreaterThan(0);
    const html = renderToString(<ReservePage doc={d} examId="e1" crumbs={[{ label: '模擬考列表', onClick: noop }]} onGoStep={noop} onExams={noop} />);
    for (const t of ['預備教室與抽離', '節次科目', '抽離考試', '抽離自習', '預備教室容量', '使用教室', '出座位表與標籤']) expect(html).toContain(t);
    expect(html).toContain('社會');
    expect(html).toContain('自然');
  });
  it('沒排座時說明並可回 ⑤；會考沒有預備教室', () => {
    const empty: Doc = { ...doc(), examFiles: { e1: { entries } } };
    expect(renderToString(<ReservePage doc={empty} examId="e1" crumbs={[]} onGoStep={noop} onExams={noop} />)).toContain('還沒有排座');
    const j = exam({ division: 'junior', kind: 'bcct' });
    expect(renderToString(<ReservePage doc={doc(j)} examId="e1" crumbs={[]} onGoStep={noop} onExams={noop} />)).toContain('會考不需要抽離');
  });
});

describe('步驟⑥ 合併區塊與 #147 核實', () => {
  const { d, e } = seated();
  it('下載內容與下載結果同一張卡；Word／PDF／版本碼說明收合', () => {
    const html = renderToString(<Step6 doc={d} exam={e} onGoStep={noop} />);
    expect(html).toContain('說明：Word、PDF 與版本碼');
    expect(html).toContain('一間預備教室一頁、格內每行一個時段');
  });
  it('#147：座位超出標籤格數（舊資料 8 排）時 ⑥ 不白屏，預覽給說明', () => {
    const res = examResult(d, e)!;
    const wide: Doc = {
      ...d,
      settings: { ...d.settings, classrooms: d.settings.classrooms.map((c) => (c.id === 'S' ? { ...c, rows: 8, depth: 6 } : c)) },
      examFiles: { e1: { ...d.examFiles!.e1!, result: { ...res, assignments: res.assignments.map((a, i) => (a.classroomId === 'S' && i === 0 ? { ...a, row: 8, depth: 6 } : a)) } } },
    };
    expect(() => renderToString(<Step6 doc={wide} exam={e} onGoStep={noop} />)).not.toThrow();
  });
});

describe('其餘頁合併區塊（稿 v2.31）', () => {
  it('模擬考列表：進度圖例收進「說明」', () => {
    const html = renderToString(<Exams doc={doc()} onOpen={noop} onNew={noop} onSettings={noop} onChangeFolder={noop} />);
    expect(html).toContain('說明：進度條怎麼看');
    expect(html).toMatch(/<details class="more"><summary>說明：進度條怎麼看<\/summary><div><div class="plegend"/);
  });
  it('新增模擬考：三段合成一張卡', () => {
    const html = renderToString(<NewExam doc={doc()} onCancel={noop} onCreate={noop} />);
    expect(html.match(/class="card stack"/g)?.length).toBe(1);
    for (const t of ['1　選類型', '2　基本資料', '3　預設設定']) expect(html).toContain(t);
    expect(html.match(/class="psec"/g)?.length).toBe(2);
  });
  it('資料夾設定：雲端硬碟與授權說明收合', () => {
    const html = renderToString(<Init repo={createMemoryRepository()} fsSupported={true} onDone={noop} />);
    expect(html).toContain('說明：雲端硬碟與授權');
  });
});
