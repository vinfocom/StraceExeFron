const USER_STORAGE_KEY = "user";
const REDIRECT_AFTER_LOGIN_KEY = "redirectAfterLogin";

const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const isElectronRuntime = () =>
  typeof navigator !== "undefined" &&
  /electron/i.test(navigator.userAgent || "");

export const readStoredUser = () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
    if (!raw || raw === "undefined") return null;
    return safeJsonParse(raw, null);
  } catch {
    return null;
  }
};

export const writeStoredUser = (user) => {
  if (typeof window === "undefined") return;

  try {
    if (!user) {
      window.sessionStorage.removeItem(USER_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // noop
  }
};

export const clearStoredUser = () => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // noop
  }
};

export const resolveCompanyId = (user) => {
  const source = user || readStoredUser();
  const candidate = Number(
    source?.company_id ?? source?.CompanyId ?? source?.companyId ?? 0,
  );
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
};

export const resolveUserRegion = (user) => {
  const source = user || readStoredUser();
  const rawValue =
    source?.country_code ??
    source?.countryCode ??
    source?.country ??
    source?.source_db ??
    source?.sourceDb;

  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["tw", "twn", "taiwan"].includes(normalized)) return "taiwan";
  if (["in", "ind", "india"].includes(normalized)) return "india";
  return normalized;
};

export const getCurrentAppLocation = () => {
  if (typeof window === "undefined") return "/";

  const { pathname, search, hash } = window.location;
  if (hash.startsWith("#/")) {
    return hash.slice(1);
  }

  return `${pathname || "/"}${search || ""}${hash || ""}`;
};

export const isLoginRoute = (target = getCurrentAppLocation()) => {
  const pathOnly = String(target || "/").split(/[?#]/, 1)[0] || "/";
  return pathOnly === "/" || pathOnly === "/login";
};

export const getStoredRedirectTarget = () => {
  if (typeof window === "undefined") return "";

  try {
    return String(window.sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY) || "").trim();
  } catch {
    return "";
  }
};

export const setStoredRedirectTarget = (target) => {
  if (typeof window === "undefined") return;

  const normalized = String(target || "").trim();
  if (!normalized || isLoginRoute(normalized)) return;

  try {
    window.sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, normalized);
  } catch {
    // noop
  }
};

export const clearStoredRedirectTarget = () => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
  } catch {
    // noop
  }
};
