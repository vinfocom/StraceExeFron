// src/utils/indexedDBProvider.js
import { readStoredUser, resolveCompanyId, resolveUserRegion } from "@/utils/authSession";

const DB_NAME = 'swr-cache-db';
const STORE_NAME = 'cache';
const DB_VERSION = 2;
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

const serializeCacheKey = (key) => {
  if (typeof key === 'string') return key;
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
};

const normalizeScopePart = (value, fallback) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || fallback;
};

const getCurrentUserScope = () => {
  const user = readStoredUser();
  if (!user) return 'guest';

  const userIdentity =
    user?.id ??
    user?.Id ??
    user?.user_id ??
    user?.UserId ??
    user?.email ??
    user?.Email ??
    'unknown-user';
  const companyId = resolveCompanyId(user) || 'no-company';
  const region = resolveUserRegion(user) || user?.country_id || user?.CountryId || 'no-country';

  return [
    normalizeScopePart(userIdentity, 'unknown-user'),
    normalizeScopePart(companyId, 'no-company'),
    normalizeScopePart(region, 'no-country'),
  ].join(':');
};

const createScopedStorageKey = (scope, key) =>
  `${scope}::${serializeCacheKey(key)}`;

class IndexedDBCache extends Map {
  constructor() {
    super();
    this.db = null;
    this.writeQueue = new Map();
    this.writeTimer = null;
    this.activeScope = getCurrentUserScope();
    this.initPromise = this.init();
  }

  async init() {
    try {
      this.db = await this.openDB();
      await this.cleanup(); // Remove old data first
      await this.loadFromDB(); // Load remaining valid data
    } catch (error) {
      console.warn('IndexedDB initialization failed, falling back to in-memory cache:', error);
    }
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'storageKey' });
        }
      };
    });
  }

  ensureScope() {
    const nextScope = getCurrentUserScope();
    if (nextScope === this.activeScope) return;

    super.clear();
    this.writeQueue.clear();
    this.activeScope = nextScope;
    void this.loadFromDB();
  }

  async cleanup() {
    if (!this.db) return;
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const now = Date.now();

    // Iterate efficiently using a cursor
    const request = store.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (
          !cursor.value.scope ||
          !cursor.value.timestamp ||
          now - cursor.value.timestamp > CACHE_EXPIRY
        ) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  }

  async loadFromDB() {
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result;
        const scope = this.activeScope;
        if (Array.isArray(entries)) {
          entries.forEach(item => {
            if (item?.scope === scope) {
              super.set(item.key, item.value);
            }
          });
        }
        resolve();
      };
      
      request.onerror = () => {
        console.warn('Failed to load SWR cache from IndexedDB');
        resolve(); // Resolve anyway to not block app
      };
    });
  }

  get(key) {
    this.ensureScope();
    return super.get(key);
  }

  has(key) {
    this.ensureScope();
    return super.has(key);
  }

  keys() {
    this.ensureScope();
    return super.keys();
  }

  values() {
    this.ensureScope();
    return super.values();
  }

  entries() {
    this.ensureScope();
    return super.entries();
  }

  [Symbol.iterator]() {
    this.ensureScope();
    return super[Symbol.iterator]();
  }

  set(key, value) {
    this.ensureScope();
    // 1. Update in-memory Map immediately (synchronous)
    super.set(key, value);

    // 2. Queue for async write (prevents UI blocking)
    const scope = this.activeScope;
    const storageKey = createScopedStorageKey(scope, key);
    this.writeQueue.set(storageKey, {
      storageKey,
      scope,
      key,
      value,
      timestamp: Date.now()
    });
    
    this.scheduleWrite();
    return this;
  }

  delete(key) {
    this.ensureScope();
    super.delete(key);
    this.writeQueue.set(createScopedStorageKey(this.activeScope, key), null); // null indicates deletion
    this.scheduleWrite();
    return true;
  }

  clear() {
    this.ensureScope();
    const scope = this.activeScope;
    Array.from(super.keys()).forEach((key) => {
      this.writeQueue.set(createScopedStorageKey(scope, key), null);
    });
    super.clear();
    this.scheduleWrite();
  }

  scheduleWrite() {
    if (this.writeTimer) return;
    
    // Batch writes every 1 second
    this.writeTimer = setTimeout(() => this.processWriteQueue(), 1000);
  }

  async processWriteQueue() {
    if (!this.db || this.writeQueue.size === 0) {
      this.writeTimer = null;
      return;
    }

    const currentQueue = new Map(this.writeQueue);
    this.writeQueue.clear();
    this.writeTimer = null;

    try {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      currentQueue.forEach((item, storageKey) => {
        if (item === null) {
          store.delete(storageKey);
        } else {
          store.put(item);
        }
      });
      
      transaction.oncomplete = () => {
        // Optional: Check if more writes came in while processing
        if (this.writeQueue.size > 0) this.scheduleWrite();
      };
    } catch (err) {
      console.error('IndexedDB batch write failed', err);
    }
  }
}

// Create a singleton instance
const cacheInstance = new IndexedDBCache();

// SWR Provider function
export const indexedDBProvider = () => {
  return cacheInstance;
};
