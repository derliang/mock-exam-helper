/**
 * 薄資料介面：畫面只透過它讀寫。施工A 的存檔實作完成後換接；目前記憶體假實作（假資料，無真實學生）。
 */
import type { ClassInfo, Classroom, ExamFiles, Student } from '../data';
import type { Doc } from './store';
import type { SaveStatus } from '../data/saveQueue';

export interface Repository {
  hasFolder(): boolean;
  /** 目前資料夾的名稱（列表頁顯示用）；沒有或不支援時可省略 */
  folderName?(): string;
  /** 用 showDirectoryPicker 選資料夾；回 false＝新資料夾沒取得授權，仍使用原資料夾（使用者取消則丟 AbortError） */
  chooseFolder(): Promise<boolean>;
  /** 拖拉資料夾（UI-03）：回 false 表示拖進來的不是資料夾 */
  adoptDropped(items: DataTransferItemList): Promise<boolean>;
  load(): Promise<Doc>;
  save(doc: Doc): Promise<void>;
  /** 存檔狀態（#58）：寫入失敗時畫面要顯示錯誤與重試；沒有佇列的實作可省略 */
  saveStatus?(): SaveStatus;
  onSaveStatus?(f: (s: SaveStatus) => void): () => void;
  /** 重寫失敗的存檔；回傳是否存妥 */
  retrySave?(): Promise<boolean>;
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
  { id: 'r1', name: '第一試場', kind: 'class', rows: 6, depth: 6, seatCount: 36, track: 'science', division: 'senior' },
  { id: 'r2', name: '預備教室', kind: 'reserve', rows: 3, depth: 4, seatCount: 12, division: 'senior' },
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
    folderName: () => (folder ? '示範資料夾（記憶體）' : ''),
    chooseFolder: async () => { folder = true; return true; },
    adoptDropped: async (items) => { const ok = items.length > 0; if (ok) folder = true; return ok; },
    load: async () => structuredClone(doc),
    save: async (d) => { doc = structuredClone(d); },
  };
}
