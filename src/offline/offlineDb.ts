export type OutboxMutationKind =
  | 'CREATE_CUSTOMER'
  | 'UPDATE_CUSTOMER'
  | 'UPDATE_CREDIT_LIMIT'
  | 'CREATE_SALE'
  | 'UPDATE_SALE_ITEMS'
  | 'RECORD_REPAYMENT'
  | 'ADD_OR_ADJUST_DEBT'
  | 'REVERSE_TX'
  | 'CREATE_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'CREATE_CATEGORY'
  | 'DELETE_CATEGORY'
  | 'CREATE_SUPPLIER'
  | 'UPDATE_SUPPLIER'
  | 'CREATE_PURCHASE'
  | 'ADJUST_INVENTORY'
  | 'UPDATE_SETTINGS';

export interface OutboxItem {
  id: string;
  kind: OutboxMutationKind;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: Record<string, unknown>;
  summary: string;
  tempCustomerId?: string;
  tempId?: string;
  tempEntityKind?: 'customer' | 'product' | 'category' | 'supplier' | 'expense' | 'sale';
  idempotencyKey: string;
  createdAt: number;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  attempts: number;
  lastError?: string;
}

interface CacheRecord<T = unknown> {
  key: string;
  data: T;
  updatedAt: number;
}

const DB_NAME = 'zamora_liquor_offline_db';
const DB_VERSION = 1;
const STORE_CACHE = 'apiCache';
const STORE_OUTBOX = 'outbox';

const memoryCache = new Map<string, CacheRecord>();
const memoryOutbox = new Map<string, OutboxItem>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const store = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function cacheGet<T = unknown>(key: string): Promise<CacheRecord<T> | null> {
  const db = await openDb();
  if (!db) {
    return (memoryCache.get(key) as CacheRecord<T> | undefined) ?? null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => resolve((req.result as CacheRecord<T> | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheSet<T = unknown>(key: string, data: T): Promise<void> {
  const record: CacheRecord<T> = { key, data, updatedAt: Date.now() };
  memoryCache.set(key, record);
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      tx.objectStore(STORE_CACHE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cacheDelete(key: string): Promise<void> {
  memoryCache.delete(key);
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      tx.objectStore(STORE_CACHE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cacheGetAll(): Promise<CacheRecord[]> {
  const db = await openDb();
  if (!db) return Array.from(memoryCache.values());

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).getAll();
      req.onsuccess = () => resolve((req.result as CacheRecord[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function outboxList(): Promise<OutboxItem[]> {
  const db = await openDb();
  if (!db) {
    return Array.from(memoryOutbox.values()).sort((a, b) => a.createdAt - b.createdAt);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readonly');
      const req = tx.objectStore(STORE_OUTBOX).getAll();
      req.onsuccess = () => {
        const items = (req.result as OutboxItem[]) ?? [];
        items.sort((a, b) => a.createdAt - b.createdAt);
        resolve(items);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function outboxPut(item: OutboxItem): Promise<void> {
  memoryOutbox.set(item.id, item);
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function outboxDelete(id: string): Promise<void> {
  memoryOutbox.delete(id);
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function generateOfflineId(prefix = 'offline'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
