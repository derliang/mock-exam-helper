/** 統計與下載防護（#62 #63 #65 #61 #66 #70）：假資料，無真實姓名 */
import { describe, expect, it } from 'vitest';
import type { ExamConfig, ExamEntry, Override, SeatingResult } from '../data';
import { allocateDetaches, applyMarks, specialOf } from '../core';
import { preflight, defaultOptions } from '../export/plan';
import type { Doc } from './store';
import { prepareExport, relevantIssues } from './exportInput';
import { classCapacity } from './capacity';
import {
  chartModel, detachPreview, groupTable, isStale, markRows, markSuggestions, nameMapOf, reseat, setMarkChoice, setOverride,
} from './seating';

const NOW = '2026-11-08T10:00:00.000Z';
const SUBJ = [{ id: 'soc', name: '社會' }, { id: 'sci', name: '自然' }, { id: 'chi', name: '國文' }];

function exam(patch: Partial<ExamConfig> = {}): ExamConfig {
  return {
    id: 'e1', name: '測試考', kind: 'gsat', division: 'senior', semester: 'first', round: 3, participation: 'all',
    subjects: SUBJ, markRules: [], classroomIds: ['S', 'P'], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt: NOW, ...patch,
  };
}

/** 一班 10 人：absentN 人全科缺考；其餘依 takers 決定考社會與否 */
function entriesOf(absentN: number, socTakers: number): ExamEntry[] {
  const list: ExamEntry[] = [];
  let no = 1;
  for (let i = 0; i < absentN; i++) list.push({ classNo: 1, seatNo: no++, name: `缺${i}`, groupCode: '0', subjectIds: [] });
  for (let i = 0; i < 10 - absentN; i++) list.push({ classNo: 1, seatNo: no++, name: `考${i}`, groupCode: '0', subjectIds: i < socTakers ? ['soc', 'chi'] : ['chi'] });
  return list;
}

function docOf(entries: ExamEntry[], e: ExamConfig = exam(), reserveSeats = 4): Doc {
  return {
    settings: {
      schoolName: '範例高中', headerText: '模擬考', defaultLabelPaper: 'B4',
      classes: [{ no: 1, name: '溫', division: 'senior', track: 'science', colorIndex: 1 }],
      classrooms: [
        { id: 'S', name: '溫', kind: 'class', rows: 4, depth: 3, seatCount: 12, track: 'science' },
        { id: 'P', name: '預備一', kind: 'reserve', rows: 1, depth: reserveSeats, seatCount: reserveSeats },
      ],
    },
    rosters: { senior: entries.map((x) => ({ classNo: x.classNo, seatNo: x.seatNo, name: x.name })), junior: [] },
    exams: [e],
    examFiles: { e1: { entries } },
  };
}

describe('#62 全科缺考者不計入標示建議、抽離預覽與容量', () => {
  for (const absentN of [0, 1, 3]) {
    it(`全科缺考 ${absentN} 人：④統計只算要排座的人`, () => {
      const d = docOf(entriesOf(absentN, 6));
      const s = markSuggestions(d, exam()).find((x) => x.subjectId === 'soc')!;
      expect(s.total).toBe(10 - absentN);
      expect(s.taking).toBe(6);
    });
  }

  it('跨 40% 門檻：含缺考者 6:4 要人決定；排除 3 人缺考後 6:1 自動標少數', () => {
    const all = docOf(entriesOf(3, 6), exam({ seatFullyAbsent: true }));
    expect(markRows(all, exam({ seatFullyAbsent: true })).find((r) => r.subjectId === 'soc')!.state).toBe('undecided');
    const d = docOf(entriesOf(3, 6));
    const row = markRows(d, exam()).find((r) => r.subjectId === 'soc')!;
    expect(row.notTaking).toBe(1);
    expect(row.state).toBe('auto');
  });

  it('抽離預覽不替不排座的人要預備教室：預備教室只 1 座位也不報不足', () => {
    const e = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const d = docOf(entriesOf(3, 6), e, 1);
    expect(detachPreview(d, e).ok).toBe(true);
    const e2 = { ...e, seatFullyAbsent: true };
    expect(detachPreview(docOf(entriesOf(3, 6), e2, 1), e2).ok).toBe(false); // 仍排座則 4 人要自習，1 座位不夠
  });

  it('一般教室容量與③一致', () => {
    const c = classCapacity(docOf(entriesOf(3, 6)), exam());
    expect(c.lines.find((l) => l.label === '理組')!.students).toBe(7);
  });
});

