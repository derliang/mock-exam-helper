/** 施工M：驗收員缺陷 D-1～D-4、D-6 的重現步驟與回歸（全部假資料）。 */
import { describe, expect, it } from 'vitest';
import { makeFixture } from '../export/fixtures';
import { scanExamSheet } from '../import/smartScan';
import { prepareExport } from './exportInput';
import { flowOf, nextAction } from './flow';
import { guardNav, initialNav, pushTo, backLabel, type Route } from './nav';
import { addRoom, patchRoom, roomsMissingTrack, setRoomTrack } from './rooms';
import { effectiveMarkRules, examResult, reseat, seatingBlockers } from './seating';
import type { Doc } from './store';

/** 全新資料夾：高中部三班（1 理 2 文 3 理）、新增兩間「班級教室」（沒指定組別，就是使用者照流程會得到的）、一份考試名單 */
function freshDoc(): Doc {
  const f = makeFixture();
  let rooms = addRoom(addRoom([], 'class'), 'class');
  rooms = rooms.map((r) => ({ ...r, rows: 5, depth: 6, seatCount: 30 }));
  const exam = { ...f.exam, classroomIds: rooms.map((r) => r.id), markRules: [] };
  return {
    settings: { ...f.settings, classrooms: rooms },
    rosters: { senior: f.students, junior: [] },
    exams: [exam],
    examFiles: { [exam.id]: { entries: f.entries, diffs: [], overrides: [] } },
  };
}

describe('D-1 教室組別（理組／文組）', () => {
  it('新增班級教室預設沒有組別；③ 就擋下並說明，不拖到 ⑤', () => {
    const d = freshDoc();
    const exam = d.exams[0]!;
    expect(d.settings.classrooms.every((r) => !r.track)).toBe(true);
    const flow = flowOf(d, exam, 3);
    const issue = flow.issues.find((i) => i.step === 3 && i.text.includes('理組／文組'));
    expect(issue?.fix).toBe('去 ③ 指定理組／文組');
    expect(flow.steps.find((s) => s.no === 4)!.state).not.toBe('done');
    expect(nextAction(flow, 3)).toMatchObject({ kind: 'go', pending: {} });
    expect(seatingBlockers(d, exam).some((b) => b.step === 3 && b.text.includes('理組／文組'))).toBe(true);
    const r = reseat(d, exam, '2026-11-08T00:00:00Z');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('沒有可用的教室');
  });

  it('指定理組一間、文組一間後：沒有擋下、能排座', () => {
    let d = freshDoc();
    const [a, b] = d.settings.classrooms;
    let rooms = patchRoom(d.settings.classrooms, a!.id, (r) => setRoomTrack(r, 'science'));
    rooms = patchRoom(rooms, b!.id, (r) => setRoomTrack(r, 'liberal'));
    d = { ...d, settings: { ...d.settings, classrooms: rooms } };
    const exam = d.exams[0]!;
    expect(flowOf(d, exam, 3).issues.some((i) => i.step === 3)).toBe(false);
    const r = reseat(d, exam, '2026-11-08T00:00:00Z');
    expect(r.ok).toBe(true);
  });

  it('預備教室不需要組別；國中部不檢查；setRoomTrack 對預備教室不寫入', () => {
    const rooms = addRoom([], 'reserve');
    expect(roomsMissingTrack(rooms, 'senior')).toEqual([]);
    expect(roomsMissingTrack(addRoom([], 'class'), 'junior')).toEqual([]);
    expect(setRoomTrack(rooms[0]!, 'science').track).toBeUndefined();
    const c = setRoomTrack(addRoom([], 'class')[0]!, 'liberal');
    expect(c.track).toBe('liberal');
    expect(setRoomTrack(c, undefined).track).toBeUndefined();
  });
});

describe('D-2 匯出與 ⑤ 畫面一致（未鎖定「標少數」建議也要一致）', () => {
  function seniorDocWithMinority(): Doc {
    const d = freshDoc();
    const rooms = d.settings.classrooms.map((r, i) => ({ ...r, track: i === 0 ? ('science' as const) : ('liberal' as const), rows: 4, depth: 5, seatCount: 20 }));
    const exam = d.exams[0]!;
    // 少數人不考英文 → 「標少數」建議 X英文；markRules 保持空（使用者完全沒點 ④）
    const entries = d.examFiles![exam.id]!.entries!.map((e, i) => (i < 4 ? { ...e, subjectIds: ['zh', 'ma'] } : e));
    const reserve = { id: 'rv', name: '預備教室1', kind: 'reserve' as const, rows: 2, depth: 5, seatCount: 10 };
    return { ...d, settings: { ...d.settings, classrooms: [...rooms, reserve] }, exams: [{ ...exam, classroomIds: [...exam.classroomIds, 'rv'] }], examFiles: { [exam.id]: { entries, diffs: [], overrides: [] } } };
  }

  it('markRules 為空時，匯出的標示、抽離、版本碼＝⑤ 的結果', () => {
    const d = seniorDocWithMinority();
    const exam = d.exams[0]!;
    expect(exam.markRules).toEqual([]);
    expect(effectiveMarkRules(d, exam).rules.length).toBeGreaterThan(0);
    const now = '2026-11-08T00:00:00Z';
    const s = reseat(d, exam, now);
    expect(s.ok ? '' : s.error).toBe('');
    if (!s.ok) return;
    const screen = examResult(s.doc, exam)!;
    const p = prepareExport(s.doc, exam);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(screen.marks.length).toBeGreaterThan(0);
    expect(p.input.result.marks).toEqual(screen.marks);
    expect(p.input.result.detaches).toEqual(screen.detaches);
    expect(p.input.result.assignments).toEqual(screen.assignments);
    expect(p.input.result.dataVersion).toBe(screen.dataVersion);
  });
});

describe('D-4 路由防護：已關閉的功能頁不可顯示，也不在「← 回到」堆疊', () => {
  const lookup: Route = { page: 'lookup' };
  const allowed = (r: Route) => r.page !== 'lookup';
  it('目前就在已關閉頁：回模擬考列表', () => {
    expect(guardNav(initialNav(lookup), allowed).route).toEqual({ page: 'exams' });
  });
  it('從考生查詢進設定關掉功能後，回到標籤不再指向考生查詢', () => {
    const s = pushTo(initialNav({ page: 'settings' }), { page: 'settings' }, { route: lookup, label: '考生查詢' });
    const g = guardNav(s, allowed);
    expect(backLabel(g)).toBeUndefined();
    expect(g.route).toEqual({ page: 'settings' });
  });
  it('沒有被關的頁面原樣不動', () => {
    const s = initialNav({ page: 'exams' });
    expect(guardNav(s, allowed)).toBe(s);
  });
});

describe('D-6 智慧匯入：科目欄單字「國」給建議「國文」', () => {
  it('表頭「國」「英」', () => {
    const subjects = [{ id: 'zh', name: '國文' }, { id: 'en', name: '英文' }];
    const s = scanExamSheet([['班級', '座號', '姓名', '國', '英'], ['1', '1', '甲生', '✓', '✓']], { subjects });
    expect(s.groups.find((g) => g.id === '國')?.suggestion).toBe('zh');
  });
});
