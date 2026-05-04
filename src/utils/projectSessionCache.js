import { clearIndexedDbByPrefix } from "@/utils/indexedDbCache";

const CACHE_PREFIX = "stracer:project-cache:v1";
const USER_SCOPE_STORAGE_KEY = "stracer:user-scope";
const DEFAULT_MAX_ENTRIES = 80;
const DEFAULT_MAX_PAYLOAD_BYTES = 750 * 1024; // Avoid filling localStorage quota.

const getStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getSessionScope = () => {
  if (typeof window === "undefined") return "guest";
  try {
    const rawUser = window.sessionStorage.getItem("user");
    if (rawUser && rawUser !== "undefined") {
      const user = safeJsonParse(rawUser, {});
      const candidate =
        user?.id ??
        user?.Id ??
        user?.user_id ??
        user?.UserId ??
        user?.email ??
        user?.Email ??
        "guest";
      const resolved = String(candidate).trim() || "guest";
      if (resolved && resolved !== "guest") {
        window.localStorage.setItem(USER_SCOPE_STORAGE_KEY, resolved);
      }
      return resolved;
    }

    const fallbackScope = String(
      window.localStorage.getItem(USER_SCOPE_STORAGE_KEY) || "",
    ).trim();
    if (fallbackScope) return fallbackScope;
    return "guest";
  } catch {
    return "guest";
  }
};

export const setProjectSessionCacheUserScope = (userLike) => {
  if (typeof window === "undefined") return;
  try {
    const candidate =
      userLike?.id ??
      userLike?.Id ??
      userLike?.user_id ??
      userLike?.UserId ??
      userLike?.email ??
      userLike?.Email ??
      null;
    const scope = String(candidate ?? "").trim();
    if (!scope) return;
    window.localStorage.setItem(USER_SCOPE_STORAGE_KEY, scope);
  } catch {
    // noop
  }
};

const normalizeSessionIds = (sessionIds) => {
  if (!sessionIds) return "";
  if (Array.isArray(sessionIds)) {
    return sessionIds
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .sort()
      .join(",");
  }
  return String(sessionIds).trim();
};

const listCacheKeys = (storage) => {
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
};

const pruneCache = (storage, maxEntries = DEFAULT_MAX_ENTRIES) => {
  const keys = listCacheKeys(storage);
  if (keys.length <= maxEntries) return;

  const entries = keys.map((key) => {
    const parsed = safeJsonParse(storage.getItem(key), {});
    return {
      key,
      createdAt: Number(parsed?.createdAt) || 0,
    };
  });

  entries.sort((a, b) => a.createdAt - b.createdAt);
  const toDelete = entries.slice(0, Math.max(1, entries.length - maxEntries));
  toDelete.forEach((item) => storage.removeItem(item.key));
};

export const makeProjectCacheKey = ({
  resource,
  projectId = "global",
  sessionIds = "",
  variant = "",
}) => {
  const scope = getSessionScope();
  const safeResource = String(resource || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const safeProjectId = String(projectId ?? "global");
  const safeSessions = normalizeSessionIds(sessionIds) || "none";
  const safeVariant = String(variant || "default")
    .replace(/[^a-zA-Z0-9,_-]/g, "_")
    .slice(0, 120);

  return `${CACHE_PREFIX}:u:${scope}:p:${safeProjectId}:r:${safeResource}:s:${safeSessions}:v:${safeVariant}`;
};

export const readProjectSessionCacheEntry = (cacheKey) => {
  const storage = getStorage();
  if (!storage || !cacheKey) return null;

  const raw = storage.getItem(cacheKey);
  if (!raw) return null;

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    storage.removeItem(cacheKey);
    return null;
  }

  return {
    data: parsed.data,
    createdAt: Number(parsed.createdAt) || 0,
  };
};

export const isProjectSessionCacheFresh = (cacheEntry, maxAgeMs = 0) => {
  if (!cacheEntry || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return true;
  const createdAt = Number(cacheEntry.createdAt) || 0;
  if (!createdAt) return false;
  return Date.now() - createdAt <= maxAgeMs;
};

export const readProjectSessionCache = (cacheKey, options = {}) => {
  const cacheEntry = readProjectSessionCacheEntry(cacheKey);
  if (!cacheEntry) return null;

  const maxAgeMs = Number(options?.maxAgeMs);
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    if (!isProjectSessionCacheFresh(cacheEntry, maxAgeMs)) {
      return null;
    }
  }

  return cacheEntry.data;
};

export const writeProjectSessionCache = (
  cacheKey,
  data,
  maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES,
) => {
  const storage = getStorage();
  if (!storage || !cacheKey) return false;

  const payload = JSON.stringify({
    createdAt: Date.now(),
    data,
  });

  if (payload.length > maxPayloadBytes) {
    return false;
  }

  try {
    storage.setItem(cacheKey, payload);
    pruneCache(storage);
    return true;
  } catch {
    try {
      pruneCache(storage, Math.floor(DEFAULT_MAX_ENTRIES / 2));
      storage.setItem(cacheKey, payload);
      return true;
    } catch {
      return false;
    }
  }
};

export const clearProjectSessionCache = () => {
  const storage = getStorage();
  if (!storage) return;

  const keys = listCacheKeys(storage);
  keys.forEach((key) => storage.removeItem(key));
  try {
    window.localStorage.removeItem(USER_SCOPE_STORAGE_KEY);
  } catch {
    // noop
  }
  void clearIndexedDbByPrefix(CACHE_PREFIX);
};

export const clearProjectSessionCacheByProjectResource = ({
  projectId = "global",
  resource = "",
} = {}) => {
  const storage = getStorage();
  if (!storage || !resource) return;

  const safeProjectId = String(projectId ?? "global");
  const safeResource = String(resource || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const marker = `:p:${safeProjectId}:r:${safeResource}:`;
  listCacheKeys(storage)
    .filter((key) => key.includes(marker))
    .forEach((key) => storage.removeItem(key));
};
