import { describe, expect, it } from 'vitest';
import { groupMarks, markCore, prefillMapping, rememberMapping, tokenizeMarks, similarMarks } from './marks';
import { buildEntries, diffEntries, scanExamSheet, smartSeat, type ScanOptions } from './smartScan';
import { smartField, smartFindHeader } from './smartHeader';

// 全部是假資料
const SUBJECTS = [
  { id: 'chinese', name: '國文' }, { id: 'english', name: '英文' }, { id: 'math-a', name: '數學A' },
  { id: 'math-b', name: '數學B' }, { id: 'science', name: '自然' }, { id: 'social', name: '社會' },
];
const OPTS: ScanOptions = {
  subjects: SUBJECTS,
  groupTable: { '0': ['chinese', 'english', 'math-a', 'math-b', 'science', 'social'], D: ['chinese', 'english', 'math-a', 'math-b', 'science'] },
};

describe('表頭偵測容錯', () => {
  it('欄名錯字、全半形、括號註記、英文欄名', () => {
    expect(smartField('坐號')).toBe('seatNo');
    expect(smartField('座　號')).toBe('seatNo');
    expect(smartField('學生座號')).toBe('seatNo');
    expect(smartField('姓名＊')).toBe('name');
    expect(smartField('學號（選填）')).toBe('schoolId');
    expect(smartField('Class')).toBe('classNo');
    expect(smartField('班級座號')).toBeNull();
    expect(smartField('備考')).toBeNull();
  });
  it('表頭前有標題與空列、表頭欄位不在第一欄', () => {
    const rows = [['模擬考名單'], [''], ['', '班別', '座位號碼', '姓名'], ['', '01', '1', '甲']];
    const h = smartFindHeader(rows);
    expect(h).toMatchObject({ row: 2, span: 1, map: { classNo: 1, seatNo: 2, name: 3 } });
  });
  it('表頭被拆成上下兩列（合併儲存格）', () => {
    const rows = [['', '座', '', '姓'], ['班級', '號', '組別', '名'], ['01', '1', '0', '甲']];
    const h = smartFindHeader(rows);
    expect(h?.span).toBe(2);
    expect(h?.map).toMatchObject({ classNo: 0, seatNo: 1, group: 2, name: 3 });
  });
  it('沒有座號與姓名就找不到', () => {
    expect(smartFindHeader([['a', 'b'], ['1', '2']])).toBeNull();
  });
});

