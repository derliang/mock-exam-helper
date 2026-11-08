/**
 * 瀏覽器端 Repository：資料夾授權（D1）＋拖拉資料夾（UI-03）＋存檔。
 * 介面符合 src/ui/repository.ts 的 Repository；資料夾 handle 存在 IndexedDB，重開頁面免重選
 * （瀏覽器可能要求重新授權，restore() 會處理）。這個檔案只含瀏覽器 API 膠水，邏輯都在 folder.ts。
 */
import type { Repository } from '../ui/repository';
import type { Doc } from '../ui/store';
import { createHandleFS, type DirFS } from './dirfs';
import type { ExamFiles } from './folder';
import { loadDoc, loadExamFile, saveDoc, saveExamFile } from './folder';

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

type PermHandle = FileSystemDirectoryHandle & {
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

export function createFsRepository(): FsRepository {
  let fs: DirFS | null = null;
  let warning: string | undefined;

  const adopt = async (h: PermHandle): Promise<boolean> => {
    if (!(await ensurePermission(h))) return false;
    fs = createHandleFS(h);
    await idb('readwrite', (s) => s.put(h, KEY));
    return true;
  };
  const need = (): DirFS => {
    if (!fs) throw new Error('尚未選擇資料夾');
    return fs;
  };

  return {
    hasFolder: () => fs !== null,
    lastWarning: () => warning,
    async chooseFolder() {
      const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<PermHandle> }).showDirectoryPicker;
      await adopt(await pick.call(window, { mode: 'readwrite' }));
    },
    async adoptDropped(items) {
      for (const item of Array.from(items)) {
        const get = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
          .getAsFileSystemHandle;
        if (!get) continue;
        const h = await get.call(item);
        if (h?.kind === 'directory') return adopt(h as PermHandle);
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
      await saveDoc(need(), doc);
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
