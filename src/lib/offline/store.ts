/**
 * A small key-value store for the copy of the person's records kept on their
 * phone, and the list of changes waiting to be sent. Backed by IndexedDB (the
 * browser's own database); an in-memory version is used in tests and as a
 * last resort.
 *
 * `persistent` says whether what is written will still be there after the app
 * is closed. Anything that promises "saved on this phone" must check it first.
 */
export interface KeyValueStore {
  readonly persistent: boolean;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    persistent: false,
    async get<T>(key: string) {
      return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async keys(prefix = "") {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

const DB_NAME = "mywitness-offline";
const STORE_NAME = "kv";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Storage request failed"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) {
        open.result.createObjectStore(STORE_NAME);
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("Could not open storage"));
    open.onblocked = () => reject(new Error("Storage is blocked"));
  });
}

function createIndexedDbStore(db: IDBDatabase): KeyValueStore {
  const tx = (mode: IDBTransactionMode) =>
    db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  return {
    persistent: true,
    async get<T>(key: string) {
      return (await request(tx("readonly").get(key))) as T | undefined;
    },
    async set(key, value) {
      await request(tx("readwrite").put(value, key));
    },
    async delete(key) {
      await request(tx("readwrite").delete(key));
    },
    async keys(prefix = "") {
      const all = (await request(tx("readonly").getAllKeys())) as IDBValidKey[];
      return all.map(String).filter((k) => k.startsWith(prefix));
    },
  };
}

let shared: Promise<KeyValueStore> | null = null;

/**
 * The store for this browser. Tries IndexedDB, proves it works with a real
 * write and read, and otherwise falls back to memory with `persistent: false`
 * so callers know not to promise anything.
 */
export function openStore(): Promise<KeyValueStore> {
  if (shared) return shared;
  shared = (async () => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("No IndexedDB");
      const store = createIndexedDbStore(await openDb());
      await store.set("__probe", Date.now());
      if ((await store.get("__probe")) === undefined) throw new Error("Probe failed");
      await store.delete("__probe");
      return store;
    } catch {
      return createMemoryStore();
    }
  })();
  return shared;
}
