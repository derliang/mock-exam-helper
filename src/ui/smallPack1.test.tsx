/** 小修包 1：部別下拉、表頭接標題、領卷預設關、#147 標籤方向上限、5-社會組留痕（全部假資料） */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { Classroom } from '../data';
import { makeFixture } from '../export/fixtures';
import { buildLabelPages, buildSeatPages } from '../export/model';
import { renderPrintHtml } from '../export/htmlRender';
import { buildEntries, scanExamSheet } from '../import/smartScan';
import { scanOptionsFor } from './pages/ImportWizard';
import { AST_SUBJECTS } from './subjects';
import type { ExamConfig } from '../data';
import { isEnabled } from './features';
import { fillHeader, headerTemplates } from './header';
import { clickSeat, resize, roomOverLabelText, roomsOverLabel, seatLimits, setRoomDivision } from './rooms';
import { noMarkOverrideReason } from './pages/Step5';
import { RoomTable } from './components/RoomList';

const room = (o: Partial<Classroom> = {}): Classroom => ({ id: 'r', name: '甲', kind: 'class', rows: 5, depth: 6, seatCount: 30, division: 'senior', ...o });

describe('教室手動改所屬部別（裁決 2）', () => {
  it('改成國中部；預備教室改不過去（國中部沒有預備教室）', () => {
    expect(setRoomDivision(room(), 'junior').division).toBe('junior');
    const rv = room({ kind: 'reserve' });
    expect(setRoomDivision(rv, 'junior')).toBe(rv);
    expect(setRoomDivision(rv, 'senior').division).toBe('senior');
  });
  it('教室清單表格有「所屬部別」欄與下拉', () => {
    const html = renderToString(<RoomTable rooms={[room()]} paper="B4" division="senior" onChange={() => {}} />);
    expect(html).toContain('所屬部別');
    expect(html).toContain('甲 所屬部別');
    expect(html).toContain('國中部');
  });
});

describe('校-54 表頭接到匯出標題', () => {
  it('預設範本代入本次考試；列印頁頁首用它，不再是「考試名稱＋座位表」', () => {
    const f = makeFixture();
    const tpl = headerTemplates(f.settings);
    const seatHeading = fillHeader(tpl.seat, f.exam);
    const labelHeading = fillHeader(tpl.label, f.exam);
    expect(seatHeading).toMatch(/^【\d+學年第1次.*模擬考】座位表$/);
    const input = { ...f, seatHeading, labelHeading };
    const seat = buildSeatPages(input)[0]!;
    const label = buildLabelPages(input)[0]!;
    expect(seat.heading).toBe(seatHeading);
    expect(label.heading).toBe(labelHeading);
    const sh = renderPrintHtml({ seat: [seat] }, { generatedAt: '2026-11-13T00:00:00.000Z', dataVersion: 'x' });
    expect(sh).toContain(`<div class="pp-h1">${seatHeading}</div>`);
    expect(sh).not.toContain('<div class="pp-h2">座位表</div>');
    expect(renderPrintHtml({ label: [label] }, { generatedAt: '2026-11-13T00:00:00.000Z', dataVersion: 'x' })).toContain(`<div class="pp-h1">${labelHeading}</div>`);
  });
  it('使用者自訂表頭照用；沒給（舊呼叫端）維持考試名稱＋座位表', () => {
    const f = makeFixture();
    expect(buildSeatPages({ ...f, seatHeading: '自訂表頭' })[0]!.heading).toBe('自訂表頭');
    const old = buildSeatPages(f)[0]!;
    expect(old.heading).toBeUndefined();
    expect(renderPrintHtml({ seat: [old] }, { generatedAt: '2026-11-13T00:00:00.000Z', dataVersion: 'x' })).toContain('<div class="pp-h2">座位表</div>');
  });
});

describe('領卷清單預設關（裁決 9：現況已是預設關，這裡守住）', () => {
  it('沒寫、features 為空、其他功能開著，領卷清單都是關', () => {
    expect(isEnabled('pickup-list', { settings: makeFixture().settings, examKind: 'gsat' })).toBe(false);
    expect(isEnabled('pickup-list', { settings: { ...makeFixture().settings, features: {} }, examKind: 'gsat' })).toBe(false);
    expect(isEnabled('pickup-list', { settings: { ...makeFixture().settings, features: { 'student-lookup': true } }, examKind: 'gsat' })).toBe(false);
    expect(isEnabled('pickup-list', { settings: { ...makeFixture().settings, features: { 'pickup-list': true } }, examKind: 'gsat' })).toBe(true);
  });
});

