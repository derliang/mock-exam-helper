/** 分科步驟③④⑤畫面（AST-1b）：資料→引擎的轉換、教室編輯、三個畫面的內容、流程狀態。全部匿名假資料。 */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { Classroom, ExamConfig, ExamEntry } from '../../data';
import { classroomSeats, isValidClassroom, studyCapacityOf } from '../../data';
import { demoDoc } from '../repository';
import { flowOf } from '../flow';
import { newExam, updateExam, type Doc } from '../store';
import { stepTitle } from '../nav';
import { AstStep3 } from './AstStep3';
import { AstStep4 } from './AstStep4';
import { AstStep5 } from './AstStep5';
import { astCapacity, astInput, astPlan, astSlots, usageCell, withApproval, withoutApproval } from './model';
import { isSeatOff, resetStudyCapacity, setStudyCapacity, stepRowDepth, stepStudyCapacity, studyAdjust, toggleSeat } from './roomEdit';

const noop = () => undefined;
const NAMES = ['溫', '良', '恭', '儉', '勤', '誠'];
const SCI = ['physics', 'chemistry', 'math-jia', 'biology'];
const LIB = ['history', 'geography', 'math-yi', 'civics'];

/** 6 個班各 per 人、6 間 7×7 班級教室、1 間綜合教室；理組班考理科、文組班考文科，座號 5 的倍數的人每科都不考其中一科（要自習） */
function fixture(per = 12, reserveSeats = 12, skipEvery = 5): { doc: Doc; exam: ExamConfig } {
  const r = newExam(demoDoc(), 'ast', '分科第一次', new Date('2026-09-01T02:00:00Z'));
  if (!r.ok) throw new Error(r.error);
  let doc = r.doc;
  let exam = doc.exams[doc.exams.length - 1]!;
  const rooms: Classroom[] = NAMES.map((n, i) => ({ id: `c${i + 1}`, name: n, kind: 'class', rows: 7, depth: 7, seatCount: 49, track: i < 3 ? 'science' : 'liberal', division: 'senior' }));
  rooms.push({ id: 'k1', name: '綜合教室一', kind: 'reserve', rows: 3, depth: 4, seatCount: reserveSeats, division: 'senior' });
  const roster = NAMES.flatMap((n, i) => Array.from({ length: per }, (_, j) => ({ classNo: i + 1, seatNo: j + 1, name: `學生${i + 1}${j + 1}` })));
  const entries: ExamEntry[] = roster.map((s) => {
    const sci = s.classNo <= 3;
    const subjectIds = (sci ? SCI : LIB).filter((_, k) => !(s.seatNo % skipEvery === 0 && k === s.seatNo % 4));
    return { classNo: s.classNo, seatNo: s.seatNo, name: s.name, subjectIds, track: sci ? 'science' : 'liberal' };
  });
  doc = { ...doc, settings: { ...doc.settings, classrooms: rooms, classes: NAMES.map((n, i) => ({ no: i + 1, name: n, division: 'senior' as const, track: i < 3 ? 'science' as const : 'liberal' as const, colorIndex: i + 1 })) }, rosters: { ...doc.rosters, senior: roster }, examFiles: { ...(doc.examFiles ?? {}), [exam.id]: { entries } } };
  const u = updateExam(doc, exam.id, { classroomIds: rooms.map((x) => x.id) });
  if (!u.ok) throw new Error(u.error);
  doc = u.doc;
  exam = doc.exams.find((e) => e.id === exam.id)!;
  return { doc, exam };
}

