import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import { afterExport, checkExamName, confirmCopy, firstIssueStep, flowOf, nextAction, prerequisites, summaryText } from './flow';
import { reseat, setMarkChoice } from './seating';
import type { Doc } from './store';

const NOW = '2026-11-08T10:00:00.000Z';

function exam(patch: Partial<ExamConfig> = {}): ExamConfig {
  return {
    id: 'e1', name: '測試考', kind: 'gsat', division: 'senior', semester: 'first', round: 3, participation: 'all',
    subjects: [{ id: 'soc', name: '社會' }, { id: 'sci', name: '自然' }, { id: 'lis', name: '英聽' }],
    markRules: [], classroomIds: ['S', 'L', 'P'], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt: NOW, ...patch,
  };
}

// 假資料：理組 1 班 4 人（2 人不考社會＝接近一半，須選擇）、文組 2 班 3 人
const entries: ExamEntry[] = [
  { classNo: 1, seatNo: 1, name: '測試甲', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
  { classNo: 1, seatNo: 2, name: '測試乙', groupCode: '6', subjectIds: ['sci', 'lis'] },
  { classNo: 1, seatNo: 3, name: '測試丙', groupCode: '6', subjectIds: ['sci', 'lis'] },
  { classNo: 1, seatNo: 4, name: '測試丁', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
  { classNo: 2, seatNo: 1, name: '測試戊', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 2, name: '測試己', groupCode: '8', subjectIds: ['soc', 'lis'] },
  { classNo: 2, seatNo: 3, name: '測試庚', groupCode: '0', subjectIds: ['soc', 'sci', 'lis'] },
];

function doc(e = exam(), withEntries = true): Doc {
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
    examFiles: withEntries ? { e1: { entries } } : {},
  };
}

const decided = () => exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
function seated(): { d: Doc; e: ExamConfig } {
  const e = decided();
  const r = reseat(doc(e), e, NOW);
  if (!r.ok) throw new Error(r.error);
  return { d: r.doc, e };
}

describe('步驟狀態（第N/6步、完成狀態）', () => {
  it('全新考試：只有 ① 完成，②③④⑤ 各有待辦，目前步驟標 cur', () => {
    const e = exam({ classroomIds: [] });
    const f = flowOf(doc(e, false), e, 1);
    expect(f.steps.map((s) => s.state)).toEqual(['cur', 'todo', 'todo', 'todo', 'todo', 'todo']);
    expect(f.steps).toHaveLength(6);
    expect(f.issues.map((i) => i.step)).toEqual([2, 3, 4, 5]);
  });

  it('接近一半未選：④ 未完成；選了之後 ①②③④ 完成', () => {
    const f = flowOf(doc(), exam(), 2);
    expect(f.steps.map((s) => s.state)).toEqual(['done', 'cur', 'done', 'todo', 'todo', 'todo']);
    const e = decided();
    const f2 = flowOf(doc(e), e, 2);
    expect(f2.steps.map((s) => s.state)).toEqual(['done', 'cur', 'done', 'done', 'todo', 'todo']);
  });

  it('排座後 ⑤ 完成；改名單後 ⑤ 過期', () => {
    const { d, e } = seated();
    expect(flowOf(d, e, 5).steps[4]!.state).toBe('cur');
    expect(flowOf(d, e, 1).steps[4]!.state).toBe('done');
    expect(flowOf(d, e, 1).issues).toEqual([]);
    const changed: Doc = { ...d, examFiles: { e1: { ...d.examFiles!.e1!, entries: entries.slice(0, 6) } } };
    const f = flowOf(changed, e, 1);
    expect(f.steps[4]!.state).toBe('stale');
    expect(f.issues.map((i) => i.text)).toEqual(['⑤ 名單或設定在排座後改過，需要重新排座']);
  });

  it('考科表被刪光：① 未完成並要求還原', () => {
    const e = exam({ subjects: [] });
    const f = flowOf(doc(e), e, 2);
    expect(f.steps[0]!.state).toBe('todo');
    expect(f.issues[0]).toMatchObject({ step: 1, level: 'block' });
  });

  it('會考的 ④ 標註不需要，且不會因標示而擋下，也不算「尚未完成」', () => {
    const e = exam({ kind: 'bcct', division: 'junior' });
    const f = flowOf(doc(e, false), e, 1);
    expect(f.steps[3]!.state).toBe('skip');
    expect(f.steps[3]!.note).toBe('會考沒有選考');
    expect(f.issues.some((i) => i.step === 4)).toBe(false);
  });

  it('稿 v2.13：①～④ 沒做完、又沒有更具體問題的步驟，補一項「尚未完成」，排在真問題之後', () => {
    const e = exam({ classroomIds: [] });
    const f = flowOf(doc(e, false), e, 1);
    const todo = f.issues.filter((i) => i.todo);
    expect(todo.map((i) => i.step)).toEqual(expect.arrayContaining([4, 5]));
    expect(todo.find((i) => i.step === 4)).toMatchObject({ title: '標示與抽離規則尚未完成', level: 'warn' });
    // 真問題（沒有 todo）全部在 todo 之前
    const firstTodo = f.issues.findIndex((i) => i.todo);
    expect(f.issues.slice(firstTodo).every((i) => i.todo)).toBe(true);
    expect(f.issues.slice(0, firstTodo).length).toBeGreaterThan(0);
  });

  it('座位少於考生：摘要列逐項要有「需要／可用／缺少」', () => {
    const e = exam({ classroomIds: ['L'] });
    const f = flowOf(doc(e), e, 3);
    const seat = f.issues.find((i) => i.title === '班級教室座位不足')!;
    expect(seat).toMatchObject({ step: 3, need: 7, have: 4, lack: 3, sub: '座位不能比考生少' });
  });
});

describe('前置條件與「下一步」按鈕', () => {
  it('沒問題就前往下一步', () => {
    const f = flowOf(doc(), exam(), 1);
    expect(nextAction(f, 1)).toEqual({ kind: 'go', to: 2, label: '完成此步，前往 ② 考試名單' });
  });

  it('沒匯入名單時，②→③ 停用，說明原因並一鍵回 ②', () => {
    const e = exam();
    const f = flowOf(doc(e, false), e, 2);
    const n = nextAction(f, 2);
    // TODO-17：不禁止，只標示原因（D47）
    expect(n).toMatchObject({ kind: 'go', to: 3, pending: { fixStep: 2, fix: '去 ② 匯入考試名單' } });
    expect(n.kind === 'go' && n.pending?.reason).toContain('考試名單還沒有匯入');
  });

  it('④ 有未選的標示 → 不能進 ⑤，指向 ④', () => {
    const f = flowOf(doc(), exam(), 4);
    const n = nextAction(f, 4);
    expect(n).toMatchObject({ kind: 'go', to: 5, pending: { fixStep: 4 } });
  });

  it('座位少於考生 → 擋在 ③ 之後，並寫出差幾個', () => {
    const e = exam({ classroomIds: ['S'] });
    const f = flowOf(doc(e), e, 3);
    expect(f.summary).toMatchObject({ students: 7, seats: 5, spare: -2 });
    const n = nextAction(f, 3);
    expect(n).toMatchObject({ kind: 'go', pending: { fixStep: 3 } });
    expect(n.kind === 'go' && n.pending?.reason).toContain('還差 2 個');
  });

  it('還沒排座不能進 ⑥；排座完成才放行；⑥ 沒有下一步', () => {
    const e = decided();
    const f = flowOf(doc(e), e, 5);
    expect(nextAction(f, 5)).toMatchObject({ kind: 'go', to: 6, pending: { fixStep: 5, fix: '去 ⑤ 開始排座' } });
    const { d, e: e2 } = seated();
    expect(nextAction(flowOf(d, e2, 5), 5)).toEqual({ kind: 'go', to: 6, label: '完成此步，前往 ⑥ 下載' });
    expect(nextAction(flowOf(d, e2, 6), 6)).toEqual({ kind: 'none' });
  });

  it('prerequisites 只算在目標步驟之前的 block 問題', () => {
    const f = flowOf(doc(), exam(), 1);
    expect(prerequisites(f, 4)).toEqual([]);
    expect(prerequisites(f, 5).map((i) => i.step)).toEqual([4]);
    expect(prerequisites(f, 6).map((i) => i.step)).toEqual([4, 5]);
  });
});

describe('常駐摘要列', () => {
  it('考生／座位／空位／警告', () => {
    const f = flowOf(doc(), exam(), 1);
    expect(f.summary).toEqual({ students: 7, seats: 9, spare: 2, warnings: 2 });
    expect(summaryText(f.summary)).toEqual({ seatNote: '2', bad: false });
  });
  it('座位不夠時空位欄顯示「缺 N」', () => {
    expect(summaryText({ students: 7, seats: 5, spare: -2, warnings: 1 })).toEqual({ seatNote: '缺 2', bad: true });
  });
  it('點警告跳到第一個問題的步驟；沒有警告則無處可跳', () => {
    expect(firstIssueStep(flowOf(doc(), exam(), 1))).toBe(4);
    const { d, e } = seated();
    expect(firstIssueStep(flowOf(d, e, 1))).toBeUndefined();
    expect(flowOf(d, e, 1).summary.warnings).toBe(0);
  });
});

describe('行內驗證', () => {
  it('考試名稱：空白、過長、重名都給原因與修法', () => {
    const d = doc();
    expect(checkExamName(d, '  ')).toMatchObject({ ok: false });
    expect(checkExamName(d, '  ').message).toContain('例如');
    expect(checkExamName(d, 'x'.repeat(31)).message).toContain('31 字');
    expect(checkExamName(d, '測試考').message).toContain('已經有叫「測試考」');
    expect(checkExamName(d, '學測第三次')).toEqual({ ok: true, message: '' });
  });
});

describe('破壞性動作文案與完工頁', () => {
  it('確認文案說明後果；有覆寫時重新排座文案提到保留', () => {
    expect(confirmCopy.deleteStudent('測試甲', '0101').body).toContain('0101 測試甲');
    expect(confirmCopy.deleteRoom('溫', true).body).toContain('過期');
    expect(confirmCopy.deleteRoom('溫', false).body).not.toContain('過期');
    expect(confirmCopy.reimportList(7).body).toContain('7 位');
    expect(confirmCopy.reseat(2).body).toContain('2 筆個別覆寫');
    expect(confirmCopy.reseat(0).body).not.toContain('覆寫');
  });
  it('匯出完成後的下一步依格式與紙張變化', () => {
    expect(afterExport('word', 'B4')[0]!.text).toContain('下載資料夾');
    expect(afterExport('pdf', 'A3')[0]!.text).toContain('另存為 PDF');
    expect(afterExport('pdf', 'A3')[1]!.text).toContain('A3');
    expect(afterExport('word', 'B4').some((i) => i.step === 5)).toBe(true);
    expect(afterExport('word', 'B4').some((i) => i.nav === 'exams')).toBe(true);
  });
});

describe('施工N：D82 考生人數、TODO-17 下一步不擋人', () => {
  it('D82：沒匯入考試名單時摘要列顯示「尚未匯入考試名單」，不是 0', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { SummaryBar } = await import('./components');
    const e = exam();
    const html = renderToString(SummaryBar({ flow: flowOf(doc(e, false), e, 2), onGo: () => undefined }));
    expect(html).toContain('尚未匯入考試名單');
    expect(html).not.toContain('<span class="sl">考生</span><b>0</b>');
    expect(html).toContain('待處理');
    const ok = renderToString(SummaryBar({ flow: flowOf(doc(e, true), e, 2), onGo: () => undefined }));
    expect(ok).toContain('<span class="sl">考生</span><b>7</b>');
  });
  it('TODO-17：下一步按鈕不停用；待處理只在常駐摘要列，標題卡不再另有警示（稿 v2.15）', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { h } = await import('preact');
    const { StepHead, StepNextContext } = await import('./components');
    const e = exam();
    const action = nextAction(flowOf(doc(e, false), e, 2), 2);
    const html = renderToString(h(StepNextContext.Provider, { value: { action, onGo: () => undefined } }, h(StepHead, { title: '② 考試名單' }, '匯入、比對、參加者')));
    expect(html).toContain('完成此步，前往 ③ 教室設定');
    expect(html).toContain('匯入、比對、參加者');
    expect(html).not.toContain('前面還有事沒做完');
    expect(html).not.toContain('disabled');
  });
  it('稿 v2.15：最後一步（⑥）標題卡顯示「最後一步」，沒有主按鈕', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { h } = await import('preact');
    const { StepHead, StepNextContext } = await import('./components');
    const e = exam();
    const action = nextAction(flowOf(doc(e), e, 6), 6);
    const html = renderToString(h(StepNextContext.Provider, { value: { action, onGo: () => undefined } }, h(StepHead, { title: '⑥ 下載' }, 'Word、PDF')));
    expect(html).toContain('最後一步');
    expect(html).not.toContain('btn-primary');
  });
  it('稿 v2.15：會考 ③ 的下一步直接是 ⑤（④ 不需要）', () => {
    const e = exam({ kind: 'bcct', division: 'junior' });
    const n = nextAction(flowOf(doc(e, false), e, 3), 3);
    expect(n).toMatchObject({ kind: 'go', to: 5, label: '完成此步，前往 ⑤ 排座與預覽' });
  });
  it('稿 v2.15：摘要列逐項列出待處理，數量類問題有需要／可用／缺少，整列可點；有待處理時不固定', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { SummaryBar } = await import('./components');
    const e = exam({ classroomIds: ['L'] });
    const html = renderToString(SummaryBar({ flow: flowOf(doc(e), e, 3), onGo: () => undefined }));
    expect(html).toContain('class="sumbar has-iss"');
    expect(html).toContain('③ 教室設定');
    expect(html).toContain('班級教室座位不足');
    expect(html).toContain('需要 <b>7</b>');
    expect(html).toContain('可用 <b>4</b>');
    expect(html).toContain('缺少 <b>3</b>');
    expect(html).toContain('class="si todo"'); // 尚未完成的步驟排在後面
    expect(html).toContain('缺位');
  });
  it('稿 v2.15：沒有待處理時摘要列固定（沒有 has-iss），顯示「✓ 沒有待處理的事」', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { SummaryBar } = await import('./components');
    const { d, e } = seated();
    const html = renderToString(SummaryBar({ flow: flowOf(d, e, 5), onGo: () => undefined }));
    expect(html).not.toContain('has-iss');
    expect(html).toContain('沒有待處理的事');
  });
  it('G2：danger 提示條與徽章用樣式表有的 a-err／b-err', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { Alert, Badge } = await import('./components');
    expect(renderToString(Alert({ tone: 'danger', children: '壞了' }))).toContain('alert a-err');
    expect(renderToString(Badge({ tone: 'danger', children: '錯' }))).toContain('badge b-err');
    expect(renderToString(Alert({ tone: 'warn', children: '注意' }))).toContain('alert a-warn');
  });
  it('G5：復原鈕組——沒有歷史時兩顆都停用但看得到；有歷史時主鈕寫動作名', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { h } = await import('preact');
    const { UndoControl } = await import('./components');
    const none = renderToString(h(UndoControl, { onUndo: () => undefined, steps: [], onUndoTo: () => undefined }));
    expect(none).toContain('undo-main');
    expect(none).toContain('undo-more');
    expect((none.match(/disabled/g) ?? []).length).toBe(2);
    const has = renderToString(h(UndoControl, { undoLabel: '新增學生', onUndo: () => undefined, steps: [{ index: 0, label: '新增學生' }], onUndoTo: () => undefined }));
    expect(has).toContain('↶ 復原：新增學生');
    expect(has).not.toContain('disabled');
  });
  it('稿 v2.15：步驟欄每步兩行（名稱＋狀態・說明）、✓／!／數字圖示，卡內有進度字、沒有右側狀態字', async () => {
    const { renderToString } = await import('preact-render-to-string');
    const { StepNav } = await import('./components');
    const { d, e } = seated();
    const html = renderToString(StepNav({ steps: flowOf(d, e, 6).steps, onGo: () => undefined }));
    expect(html).toContain('第 6／6 步');
    expect(html).toContain('已完成・類型、次別、考科');
    expect(html).toContain('<span class="no">✓</span>');
    expect(html).toContain('<span class="no">6</span>');
    expect(html).not.toContain('未完成');
    expect(html).not.toContain('>目前<');
  });
  it('TODO-19：步驟 ⑥ 叫「下載」', async () => {
    const { STEP_NAMES } = await import('./nav');
    expect(STEP_NAMES[5]).toBe('下載');
  });
});
