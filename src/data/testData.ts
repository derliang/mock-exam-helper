/** 存檔測試與量測共用的假資料／計數檔案系統（#72） */
import { createMemoryFS, type DirFS } from './dirfs';
import type { Doc } from '../ui/store';
import type { ExamConfig, ExamEntry, Student } from './types';

export function countingFS() {
  const base = createMemoryFS();
  const c = { reads: 0, writes: 0, lists: 0, removes: 0, bytes: 0 };
  const fs: DirFS = {
    readText: async (p) => { c.reads++; return base.readText(p); },
    writeText: async (p, t) => { c.writes++; c.bytes += t.length; return base.writeText(p, t); },
    listDirs: async (d) => { c.lists++; return base.listDirs(d); },
    remove: async (p) => { c.removes++; return base.remove(p); },
  };
  const reset = () => { c.reads = c.writes = c.lists = c.removes = c.bytes = 0; };
  return { fs, base, c, reset };
}

export function bigDoc(exams: number, people: number): Doc {
  const students: Student[] = Array.from({ length: people }, (_, i) => ({ classNo: 101 + (i % 20), seatNo: 1 + Math.floor(i / 20), name: `學生${i}` }));
  const entries: ExamEntry[] = students.map((s) => ({ ...s, subjectIds: ['chi', 'eng', 'math'] }));
  const list: ExamConfig[] = Array.from({ length: exams }, (_, i) => ({
    id: `exam-${i}`, name: `範例考${i}`, kind: 'monthly', division: 'senior', semester: '1', participation: 'all',
    subjects: [], markRules: [], classroomIds: [], labelLayout: {}, createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  } as unknown as ExamConfig));
  const examFiles: NonNullable<Doc['examFiles']> = {};
  for (const e of list) examFiles[e.id] = { entries, diffs: [], overrides: [] };
  return {
    settings: { schoolName: '範例學校', headerText: '', defaultLabelPaper: 'B4', classes: [], classrooms: [] },
    rosters: { senior: students, junior: [] },
    exams: list,
    examFiles,
  };
}