describe('時段與規劃輸入', () => {
  it('分科節次表＝兩天各 4 個時段、一時段一科，標籤「第一天 時段一」', () => {
    const { doc, exam } = fixture();
    const slots = astSlots(doc, exam);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toMatchObject({ day: 0, slot: 1, label: '第一天 時段一', subjectIds: ['physics'] });
    expect(slots[7]).toMatchObject({ day: 1, slot: 4, label: '第二天 時段四' });
  });
  it('考生的 takes 依考試名單、文理組用考生自己的；教室只含本次勾選的', () => {
    const { doc, exam } = fixture();
    const input = astInput(doc, exam);
    expect(input.students).toHaveLength(72);
    const s = input.students.find((x) => x.classNo === 1 && x.seatNo === 1)!;
    expect(Object.values(s.takes).sort()).toEqual([...SCI].sort());
    expect(input.rooms.map((r) => r.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'k1']);
    const u = updateExam(doc, exam.id, { classroomIds: ['c1', 'k1'] });
    if (!u.ok) throw new Error();
    expect(astInput(u.doc, u.doc.exams.find((e) => e.id === exam.id)!).rooms).toHaveLength(2);
  });
  it('跑引擎：合規、沒有排不進的人、兩種模式的指標都有；同輸入重算結果相同', () => {
    const { doc, exam } = fixture();
    const a = astPlan(doc, exam, 'fewest-rooms')!;
    const b = astPlan(doc, exam, 'least-movement')!;
    for (const p of [a, b]) { expect(p.errors).toEqual([]); expect(p.unplaced).toBe(0); expect(p.out.metrics).toBeTruthy(); }
    expect(b.out.metrics!.leaveHome).toBeLessThanOrEqual(a.out.metrics!.leaveHome);
    expect(JSON.stringify(astPlan(doc, exam, 'fewest-rooms')!.out)).toBe(JSON.stringify(a.out));
  });
  it('沒有考試名單或沒勾教室＝沒有方案（不跑引擎）', () => {
    const { doc, exam } = fixture();
    const u = updateExam(doc, exam.id, { classroomIds: [] });
    if (!u.ok) throw new Error();
    expect(astPlan(u.doc, u.doc.exams.find((e) => e.id === exam.id)!)).toBeUndefined();
    const { doc: d2, exam: e2 } = fixture();
    expect(astPlan({ ...d2, examFiles: {} }, e2)).toBeUndefined();
  });
});

describe('教室編輯（每排深位數、停用座位、自習容量）', () => {
  const room: Classroom = { id: 'x', name: '甲', kind: 'class', rows: 3, depth: 4, seatCount: 12 };
  it('每排深位數可不同：存成 rowDepths、depth＝最大值、座位數跟著變、仍是合法教室', () => {
    const r = stepRowDepth(room, 2, -1, { depth: 8, cap: 49 });
    expect(r.rowDepths).toEqual([4, 3, 4]);
    expect(r.depth).toBe(4);
    expect(r.seatCount).toBe(11);
    expect(isValidClassroom(r)).toBe(true);
    expect(classroomSeats(r)).toHaveLength(11);
    expect(classroomSeats(r).some((s) => s.row === 2 && s.depth === 4)).toBe(false);
    // 全部改回一樣 → 不再存 rowDepths
    expect(stepRowDepth(r, 2, 1, { depth: 8, cap: 49 }).rowDepths).toBeUndefined();
  });
  it('深位數不得小於 1、不得超過上限與標籤紙張座位數', () => {
    expect(stepRowDepth({ ...room, depth: 1, seatCount: 3, rowDepths: undefined }, 1, -1, { depth: 8, cap: 49 }).seatCount).toBe(3);
    expect(stepRowDepth(room, 1, 1, { depth: 4, cap: 49 })).toBe(room);
    expect(stepRowDepth(room, 1, 1, { depth: 8, cap: 12 })).toBe(room);
  });
  it('點座位停用／恢復；至少留 1 個可排', () => {
    const off = toggleSeat(room, 2, 3, 49);
    expect(isSeatOff(off, 2, 3)).toBe(true);
    expect(off.seatCount).toBe(11);
    expect(off.disabled).toEqual(['2-3']);
    const back = toggleSeat(off, 2, 3, 49);
    expect(isSeatOff(back, 2, 3)).toBe(false);
    expect(back.disabled).toBeUndefined();
    const one: Classroom = { ...room, rows: 1, depth: 1, seatCount: 1 };
    expect(toggleSeat(one, 1, 1, 49)).toBe(one);
  });
  it('自習容量：預設＝可排座位；可調高（琥珀）、調低、還原；程式不自己調大', () => {
    expect(studyCapacityOf(room)).toBe(12);
    expect(studyAdjust(room)).toEqual({ kind: 'default', diff: 0 });
    const up = stepStudyCapacity(room, 1);
    expect(up.studyCapacity).toBe(13);
    expect(studyAdjust(up)).toEqual({ kind: 'raised', diff: 1 });
    const down = setStudyCapacity(room, 9);
    expect(studyAdjust(down)).toEqual({ kind: 'lowered', diff: -3 });
    expect(resetStudyCapacity(up).studyCapacity).toBeUndefined();
    // 停用一個座位後，沒手動設過的自習容量跟著可排座位；手動設過的不動
    expect(studyCapacityOf(toggleSeat(room, 1, 1, 49))).toBe(11);
    expect(studyCapacityOf(toggleSeat(up, 1, 1, 49))).toBe(13);
  });
});

