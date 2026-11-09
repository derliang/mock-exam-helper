import { describe, expect, it } from 'vitest';
import { buildEntries, scanExamSheet } from './smartScan';
import { AST_SUBJECTS } from '../ui/subjects';
import { scanOptionsFor } from '../ui/pages/ImportWizard';
import type { ExamConfig } from '../data';

const exam = { kind: 'ast', subjects: AST_SUBJECTS } as ExamConfig;
const rows = [
  ['班級', '座號', '姓名', '組別'],
  ['301', '1', '甲生', '數甲.物理.化學'],
  ['301', '2', '乙生', '化學、生物'],
  ['302', '1', '丙生', '歷史 地理 公民'],
  ['302', '2', '丁生', '數乙'],
];

describe('分科：考科文字欄直接當選考科目', () => {
  const opts = scanOptionsFor(exam, ['301', '302']);
  const scan = scanExamSheet(rows, opts);
  it('每位考生只考自己選的科，建議對應正確', () => {
    const sug = Object.fromEntries(scan.groups.map((g) => [g.id, g.suggestion]));
    expect(sug['數甲']).toBe('math-jia');
    expect(sug['物理']).toBe('physics');
    expect(sug['公民']).toBe('civics');
    const mapping = Object.fromEntries(scan.groups.map((g) => [g.id, g.suggestion ?? 'ignore']));
    const r = buildEntries(scan, opts, { mapping, rows: {} });
    expect(r.ready).toBe(true);
    expect(r.entries.map((e) => e.subjectIds)).toEqual([
      ['math-jia', 'physics', 'chemistry'], ['chemistry', 'biology'], ['history', 'geography', 'civics'], ['math-yi'],
    ]);
  });
});

import { suggestMarks } from '../core/marks';
import type { ClassInfo, ExamEntry } from '../data';

describe('分科：選考差異大時，每科標少數那一邊', () => {
  it('理組 10 人：物理 2 人考→標「加考」；化學 9 人考→標「不考」', () => {
    const classes = [{ no: 1, track: 'science' }] as unknown as ClassInfo[];
    const entries: ExamEntry[] = Array.from({ length: 10 }, (_, i) => ({
      classNo: 1, seatNo: i + 1, name: `生${i}`,
      subjectIds: [...(i < 2 ? ['physics'] : []), ...(i < 9 ? ['chemistry'] : [])],
    }));
    const s = suggestMarks(entries, classes, AST_SUBJECTS);
    expect(s.find((x) => x.subjectId === 'physics')).toMatchObject({ taking: 2, suggested: 'mark-extra' });
    expect(s.find((x) => x.subjectId === 'chemistry')).toMatchObject({ taking: 9, suggested: 'mark-absent' });
    expect(s.find((x) => x.subjectId === 'biology')?.suggested).toBe('none');
  });
});
