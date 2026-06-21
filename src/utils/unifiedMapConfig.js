export const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };
export const DEFAULT_MAP_ZOOM = 13;
export const MAP_ZOOM_LOCK_STORAGE_KEY = "stracer:map-zoom-lock";
export const MAP_ZOOM_LOCK_EVENT = "stracer:map-zoom-lock-change";
export const EMPTY_POLYGONS = Object.freeze([]);
export const EMPTY_LIST = Object.freeze([]);

export const readInitialMapZoomLock = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MAP_ZOOM_LOCK_STORAGE_KEY) === "1";
};

export const SESSION_QUERY_KEYS = Object.freeze([
  "sessionId",
  "session",
  "sessionIds",
  "session_ids",
  "session_Ids",
  "SessionId",
  "SessionID",
  "SessionIds",
  "Session_Ids",
]);

export const DEFAULT_COVERAGE_FILTERS = {
  rsrp: { enabled: false, threshold: -110 },
  rsrq: { enabled: false, threshold: -15 },
  sinr: { enabled: false, threshold: 0 },
};

export const GRID_VIEW_SUPPORTED_METRICS = Object.freeze([
  "rsrp",
  "rsrq",
  "sinr",
  "dl_thpt",
  "ul_thpt",
  "mos",
  "latency",
  "jitter",
]);

export const GRID_POLYGON_FILL_OPACITY = 0.72;
export const GRID_POLYGON_STROKE_OPACITY = 0.85;

export const GRID_ONLY_METRICS = Object.freeze([
  "best_operator",
  "best_technology",
  "best_pci",
]);

export const DEFAULT_DATA_FILTERS = {
  providers: [],
  bands: [],
  technologies: [],
  cellIds: [],
  apps: [],
  indoorOutdoor: [],
  excludedMetricValue: "",
};

export const DRAWN_POLYGON_OPACITY = 0.58;
export const DRAWN_POLYGON_FILL_OPACITY = 0;

export const METRIC_CONFIG = {
  rsrp: {
    higherIsBetter: true,
    unit: "dBm",
    label: "RSRP",
    min: -140,
    max: -44,
  },
  rsrq: { higherIsBetter: true, unit: "dB", label: "RSRQ", min: -20, max: -3 },
  sinr: { higherIsBetter: true, unit: "dB", label: "SINR", min: -10, max: 30 },
  dl_thpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  dl_tpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  dl_rpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  ul_thpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  ul_tpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  ul_rpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  mos: { higherIsBetter: true, unit: "", label: "MOS", min: 1, max: 5 },
  lte_bler: {
    higherIsBetter: false,
    unit: "%",
    label: "BLER",
    min: 0,
    max: 100,
  },
  num_cells: {
    higherIsBetter: false,
    unit: "",
    label: "Pilot Pollution",
    min: 1,
    max: 20,
  },
  level: {
    higherIsBetter: true,
    unit: "dB",
    label: "Ping Pong",
    min: -120,
    max: -30,
  },
  jitter: {
    higherIsBetter: false,
    unit: "ms",
    label: "Jitter",
    min: 0,
    max: 100,
  },
  latency: {
    higherIsBetter: false,
    unit: "ms",
    label: "Latency",
    min: 0,
    max: 500,
  },
  packet_loss: {
    higherIsBetter: false,
    unit: "%",
    label: "Packet Loss",
    min: 0,
    max: 100,
  },
  cell_id: {
    higherIsBetter: true,
    unit: "",
    label: "Cell ID",
    min: 0,
    max: 1000000,
  },
};

export const COLOR_GRADIENT = [
  { min: 0.8, color: "#22C55E" },
  { min: 0.6, color: "#84CC16" },
  { min: 0.4, color: "#EAB308" },
  { min: 0.2, color: "#F97316" },
  { min: 0.0, color: "#EF4444" },
];

