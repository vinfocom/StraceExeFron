export const FEATURE_KEYS = {
  REPORT_GENERATION: "report_generation",
  BENCHMARK_TAB: "benchmark_tab",
  RUN_PREDICTION: "run_prediction",
  GRID_FETCH: "grid_fetch",
};

export const FEATURE_OPTIONS = [
  { key: FEATURE_KEYS.REPORT_GENERATION, label: "Report Generation" },
  { key: FEATURE_KEYS.BENCHMARK_TAB, label: "Benchmark Tab" },
  { key: FEATURE_KEYS.RUN_PREDICTION, label: "Run Prediction" },
  { key: FEATURE_KEYS.GRID_FETCH, label: "Grid Fetch/Compute" },
];

const FEATURE_ALIASES = {
  report: FEATURE_KEYS.REPORT_GENERATION,
  report_generation: FEATURE_KEYS.REPORT_GENERATION,
  reportgeneration: FEATURE_KEYS.REPORT_GENERATION,
  generate_report: FEATURE_KEYS.REPORT_GENERATION,
  generatepdf: FEATURE_KEYS.REPORT_GENERATION,
  generate_pdf: FEATURE_KEYS.REPORT_GENERATION,
  pdf_report: FEATURE_KEYS.REPORT_GENERATION,

  benchmark: FEATURE_KEYS.BENCHMARK_TAB,
  benchmark_tab: FEATURE_KEYS.BENCHMARK_TAB,
  operatorcomparison: FEATURE_KEYS.BENCHMARK_TAB,
  operator_comparison: FEATURE_KEYS.BENCHMARK_TAB,

  run_prediction: FEATURE_KEYS.RUN_PREDICTION,
  runprediction: FEATURE_KEYS.RUN_PREDICTION,
  prediction: FEATURE_KEYS.RUN_PREDICTION,
  lte_prediction: FEATURE_KEYS.RUN_PREDICTION,
  run_lte_prediction: FEATURE_KEYS.RUN_PREDICTION,

  grid_fetch: FEATURE_KEYS.GRID_FETCH,
  gridfetch: FEATURE_KEYS.GRID_FETCH,
  fetch_grid: FEATURE_KEYS.GRID_FETCH,
  fetchgrid: FEATURE_KEYS.GRID_FETCH,
  grid_api: FEATURE_KEYS.GRID_FETCH,
  grid_compute: FEATURE_KEYS.GRID_FETCH,
  compute_grid: FEATURE_KEYS.GRID_FETCH,
};

const FEATURE_FIELDS = [
  "features",
  "feature_list",
  "featureList",
  "enabled_features",
  "enabledFeatures",
  "license_features",
  "licenseFeatures",
  "permissions",
  "permission",
  "modules",
  "access",
];

const normalizeFeatureToken = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const canonicalFeatureKey = (value) => {
  const normalized = normalizeFeatureToken(value);
  return FEATURE_ALIASES[normalized] || normalized;
};

const parseFeatureValue = (value) => {
  if (value == null || value === "") return [];

  if (Array.isArray(value)) {
    return value
      .map(canonicalFeatureKey)
      .filter((item) => Object.values(FEATURE_KEYS).includes(item));
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => canonicalFeatureKey(key))
      .filter((item) => Object.values(FEATURE_KEYS).includes(item));
  }

  const stringValue = String(value).trim();
  if (!stringValue) return [];

  if (
    (stringValue.startsWith("[") && stringValue.endsWith("]")) ||
    (stringValue.startsWith("{") && stringValue.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(stringValue);
      return parseFeatureValue(parsed);
    } catch {
      // fall through to separator parsing
    }
  }

  return stringValue
    .split(/[,\n;|]+/g)
    .map(canonicalFeatureKey)
    .filter((item) => Object.values(FEATURE_KEYS).includes(item));
};

export const getEnabledFeaturesFromSource = (source) => {
  if (!source || typeof source !== "object") return [];

  for (const key of FEATURE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const parsed = parseFeatureValue(source[key]);
      if (parsed.length > 0) return [...new Set(parsed)];
      if (source[key] != null && source[key] !== "") return [];
    }
  }

  return [];
};

export const buildFeaturePayload = (features = []) => {
  const normalized = [...new Set(parseFeatureValue(features))];
  const csv = normalized.join(",");
  return {
    features: normalized,
    feature_list: normalized,
    enabled_features: normalized,
    permissions: normalized,
    feature_codes: csv,
    features_csv: csv,
  };
};

export const hasFeatureAccess = (user, featureKey, defaultAllow = true) => {
  const enabled = getEnabledFeaturesFromSource(user);
  if (!enabled.length) return defaultAllow;
  return enabled.includes(featureKey);
};
