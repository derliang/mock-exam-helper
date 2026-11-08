/**
 * 薄資料介面：畫面只透過它讀寫。施工A 的存檔實作完成後換接；目前記憶體假實作（假資料，無真實學生）。
 */
import type { ClassInfo, Classroom, ExamFiles, Student } from '../data';
import type { Doc } from './store';

export interface Repository {
  hasFolder(): boolean;
  /** 用 showDirectoryPicker 選資料夾 */
  chooseFolder(): Promise<void>;
  /** 拖拉資料夾（UI-03）：回 false 表示拖進來的不是資料夾 */
  adoptDropped(items: DataTransferItemList): Promise<boolean>;
  load(): Promise<Doc>;
  save(doc: Doc): Promise<void>;
  /** 單次模擬考底下的其他檔案（考試名單、比對結果、覆寫、排座結果） */
  loadExamFile<K extends keyof ExamFiles>(examId: string, key: K): Promise<ExamFiles[K] | null>;
  saveExamFile<K extends keyof ExamFiles>(examId: string, key: K, data: ExamFiles[K]): Promise<void>;
}

const names = ['溫', '良', '恭', '儉', '勤', '誠'];
const seniorClasses: ClassInfo[] = names.map((name, i) => ({
  no: i + 1, name, division: 'senior', track: i < 3 ? 'science' : 'liberal', colorIndex: i + 1,
}));
const juniorClasses: ClassInfo[] = ['一', '二', '三'].map((n, i) => ({
  no: i + 1, name: `${n}年級示範班`, division: 'junior', colorIndex: i + 1,
}));
const rooms: Classroom[] = [
  { id: 'r1', name: '第一試場', kind: 'class', rows: 6, depth: 6, seatCount: 36, track: 'science' },
  { id: 'r2', name: '預備教室', kind: 'reserve', rows: 3, depth: 4, seatCount: 12 },
];
const demo = (classNo: number, list: string[]): Student[] => list.map((name, i) => ({ classNo, seatNo: i + 1, name }));

export function demoDoc(): Doc {
  return {
    settings: { schoolName: '範例高中', headerText: '模擬考', defaultLabelPaper: 'B4', classes: [...seniorClasses, ...juniorClasses], classrooms: rooms },
    rosters: { senior: [...demo(1, ['王小明', '李小華', '陳小美']), ...demo(4, ['林小安', '張小宇'])], junior: demo(1, ['趙小晴', '周小豪']) },
    exams: [],
  };
}

export const emptyDoc = (): Doc => ({
  settings: { schoolName: '', headerText: '模擬考', defaultLabelPaper: 'B4', classes: [], classrooms: [] },
  rosters: { senior: [], junior: [] },
  exams: [],
});

/** 全新資料夾載入是空 Doc：由初始化流程帶入預設班級（溫良恭儉勤誠，高中 01～03 理、04～06 文，D9/D28） */
export function withDefaults(doc: Doc): Doc {
  if (doc.settings.classes.length > 0) return doc;
  const mk = (division: 'senior' | 'junior'): ClassInfo[] =>
    names.map((name, i) => ({ no: i + 1, name, division, ...(division === 'senior' ? { track: i < 3 ? ('science' as const) : ('liberal' as const) } : {}), colorIndex: i + 1 }));
  return { ...doc, settings: { ...doc.settings, classes: [...mk('senior'), ...mk('junior')] } };
}

export function createMemoryRepository(): Repository {
  let folder = false;
  let doc = demoDoc();
  const files = new Map<string, unknown>();
  return {
    loadExamFile: async <K extends keyof ExamFiles>(examId: string, key: K) => structuredClone((files.get(`${examId}/${key}`) ?? null) as ExamFiles[K] | null),
    saveExamFile: async <K extends keyof ExamFiles>(examId: string, key: K, data: ExamFiles[K]) => { files.set(`${examId}/${key}`, structuredClone(data)); },
    hasFolder: () => folder,
    chooseFolder: async () => { folder = true; },
    adoptDropped: async (items) => { const ok = items.length > 0; if (ok) folder = true; return ok; },
    load: async () => structuredClone(doc),
    save: async (d) => { doc = structuredClone(d); },
  };
}
