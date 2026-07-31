import { normalizeTechName } from "@/utils/colorUtils";

export const THRESHOLD_BUCKET_KEYS = ["default", "5g", "4g", "3g", "2g"];

export const createEmptyThresholdBuckets = () => ({
  default: [],
  "5g": [],
  "4g": [],
  "3g": [],
  "2g": [],
});

export const createEmptyScalarBuckets = (fallback = -110) => ({
  default: fallback,
  "5g": fallback,
  "4g": fallback,
  "3g": fallback,
  "2g": fallback,
});

export const parseBucketedRangeValue = (rawValue) => {
  if (!rawValue) return createEmptyThresholdBuckets();

  try {
    const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;

    if (Array.isArray(parsed)) {
      return {
        ...createEmptyThresholdBuckets(),
        default: parsed,
      };
    }

    if (parsed && typeof parsed === "object") {
      return THRESHOLD_BUCKET_KEYS.reduce((acc, key) => {
        acc[key] = Array.isArray(parsed[key]) ? parsed[key] : [];
        return acc;
      }, createEmptyThresholdBuckets());
    }
  } catch (error) {
    console.error("Threshold range parse error:", error);
  }

  return createEmptyThresholdBuckets();
};

export const parseBucketedScalarValue = (rawValue, fallback = -110) => {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return createEmptyScalarBuckets(fallback);
  }

  try {
    const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return THRESHOLD_BUCKET_KEYS.reduce((acc, key) => {
        const nextValue = Number.parseFloat(parsed[key]);
        acc[key] = Number.isFinite(nextValue) ? nextValue : fallback;
        return acc;
      }, createEmptyScalarBuckets(fallback));
    }
  } catch {
    const parsedValue = Number.parseFloat(rawValue);
    return createEmptyScalarBuckets(Number.isFinite(parsedValue) ? parsedValue : fallback);
  }

  return createEmptyScalarBuckets(fallback);
};

const isAllTechnologyValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "all" ||
    normalized === "default" ||
    normalized === "unknown" ||
    normalized === "n/a"
  );
};

export const normalizeTechnologyBucket = (value) => {
  if (isAllTechnologyValue(value)) return null;

  const normalized = normalizeTechName(String(value ?? "").trim());
  const lower = String(normalized ?? value ?? "").trim().toLowerCase();

  if (!lower) return null;
  if (lower.includes("5g") || lower === "nr") return "5g";
  if (lower.includes("4g") || lower === "lte") return "4g";
  if (lower.includes("3g") || lower === "umts" || lower === "wcdma") return "3g";
  if (lower.includes("2g") || lower === "gsm") return "2g";

  return null;
};

export const resolveSelectedTechnologyBucket = (selectedTechnologies) => {
  const values = Array.isArray(selectedTechnologies)
    ? selectedTechnologies
    : selectedTechnologies === null || selectedTechnologies === undefined
      ? []
      : [selectedTechnologies];

  const buckets = Array.from(
    new Set(values.map(normalizeTechnologyBucket).filter(Boolean)),
  );

  return buckets.length === 1 ? buckets[0] : "default";
};

const isBucketedThresholdValue = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return THRESHOLD_BUCKET_KEYS.some((key) => key in value);
};

export const pickThresholdBucketValue = (value, selectedBucket, fallback = null) => {
  if (!isBucketedThresholdValue(value)) {
    return value ?? fallback;
  }

  const bucketKey = THRESHOLD_BUCKET_KEYS.includes(selectedBucket) ? selectedBucket : "default";
  const bucketValue = value[bucketKey];
  const defaultValue = value.default;

  if (Array.isArray(defaultValue) || Array.isArray(bucketValue)) {
    if (Array.isArray(bucketValue)) return bucketValue;
    if (Array.isArray(defaultValue)) return defaultValue;
    return Array.isArray(fallback) ? fallback : [];
  }

  if (bucketValue !== undefined && bucketValue !== null && bucketValue !== "") {
    return bucketValue;
  }
  if (defaultValue !== undefined && defaultValue !== null && defaultValue !== "") {
    return defaultValue;
  }
  return fallback;
};
