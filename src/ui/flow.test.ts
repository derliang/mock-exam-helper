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
    expect(f.issues.map((i) => i.step)).toEqual([2, 3, 5]);
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
    expect(f.issues.map((i) => i.text)).toEqual(['⑤ 名單或設定在排座後改過，座位表已過期']);
  });

  it('考科表被刪光：① 未完成並要求還原', () => {
    const e = exam({ subjects: [] });
    const f = flowOf(doc(e), e, 2);
    expect(f.steps[0]!.state).toBe('todo');
    expect(f.issues[0]).toMatchObject({ step: 1, level: 'block' });
  });

  it('會考的 ④ 標註不需要，且不會因標示而擋下', () => {
    const e = exam({ kind: 'bcct', division: 'junior' });
    const f = flowOf(doc(e, false), e, 1);
    expect(f.steps[3]!.note).toBe('會考不需要');
    expect(f.issues.some((i) => i.step === 4)).toBe(false);
  });
});

describe('前置條件與「下一步」按鈕', () => {
  it('沒問題就前往下一步', () => {
    const f = flowOf(doc(), exam(), 1);
    expect(nextAction(f, 1)).toEqual({ kind: 'go', to: 2, label: '下一步：② 考試名單' });
  });

  it('沒匯入名單時，②→③ 停用，說明原因並一鍵回 ②', () => {
    const e = exam();
    const f = flowOf(doc(e, false), e, 2);
    const n = nextAction(f, 2);
    expect(n).toMatchObject({ kind: 'blocked', to: 3, fixStep: 2, fix: '去 ② 匯入考試名單' });
    expect(n.kind === 'blocked' && n.reason).toContain('考試名單還沒有匯入');
  });

  it('④ 有未選的標示 → 不能進 ⑤，指向 ④', () => {
    const f = flowOf(doc(), exam(), 4);
    const n = nextAction(f, 4);
    expect(n).toMatchObject({ kind: 'blocked', to: 5, fixStep: 4 });
  });

  it('座位少於考生 → 擋在 ③ 之後，並寫出差幾個', () => {
    const e = exam({ classroomIds: ['S'] });
    const f = flowOf(doc(e), e, 3);
    expect(f.summary).toMatchObject({ students: 7, seats: 5, spare: -2 });
    const n = nextAction(f, 3);
    expect(n).toMatchObject({ kind: 'blocked', fixStep: 3 });
    expect(n.kind === 'blocked' && n.reason).toContain('還差 2 個');
  });

  it('還沒排座不能進 ⑥；排座完成才放行；⑥ 沒有下一步', () => {
    const e = decided();
    const f = flowOf(doc(e), e, 5);
    expect(nextAction(f, 5)).toMatchObject({ kind: 'blocked', to: 6, fixStep: 5, fix: '去 ⑤ 開始排座' });
    const { d, e: e2 } = seated();
    expect(nextAction(flowOf(d, e2, 5), 5)).toEqual({ kind: 'go', to: 6, label: '下一步：⑥ 匯出' });
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
