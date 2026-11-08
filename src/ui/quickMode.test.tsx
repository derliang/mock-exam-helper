import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import './featureRegister/quick';
import { enabledStepPanels } from './features';
import { QuickPanel } from './pages/QuickPanel';
import { parsePasted, previousExam, quickCheck, sheetFromPaste } from './quickMode';
import { reseat } from './seating';
import { previousExam as storePrevious, type Doc } from './store';

const SUBJ = [{ id: 'chinese', name: '國文' }, { id: 'math', name: '數學' }];
function exam(id: string, createdAt: string, patch: Partial<ExamConfig> = {}): ExamConfig {
  return {
    id, name: `測試會考${id}`, kind: 'bcct', division: 'junior', semester: 'first', participation: 'all',
    subjects: SUBJ, markRules: [], classroomIds: ['A'], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt, ...patch,
  };
}
const entries: ExamEntry[] = [
  { classNo: 1, seatNo: 1, name: '測試甲', subjectIds: ['chinese', 'math'] },
  { classNo: 1, seatNo: 2, name: '測試乙', subjectIds: ['chinese', 'math'] },
  { classNo: 1, seatNo: 3, name: '測試丙', subjectIds: ['chinese', 'math'] },
];
const roster = entries.map((e) => ({ classNo: e.classNo, seatNo: e.seatNo, name: e.name }));
const PASTE = '班級\t座號\t姓名\n01\t1\t測試甲\n01\t2\t測試乙\n01\t3\t測試丙\n';

function doc(cur: Partial<ExamConfig> = {}, students = roster): Doc {
  return {
    settings: {
      schoolName: '範例中學', headerText: '模擬考', defaultLabelPaper: 'B4',
      classes: [{ no: 1, name: '一', division: 'junior', colorIndex: 1 }],
      classrooms: [
        { id: 'A', name: '甲教室', kind: 'class', rows: 2, depth: 3, seatCount: 6 },
        { id: 'B', name: '乙教室', kind: 'class', rows: 2, depth: 3, seatCount: 6 },
      ],
    },
    rosters: { senior: [], junior: students },
    exams: [exam('p', '2026-01-01T00:00:00.000Z'), exam('c', '2026-06-01T00:00:00.000Z', cur)],
    examFiles: { p: { entries } },
  };
}
const cur = (d: Doc) => d.exams[1]!;
const fails = (r: ReturnType<typeof quickCheck>) => r.checks.filter((c) => c.state === 'fail').map((c) => c.key);

