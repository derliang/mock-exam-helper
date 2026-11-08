import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig, RosterDiff } from '../../data';
import { carryMode, carryRows, carrySource, resumeCarry, stopCarry } from '../carry';
import { classCapacity, reserveCheck } from '../capacity';
import { demoDoc } from '../repository';
import { newExam, type Doc } from '../store';
import { defaultSubjects, saveSubject, subjectTags, subjectWho } from '../subjects';
import { Step1 } from './Step1';
import { Step2 } from './Step2';
import { Step3 } from './Step3';

const noop = () => undefined;
function twoGsat(): { doc: Doc; first: ExamConfig; second: ExamConfig } {
  let d = demoDoc();
  for (const [n, t] of [['學測第一次', '2026-09-01T02:00:00Z'], ['學測第二次', '2026-10-01T02:00:00Z']] as const) {
    const r = newExam(d, 'gsat', n, new Date(t));
    if (!r.ok) throw new Error(r.error);
    d = r.doc;
  }
  return { doc: d, first: d.exams[0] as ExamConfig, second: d.exams[1] as ExamConfig };
}

describe('步驟① 考科表與誰要考', () => {
  it('預設只有數學A／B、自然、社會依組別，其餘每位考生都考；會考全部都考', () => {
    const who = (k: 'gsat' | 'bcct', r: number) => Object.fromEntries(defaultSubjects(k, r).map((s) => [s.name, subjectWho(k, s)]));
    expect(who('gsat', 3)).toMatchObject({ 國文: 'all', 英文: 'all', 數學A: 'group', 數學B: 'group', 自然: 'group', 社會: 'group' });
    expect(who('gsat', 1)).toMatchObject({ 數學: 'all', 英聽: 'all' });
    expect(Object.values(who('bcct', 1)).every((v) => v === 'all')).toBe(true);
  });
  it('標籤：依次別、只有第 1、2 次；改過才標已自訂', () => {
    const subs = defaultSubjects('gsat', 1);
    expect(subjectTags('gsat', subs.find((s) => s.id === 'math')!).map((t) => t.text)).toEqual(['依次別']);
    expect(subjectTags('gsat', subs.find((s) => s.id === 'en-listen')!).map((t) => t.text)).toEqual(['只有第 1、2 次']);
    const same = saveSubject('gsat', subs, 'chinese', '國文', 'all');
    expect(same.ok && same.list === subs).toBe(true); // 沒改就不標已自訂
    const edited = saveSubject('gsat', subs, 'chinese', '國語文', 'all');
    expect(edited.ok && edited.list.find((s) => s.id === 'chinese')?.custom).toBe(true);
    expect(saveSubject('gsat', subs, null, '國文', 'all').ok).toBe(false); // 重名
    expect(saveSubject('gsat', subs, null, ' ', 'all').ok).toBe(false);
    const added = saveSubject('gsat', subs, null, '作文', 'group');
    expect(added.ok && added.list.at(-1)).toMatchObject({ name: '作文', who: 'group', custom: true });
  });
  it('頁面：卡片、誰要考欄、學期下拉、次別 5 以上仍有選中項、參加方式不在這步', () => {
    const { doc, second } = twoGsat();
    const html = renderToString(<Step1 doc={doc} exam={second} onChange={noop} />);
    for (const t of ['基本資料', '考科表', '誰要考', '依組別代碼決定', '每位考生都考', '新增考科', '沿用上次的設定', '不沿用，從空白開始', '已自動帶入「<b>學測第一次</b>」', '<select']) expect(html).toContain(t);
    expect(html).not.toContain('全員參加');
    expect(html).not.toContain('還原預設'); // 還沒自訂才不出現
    const fifth = { ...second, round: 5 };
    const h5 = renderToString(<Step1 doc={{ ...doc, exams: [doc.exams[0] as ExamConfig, fifth] }} exam={fifth} onChange={noop} />);
    expect(h5).toContain('第五次');
    expect(h5).toMatch(/aria-pressed="true"[^>]*>第五次/);
  });
  it('會考：固定七科 info，沒有新增、編輯、刪除', () => {
    let d = demoDoc();
    const r = newExam(d, 'bcct', '會考第一次', new Date('2026-10-01T02:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    d = r.doc;
    const html = renderToString(<Step1 doc={d} exam={d.exams[0] as ExamConfig} onChange={noop} />);
    expect(html).toContain('會考科目固定為七科');
    expect(html).not.toContain('新增考科');
    expect(html).toContain('固定');
    expect(html).toContain('還沒有更早的「會考」可以沿用');
  });
});

describe('沿用上次設定', () => {
  it('沿用對象是同類型較早建立的一次；不沿用清空 ②③④ 的設定、恢復沿用再帶回', () => {
    const { doc, first, second } = twoGsat();
    expect(carrySource(doc, second)?.id).toBe(first.id);
    expect(carrySource(doc, first)).toBeUndefined();
    expect(carryMode(doc, first)).toBe('none');
    const withRooms: Doc = { ...doc, exams: doc.exams.map((e) => (e.id === second.id ? { ...e, classroomIds: ['x'] } : e)) };
    const off = stopCarry(withRooms, withRooms.exams[1] as ExamConfig);
    const offExam = off.exams[1] as ExamConfig;
    expect(offExam).toMatchObject({ carry: false, classroomIds: [], markRules: [], participation: 'all' });
    expect(carryMode(off, offExam)).toBe('off');
    const prevWithRooms: Doc = { ...off, exams: off.exams.map((e) => (e.id === first.id ? { ...e, classroomIds: ['a', 'b'], participation: 'partial' as const } : e)) };
    const on = resumeCarry(prevWithRooms, prevWithRooms.exams[1] as ExamConfig);
    expect(on.exams[1]).toMatchObject({ carry: true, classroomIds: ['a', 'b'], participation: 'partial' });
  });
  it('列表：④ 在數學分科方式不同時標「需確認」，會考標「不需要」', () => {
    const { doc, first, second } = twoGsat();
    const r3 = { ...second, round: 3 };
    const rows = carryRows(doc, r3, { ...first, round: 2 });
    expect(rows.map((r) => r.step)).toEqual(['② 考試名單', '③ 教室設定', '④ 標示與抽離規則', '⑤ 排座、⑥ 下載']);
    expect(rows[2]?.badge).toBe('需確認');
    expect(carryRows(doc, second, first)[2]?.badge).toBe('沿用');
    expect(carryRows(doc, { ...second, kind: 'bcct' }, first)[2]?.badge).toBe('不需要');
  });
});

describe('步驟② 考試名單', () => {
  it('尚未匯入：warn 狀態 alert＋「匯入本次考試名單」、誰會參加、各班人數、名單比對、共用學生名單', () => {
    const { doc, second } = twoGsat();
    const html = renderToString(<Step2 doc={doc} exam={second} onChange={noop} onToRoster={noop} />);
    for (const t of ['還沒有匯入本次考試名單', '匯入本次考試名單', '本次考試名單', '誰會參加', '全員參加', '部分參加', '各班人數', '合計', '名單比對', '共用學生名單', '查看／編輯共用學生名單']) expect(html).toContain(t);
  });
  it('已匯入且全部一致：ok alert＋「再匯入一次」', () => {
    const { doc, second } = twoGsat();
    const d: Doc = { ...doc, examFiles: { [second.id]: { entries: [], diffs: [] } } };
    const html = renderToString(<Step2 doc={d} exam={second} onChange={noop} onToRoster={noop} />);
    expect(html).toContain('已比對');
    expect(html).toContain('再匯入一次');
  });
  it('有差異且未打開比對畫面：warn 提示「處理差異」；比對畫面在匯入後才自動打開（state），總覽不出現表格', () => {
    const { doc, second } = twoGsat();
    const diffs: RosterDiff[] = [{ kind: 'only-in-exam', code: '0145', exam: { classNo: 1, seatNo: 45, name: '測試生' } }];
    const d: Doc = { ...doc, examFiles: { [second.id]: { entries: [{ classNo: 1, seatNo: 45, name: '測試生', subjectIds: ['chi'] }], diffs } } };
    const html = renderToString(<Step2 doc={d} exam={second} onChange={noop} onToRoster={noop} />);
    expect(html).toContain('還有 1 筆差異沒處理');
    expect(html).toContain('處理差異');
    expect(html).not.toContain('<table');
  });
});

describe('步驟③ 教室設定', () => {
  it('D82：沒匯入考試名單時不顯示考生 0，說「尚未匯入考試名單」；匯入後以本次名單人數算（部分參加時與共用名單不同）', () => {
    const { doc, second } = twoGsat();
    const none = classCapacity(doc, second);
    expect(none).toMatchObject({ lines: [], noList: true });
    expect(renderToString(<Step3 doc={doc} exam={second} onChange={noop} />)).toContain('尚未匯入考試名單');
    const some = doc.rosters.senior.slice(0, 3).map((s) => ({ classNo: s.classNo, seatNo: s.seatNo, name: s.name, subjectIds: ['chi'] }));
    const d: Doc = { ...doc, examFiles: { [second.id]: { entries: some, diffs: [] } } };
    const r = classCapacity(d, second);
    expect(r.noList).toBe(false);
    expect(r.lines.reduce((n, l) => n + l.students, 0)).toBe(3);
  });
  it('卡片：狀態檢核（理組／文組分列＋預備教室）、班級文理組、教室與座位', () => {
    const { doc, second } = twoGsat();
    const entries = doc.rosters.senior.map((s) => ({ classNo: s.classNo, seatNo: s.seatNo, name: s.name, subjectIds: ['chi'] }));
    const withList: Doc = { ...doc, examFiles: { [second.id]: { entries, diffs: [] } } };
    const html = renderToString(<Step3 doc={withList} exam={second} onChange={noop} />);
    for (const t of ['狀態檢核', '理組教室座位', '文組教室座位', '預備教室容量', '班級', '理組</button>', '文組</button>', '教室與座位']) expect(html).toContain(t);
  });
  it('分組容量：理組座位不夠擋下、文組夠；預備教室不足給 warn', () => {
    const { doc, second } = twoGsat();
    const track = doc.settings.classes.filter((c) => c.division === 'senior').map((c, i) => ({ ...c, track: (i === 0 ? 'science' : 'liberal') as 'science' | 'liberal' }));
    const first = doc.rosters.senior.filter((s) => s.classNo === track[0]?.no).length;
    const rooms = [
      { id: 'r1', name: '試場1', kind: 'class' as const, rows: 1, depth: 1, seatCount: 1, track: 'science' as const },
      { id: 'r2', name: '試場2', kind: 'class' as const, rows: 8, depth: 6, seatCount: 48, track: 'liberal' as const },
    ];
    const entries = doc.rosters.senior.map((s) => ({ classNo: s.classNo, seatNo: s.seatNo, name: s.name, subjectIds: ['chi'] }));
    const d: Doc = { ...doc, examFiles: { [second.id]: { entries, diffs: [] } }, settings: { ...doc.settings, classes: [...track, ...doc.settings.classes.filter((c) => c.division !== 'senior')], classrooms: rooms }, exams: doc.exams.map((e) => (e.id === second.id ? { ...e, classroomIds: ['r1', 'r2'] } : e)) };
    const { lines } = classCapacity(d, d.exams[1] as ExamConfig);
    expect(lines.map((l) => l.label)).toEqual(['理組', '文組']);
    if (first > 1) expect(lines[0]?.ok).toBe(false);
    expect(lines[1]?.seats).toBe(48);
    expect(['ok', 'warn']).toContain(reserveCheck(d, d.exams[1] as ExamConfig).tone);
    expect(reserveCheck(d, { ...second, kind: 'bcct' }).tone).toBe('info');
  });
});
