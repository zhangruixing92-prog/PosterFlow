export interface HistoryImageRecord {
  sizeId: string;
  sizeName: string;
  width: number;
  height: number;
  blob: Blob;
}

export interface HistoryRecord {
  id: string;
  createdAt: number;
  /** 主海报缩略图 dataURL，用于历史卡片封面 */
  masterThumb: string;
  count: number;
  images: HistoryImageRecord[];
}

const DB_NAME = 'posterflow';
const STORE = 'history';
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  try {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    return await promisifyRequest(run(store));
  } finally {
    db.close();
  }
}

export async function addHistoryRecord(record: HistoryRecord): Promise<void> {
  await withStore('readwrite', (store) => store.add(record));
}

export async function listHistoryRecords(): Promise<HistoryRecord[]> {
  const all = await withStore<HistoryRecord[]>('readonly', (store) => store.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function clearHistoryRecords(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}