describe('③ 教室與自習空間', () => {
  it('標題、狀態檢核、班級、綜合教室、自習去哪裡、班級教室與座位圖', () => {
    const { doc, exam } = fixture();
    const html = renderToString(<AstStep3 doc={doc} exam={exam} onChange={noop} />);
    for (const s of ['③ 教室與自習空間', '理組考場座位', '文組考場座位', '綜合教室自習容量', '綜合教室（＝預備教室）', '新增綜合教室', '自習可以去哪裡', '允許自習去他班原班教室', '班級教室與座位圖', '自習容量（預設＝可排座位）', '編輯座位圖']) expect(html).toContain(s);
    expect(html).toContain('夠用');
    expect(html).not.toContain('標少數');
  });
  it('理組座位不夠最多一個時段的考生 → 該格不足', () => {
    const { doc, exam } = fixture(60);
    const html = renderToString(<AstStep3 doc={doc} exam={exam} onChange={noop} />);
    expect(html).toContain('不足');
  });
  it('綜合教室放不下 → 琥珀警示；開「允許他班原班自習」後不再有待處理', () => {
    const { doc, exam } = fixture(12, 1, 2);
    expect(astCapacity(doc, exam).study.slotsShort).toBeGreaterThan(0);
    expect(renderToString(<AstStep3 doc={doc} exam={exam} onChange={noop} />)).toContain('個時段的綜合教室自習容量不夠');
    const u = updateExam(doc, exam.id, { astAllowOtherStudy: true });
    if (!u.ok) throw new Error();
    expect(astCapacity(u.doc, u.doc.exams.find((e) => e.id === exam.id)!).study.slotsShort).toBe(0);
  });
});

describe('④ 排座模式與方案', () => {
  it('兩張模式卡（預設少教室優先）、方案比較表含 D103 三項與同分決勝', () => {
    const { doc, exam } = fixture();
    const html = renderToString(<AstStep4 doc={doc} exam={exam} onChange={noop} onStep={noop} />);
    for (const s of ['④ 排座模式與方案', '少教室優先', '少移動優先', '預設', '目前使用 ✓', '改用這個', '用到的教室總數', '考場教室數／自習教室數', '跨科換座位次數', '需跨教室學生數', '各考場人數最大落差', '發卷區段數', '兩個方案完全同分時', '這份名單的結果']) expect(html).toContain(s);
    expect(html).toMatch(/aria-pressed="true"[^>]*>目前使用 ✓/);
  });
  it('選少移動優先後，目前使用那張卡換了', () => {
    const { doc, exam } = fixture();
    const u = updateExam(doc, exam.id, { astMode: 'least-movement' });
    if (!u.ok) throw new Error();
    const e2 = u.doc.exams.find((e) => e.id === exam.id)!;
    expect(renderToString(<AstStep4 doc={u.doc} exam={e2} onChange={noop} onStep={noop} />)).toContain('少移動優先（使用中）');
  });
  it('沒有名單：只提示去 ②，不報錯', () => {
    const { doc, exam } = fixture();
    expect(renderToString(<AstStep4 doc={{ ...doc, examFiles: {} }} exam={exam} onChange={noop} onStep={noop} />)).toContain('還沒有考試名單');
  });
});

