import { clearIndexedDbByPrefix } from "@/utils/indexedDbCache";

const CACHE_PREFIX = "stracer:project-cache:v1";
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
    if (!rawUser || rawUser === "undefined") return "guest";
    const user = safeJsonParse(rawUser, {});
    const candidate =
      user?.id ??
      user?.Id ??
      user?.user_id ??
      user?.UserId ??
      user?.email ??
      user?.Email ??
      "guest";
    return String(candidate).trim() || "guest";
  } catch {
    return "guest";
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

export const readProjectSessionCache = (cacheKey) => {
  const storage = getStorage();
  if (!storage || !cacheKey) return null;

  const raw = storage.getItem(cacheKey);
  if (!raw) return null;

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    storage.removeItem(cacheKey);
    return null;
  }

  return parsed.data;
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
  void clearIndexedDbByPrefix(CACHE_PREFIX);
};