describe('#63 ⑥最後輸出邊界重跑⑤驗證', () => {
  const base = () => {
    const e = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const d = docOf(entriesOf(0, 6), e);
    const r = reseat(d, e, NOW);
    if (!r.ok) throw new Error(r.error);
    return { e, d: r.doc };
  };
  const tamper = (d: Doc, fn: (r: SeatingResult) => SeatingResult): Doc => ({ ...d, examFiles: { e1: { ...d.examFiles!.e1!, result: fn(d.examFiles!.e1!.result!) } } });

  it('正常結果可下載', () => {
    const { e, d } = base();
    expect(prepareExport(d, e).ok).toBe(true);
  });
  it('結果存在、版本不過期，但有人沒座位：擋下並說明', () => {
    const { e, d } = base();
    const bad = tamper(d, (r) => ({ ...r, assignments: r.assignments.slice(1) }));
    expect(isStale(bad, e)).toBe(false);
    const p = prepareExport(bad, e);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.errors[0]).toMatch(/^排座驗證未通過/);
  });
  it('座位重複：擋下', () => {
    const { e, d } = base();
    const bad = tamper(d, (r) => ({ ...r, assignments: r.assignments.map((a, i) => (i === 1 ? { ...r.assignments[0]!, code: a.code } : a)) }));
    expect(prepareExport(bad, e).ok).toBe(false);
  });
});

describe('#65 至少選一項：畫面與按下去用同一條件', () => {
  const input = (() => {
    const e = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
    const r = reseat(docOf(entriesOf(0, 6), e), e, NOW);
    if (!r.ok) throw new Error(r.error);
    const p = prepareExport(r.doc, e);
    if (!p.ok) throw new Error(p.errors.join());
    return p.input;
  })();
  const none = { ...defaultOptions('B4'), seat: false, label: false, study: false, reserve: false };
  const raw = preflight(input, none, {}, () => true);

  it('核心全不選：原始檢查有「還沒勾選」擋下', () => {
    expect(raw.some((i) => i.level === 'block' && i.text.startsWith('還沒勾選'))).toBe(true);
  });
  it('只勾選用文件：不再擋（單獨下載的既有設計）', () => {
    expect(relevantIssues(raw, true, 1).some((i) => i.level === 'block')).toBe(false);
  });
  it('全部不勾：仍擋下，且有原因文字', () => {
    const hit = relevantIssues(raw, true, 0).filter((i) => i.level === 'block');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]!.text.length).toBeGreaterThan(5);
  });
  it('有勾核心項目時不受影響', () => {
    expect(relevantIssues(preflight(input, { ...none, seat: true }, {}, () => true), false, 0).some((i) => i.level === 'block')).toBe(false);
  });
});

describe('#61 只改共用姓名，版本碼要變', () => {
  const e = exam({ markRules: setMarkChoice(exam(), 'science', 'soc', 'mark-absent') });
  const seated = () => {
    const r = reseat(docOf(entriesOf(0, 6), e), e, NOW);
    if (!r.ok) throw new Error(r.error);
    return r.doc;
  };
  it('共用名單與考試名單一致時，不強迫重排', () => {
    const d = seated();
    expect(isStale(d, e)).toBe(false);
  });
  it('改共用名單姓名（考試名單不動）→ 版本碼變、顯示過期', () => {
    const d = seated();
    const renamed: Doc = { ...d, rosters: { ...d.rosters, senior: d.rosters.senior.map((s, i) => (i === 0 ? { ...s, name: '改名後' } : s)) } };
    expect(isStale(renamed, e)).toBe(true);
    const again = reseat(renamed, e, NOW);
    if (!again.ok) throw new Error(again.error);
    expect(again.doc.examFiles!.e1!.result!.dataVersion).not.toBe(d.examFiles!.e1!.result!.dataVersion);
    // 改回原名：版本碼回到原值
    const back = reseat({ ...again.doc, rosters: d.rosters }, e, NOW);
    if (!back.ok) throw new Error(back.error);
    expect(back.doc.examFiles!.e1!.result!.dataVersion).toBe(d.examFiles!.e1!.result!.dataVersion);
  });
  it('⑤座位表的姓名來源＝共用名單（與下載一致）', () => {
    const d = seated();
    const renamed: Doc = { ...d, rosters: { ...d.rosters, senior: d.rosters.senior.map((s, i) => (i === 0 ? { ...s, name: '改名後' } : s)) } };
    const code = '0101';
    expect(nameMapOf(renamed, e).get(code)).toBe('改名後');
    const model = chartModel(renamed, e, renamed.examFiles!.e1!.result!, renamed.settings.classrooms[0]!);
    const cell = model.lines.flat().find((c) => c.kind === 'student' && c.code === code);
    expect(cell && cell.kind === 'student' && cell.name).toBe('改名後');
  });
});