describe('#147：教室橫排／深位各自受標籤版型限制', () => {
  it('B4 最多 6 排×8 深位、A3 最多 7 排×7 深位', () => {
    expect(seatLimits('B4')).toEqual({ rows: 6, depth: 8 });
    expect(seatLimits('A3')).toEqual({ rows: 7, depth: 7 });
  });
  it('8 排×6 深位（48 座）在 B4 改不出來：橫排加到 7 以上被擋', () => {
    const lim = seatLimits('B4');
    const r6 = room({ rows: 6, depth: 6, seatCount: 36 });
    expect(resize(r6, { rows: 7 }, 48, lim)).toBe(r6); // 7×6=42 沒超過 48 但排數超過 6
    expect(resize(r6, { depth: 8 }, 48, lim).depth).toBe(8); // 6×8=48 可以
    const r68 = room({ rows: 6, depth: 8, seatCount: 48 });
    expect(resize(r68, { rows: 5 }, 48, lim).rows).toBe(5);
  });
  it('舊資料 8 排×6 深位：檢查找得出來，說明橫排／深位各自的上限；允許改小', () => {
    const bad = room({ rows: 8, depth: 6, seatCount: 48 });
    expect(roomsOverLabel([bad, room()], 'B4')).toEqual([bad]);
    expect(roomOverLabelText(bad, 'B4')).toBe('「甲」是 8 排×6 深位，標籤紙 B4 最多 6 排×8 深位');
    expect(resize(bad, { rows: 6 }, 48, seatLimits('B4')).rows).toBe(6);
  });
  it('原本的排座仍能排進標籤：6 排×8 深位的座位可印；超出的標籤版型會丟錯（⑥ 預覽要接住，不白屏）', () => {
    const f = makeFixture();
    const wide = { ...f, settings: { ...f.settings, classrooms: f.settings.classrooms.map((c) => (c.id === 'r1' ? { ...c, rows: 8, depth: 6 } : c)) }, result: { ...f.result, assignments: f.result.assignments.map((a) => (a.classroomId === 'r1' && a.code === f.result.assignments.find((x) => x.classroomId === 'r1')!.code ? { ...a, row: 8, depth: 6 } : a)) } };
    expect(() => buildLabelPages(wide)).toThrow(/超過標籤每張 6 排×8 深位/);
  });
  it('用到 clickSeat 不受影響（座位格數仍以總數為上限）', () => {
    expect(clickSeat(room({ rows: 2, depth: 3, seatCount: 6 }), { row: 1, depth: 1 }, 48).seatCount).toBe(5);
  });
});

describe('校-41 沒有被標示科目的考生不能新增個別覆寫', () => {
  it('擋下說明含考生、原因與去處（④）', () => {
    const t = noMarkOverrideReason('0305', '甲生');
    expect(t).toContain('0305 甲生 沒有被標示的科目，不能新增個別覆寫');
    expect(t).toContain('④ 設定標示與抽離規則');
  });
});

describe('5-社會組（裁決 12）：視為 4 社會組並在處理紀錄留痕', () => {
  const exam = { kind: 'ast', subjects: AST_SUBJECTS } as ExamConfig;
  const opts = scanOptionsFor(exam, ['01', '02', '03', '04']);
  const sheet = [
    ['班級', '座號', '姓名', '組別'],
    ['04', '01', '丁一', '4-社會組'],
    ['04', '02', '丁二', '5-社會組'],
  ];
  it('不再進待確認；考科同 4 社會組；原組別文字保留；notices 記錄這一列', () => {
    const s = scanExamSheet(sheet, opts);
    expect(s.review).toEqual([]);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]!.message).toContain('5-社會組');
    const r = buildEntries(s, opts, { mapping: {}, rows: {} });
    expect(r.ready).toBe(true);
    const by = Object.fromEntries(r.entries.map((e) => [e.seatNo, e]));
    expect(by[2]!.subjectIds).toEqual(by[1]!.subjectIds);
    expect(by[2]!.groupCode).toBe('5-社會組');
  });
  it('其他不在表上的代碼仍進待確認，不猜', () => {
    const s = scanExamSheet([...sheet, ['04', '03', '丁三', '7-其他']], opts);
    expect(s.review.map((x) => x.kind)).toEqual(['bad-group']);
    expect(s.notices).toHaveLength(1);
  });
});
