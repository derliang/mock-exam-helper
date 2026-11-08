/**
 * 薄資料介面：畫面只透過它讀寫。施工A 的存檔實作完成後換接，目前用記憶體假實作（假資料，無真實學生）。
 */
import type { ClassInfo, Classroom, ExamConfig, Settings, Student } from '../data';

export interface Repository {
  /** 是否已授權資料夾（初始化頁用） */
  hasFolder(): boolean;
  chooseFolder(): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  listExams(): Promise<ExamConfig[]>;
  loadRoster(division: 'junior' | 'senior'): Promise<Student[]>;
  saveRoster(division: 'junior' | 'senior', students: Student[]): Promise<void>;
}

const classes: ClassInfo[] = ['溫', '良', '恭', '儉', '勤', '誠'].map((name, i) => ({
  no: i + 1, name, division: 'senior' as const, track: i < 3 ? ('science' as const) : ('liberal' as const), colorIndex: i + 1,
}));
const rooms: Classroom[] = [
  { id: 'r1', name: '第一試場', kind: 'class', rows: 6, depth: 6, seatCount: 36, track: 'science' },
  { id: 'r2', name: '預備教室', kind: 'reserve', rows: 3, depth: 4, seatCount: 12 },
];

export function createMemoryRepository(): Repository {
  let folder = false;
  let settings: Settings = { schoolName: '範例高中', headerText: '模擬考', defaultLabelPaper: 'B4', classes, classrooms: rooms };
  const rosters: Record<string, Student[]> = {
    senior: [{ classNo: 1, seatNo: 1, name: '王小明' }, { classNo: 1, seatNo: 2, name: '李小華' }],
    junior: [],
  };
  const exams: ExamConfig[] = [];
  return {
    hasFolder: () => folder,
    chooseFolder: async () => { folder = true; },
    loadSettings: async () => structuredClone(settings),
    saveSettings: async (s) => { settings = structuredClone(s); },
    listExams: async () => structuredClone(exams),
    loadRoster: async (d) => structuredClone(rosters[d] ?? []),
    saveRoster: async (d, s) => { rosters[d] = structuredClone(s); },
  };
}
