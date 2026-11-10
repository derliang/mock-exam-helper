/** 測試用假資料（公開 repo：全部虛構，姓名為「甲生01」這類代號）。 */
import { studentCode, type Classroom, type ExamConfig, type ExamEntry, type SeatingResult, type Settings, type Student } from '../data';
import type { ExportInput } from './model';

export function makeFixture(opts: { labelCols?: number; labelRows?: number; paper?: 'B4' | 'A3' } = {}): ExportInput {
  const classes = [
    { no: 1, name: '溫', division: 'senior' as const, track: 'science' as const, colorIndex: 1 },
    { no: 2, name: '良', division: 'senior' as const, track: 'liberal' as const, colorIndex: 2 },
    { no: 3, name: '恭', division: 'senior' as const, track: 'science' as const, colorIndex: 3 },
  ];
  const classrooms: Classroom[] = [
    { id: 'r1', name: '甲教室', kind: 'class', rows: 4, depth: 5, seatCount: 18, division: 'senior' },
    { id: 'r2', name: '乙教室', kind: 'class', rows: 4, depth: 5, seatCount: 12, division: 'senior' },
    { id: 'rv', name: '預備教室', kind: 'reserve', rows: 2, depth: 3, seatCount: 6, division: 'senior' },
  ];
  const settings: Settings = {
    schoolName: '測試學校',
    headerText: '模擬考',
    defaultLabelPaper: 'B4',
    classes,
    classrooms,
  };
  const students: Student[] = [];
  for (const c of classes) for (let n = 1; n <= 10; n++) students.push({ classNo: c.no, seatNo: n, name: `甲生${c.no}${String(n).padStart(2, '0')}` });
  const exam: ExamConfig = {
    id: 'e1',
    name: '測試模擬考',
    kind: 'gsat',
    division: 'senior',
    semester: 'first',
    round: 1,
    participation: 'all',
    subjects: [
      { id: 'zh', name: '國文' },
      { id: 'en', name: '英文' },
      { id: 'ma', name: '數學' },
    ],
    markRules: [],
    classroomIds: ['r1', 'r2', 'rv'],
    labelLayout: { paper: opts.paper ?? 'B4', cols: opts.labelCols ?? 6, rows: opts.labelRows ?? 8 },
    createdAt: '2026-11-08T00:00:00Z',
  };
  const entries: ExamEntry[] = students.map((s) => ({ classNo: s.classNo, seatNo: s.seatNo, name: s.name, subjectIds: ['zh', 'en', 'ma'] }));
  // 簡單排座：前 18 人在甲教室，其餘 12 人在乙教室，皆依座位順序
  const assignments: SeatingResult['assignments'] = [];
  const order = students.map((s) => studentCode(s.classNo, s.seatNo));
  const place = (roomId: string, codes: string[], depth: number) =>
    codes.forEach((code, i) => assignments.push({ classroomId: roomId, row: Math.floor(i / depth) + 1, depth: (i % depth) + 1, code }));
  place('r1', order.slice(0, 18), 5);
  place('r2', order.slice(18), 5);
  const result: SeatingResult = {
    examId: 'e1',
    generatedAt: '2026-11-08T08:30:00Z',
    dataVersion: 'A1B2C3D4',
    assignments,
    marks: [
      { code: '0102', subjectId: 'en', mode: 'absent' },
      { code: '0103', subjectId: 'ma', mode: 'extra' },
    ],
    detaches: [
      { code: '0105', subjectId: 'en', purpose: 'exam', roomId: 'rv', seat: { row: 1, depth: 1 } },
      { code: '0106', subjectId: 'en', purpose: 'exam', roomId: 'rv', seat: { row: 1, depth: 2 } },
      { code: '0201', subjectId: 'zh', purpose: 'study', roomId: 'rv' },
    ],
    overrides: [{ kind: 'single', code: '0301', location: '教務處', purpose: 'exam' }],
  };
  return { settings, exam, students, entries, result };
}
