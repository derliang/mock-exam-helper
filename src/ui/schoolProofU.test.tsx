/** 校稿收尾 U：校-64 排座過期、校-41 個別覆寫完整表單、校-54 表頭欄位（只用假資料） */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry } from '../data';
import { flowOf } from './flow';
import { OverrideModal } from './pages/Step5';
import { Settings } from './pages/Settings';
import { Step6 } from './pages/Step6';
import { examResult, isStale, reseat, setMarkChoice } from './seating';
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

function seated(): { d: Doc; e: ExamConfig } {
  const e = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
  const r = reseat(doc(e), e, NOW);
  if (!r.ok) throw new Error(r.error);
  return { d: r.doc, e };
}

describe('校-64 排座過期', () => {
  it('改名單後：⑥ 出現琥珀「過期」橫幅、下載鈕停用並寫「排座過期，先重新排座」、步驟欄 ⑤ 標過期', () => {
    const { d, e } = seated();
    const fresh = renderToString(<Step6 doc={d} exam={e} onGoStep={noop} />);
    expect(fresh).not.toContain('排座結果過期');
    expect(fresh).not.toContain('排座過期，先重新排座');

    const changed: Doc = { ...d, examFiles: { e1: { ...d.examFiles!.e1!, entries: entries.slice(0, 6) } } };
    expect(isStale(changed, e)).toBe(true);
    const html = renderToString(<Step6 doc={changed} exam={e} onGoStep={noop} />);
    expect(html).toContain('stale-banner');
    expect(html).toContain('排座結果過期，下載已停用');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>排座過期，先重新排座<\/button>/);
    expect(html).not.toContain('排座已過期：名單或設定在排座之後改過'); // 不再重複顯示紅色錯誤

    expect(flowOf(changed, e, 1).steps.find((s) => s.no === 5)!.state).toBe('stale');
  });

  it('改設定（教室座位）也會過期；舊存檔沒有排座簽章視為未過期', () => {
    const { d, e } = seated();
    const rooms = d.settings.classrooms.map((r) => (r.id === 'S' ? { ...r, seatCount: 6 } : r));
    expect(isStale({ ...d, settings: { ...d.settings, classrooms: rooms } }, e)).toBe(true);

    const res = examResult(d, e)!;
    const { dataVersion: _drop, ...legacy } = res;
    const old: Doc = { ...d, examFiles: { e1: { ...d.examFiles!.e1!, result: legacy as typeof res, entries: entries.slice(0, 6) } } };
    expect(isStale(old, e)).toBe(false);
  });

  it('重新排座後恢復：橫幅消失、下載鈕可按', () => {
    const { d, e } = seated();
    const changed: Doc = { ...d, examFiles: { e1: { ...d.examFiles!.e1!, entries: entries.slice(0, 6) } } };
    const again = reseat(changed, e, '2026-11-08T11:00:00.000Z');
    if (!again.ok) throw new Error(again.error);
    expect(isStale(again.doc, e)).toBe(false);
    expect(renderToString(<Step6 doc={again.doc} exam={e} onGoStep={noop} />)).not.toContain('stale-banner');
  });
});

describe('校-41 個別覆寫彈窗', () => {
  it('被標示的考生：逐科用途＋地點＋教務處／圖書館／輔導室＋取消／儲存', () => {
    const { d, e } = seated();
    const html = renderToString(<OverrideModal doc={d} exam={e} result={examResult(d, e)!} code="0102" co="1-2" name="測試乙" onClose={noop} onSave={noop} />);
    for (const t of ['到他處考試', '到他處自習', '教務處', '圖書館', '輔導室', '取消', '儲存']) expect(html).toContain(t);
  });

  it('沒有被標示科目的考生：直接擋下並說明（稿 v2.30、裁決 4），不給表單也沒有儲存鈕', () => {
    const { d, e } = seated();
    const html = renderToString(<OverrideModal doc={d} exam={e} result={examResult(d, e)!} code="0101" co="1-1" name="測試甲" onClose={noop} onSave={noop} />);
    expect(html).toContain('沒有被標示的科目，不能新增個別覆寫');
    expect(html).toContain('④ 設定標示與抽離規則');
    expect(html).not.toContain('>儲存<');
    expect(html).not.toContain('到他處自習');
  });
});

describe('校-41 步驟⑤ 的「管理覆寫」「查看」鈕', () => {
  it('源碼層：覆寫卡有「管理覆寫」、預備教室與抽離卡有「查看」', async () => {
    const { Step5 } = await import('./pages/Step5');
    const { d, e } = seated();
    const html = renderToString(<Step5 doc={d} exam={e} onChange={noop} onStep={noop} onReserve={noop} />);
    expect(html).toContain('管理覆寫');
    expect(html).toContain('>查看<');
  });
});

describe('校-54 學校與表頭欄位', () => {
  it('有座位表表頭、標籤表頭（含占位符說明）與標籤注意事項，沒有舊的單一「表頭文字」', () => {
    const { d } = seated();
    const html = renderToString(<Settings doc={d} onChange={noop} tab="school" />);
    for (const t of ['學校名稱', '座位表表頭', '標籤表頭', '{學年}、{次別}、{類型}', '標籤注意事項', '預設紙張']) expect(html).toContain(t);
    expect(html).not.toContain('>表頭文字<');
  });
  it('存了自訂表頭就顯示自訂值', () => {
    const { d } = seated();
    const html = renderToString(<Settings doc={{ ...d, settings: { ...d.settings, seatHeader: '自訂座位表頭' } }} onChange={noop} tab="school" />);
    expect(html).toContain('自訂座位表頭');
  });
});
