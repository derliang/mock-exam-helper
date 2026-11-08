import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { applyDiffs, allResolved, compareRosters } from './compare';
import { mapColumns, parseClassNo } from './columns';
import { parseExamList, parseSubjects } from './examList';
import { parseRoster } from './roster';
import { readXlsx } from './xlsx';
import type { RosterDiff, Student } from '../data/types';

// 全部是假資料
const NAMES = ['溫', '良', '恭', '儉', '勤', '誠'];

async function makeXlsx(rows: string[][]): Promise<Uint8Array> {
  const z = new JSZip();
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheet = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map((c, ci) =>
            c === '' ? '' : /^\d+$/.test(c) ? `<c r="${col(ci)}${ri + 1}"><v>${c}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('');
  z.file('xl/workbook.xml', '<workbook><sheets><sheet name="名單" sheetId="1" r:id="rId1"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  z.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheet}</sheetData></worksheet>`);
  return z.generateAsync({ type: 'uint8array' });
}

describe('xlsx 讀取', () => {
  it('讀出儲存格文字、略過空格、保留欄位位置', async () => {
    const sheets = await readXlsx(await makeXlsx([['班級', '', '姓名'], ['01', '', '測試甲 & 乙']]));
    expect(sheets[0]?.name).toBe('名單');
    expect(sheets[0]?.rows[1]).toEqual(['01', '', '測試甲 & 乙']);
  });
  it('共用字串表', async () => {
    const z = new JSZip();
    z.file('xl/workbook.xml', '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>');
    z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>');
    z.file('xl/sharedStrings.xml', '<sst><si><t>姓名</t></si><si><r><t>測試</t></r><r><t>乙</t></r></si></sst>');
    z.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row></sheetData></worksheet>');
    const s = await readXlsx(await z.generateAsync({ type: 'uint8array' }));
    expect(s[0]?.rows[0]).toEqual(['姓名', '', '測試乙']);
  });
});

describe('欄位對應', () => {
  it('同義詞、全半形、空白', () => {
    expect(mapColumns(['校代碼', '年級', '班 級', '座號', '姓名', '組別', '學號', '特殊生需求註明', '加考'])).toEqual({
      school: 0, grade: 1, classNo: 2, seatNo: 3, name: 4, group: 5, schoolId: 6, note: 7, extra: 8,
    });
  });
  it('班級正規化', () => {
    expect(parseClassNo('01')).toBe(1);
    expect(parseClassNo('3年5班')).toBe(5);
    expect(parseClassNo('誠', NAMES)).toBe(6);
    expect(parseClassNo('')).toBeNull();
  });
});

describe('缺考科目寬鬆解析', () => {
  it.each([
    ['x數A', true, ['mathA']],
    ['X數Ａ、社', true, ['mathA', 'soc']],
    ['缺自然社會', true, ['sci', 'soc']],
    ['x數', false, ['math']],
    ['x數', true, ['mathA', 'mathB']],
    ['英聽', false, []],
  ])('%s', (text, second, want) => {
    expect(parseSubjects(text, second).sort()).toEqual([...want].sort());
  });
});

describe('考試名單', () => {
  const head = ['校代碼', '年級', '班級', '座號', '姓名', '組別', '學號', '特殊生需求註明', '加考'];
  it('第 3 次：組別、缺考、加考、說明區略過、重複列警告', () => {
    const rows = [
      ['說明：組別對照'],
      head,
      ['001', '3', '01', '1', '測試甲', '0-全科', 'T001', 'x數A', ''],
      ['001', '3', '1', '2', '測試乙', '8-社會B組', '', '', '自然'],
      ['001', '3', '04', '3', '測試丙', 'F-五科', '', '', ''],
      ['各班人數統計', '', '', '', '', '', '', '', ''],
      ['001', '3', '01', '1', '測試甲', '0', '', '', ''],
      ['001', '3', '02', '5', '測試丁', 'Z-未知', '', '', ''],
    ];
    const r = parseExamList(rows, { round: 3 });
    expect(r.entries).toHaveLength(4);
    expect(r.entries[0]?.subjectIds).toEqual(['chi', 'eng', 'mathB', 'sci', 'soc']);
    expect(r.entries[0]?.note).toBe('x數A');
    expect(r.entries[1]?.subjectIds).toEqual(['chi', 'eng', 'mathB', 'soc', 'sci']);
    expect(r.entries[2]?.subjectIds).toEqual(['chi', 'eng', 'mathA', 'sci', 'soc']);
    expect(r.entries[3]?.subjectIds).toEqual([]);
    expect(r.issues.map((i) => i.message).join()).toContain('重複');
    expect(r.issues.map((i) => i.message).join()).toContain('不在對照表');
  });
  it('第 1 次：數學不分', () => {
    const r = parseExamList([head, ['001', '3', '01', '1', '測試甲', 'D-自然組', '', '', '']], { round: 1 });
    expect(r.entries[0]?.subjectIds).toEqual(['chi', 'eng', 'math', 'sci']);
  });
  it('找不到表頭時回報問題', () => {
    const r = parseExamList([['a', 'b']]);
    expect(r.entries).toEqual([]);
    expect(r.issues[0]?.message).toContain('表頭');
  });
});

