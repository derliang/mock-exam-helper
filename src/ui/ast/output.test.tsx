/** 分科 ⑥ 輸出（AST-2）：五份輸出的內容、彼此一致、應試編號有才印、擋下條件、畫面。全部匿名假資料。 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { Classroom, ExamConfig, ExamEntry } from '../../data';
import { demoDoc } from '../repository';
import { newExam, updateExam, type Doc } from '../store';
import { codeOf } from '../../core/astD99/contract';
import { AstStep6, runAstExport } from './AstStep6';
import { astPlan } from './model';
import { astOutputBlockers, astOutputs } from './output';

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


const noopFonts = async (): Promise<never> => { throw new Error('PDF 不需要字型'); };
const withExamNo = (doc: Doc, exam: ExamConfig): Doc => {
  const entries = doc.examFiles![exam.id]!.entries!.map((e: ExamEntry) => ({ ...e, examNo: `A${String(e.classNo)}${String(e.seatNo).padStart(2, '0')}` }));
  return { ...doc, examFiles: { ...doc.examFiles, [exam.id]: { entries } } };
};
const rosterTables = (o: ReturnType<typeof astOutputs>) => o.reg.filter((t) => t.heads[0] === '座位（排－深位）');

describe('分科輸出：內容', () => {
  const { doc, exam } = fixture();
  const plan = astPlan(doc, exam)!;
  const o = astOutputs(doc, exam, plan);
  it('標籤：每間有人考試的考場一張紙，一座位一張、各時段一行、印時段＋科目、不印鐘點', () => {
    const rooms = new Set(plan.out.exams.map((e) => e.roomId));
    expect(o.label).toHaveLength(rooms.size);
    const seats = new Set(plan.out.exams.map((e) => `${e.roomId}:${e.row}-${e.depth}`));
    expect(o.label.reduce((n, p) => n + p.cells.length, 0)).toBe(seats.size);
    expect(plan.out.metrics!.labels).toBe(seats.size);
    const cell = o.label[0]!.cells.find((c) => c.periodLines!.length > 1)!;
    expect(cell.periodLines![0]!.head).toMatch(/^\d天\d$/);
    expect(JSON.stringify(o.label)).not.toMatch(/\d{1,2}:\d{2}/);
  });
  it('班級公告：每班一份、每生一列、各時段一欄；考試列教室與座位、自習只列教室', () => {
    expect(o.ann).toHaveLength(6);
    const t = o.ann[0]!;
    expect(t.rows).toHaveLength(12);
    expect(t.heads).toHaveLength(2 + 8);
    const cells = t.rows.flatMap((r) => r.slice(2));
    expect(cells.some((c) => /^考 .+ \d+－\d+$/.test(c))).toBe(true);
    expect(cells.some((c) => c.startsWith('自習'))).toBe(true);
    expect(cells.filter((c) => c.startsWith('自習')).every((c) => !/\d－\d/.test(c))).toBe(true);
  });
  it('一致性：標籤、清冊、公告都從同一份方案來，座位逐筆相同（§13.1 第 7 條）', () => {
    const roster = rosterTables(o).flatMap((t) => t.rows.map((r) => `${r[1]}|${r[0]}`));
    expect(roster).toHaveLength(plan.out.exams.length);
    const fromPlan = new Set(plan.out.exams.map((e) => `${e.code}|${e.row}－${e.depth}`));
    for (const r of roster) expect(fromPlan.has(r)).toBe(true);
    const labelTexts = o.label.flatMap((p) => p.cells.flatMap((c) => c.periodLines!.map((l) => l.text)));
    expect(labelTexts).toHaveLength(plan.out.exams.length);
    for (const e of plan.out.exams) expect(labelTexts.some((t) => t.includes(e.code))).toBe(true);
    // 公告：全部公告裡「考」的格子數＝方案的考試數
    const annExam = o.ann.flatMap((t) => t.rows.flatMap((r) => r.slice(2))).filter((c) => c.startsWith('考 ')).length;
    expect(annExam).toBe(plan.out.exams.length);
    const annStudy = o.ann.flatMap((t) => t.rows.flatMap((r) => r.slice(2))).filter((c) => c.startsWith('自習')).length;
    expect(annStudy).toBe(plan.out.study.length);
  });
  it('每科試務清冊：每科一份總表、每間考場一頁名冊；名冊有到考／缺考欄、總人數對得上', () => {
    expect(o.reg.filter((t) => t.heads[0] === '考場')).toHaveLength(8);
    expect(rosterTables(o).reduce((n, t) => n + t.rows.length, 0)).toBe(plan.out.exams.length);
    const r = rosterTables(o)[0]!;
    expect(r.heads.slice(-2)).toEqual(['到考', '缺考']);
    expect(r.rows[0]!.slice(-2)).toEqual(['□', '□']);
  });
  it('教室用途表：每間教室一列、每時段一欄；附方案指標頁', () => {
    expect(o.use[0]!.rows).toHaveLength(plan.input.rooms.length);
    expect(o.use[0]!.heads).toHaveLength(2 + 8);
    expect(o.use[1]!.rows.find((r) => r[0] === '標籤張數')![1]).toBe(String(plan.out.metrics!.labels));
  });
  it('自習名單：只列離開原班的人，人數與引擎一致；另有一份布置工作表', () => {
    const lists = o.study.filter((t) => t.heads[0] === '自習教室');
    const n = lists.reduce((a, t) => a + t.rows.length, 0);
    const homeOf = (cl: number) => plan.input.rooms.find((r) => r.kind === 'class' && r.classNo === cl)?.id;
    const away = plan.out.study.filter((s) => homeOf(Number(s.code.slice(0, 2))) !== s.roomId).length;
    expect(n).toBe(away);
    if (n > 0) expect(o.study[o.study.length - 1]!.heads).toContain('門口標籤');
  });
  it('版本碼：同方案相同、方案變了就不同', () => {
    expect(astOutputs(doc, exam, plan).version).toBe(o.version);
    const f = fixture(10);
    expect(astOutputs(f.doc, f.exam, astPlan(f.doc, f.exam)!).version).not.toBe(o.version);
  });
});

describe('分科輸出：應試編號（選填）', () => {
  it('沒匯入：公告、清冊、標籤都沒有應試編號欄', () => {
    const { doc, exam } = fixture();
    const o = astOutputs(doc, exam, astPlan(doc, exam)!);
    expect(o.ann[0]!.heads).not.toContain('應試編號');
    expect(rosterTables(o)[0]!.heads).not.toContain('應試編號');
    expect(JSON.stringify(o.label)).not.toContain(' A1');
  });
  it('有匯入：每份都印', () => {
    const f = fixture();
    const doc = withExamNo(f.doc, f.exam);
    const o = astOutputs(doc, f.exam, astPlan(doc, f.exam)!);
    expect(o.ann[0]!.heads).toContain('應試編號');
    expect(o.ann[0]!.rows[0]![2]).toBe('A101');
    expect(rosterTables(o)[0]!.heads).toContain('應試編號');
    const code = codeOf({ classNo: 1, seatNo: 1 });
    expect(o.label.flatMap((p) => p.cells.flatMap((c) => c.periodLines!.map((l) => l.text))).some((t) => t.includes(code) && t.endsWith('A101'))).toBe(true);
  });
});

describe('分科輸出：擋下與畫面', () => {
  it('沒有名單／沒有方案／座位不夠：擋下並指向對的步驟', () => {
    expect(astOutputBlockers(undefined, false)[0]!.step).toBe(2);
    expect(astOutputBlockers(undefined, true)[0]!.step).toBe(3);
    const f = fixture(12, 12);
    const u = updateExam(f.doc, f.exam.id, { classroomIds: ['c1'] });
    if (!u.ok) throw new Error();
    const e = u.doc.exams.find((x) => x.id === f.exam.id)!;
    expect(astOutputBlockers(astPlan(u.doc, e), true)[0]!.step).toBe(3);
  });
  it('⑥ 畫面：可以下載時出現五個項目與驗證通過；不能時顯示擋下原因', () => {
    const { doc, exam } = fixture();
    const html = renderToString(<AstStep6 doc={doc} exam={exam} onGoStep={noop} />);
    for (const t of ['整合標籤', '班級公告', '每節教室用途表', '每科試務清冊', '自習教室名單與布置標籤工作表', '方案通過驗證']) expect(html).toContain(t);
    const u = updateExam(doc, exam.id, { classroomIds: [] });
    if (!u.ok) throw new Error();
    const html2 = renderToString(<AstStep6 doc={u.doc} exam={u.doc.exams.find((x) => x.id === exam.id)!} onGoStep={noop} />);
    expect(html2).toContain('還不能下載');
  });
  it('PDF 輸出：合併成一個列印頁，含版本碼，標籤白底；一項都沒勾會報錯', async () => {
    const { doc, exam } = fixture();
    const o = astOutputs(doc, exam, astPlan(doc, exam)!);
    const res = await runAstExport(o, ['label', 'ann', 'use', 'reg', 'study'], 'pdf', 'B4', exam.name, noopFonts);
    expect(res).toHaveLength(1);
    const h = res[0]!.data as string;
    expect(h).toContain(o.version);
    expect(h).toContain('班級公告');
    expect(h).not.toMatch(/background:#FBE7C6/);
    await expect(runAstExport(o, [], 'pdf', 'B4', exam.name, noopFonts)).rejects.toThrow();
  });
  it('Word 輸出：標籤一個檔、其餘每項一個檔，都是可解開的 docx', async () => {
    const { doc, exam } = fixture();
    const o = astOutputs(doc, exam, astPlan(doc, exam)!);
    const dir = new URL('../../export/fonts/', import.meta.url);
    const fonts = async () => ({ fonts: { regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', dir))), bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', dir))) }, has: () => true });
    const res = await runAstExport(o, ['label', 'ann', 'use', 'reg', 'study'], 'word', 'B4', exam.name, fonts);
    expect(res.map((f) => f.name.replace(/^.*?-/, ''))).toEqual(['整合標籤（B4）.docx', '班級公告.docx', '每節教室用途表.docx', '每科試務清冊.docx', '自習教室名單與布置標籤工作表.docx']);
    for (const f of res) expect(Object.keys((await JSZip.loadAsync(f.data as Uint8Array)).files)).toContain('word/document.xml');
  }, 30000);
});
