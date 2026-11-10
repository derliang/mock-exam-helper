import { describe, expect, it } from 'vitest';
import { createMemoryFS } from './dirfs';
import { loadDoc, saveDoc } from './folder';
import { roomDivision, withRoomDivisions } from './helpers';
import { seatingVersion } from '../core/run';
import type { Classroom, ExamConfig, Settings } from './types';
import type { Doc } from '../ui/store';

const room = (o: Partial<Classroom> & { id: string }): Classroom => ({ name: o.id, kind: 'class', rows: 5, depth: 6, seatCount: 30, ...o });
const exam = (id: string, division: 'senior' | 'junior', classroomIds: string[]): ExamConfig => ({
  id, name: id, kind: division === 'junior' ? 'bcct' : 'gsat', division, semester: 'first', participation: 'all',
  subjects: [{ id: 'chi', name: '國文' }], markRules: [], classroomIds, labelLayout: { paper: 'B4', cols: 7, rows: 7 }, createdAt: '2026-01-01',
});
const classes: Settings['classes'] = [
  { no: 1, name: '溫', division: 'senior', track: 'science', colorIndex: 1 },
  { no: 1, name: '一年級示範班', division: 'junior', colorIndex: 1 },
];
const settings = (classrooms: Classroom[]): Settings => ({ schoolName: '', headerText: '', defaultLabelPaper: 'B4', classes, classrooms });

describe('教室部別推斷（校-33，舊資料沒有 division）', () => {
  const ctx = { classes, exams: [exam('j', 'junior', ['jr'])] };
  it('有明確 division 就用它，不被其他資訊覆蓋', () => {
    expect(roomDivision(room({ id: 'x', division: 'junior', track: 'science' }), ctx)).toBe('junior');
  });
  it('預備教室、有文理組的教室＝高中部', () => {
    expect(roomDivision(room({ id: 'x', kind: 'reserve' }), ctx)).toBe('senior');
    expect(roomDivision(room({ id: 'x', track: 'liberal' }), ctx)).toBe('senior');
  });
  it('名稱只對得上某部別的班級＝該部別', () => {
    expect(roomDivision(room({ id: 'x', name: '一年級示範班' }), ctx)).toBe('junior');
    expect(roomDivision(room({ id: 'x', name: '溫' }), ctx)).toBe('senior');
  });
  it('只被會考選用、沒被高中部考試選用＝國中部；兩邊都選用或沒人用＝高中部（預設）', () => {
    expect(roomDivision(room({ id: 'jr' }), ctx)).toBe('junior');
    expect(roomDivision(room({ id: 'both' }), { classes, exams: [exam('j', 'junior', ['both']), exam('s', 'senior', ['both'])] })).toBe('senior');
    expect(roomDivision(room({ id: 'nobody' }), ctx)).toBe('senior');
  });
  it('兩部別都有同名班級（預設班級溫良恭儉勤誠）時不靠名稱，回到考試選用判斷', () => {
    const both: Settings['classes'] = [
      { no: 2, name: '良', division: 'junior', colorIndex: 2 },
      { no: 2, name: '良', division: 'senior', track: 'science', colorIndex: 2 },
    ];
    expect(roomDivision(room({ id: 'x', name: '良' }), { classes: both, exams: [] })).toBe('senior');
    expect(roomDivision(room({ id: 'x', name: '良' }), { classes: both, exams: [exam('j', 'junior', ['x'])] })).toBe('junior');
  });
});

describe('讀檔遷移 withRoomDivisions（不破壞資料）', () => {
  const old = [room({ id: 'a', track: 'science', disabled: ['1-1'], seatCount: 29 }), room({ id: 'jr' }), room({ id: 'p', kind: 'reserve' })];
  it('只補 division，其他欄位逐一不變；已有的不動；重複執行結果相同', () => {
    const out = withRoomDivisions(settings(old), [exam('j', 'junior', ['jr'])]);
    expect(out.classrooms.map((r) => [r.id, r.division])).toEqual([['a', 'senior'], ['jr', 'junior'], ['p', 'senior']]);
    for (const [i, r] of out.classrooms.entries()) {
      const { division: _d, ...rest } = r;
      void _d;
      expect(rest).toEqual(old[i]);
    }
    expect(withRoomDivisions(out, [])).toBe(out); // 都有了：原物件，不再改
    const kept = withRoomDivisions({ ...out, classrooms: [{ ...out.classrooms[1]!, division: 'senior' }] }, [exam('j', 'junior', ['jr'])]);
    expect(kept.classrooms[0]!.division).toBe('senior'); // 使用者／先前已標的不被推斷覆蓋
    expect(old.every((r) => r.division === undefined)).toBe(true); // 沒有改到輸入
  });
  it('loadDoc 讀沒有 division 的舊存檔：補上；存回再讀不變', async () => {
    const fs = createMemoryFS();
    const doc: Doc = { settings: settings(old), rosters: { senior: [], junior: [] }, exams: [exam('j', 'junior', ['jr'])] };
    await saveDoc(fs, doc);
    const a = (await loadDoc(fs)).data;
    expect(a.settings.classrooms.map((r) => r.division)).toEqual(['senior', 'junior', 'senior']);
    expect(a.settings.classrooms[0]).toMatchObject({ track: 'science', disabled: ['1-1'], seatCount: 29 });
    await saveDoc(fs, a);
    expect((await loadDoc(fs)).data.settings.classrooms).toEqual(a.settings.classrooms);
  });
  it('補上部別不改變排座版本碼（否則讀檔後所有排座結果都會被誤報「過期」）', () => {
    const base = { examId: 'E', division: 'senior' as const, classes: [], entries: [], subjects: [], markRules: [], overrides: [], now: 'x' };
    const a = seatingVersion({ ...base, classrooms: old });
    const b = seatingVersion({ ...base, classrooms: withRoomDivisions(settings(old), []).classrooms });
    expect(b).toBe(a);
  });
});