describe('學生名單', () => {
  it('直式表', () => {
    const r = parseRoster([['班級', '學號', '座號', '姓名'], ['01', 'T1', '1', '測試甲'], ['02', '', '3', '測試乙']]);
    expect(r.layout).toBe('tall');
    expect(r.students).toEqual([
      { classNo: 1, seatNo: 1, name: '測試甲', schoolId: 'T1' },
      { classNo: 2, seatNo: 3, name: '測試乙' },
    ]);
  });
  it('橫向寬表：兩班並排、班名在表頭上方、忽略類組與帳號', () => {
    const rows = [
      ['溫', '', '', '', '', '良', '', '', '', ''],
      ['學號', '座號', '姓名', '類組', '帳號', '學號', '座號', '姓名', '類組', '帳號'],
      ['A1', '1', '測試甲', '工程群', 'x', 'B1', '1', '測試丙', '', 'y'],
      ['A2', '2', '測試乙', '', 'x', '', '', '', '', ''],
    ];
    const r = parseRoster(rows, { classNames: NAMES });
    expect(r.layout).toBe('wide');
    expect(r.students).toEqual([
      { classNo: 1, seatNo: 1, name: '測試甲', schoolId: 'A1' },
      { classNo: 1, seatNo: 2, name: '測試乙', schoolId: 'A2' },
      { classNo: 2, seatNo: 1, name: '測試丙', schoolId: 'B1' },
    ]);
  });
});

describe('名單比對', () => {
  const s = (classNo: number, seatNo: number, name: string): Student => ({ classNo, seatNo, name });
  const e = (classNo: number, seatNo: number, name: string) => ({ classNo, seatNo, name, subjectIds: ['chi'] });
  const roster = [s(1, 1, '甲'), s(1, 2, '乙'), s(1, 3, '丙'), s(2, 1, '丁')];
  const entries = [e(1, 1, '甲'), e(1, 2, '乙改'), e(1, 9, '丙'), e(3, 1, '戊')];

  it('全員參加：四種差異都列出', () => {
    const { diffs } = compareRosters(roster, entries, 'all');
    expect(diffs.map((d) => [d.kind, d.code])).toEqual([
      ['mismatch', '0102'],
      ['mismatch', '0109'], // 同名丙換了座號
      ['only-in-roster', '0201'],
      ['only-in-exam', '0301'],
    ]);
  });
  it('部分參加：學生名單多出來的不算差異，只計未參加人數', () => {
    const r = compareRosters(roster, entries, 'partial');
    expect(r.diffs.some((d) => d.kind === 'only-in-roster')).toBe(false);
    expect(r.notParticipating).toBe(1);
  });
  it('未處理完不能繼續；處理後的名單正確，輸入不被改動', () => {
    const { diffs } = compareRosters(roster, entries, 'all');
    expect(allResolved(diffs)).toBe(false);
    expect(() => applyDiffs(roster, entries, diffs)).toThrow();
    const choose = (d: RosterDiff): RosterDiff => {
      if (d.code === '0102') return { ...d, choice: 'use-exam' };
      if (d.code === '0109') return { ...d, choice: 'use-roster' };
      if (d.code === '0201') return { ...d, choice: 'use-exam' };
      return { ...d, choice: 'manual', edited: s(3, 2, '戊') };
    };
    const done = diffs.map(choose);
    expect(allResolved(done)).toBe(true);
    const r = applyDiffs(roster, entries, done);
    expect(r.students.map((x) => `${x.classNo}-${x.seatNo}-${x.name}`)).toEqual(['1-1-甲', '1-2-乙改', '1-3-丙', '3-2-戊']);
    expect(r.entries.map((x) => `${x.classNo}-${x.seatNo}-${x.name}`)).toEqual(['1-1-甲', '1-2-乙改', '1-3-丙', '3-2-戊']);
    expect(roster).toHaveLength(4);
    expect(entries[2]?.seatNo).toBe(9);
  });
  it('manual 缺 edited 不算處理完', () => {
    expect(allResolved([{ kind: 'only-in-exam', code: '0101', choice: 'manual' }])).toBe(false);
  });
});