describe('標示分群', () => {
  it('核心：全半形、大小寫、前綴', () => {
    expect(markCore('ｃｈ')).toEqual({ key: 'CH', prefixRole: null });
    expect(markCore('缺國')).toEqual({ key: '國', prefixRole: 'absent' });
    expect(markCore('加考數Ａ')).toEqual({ key: '數A', prefixRole: 'extra' });
  });
  it('切開標示、連寫縮寫拆單字、長句不當標示', () => {
    expect(tokenizeMarks('缺國英').marks.map((m) => m.key)).toEqual(['國', '英']);
    expect(tokenizeMarks('國、英，數A').marks.map((m) => m.key)).toEqual(['國', '英', '數A']);
    const t = tokenizeMarks('需要放大試卷並使用電腦作答');
    expect(t.marks).toHaveLength(0);
    expect(t.prose).toHaveLength(1);
  });
  it('相似度：國／國文／國語文同組、CH／CHINESE 同組；數A 與 數 不併、符號同類併', () => {
    expect(similarMarks('國', '國文')).toBe(true);
    expect(similarMarks('國文', '國語文')).toBe(true);
    expect(similarMarks('CH', 'CHINESE')).toBe(true);
    expect(similarMarks('數A', '數')).toBe(false);
    expect(similarMarks('數A', '數學A')).toBe(true);
    expect(similarMarks('數A', '數B')).toBe(false);
    expect(similarMarks('✓', '✔')).toBe(true);
    expect(similarMarks('✓', '○')).toBe(false);
    expect(similarMarks('國', 'CH')).toBe(false);
  });
  it('混用標示：分組、計次、給建議但不自動採用', () => {
    const marks = ['國', '國文', '國', 'Ch', '英', 'ENG', '✓', '✔', '數Ａ', '數學A', '神秘'].map((r) => ({ raw: r, ...markCore(r) }));
    const gs = groupMarks(marks, SUBJECTS);
    const chi = gs.find((g) => g.members.some((m) => m.key === '國'));
    expect(chi?.total).toBe(3);
    expect(chi?.suggestion).toBe('chinese');
    expect(gs.find((g) => g.members.some((m) => m.key === 'CH'))?.suggestion).toBe('chinese');
    expect(gs.find((g) => g.members.some((m) => m.key === '數A'))?.suggestion).toBe('math-a');
    expect(gs.find((g) => g.kind === 'symbol')?.members.map((m) => m.key).sort()).toEqual(['✓', '✔']);
    expect(gs.find((g) => g.id === '神秘')?.suggestion).toBeUndefined();
    expect(gs[0]?.total).toBeGreaterThanOrEqual(gs[gs.length - 1]?.total ?? 0);
  });
  it('對應可存可重用：同組一致才預填，衝突留給使用者', () => {
    const marks = ['國', '國文', '英'].map((r) => ({ raw: r, ...markCore(r) }));
    const gs = groupMarks(marks, SUBJECTS);
    const saved = rememberMapping(gs, { 國: 'chinese', 英: 'ignore' });
    expect(prefillMapping(gs, saved, ['chinese', 'english'])).toEqual({ 國: 'chinese', 英: 'ignore' });
    expect(prefillMapping(gs, { 國: 'chinese', 國文: 'english' }, ['chinese', 'english'])).toEqual({});
    expect(prefillMapping(gs, { 國: 'gone' }, ['chinese'])).toEqual({});
  });
});

const HEAD = ['班級', '座號', '姓名', '組別', '特殊生需求註明'];