describe('H7 快速模式進入條件', () => {
  it('上一次會考＝建立時間最近、已有名單的另一次；沒有則不能用', () => {
    const d = doc();
    expect(previousExam(d, cur(d))?.id).toBe('p');
    const alone: Doc = { ...d, exams: [cur(d)], examFiles: {} };
    const r = quickCheck(alone, alone.exams[0]!);
    expect(r.status).toBe('unavailable');
    expect(r.checks[0]!.text).toContain('沒有上一次會考');
  });

  it('「上次」與新增考試共用同一個定義：同類型、最近修改的那次（不是建立時間）', () => {
    const d = doc();
    // p 建立較早但剛修改過；另加一次較晚建立、較早修改的 q
    const q = exam('q', '2026-03-01T00:00:00.000Z', { updatedAt: '2026-03-02T00:00:00.000Z' });
    const p2 = { ...d.exams[0]!, updatedAt: '2026-09-01T00:00:00.000Z' };
    const d2: Doc = { ...d, exams: [p2, q, cur(d)], examFiles: { p: { entries }, q: { entries } } };
    expect(previousExam(d2, cur(d2))?.id).toBe('p');
    expect(storePrevious(d2, 'bcct', (e) => e.id !== 'c' && !!d2.examFiles?.[e.id]?.entries?.length)?.id).toBe('p');
  });

  it('貼上前：教室與學生名單沒變 → ready，另兩項待貼上才判斷', () => {
    const d = doc();
    const r = quickCheck(d, cur(d));
    expect(r.status).toBe('ready');
    expect(r.checks.map((c) => `${c.key}:${c.state}`)).toEqual(['rooms:ok', 'roster:ok', 'count:pending', 'subjects:pending']);
  });

  it('四項全成立（貼上的名單人數相符、科目對得上）→ passed', () => {
    const d = doc();
    const input = parsePasted(cur(d), ['一'], PASTE)!;
    expect(input.entries).toHaveLength(3);
    expect(input.problems).toBe(0);
    const r = quickCheck(d, cur(d), input);
    expect(r.status).toBe('passed');
    expect(r.checks.every((c) => c.state === 'ok')).toBe(true);
  });

  it('① 教室變了 → 退回一般流程並指出教室', () => {
    const d = doc({ classroomIds: ['A', 'B'] });
    const r = quickCheck(d, cur(d));
    expect(r.status).toBe('unavailable');
    expect(fails(r)).toEqual(['rooms']);
    expect(r.checks[0]!.text).toContain('教室與上次不同');
  });

  it('② 學生名單變了 → 退回，並說有幾筆差異', () => {
    const d = doc({}, [...roster, { classNo: 1, seatNo: 4, name: '轉學生' }]);
    const r = quickCheck(d, cur(d));
    expect(fails(r)).toEqual(['roster']);
    expect(r.checks[1]!.text).toContain('1 筆差異');
  });

  it('③ 新名單人數與考生數不符 → 退回', () => {
    const d = doc();
    const input = parsePasted(cur(d), ['一'], '班級\t座號\t姓名\n01\t1\t測試甲\n01\t2\t測試乙\n')!;
    const r = quickCheck(d, cur(d), input);
    expect(r.status).toBe('unavailable');
    expect(fails(r)).toEqual(['count']);
    expect(r.checks[2]!.text).toContain('新名單 2 人，學生名單 3 人');
  });

  it('④ 有科目標示對不上 → 退回', () => {
    const d = doc();
    const r = quickCheck(d, cur(d), { entries, problems: 2 });
    expect(fails(r)).toEqual(['subjects']);
    expect(r.checks[3]!.text).toContain('2 處');
  });

  it('學測不能用', () => {
    const d = doc({ kind: 'gsat', division: 'senior' });
    const r = quickCheck(d, cur(d));
    expect(r.status).toBe('unavailable');
    expect(r.checks[0]!.text).toContain('只用於會考');
  });

  it('貼上文字轉工作表：空白行略過，Tab 分欄', () => {
    expect(sheetFromPaste('\n\n')).toEqual([]);
    expect(sheetFromPaste('a\tb\n\nc\td')[0]!.rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('通過後可直接排座（沿用上次設定）', () => {
    const d = doc();
    const input = parsePasted(cur(d), ['一'], PASTE)!;
    const next: Doc = { ...d, examFiles: { ...d.examFiles, c: { entries: input.entries, diffs: [] } } };
    const r = reseat(next, cur(next), '2026-11-08T10:00:00.000Z');
    expect(r.ok).toBe(true);
  });
});

describe('H7 開關與畫面', () => {
  const on = { features: { 'bcct-quick-mode': true } };
  it('開關關閉時 ② 頁不出現快速模式面板', () => {
    expect(enabledStepPanels({ settings: {}, examKind: 'bcct' }, 2)).toEqual([]);
    expect(enabledStepPanels({ settings: { features: { 'bcct-quick-mode': false } }, examKind: 'bcct' }, 2)).toEqual([]);
  });
  it('開啟且是會考才出現；學測與其他步驟不出現', () => {
    expect(enabledStepPanels({ settings: on, examKind: 'bcct' }, 2)).toHaveLength(1);
    expect(enabledStepPanels({ settings: on, examKind: 'gsat' }, 2)).toEqual([]);
    expect(enabledStepPanels({ settings: on, examKind: 'bcct' }, 5)).toEqual([]);
  });
  it('面板：條件成立顯示貼上框；教室變了顯示退回一般六步驟的原因', () => {
    const d = doc();
    const html = renderToString(<QuickPanel doc={d} exam={cur(d)} onChange={() => undefined} />);
    expect(html).toContain('貼上考試名單');
    expect(html).toContain('沿用「測試會考p」');
    const d2 = doc({ classroomIds: ['A', 'B'] });
    const html2 = renderToString(<QuickPanel doc={d2} exam={cur(d2)} onChange={() => undefined} />);
    expect(html2).toContain('這次不能用快速模式，請照一般六步驟做');
    expect(html2).toContain('教室與上次不同');
    expect(html2).not.toContain('貼上考試名單');
  });
});
