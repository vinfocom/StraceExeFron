// src/utils/indexedDBProvider.js

const DB_NAME = 'swr-cache-db';
const STORE_NAME = 'cache';
const DB_VERSION = 1;
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

class IndexedDBCache extends Map {
  constructor() {
    super();
    this.db = null;
    this.writeQueue = new Map();
    this.writeTimer = null;
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Create store with 'key' as the primary key
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    });
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
        if (cursor.value.timestamp && now - cursor.value.timestamp > CACHE_EXPIRY) {
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
        if (Array.isArray(entries)) {
          entries.forEach(item => {
            // Populate the parent Map directly
            super.set(item.key, item.value);
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

  set(key, value) {
    // 1. Update in-memory Map immediately (synchronous)
    super.set(key, value);

    // 2. Queue for async write (prevents UI blocking)
    this.writeQueue.set(key, {
      key,
      value,
      timestamp: Date.now()
    });
    
    this.scheduleWrite();
    return this;
  }

  delete(key) {
    super.delete(key);
    this.writeQueue.set(key, null); // null indicates deletion
    this.scheduleWrite();
    return true;
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

      currentQueue.forEach((item, key) => {
        if (item === null) {
          store.delete(key);
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