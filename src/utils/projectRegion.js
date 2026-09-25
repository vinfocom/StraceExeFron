// Which regional backend database a project belongs to, from the signed-in user.
// The Python backend defaults to "india" when no region is sent, so every call
// that creates or reads project data has to pass it explicitly.
export const normalizeProjectCountryCode = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (["TAIWAN", "TWN"].includes(raw)) return "TW";
  if (["INDIA", "IND"].includes(raw)) return "IN";
  return raw;
};

export const getProjectRegionFromCountryCode = (value) => {
  const normalized = normalizeProjectCountryCode(value);
  if (normalized === "TW") return "taiwan";
  if (normalized === "IN") return "india";
  return "";
};

export const getUserCountryCode = (user) =>
  normalizeProjectCountryCode(
    user?.country_code ?? user?.countryCode ?? user?.country ?? user?.source_db ?? user?.sourceDb
  );

export const getUserProjectRegion = (user) => getProjectRegionFromCountryCode(getUserCountryCode(user));
