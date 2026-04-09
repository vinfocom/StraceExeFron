const DB_NAME = "stracer-cache-v1";
const STORE_NAME = "entries";
const DB_VERSION = 1;

let dbPromise = null;

const isIndexedDbAvailable = () =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
  });

const openDb = async () => {
  if (!isIndexedDbAvailable()) return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
};

export const readIndexedDbCache = async (key) => {
  if (!key) return null;
  try {
    const db = await openDb();
    if (!db) return null;

    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const row = await requestToPromise(store.get(key));
    return row && Object.prototype.hasOwnProperty.call(row, "data") ? row.data : null;
  } catch {
    return null;
  }
};

export const writeIndexedDbCache = async (key, data) => {
  if (!key) return false;
  try {
    const db = await openDb();
    if (!db) return false;

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      key,
      data,
      updatedAt: Date.now(),
    });
    await transactionDone(tx);
    return true;
  } catch {
    return false;
  }
};

export const clearIndexedDbByPrefix = async (prefix) => {
  if (!prefix) return;
  try {
    const db = await openDb();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const rows = await requestToPromise(store.getAll());

    rows
      .filter((row) => String(row?.key || "").startsWith(prefix))
      .forEach((row) => store.delete(row.key));

    await transactionDone(tx);
  } catch {
    // Ignore cache-clear failures.
  }
};

