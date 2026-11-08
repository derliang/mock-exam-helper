/**
 * 資料夾內容的讀寫（一次模擬考一個子資料夾，D2）。
 *
 * 版面：
 *   settings.json            Settings（D61）
 *   roster-senior.json       高中部學生名單（D62）
 *   roster-junior.json       國中部學生名單
 *   exams/<id>/exam.json     ExamConfig
 *   exams/<id>/entries.json  考試名單 ExamEntry[]（D63）
 *   exams/<id>/diffs.json    名單比對的處理結果 RosterDiff[]
 *   exams/<id>/overrides.json 個別覆寫（獨立檔案，D23）
 *   exams/<id>/result.json   排座結果 SeatingResult（D22）
 *
 * 每次覆寫前先把仍然完好的舊檔留成 <檔名>.bak；主檔損壞時自動改讀 .bak 並回報警告。
 */
import type { DirFS } from './dirfs';
import { decode, encode } from './envelope';
import type { DecodeError } from './envelope';
import type {
  Division,
  ExamConfig,
  ExamEntry,
  Override,
  RosterDiff,
  SeatingResult,
  Settings,
  Student,
} from './types';
import type { Doc } from '../ui/store';

export class StorageError extends Error {
  constructor(
    public file: string,
    public reason: DecodeError,
    message: string,
  ) {
    super(`${file}：${message}`);
    this.name = 'StorageError';
  }
}

export interface Loaded<T> {
  data: T;
  /** 主檔損壞、改用備份時的說明 */
  warning?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isSettings = (v: unknown): v is Settings => isObj(v) && isArr(v.classes) && isArr(v.classrooms);
const isStudents = (v: unknown): v is Student[] =>
  isArr(v) && v.every((s) => isObj(s) && typeof s.classNo === 'number' && typeof s.seatNo === 'number' && typeof s.name === 'string');
const isExam = (v: unknown): v is ExamConfig =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && isArr(v.subjects);
const isList = <T>(v: unknown): v is T[] => isArr(v);
const isResult = (v: unknown): v is SeatingResult => isObj(v) && typeof v.examId === 'string' && isArr(v.assignments);

/** 讀一個 JSON 檔；不存在回 null；損壞則試 .bak，都不行就丟 StorageError */
export async function readFile<T>(
  fs: DirFS,
  path: string,
  validate: (v: unknown) => v is T,
): Promise<Loaded<T> | null> {
  const text = await fs.readText(path);
  if (text === null) return null;
  const main = decode(text, validate);
  if (main.ok) return { data: main.data };
  const bakText = await fs.readText(`${path}.bak`);
  if (bakText !== null) {
    const bak = decode(bakText, validate);
    if (bak.ok) return { data: bak.data, warning: `${path} 已損壞（${main.message}），已改用備份` };
  }
  throw new StorageError(path, main.reason, main.message);
}

/** 寫一個 JSON 檔；覆寫前先備份仍然完好的舊檔 */
export async function writeFile(fs: DirFS, path: string, data: unknown): Promise<void> {
  const next = encode(data);
  const old = await fs.readText(path);
  if (old !== null && old !== next && decode(old).ok) await fs.writeText(`${path}.bak`, old);
  if (old !== next) await fs.writeText(path, next);
}

const rosterPath = (d: Division) => `roster-${d}.json`;
const examDir = (id: string) => `exams/${id}`;

const emptySettings = (): Settings => ({
  schoolName: '',
  headerText: '',
  defaultLabelPaper: 'B4',
  classes: [],
  classrooms: [],
});

/** 檢查檔名不含路徑跳脫（考試 id 會成為資料夾名稱） */
export function assertSafeId(id: string): void {
  if (!/^[\w\-一-鿿]+$/.test(id)) throw new Error(`不合法的考試代碼：${id}`);
}

export async function loadDoc(fs: DirFS): Promise<Loaded<Doc>> {
  const warnings: string[] = [];
  const note = <T>(l: Loaded<T> | null): T | null => {
    if (l?.warning) warnings.push(l.warning);
    return l ? l.data : null;
  };
  const settings = note(await readFile(fs, 'settings.json', isSettings)) ?? emptySettings();
  const senior = note(await readFile(fs, rosterPath('senior'), isStudents)) ?? [];
  const junior = note(await readFile(fs, rosterPath('junior'), isStudents)) ?? [];
  const exams: ExamConfig[] = [];
  for (const id of await fs.listDirs('exams')) {
    const e = note(await readFile(fs, `${examDir(id)}/exam.json`, isExam));
    if (e) exams.push(e);
  }
  exams.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const doc: Doc = { settings, rosters: { senior, junior }, exams };
  return warnings.length ? { data: doc, warning: warnings.join('；') } : { data: doc };
}

const EXAM_FILES = ['exam.json', 'entries.json', 'diffs.json', 'overrides.json', 'result.json'];

export async function saveDoc(fs: DirFS, doc: Doc): Promise<void> {
  await writeFile(fs, 'settings.json', doc.settings);
  await writeFile(fs, rosterPath('senior'), doc.rosters.senior);
  await writeFile(fs, rosterPath('junior'), doc.rosters.junior);
  const keep = new Set<string>();
  for (const e of doc.exams) {
    assertSafeId(e.id);
    keep.add(e.id);
    await writeFile(fs, `${examDir(e.id)}/exam.json`, e);
  }
  // 被刪除的模擬考：移除其檔案（含備份）
  for (const id of await fs.listDirs('exams')) {
    if (keep.has(id)) continue;
    for (const f of EXAM_FILES) {
      await fs.remove(`${examDir(id)}/${f}`);
      await fs.remove(`${examDir(id)}/${f}.bak`);
    }
  }
}

/** 一次模擬考底下的其他檔案 */
export interface ExamFiles {
  entries: ExamEntry[];
  diffs: RosterDiff[];
  overrides: Override[];
  result: SeatingResult;
}
type ExamFileKey = keyof ExamFiles;
const validators: { [K in ExamFileKey]: (v: unknown) => v is ExamFiles[K] } = {
  entries: isList<ExamEntry>,
  diffs: isList<RosterDiff>,
  overrides: isList<Override>,
  result: isResult,
};

export async function loadExamFile<K extends ExamFileKey>(
  fs: DirFS,
  examId: string,
  key: K,
): Promise<Loaded<ExamFiles[K]> | null> {
  assertSafeId(examId);
  return readFile(fs, `${examDir(examId)}/${key}.json`, validators[key]);
}

export async function saveExamFile<K extends ExamFileKey>(
  fs: DirFS,
  examId: string,
  key: K,
  data: ExamFiles[K],
): Promise<void> {
  assertSafeId(examId);
  await writeFile(fs, `${examDir(examId)}/${key}.json`, data);
}
