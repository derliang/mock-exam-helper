/**
 * 瀏覽器端 Repository：資料夾授權（D1）＋拖拉資料夾（UI-03）＋存檔。
 * 介面符合 src/ui/repository.ts 的 Repository；資料夾 handle 存在 IndexedDB，重開頁面免重選
 * （瀏覽器可能要求重新授權，restore() 會處理）。這個檔案只含瀏覽器 API 膠水，邏輯都在 folder.ts。
 */
import type { Repository } from '../ui/repository';
import type { Doc } from '../ui/store';
import { createHandleFS, type DirFS } from './dirfs';
import type { ExamFiles } from './folder';
import { createIncrementalSaver, loadDoc, loadExamFile, saveExamFile } from './folder';
import { createSaveQueue, SwitchBlockedError, type SaveQueue, type SaveStatus } from './saveQueue';

const DB = 'mock-exam-helper';
const STORE = 'handles';
const KEY = 'root';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

async function ensurePermission(h: PermHandle): Promise<boolean> {
  const opt = { mode: 'readwrite' } as const;
  if ((await h.queryPermission?.(opt)) === 'granted') return true;
  return (await h.requestPermission?.(opt)) === 'granted';
}

export interface FsRepository extends Repository {
  /** 重開頁面時嘗試還原上次選的資料夾；需要使用者手勢才能重新授權 */
  restore(): Promise<boolean>;
  /** 最近一次 load 的警告（例如主檔損壞、已改用備份） */
  lastWarning(): string | undefined;
}

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** 瀏覽器 API 的注入點（測試用）；預設用真實的 showDirectoryPicker／IndexedDB／檔案系統 */
export interface FsRepositoryDeps {
  pick?: () => Promise<PermHandle>;
  permission?: (h: PermHandle) => Promise<boolean>;
  makeFs?: (h: PermHandle) => DirFS;
  remember?: (h: PermHandle) => Promise<void>;
}

export function createFsRepository(deps: FsRepositoryDeps = {}): FsRepository {
  let fs: DirFS | null = null;
  let queue: SaveQueue<Doc> | null = null;
  let warning: string | undefined;
  let folder = '';
  let status: SaveStatus = { state: 'idle' };
  const listeners = new Set<(s: SaveStatus) => void>();
  const emit = (s: SaveStatus) => { status = s; listeners.forEach((f) => f(s)); };

  const permission = deps.permission ?? ensurePermission;
  const makeFs = deps.makeFs ?? createHandleFS;
  const remember = deps.remember ?? ((h: PermHandle) => idb('readwrite', (s) => s.put(h, KEY)).then(() => undefined));

  // 授權成功才換資料夾；換之前先等舊資料夾的存檔佇列清空（#58、#69），失敗就不切換
  const adopt = async (h: PermHandle, verify = false): Promise<boolean> => {
    if (!(await permission(h))) return false;
    while (queue && !queue.isIdle()) if (!(await queue.flush())) throw new SwitchBlockedError();
    if (queue && queue.status().state === 'error') throw new SwitchBlockedError();
    const nextFs = makeFs(h);
    if (verify) await loadDoc(nextFs); // 新資料夾讀不了就丟錯、不切換（#69：B 讀檔失敗時仍使用 A）
    await remember(h);
    fs = nextFs;
    const saveInc = createIncrementalSaver(nextFs); // #72：每個資料夾一個，只寫有變的檔案
    queue = createSaveQueue((d: Doc) => saveInc(d), emit);
    emit({ state: 'idle' });
    folder = h.name;
    return true;
  };
  const need = (): DirFS => {
    if (!fs) throw new Error('尚未選擇資料夾');
    return fs;
  };

  return {
    hasFolder: () => fs !== null,
    folderName: () => folder,
    lastWarning: () => warning,
    async chooseFolder() {
      const pick = deps.pick ?? (() => (window as unknown as { showDirectoryPicker: (o: object) => Promise<PermHandle> }).showDirectoryPicker.call(window, { mode: 'readwrite' }));
      return adopt(await pick(), true);
    },
    saveStatus: () => status,
    onSaveStatus(f) { listeners.add(f); return () => { listeners.delete(f); }; },
    async retrySave() { return queue ? queue.retry() : true; },
    async adoptDropped(items) {
      for (const item of Array.from(items)) {
        const get = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
          .getAsFileSystemHandle;
        if (!get) continue;
        const h = await get.call(item);
        if (h?.kind === 'directory') return adopt(h as PermHandle, true);
      }
      return false;
    },
    async restore() {
      try {
        const h = await idb<PermHandle | undefined>('readonly', (s) => s.get(KEY));
        return h ? await adopt(h) : false;
      } catch {
        return false;
      }
    },
    async load(): Promise<Doc> {
      const r = await loadDoc(need());
      warning = r.warning;
      return r.data;
    },
    async save(doc) {
      need();
      queue!.enqueue(doc); // 排進佇列即返回；失敗由 onSaveStatus 通知畫面
    },
    async loadExamFile<K extends keyof ExamFiles>(examId: string, key: K): Promise<ExamFiles[K] | null> {
      const r = await loadExamFile(need(), examId, key);
      if (r?.warning) warning = r.warning;
      return r ? r.data : null;
    },
    async saveExamFile<K extends keyof ExamFiles>(examId: string, key: K, data: ExamFiles[K]): Promise<void> {
      await saveExamFile(need(), examId, key, data);
    },
  };
}
