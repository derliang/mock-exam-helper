import { describe, expect, it } from 'vitest';
import { readXlsx, writeXlsx, parseRoster } from '../import';
import { applyImport, exportRows, planImport, templateRows } from './rosterIO';
import { emptyDoc, withDefaults } from './repository';

describe('名單範本與匯出', () => {
  it('寫出再讀回完全一致（含前導零與特殊字元）', async () => {
    const rows = [['班級', '座號', '姓名'], ['01', '3', '測試 & <甲>']];
    const back = (await readXlsx(await writeXlsx(rows)))[0]?.rows;
    expect(back).toEqual(rows);
  });
  it('匯出的檔案能被 parseRoster 讀回同一份名單', async () => {
    const students = [{ classNo: 2, seatNo: 5, name: '測試乙', schoolId: 'T9' }, { classNo: 1, seatNo: 1, name: '測試甲' }];
    const rows = (await readXlsx(await writeXlsx(exportRows(students))))[0]!.rows;
    expect(parseRoster(rows).students).toEqual([students[1], students[0]]);
  });
  it('範本只有表頭，且能被辨識為直式表頭', () => {
    expect(templateRows()).toHaveLength(1);
    expect(parseRoster([...templateRows(), ['01', '1', '測試甲', '']]).students).toHaveLength(1);
  });
});

describe('匯入規劃', () => {
  const doc = withDefaults(emptyDoc());
  it('回報不存在的班級；套用後取代該部別整份名單，另一部別不動', () => {
    doc.rosters.junior = [{ classNo: 1, seatNo: 1, name: '舊' }];
    const plan = planImport(doc, 'senior', [{ classNo: 9, seatNo: 1, name: '測試甲' }, { classNo: 1, seatNo: 2, name: '測試乙' }]);
    expect(plan.unknownClasses).toEqual([9]);
    expect(plan.after).toBe(2);
    const next = applyImport(doc, 'senior', plan, 'add');
    expect(next.rosters.senior).toHaveLength(2);
    expect(next.rosters.junior).toEqual(doc.rosters.junior);
    expect(doc.rosters.senior).toHaveLength(0);
  });
});

describe('組別與特殊生需求（只作紀錄）', () => {
  it('匯入取代名單時，同班同座號同姓名的組別與特殊生需求沿用', () => {
    const doc = withDefaults(emptyDoc());
    const withOld = { ...doc, rosters: { ...doc.rosters, senior: [{ classNo: 1, seatNo: 1, name: '測試甲', groupCode: 'D', special: 'x數A' }, { classNo: 1, seatNo: 2, name: '測試乙', special: '舊' }] } };
    const plan = planImport(withOld, 'senior', [{ classNo: 1, seatNo: 1, name: '測試甲' }, { classNo: 1, seatNo: 2, name: '改名了' }]);
    const next = applyImport(withOld, 'senior', plan).rosters.senior;
    expect(next[0]).toMatchObject({ groupCode: 'D', special: 'x數A' });
    expect(next[1]).toEqual({ classNo: 1, seatNo: 2, name: '改名了' }); // 姓名不同＝不同人，不沿用
  });
});