describe('⑤ 時段教室與座位', () => {
  it('教室用途表、該時段摘要與名單、座位圖、硬性限制檢查；不用 X＋科目標示', () => {
    const { doc, exam } = fixture();
    const html = renderToString(<AstStep5 doc={doc} exam={exam} onChange={noop} onStep={noop} />);
    for (const s of ['⑤ 時段教室與座位', '各時段教室用途', '第一天', '時段一', '考試（科目＋人數）', '原班（沒被徵用', '考場座位圖', '只看', '硬性限制檢查', '同一時段同一間教室只能是考場或自習其中一種', '沒有尚待核可的替代方案', '講　台']) expect(html).toContain(s);
    expect(html).not.toMatch(/X物|＋物/);
  });
  it('用途表每格與引擎輸出一致：考試人數＝該節該教室的座位安排數', () => {
    const { doc, exam } = fixture();
    const plan = astPlan(doc, exam)!;
    const slots = astSlots(doc, exam);
    let checked = 0;
    for (const s of slots) for (const r of plan.input.rooms) {
      const c = usageCell(plan, s, r);
      if (c.kind === 'exam') { expect(c.count).toBe(plan.out.exams.filter((e) => e.slotId === s.id && e.roomId === r.id).length); checked++; }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('替代方案：容量不夠時出現待核可卡；核可後變「借用自習」並可取消；沒核可前 ⑤ 的流程有待處理', () => {
    const { doc, exam } = fixture(12, 1, 2);
    const plan = astPlan(doc, exam)!;
    expect(plan.pending.length).toBeGreaterThan(0);
    const html = renderToString(<AstStep5 doc={doc} exam={exam} onChange={noop} onStep={noop} />);
    for (const s of ['自習容量不足', '程式建議：改用', '核可此方案', '調高自習容量／改設定', '未經你核可不會採用']) expect(html).toContain(s);
    expect(flowOf(doc, exam, 5).issues.some((i) => i.step === 5 && i.text.includes('替代方案待核可'))).toBe(true);
    // 逐一核可
    let cur = doc; let e = exam;
    for (let i = 0; i < 20; i++) {
      const p = astPlan(cur, e)!;
      const pr = p.pending[0];
      if (!pr) break;
      const u = updateExam(cur, e.id, { astApprovals: withApproval(e, pr.slotId, pr.roomId) });
      if (!u.ok) throw new Error();
      cur = u.doc; e = cur.exams.find((x) => x.id === exam.id)!;
    }
    const done = astPlan(cur, e)!;
    expect(done.pending).toHaveLength(0);
    expect(done.approved.length).toBeGreaterThan(0);
    expect(done.errors).toEqual([]);
    const html2 = renderToString(<AstStep5 doc={cur} exam={e} onChange={noop} onStep={noop} />);
    expect(html2).toContain('已核可替代方案');
    expect(html2).toContain('取消核可');
    expect(html2).toContain('借用自習');
    const a = done.approved[0]!;
    expect(withoutApproval(e, a.slotId, a.roomId).some((x) => x.slotId === a.slotId && x.roomId === a.roomId)).toBe(false);
  });
  it('座位比考生少（無解）：不丟例外，⑤ 請使用者回 ③，指標顯示「—」', () => {
    const { doc, exam } = fixture(60);
    const plan = astPlan(doc, exam)!;
    expect(plan.infeasible).toBe(true);
    expect(renderToString(<AstStep5 doc={doc} exam={exam} onChange={noop} onStep={noop} />)).toContain('座位不夠，排不出方案');
    expect(renderToString(<AstStep4 doc={doc} exam={exam} onChange={noop} onStep={noop} />)).toContain('匯入名單並勾選教室後才算得出來');
  });
  it('沒有名單／沒有教室：給前往 ② 或 ③ 的提示', () => {
    const { doc, exam } = fixture();
    expect(renderToString(<AstStep5 doc={{ ...doc, examFiles: {} }} exam={exam} onChange={noop} onStep={noop} />)).toContain('前往 ② 考試名單');
    const u = updateExam(doc, exam.id, { classroomIds: [] });
    if (!u.ok) throw new Error();
    expect(renderToString(<AstStep5 doc={u.doc} exam={u.doc.exams.find((e) => e.id === exam.id)!} onChange={noop} onStep={noop} />)).toContain('前往 ③ 教室與自習空間');
  });
});

describe('流程（步驟欄、摘要列）', () => {
  it('分科的 ③④⑤ 名稱與短語換成新的；學測不變', () => {
    const { doc, exam } = fixture();
    const f = flowOf(doc, exam, 3);
    expect(f.steps.map((s) => s.name)).toEqual(['考試設定', '考試名單', '教室與自習空間', '排座模式與方案', '時段教室與座位', '下載']);
    expect(f.steps[2]!.blurb).toBe('座位圖、自習容量、綜合教室');
    expect(stepTitle(4, 'ast')).toBe('④ 排座模式與方案');
    expect(stepTitle(4, 'gsat')).toBe('④ 標示與抽離規則');
    expect(stepTitle(4)).toBe('④ 標示與抽離規則');
  });
  it('資料齊全且合規：③④⑤ 都完成、摘要沒有缺位', () => {
    const { doc, exam } = fixture();
    const f = flowOf(doc, exam, 1);
    expect(f.steps.slice(2, 5).map((s) => s.state)).toEqual(['done', 'done', 'done']);
    expect(f.summary.spare).toBeGreaterThanOrEqual(0);
    expect(f.issues.filter((i) => i.step >= 3 && i.step <= 5)).toEqual([]);
  });
  it('座位不夠時 ③ 擋下並寫明缺幾個', () => {
    const { doc, exam } = fixture(60);
    const f = flowOf(doc, exam, 1);
    expect(f.issues.some((i) => i.step === 3 && i.level === 'block' && /還差/.test(i.text))).toBe(true);
  });
});