describe('#66 單人特例：同一人 X 與＋並存，各科各自決定', () => {
  const entries: ExamEntry[] = [
    { classNo: 1, seatNo: 1, name: '甲', groupCode: '0', subjectIds: ['sci', 'chi'] }, // 不考社會（X）、考自然、
    { classNo: 1, seatNo: 2, name: '乙', groupCode: '0', subjectIds: ['soc', 'sci', 'chi'] },
    { classNo: 1, seatNo: 3, name: '丙', groupCode: '0', subjectIds: ['soc', 'sci', 'chi'] },
  ];
  const classes = [{ no: 1, name: '溫', division: 'senior' as const, track: 'science' as const, colorIndex: 1 }];
  const rules = [{ track: 'science' as const, subjectId: 'soc', mode: 'mark-absent' as const }, { track: 'science' as const, subjectId: 'sci', mode: 'mark-extra' as const }];
  // 同一個人（0101）：社會 X（原本不考）、自然 ＋（加考）
  const marks = applyMarks([{ ...entries[0]!, subjectIds: ['chi', 'sci'] }, { ...entries[1]!, subjectIds: ['soc', 'chi'] }, { ...entries[2]!, subjectIds: ['soc', 'chi'] }], classes, SUBJ, rules);
  const reserve = [{ id: 'P', name: '預備一', kind: 'reserve' as const, rows: 1, depth: 4, seatCount: 4 }];
  const run = (overrides: Override[]) => allocateDetaches({ subjects: SUBJ, marks, overrides, reserveRooms: reserve, classes });
  const mixedMarks = marks.filter((m) => m.code === '0101');

  it('先確認這個人真的同時有 X 與＋', () => {
    expect(new Set(mixedMarks.map((m) => m.mode))).toEqual(new Set(['absent', 'extra']));
  });
  it('逐科設定：社會自習、自然考試，各自生效', () => {
    const r = run([{ kind: 'single', code: '0101', location: '教務處', purpose: 'exam', purposes: { soc: 'study', sci: 'exam' } }]);
    if (!r.ok) throw new Error(r.errors.join());
    const sp = r.special.filter((x) => x.code === '0101');
    expect(sp.find((x) => x.subjectId === 'soc')!.purpose).toBe('study');
    expect(sp.find((x) => x.subjectId === 'sci')!.purpose).toBe('exam');
  });
  it('舊資料只有單一 purpose=exam：混合標示者 X 科不被竄改成考試', () => {
    const r = run([{ kind: 'single', code: '0101', location: '教務處', purpose: 'exam' }]);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.special.find((x) => x.subjectId === 'soc')!.purpose).toBe('study');
    expect(r.special.find((x) => x.subjectId === 'sci')!.purpose).toBe('exam');
  });
  it('單一標示方向的人，舊資料行為不變（單一 purpose 照用）', () => {
    const r = run([{ kind: 'single', code: '0102', location: '圖書館', purpose: 'study' }]);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.special.every((x) => x.purpose === 'study')).toBe(true);
  });
  it('由結果推回的特例（領卷、出缺席用）與配置一致', () => {
    const o: Override = { kind: 'single', code: '0101', location: '教務處', purpose: 'exam', purposes: { soc: 'study', sci: 'exam' } };
    const result = { examId: 'e1', generatedAt: NOW, dataVersion: 'x', assignments: [], marks, detaches: [], overrides: [o] } as SeatingResult;
    expect(specialOf(result).map((x) => `${x.subjectId}:${x.purpose}`).sort()).toEqual(['sci:exam', 'soc:study']);
  });
  it('setOverride 保留 purposes', () => {
    const e = exam();
    const d = docOf(entries, e);
    const r = setOverride(d, e, { kind: 'single', code: '0101', location: ' 教務處 ', purpose: 'exam', purposes: { soc: 'study', sci: 'exam' } });
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.examFiles!.e1!.overrides![0]!.purposes).toEqual({ soc: 'study', sci: 'exam' });
  });
});

describe('#70 組別對照表：同代碼考科不一致要標出', () => {
  const a: ExamEntry = { classNo: 1, seatNo: 1, name: '甲', groupCode: 'D', subjectIds: ['soc', 'sci', 'chi'] };
  const b: ExamEntry = { classNo: 1, seatNo: 2, name: '乙', groupCode: 'D', subjectIds: ['soc', 'chi'] };
  const c: ExamEntry = { classNo: 1, seatNo: 3, name: '丙', groupCode: 'D', subjectIds: ['soc', 'chi'] };
  it('一致時 differing=0', () => {
    expect(groupTable(docOf([a, { ...a, seatNo: 2 }]), exam())[0]).toMatchObject({ code: 'D', count: 2, differing: 0 });
  });
  it('不一致：標 N 人考科不同，標準為人數最多組合', () => {
    expect(groupTable(docOf([a, b, c]), exam())[0]).toMatchObject({ count: 3, differing: 1, subjectIds: ['soc', 'chi'] });
  });
  it('人數相同時，改變資料列順序結果相同', () => {
    const x = groupTable(docOf([a, b]), exam())[0]!;
    const y = groupTable(docOf([b, a]), exam())[0]!;
    expect(x).toEqual(y);
    expect(x.differing).toBe(1);
  });
});