describe('智慧掃描與建立考試名單', () => {
  it('混用標示：缺考欄寫「缺國」「國文」「缺Ch」；全半形與空列；未對應前不 ready', () => {
    const rows = [
      ['期中考名單'], [''], HEAD,
      ['０１', '１', '甲', '0', '缺國'], [''], ['01', '2', '乙', '0', ''], ['01', '3', '丙', '0', '缺 CH'], ['01', '4', '丁', 'D', '缺國文、社'],
    ];
    const s = scanExamSheet(rows, OPTS);
    expect(s.problems).toEqual([]);
    expect(s.blankRows).toBe(1);
    expect(s.rows).toHaveLength(4);
    const chiGroups = s.groups.filter((g) => g.members.some((m) => ['國', 'CH', '國文'].includes(m.key)));
    expect(chiGroups.length).toBe(2); // 國／國文 一組；CH 另一組（形不相似，由使用者各自對應）
    const r0 = buildEntries(s, OPTS, { mapping: {}, rows: {} });
    expect(r0.ready).toBe(false);
    expect(r0.pendingGroups.length).toBeGreaterThan(0);
    const mapping: Record<string, string> = {};
    for (const g of s.groups) mapping[g.id] = g.suggestion ?? 'ignore';
    const r = buildEntries(s, OPTS, { mapping, rows: {} });
    expect(r.ready).toBe(true);
    const by = (n: number) => r.entries.find((e) => e.seatNo === n)?.subjectIds;
    expect(by(1)).toEqual(['english', 'math-a', 'math-b', 'science', 'social']);
    expect(by(2)).toHaveLength(6);
    expect(by(3)).not.toContain('chinese');
    expect(by(4)).toEqual(['english', 'math-a', 'math-b', 'science']);
  });
  it('科目欄式標示（國／英欄打 ✓ 或 ×）', () => {
    const rows = [['班級', '座號', '姓名', '國', '英'], ['1', '1', '甲', '✓', '×'], ['1', '2', '乙', '○', '○']];
    const s = scanExamSheet(rows, OPTS);
    expect(Object.values(s.subjectColumns)).toEqual(['國', '英']);
    const mapping = { 國: 'chinese', 英: 'english' };
    const r = buildEntries(s, OPTS, { mapping, rows: {} });
    expect(r.entries.map((e) => e.subjectIds)).toEqual([['chinese'], ['chinese', 'english']]);
  });
  it('無法判斷的列進待確認清單，不默默丟棄；說明列另列', () => {
    const rows = [
      HEAD, ['01', '1', '甲', '0', ''], ['01', '1', '乙', '0', ''], ['01', 'x', '丙', '0', ''], ['', '', '', '', ''],
      ['01', '5', '', '0', ''], ['01', '6', '丁', 'Q', ''], ['製表人：某某'],
    ];
    const s = scanExamSheet(rows, OPTS);
    expect(s.rows.map((r) => r.name)).toEqual(['甲']);
    expect(s.review.map((x) => x.kind).sort()).toEqual(['bad-group', 'bad-id', 'dup', 'no-name']);
    expect(s.skipped).toHaveLength(1);
    expect(s.blankRows).toBe(1);
    const r0 = buildEntries(s, OPTS, { mapping: {}, rows: {} });
    expect(r0.ready).toBe(false);
    expect(r0.pendingReview).toHaveLength(4);
    const dec = {
      mapping: {},
      rows: {
        3: { action: 'fix', classNo: 1, seatNo: 2, name: '乙' },
        4: { action: 'fix', classNo: 1, seatNo: 3, name: '丙' },
        6: { action: 'skip' },
        7: { action: 'fix', classNo: 1, seatNo: 6, name: '丁', groupCode: '0' },
      },
    } as const;
    const r1 = buildEntries(s, OPTS, dec);
    expect(r1.ready).toBe(true);
    expect(r1.skippedByUser).toBe(1);
    expect(r1.entries.map((e) => e.name)).toEqual(['甲', '乙', '丙', '丁']);
    // 修正後仍重複則仍待處理
    const r2 = buildEntries(s, OPTS, { mapping: {}, rows: { ...dec.rows, 4: { action: 'fix', classNo: 1, seatNo: 1, name: '丙' } } });
    expect(r2.pendingReview.map((x) => x.row)).toEqual([4]);
  });
  it('缺班級欄時擋下', () => {
    const s = scanExamSheet([['座號', '姓名'], ['1', '甲']], OPTS);
    expect(s.problems[0]).toContain('班級');
    expect(buildEntries(s, OPTS, { mapping: {}, rows: {} }).ready).toBe(false);
  });
  it('座號寫法', () => {
    expect(smartSeat('５號')).toBe(5);
    expect(smartSeat('05')).toBe(5);
    expect(smartSeat('abc')).toBeNull();
    expect(smartSeat('0')).toBeNull();
  });
});

describe('匯入預覽差異', () => {
  it('新增、移除、變更、不變', () => {
    const a = { classNo: 1, seatNo: 1, name: '甲', subjectIds: ['chinese'] };
    const b = { classNo: 1, seatNo: 2, name: '乙', subjectIds: ['chinese'] };
    const c = { classNo: 1, seatNo: 3, name: '丙', subjectIds: ['english'] };
    const d = diffEntries([a, b, c], [a, { ...b, subjectIds: ['english', 'chinese'] }, { ...c, name: '丙丙' }, { classNo: 2, seatNo: 1, name: '丁', subjectIds: [] }]);
    expect(d.unchanged).toBe(1);
    expect(d.changed.map((x) => [x.code, x.fields])).toEqual([['1-2', ['subjects']], ['1-3', ['name']]]);
    expect(d.added).toHaveLength(1);
    expect(diffEntries([a], []).removed).toHaveLength(1);
    expect(diffEntries(undefined, [a]).added).toHaveLength(1);
  });
});
