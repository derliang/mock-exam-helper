import { describe, expect, it } from 'vitest';
import { parseExamWorkbook, parseRosterWorkbook } from './step2';
import { defaultSubjects } from './subjects';
import type { ExamConfig } from '../data';

const exam = (round: number): ExamConfig => ({
  id: 'e', name: 't', kind: 'gsat', division: 'senior', semester: 'first', round, participation: 'all',
  subjects: defaultSubjects('gsat', round), markRules: [], classroomIds: [], labelLayout: { paper: 'B4', cols: 6, rows: 8 }, createdAt: '2026-01-01',
});
const head = ['班級', '座號', '姓名', '組別', '特殊生需求註明'];

describe('② 考試名單匯入', () => {
  it('組別代碼轉成考科表的科目 id；挑人數最多的工作表', () => {
    const sheets = [
      { name: '說明', rows: [['說明文字']] },
      { name: '名單', rows: [head, ['01', '1', '測試甲', '0-全科', 'x數A'], ['01', '2', '測試乙', '7-社會A組', '']] },
    ];
    const r = parseExamWorkbook(sheets, exam(3), []);
    expect(r.entries[0]?.subjectIds).toEqual(['chinese', 'english', 'math-b', 'science', 'social']);
    expect(r.entries[1]?.subjectIds).toEqual(['chinese', 'english', 'math-a', 'social']);
    expect(r.headers.group).toBe('組別');
  });
  it('科目不在本次考科表（使用者刪掉自然）會被略過並計數', () => {
    const e = exam(1);
    e.subjects = e.subjects.filter((x) => x.id !== 'science');
    const r = parseExamWorkbook([{ name: 's', rows: [head, ['01', '1', '測試甲', '0-全科', '']] }], e, []);
    expect(r.droppedSubjects).toBe(1);
  });
  it('會考沒有組別欄時用考科表全部科目', () => {
    const e: ExamConfig = { ...exam(1), kind: 'bcct', division: 'junior', subjects: [{ id: 'chinese', name: '國文' }, { id: 'math', name: '數學' }] };
    const r = parseExamWorkbook([{ name: 's', rows: [['班級', '座號', '姓名'], ['01', '1', '測試甲']] }], e, []);
    expect(r.entries[0]?.subjectIds).toEqual(['chinese', 'math']);
  });
  it('學生名單挑人數最多的工作表', () => {
    const r = parseRosterWorkbook([{ name: 'a', rows: [['x']] }, { name: 'b', rows: [['班級', '座號', '姓名'], ['01', '1', '測試甲']] }], []);
    expect(r.students).toHaveLength(1);
  });
});