export const coordinatesToWktPolygon = (coords) => {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const points = coords
    .map((p) => {
      const lat = Number(typeof p?.lat === "function" ? p.lat() : p?.lat);
      const lng = Number(typeof p?.lng === "function" ? p.lng() : p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);
  if (points.length < 3) return null;
  const pointsString = points.map((p) => `${p.lat} ${p.lng}`).join(", ");
  const firstPointString = `${points[0].lat} ${points[0].lng}`;
  return `POLYGON((${pointsString}, ${firstPointString}))`;
};

export const extractPolygonIdFromSaveResponse = (response) => {
  const candidates = [
    response?.PolygonId,
    response?.polygonId,
    response?.Id,
    response?.id,
    response?.Data?.PolygonId,
    response?.Data?.polygonId,
    response?.Data?.Id,
    response?.Data?.id,
  ];
  const match = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  return match ? Number(match) : null;
};

export const hexToRgbaArray = (hexColor, alpha = 190) => {
  const hex = String(hexColor || "").trim();
  const short = /^#([a-fA-F0-9]{3})$/;
  const full = /^#([a-fA-F0-9]{6})$/;

  if (short.test(hex)) {
    const [, part] = hex.match(short);
    const r = parseInt(part[0] + part[0], 16);
    const g = parseInt(part[1] + part[1], 16);
    const b = parseInt(part[2] + part[2], 16);
    return [r, g, b, alpha];
  }
  if (full.test(hex)) {
    const [, part] = hex.match(full);
    const r = parseInt(part.slice(0, 2), 16);
    const g = parseInt(part.slice(2, 4), 16);
    const b = parseInt(part.slice(4, 6), 16);
    return [r, g, b, alpha];
  }
  return [107, 114, 128, alpha];
};

export const debounce = (fn, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

export const toFiniteNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeMetric = (metric) => {
  if (!metric) return "rsrp";
  const lower = metric.toLowerCase();
  if (["dl_thpt", "dl_tpt", "dl_rpt", "dl_throughput", "tpt_dl", "throughput_dl"].includes(lower)) return "dl_thpt";
  if (["ul_thpt", "ul_tpt", "ul_rpt", "ul_throughput", "tpt_ul", "throughput_ul"].includes(lower)) return "ul_thpt";
  return lower;
};

export const normalizeMetricValue = (value, metric) => {
  const normalizedKey = normalizeMetric(metric);
  const config = METRIC_CONFIG[normalizedKey] || METRIC_CONFIG[metric];
  if (!config || value == null || isNaN(value)) return null;

  let normalized = (value - config.min) / (config.max - config.min);
  normalized = Math.max(0, Math.min(1, normalized));

  if (!config.higherIsBetter) {
    normalized = 1 - normalized;
  }

  return normalized;
};

export const getColorFromNormalizedValue = (normalizedValue) => {
  if (normalizedValue == null || isNaN(normalizedValue)) return "#999999";
  for (const { min, color } of COLOR_GRADIENT) {
    if (normalizedValue >= min) return color;
  }
  return "#EF4444";
};

export const getColorForMetricValue = (value, metric) => {
  const normalizedKey = normalizeMetric(metric);
  const normalized = normalizeMetricValue(value, normalizedKey);
  return getColorFromNormalizedValue(normalized);
};

export const parseSessionIds = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === "number") return [String(value)];
  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    const fromSessionIds = parseSessionIds(value.sessionIds);
    if (fromSessionIds.length > 0) return fromSessionIds;
    const fromSessionIdsSnake = parseSessionIds(value.session_ids);
    if (fromSessionIdsSnake.length > 0) return fromSessionIdsSnake;
    const fromSessionId = parseSessionIds(value.sessionId);
    if (fromSessionId.length > 0) return fromSessionId;
    return parseSessionIds(value.session);
  }

  return [];
};

export const toSessionCsv = (value) => {
  const ids = parseSessionIds(value);
  return ids.length > 0 ? ids.join(",") : "";
};
