/** 會考全員參加：不需匯入考試名單，學生名單就是考試名單；步驟③ 狀態檢核（只用假資料） */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { Classroom, ExamConfig } from '../data';
import { SummaryBar } from './components';
import { classCapacity } from './capacity';
import { examProgress } from './examList';
import { flowOf } from './flow';
import { Step2 } from './pages/Step2';
import { Step3 } from './pages/Step3';
import { demoDoc } from './repository';
import { examEntries, seatableEntries, seatingBlockers } from './seating';
import { newExam, type Doc } from './store';

const noop = () => undefined;
const room = (id: string, seatCount: number, kind: 'class' | 'reserve' = 'class'): Classroom =>
  ({ id, name: id, kind, cols: seatCount, rows: 1, seatCount, disabled: [] } as unknown as Classroom);

function junior(roomSeats: number[], students = 10): { doc: Doc; exam: ExamConfig } {
  let d = demoDoc();
  d = { ...d, rosters: { ...d.rosters, junior: Array.from({ length: students }, (_, i) => ({ classNo: 1, seatNo: i + 1, name: `假生${i + 1}` })) } };
  const classrooms = roomSeats.map((n, i) => room(`rj${i}`, n));
  d = { ...d, settings: { ...d.settings, classrooms: [...d.settings.classrooms, ...classrooms] } };
  const r = newExam(d, 'bcct', '會考測試', new Date('2026-11-01T02:00:00Z'));
  if (!r.ok) throw new Error(r.error);
  const exam = { ...(r.doc.exams[r.doc.exams.length - 1] as ExamConfig), classroomIds: classrooms.map((c) => c.id) };
  return { doc: { ...r.doc, exams: r.doc.exams.map((e) => (e.id === exam.id ? exam : e)) }, exam };
}

describe('會考不匯入名單：考生＝共用學生名單', () => {
  it('沒匯入也有考生，數量等於學生名單，每人考全部科目；不擋 ② 匯入', () => {
    const { doc, exam } = junior([12]);
    expect(examEntries(doc, exam)).toHaveLength(10);
    expect(seatableEntries(doc, exam)).toHaveLength(10);
    expect(examEntries(doc, exam)[0]!.subjectIds).toHaveLength(exam.subjects.length);
    expect(seatingBlockers(doc, exam).some((b) => b.step === 2)).toBe(false);
  });
  it('② 顯示「全員參加，不需匯入」且該步完成；摘要列、③ 人數一致', () => {
    const { doc, exam } = junior([12]);
    const html2 = renderToString(<Step2 doc={doc} exam={exam} onChange={noop} onToRoster={noop} />);
    expect(html2).toContain('全員參加，不需匯入');
    expect(html2).not.toContain('尚未匯入');
    const flow = flowOf(doc, exam, 3);
    expect(flow.steps[1]!.state).toBe('done');
    expect(flow.summary.students).toBe(10);
    expect(examProgress(doc, exam).cells[1]).toBe('d');
    const bar = renderToString(<SummaryBar flow={flow} onGo={noop} />);
    expect(bar).toContain('<span class="sl">考生</span><b>10</b>');
    expect(bar).not.toContain('尚未匯入考試名單');
  });
  it('③ 狀態檢核：考生 10、座位 12、空位 2、夠用；會考不需要預備教室', () => {
    const { doc, exam } = junior([12]);
    expect(classCapacity(doc, exam)).toMatchObject({ noList: false, seats: 12 });
    const html = renderToString(<Step3 doc={doc} exam={exam} onChange={noop} />);
    expect(html).toContain('座位</small><strong>12</strong>');
    expect(html).toContain('考生 10');
    expect(html).toContain('多 2');
    expect(html).toContain('多 2 個空位');
    expect(html).toContain('會考沒有抽離，不需要預備教室');
    expect(html).not.toContain('尚未匯入考試名單');
  });
  it('座位不足：顯示缺位與「缺 N 個座位」並擋下 ③', () => {
    const { doc, exam } = junior([6]);
    const html = renderToString(<Step3 doc={doc} exam={exam} onChange={noop} />);
    expect(html).toContain('不足 4');
    expect(html).toContain('請增加 4 個座位');
    const flow = flowOf(doc, exam, 1);
    expect(flow.steps[2]!.state).toBe('todo');
    expect(flow.summary.spare).toBe(-4);
  });
  it('D79：全科缺考（匯入的名單）仍不排座；匯入名單時以匯入為準', () => {
    const { doc, exam } = junior([12]);
    const entries = examEntries(doc, exam).map((e, i) => (i < 2 ? { ...e, subjectIds: [] } : e));
    const d: Doc = { ...doc, examFiles: { [exam.id]: { entries, diffs: [] } } };
    expect(examEntries(d, exam)).toHaveLength(10);
    expect(seatableEntries(d, exam)).toHaveLength(8);
  });
  it('學生名單是空的：不顯示考生 0，給座位合計與說明', () => {
    const { doc, exam } = junior([12], 0);
    const html = renderToString(<Step3 doc={doc} exam={exam} onChange={noop} />);
    expect(html).not.toContain('考生 0');
    expect(html).toContain('教室座位合計 12');
  });
});

describe('高中部：沒匯入名單維持 D82，但座位合計與統計列仍在', () => {
  it('不顯示考生 0；有座位合計與「匯入考試名單後檢核夠不夠」', () => {
    const doc = demoDoc();
    const r = newExam(doc, 'gsat', '學測測試', new Date('2026-11-01T02:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    const exam = r.doc.exams[r.doc.exams.length - 1] as ExamConfig;
    expect(examEntries(r.doc, exam)).toHaveLength(0);
    expect(seatingBlockers(r.doc, exam).some((b) => b.step === 2)).toBe(true);
    const html = renderToString(<Step3 doc={r.doc} exam={exam} onChange={noop} />);
    expect(html).toContain('匯入考試名單後檢核夠不夠');
    expect(html).not.toContain('考生 0');
  });
});

describe('步驟③ 教室列：國中部', () => {
  it('會考不顯示組別欄、不列預備教室、不提「新增預備教室」；高中部不變', async () => {
    const { RoomList } = await import('./components/RoomList');
    const rooms = [room('c1', 36), room('c2', 12, 'reserve')];
    const j = renderToString(<RoomList junior rooms={rooms} paper="B4" onChange={noop} selected={['c1']} onSelect={noop} />);
    expect(j).toContain('c1');
    expect(j).not.toContain('c2');
    expect(j).not.toContain('組別');
    expect(j).not.toContain('理組');
    expect(j).not.toContain('新增預備教室');
    const s = renderToString(<RoomList rooms={rooms} paper="B4" onChange={noop} selected={['c1']} onSelect={noop} />);
    expect(s).toContain('組別（高中部必選）');
    expect(s).toContain('新增預備教室');
  });
  it('國中部會考整頁③不出現文理組字樣', () => {
    const { doc, exam } = junior([12]);
    const html = renderToString(<Step3 doc={doc} exam={exam} onChange={noop} />);
    expect(html.replace('會考不分文理組', '')).not.toMatch(/理組|文組|組別|文理/);
  });
});
