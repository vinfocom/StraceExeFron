const METRICS = [
  { key: "lte_rsrp", label: "LTE RSRP", aliases: ["rsrp", "ltersrp"], unit: "dBm", unitVerified: true, colorMetric: "rsrp" },
  { key: "nr_ss_rsrp", label: "NR SS-RSRP", aliases: ["ssrsrp", "nrssrsrp", "nrssrsrp"], unit: "dBm", unitVerified: true, colorMetric: "rsrp" },
  { key: "nr_csi_rsrp", label: "NR CSI-RSRP", aliases: ["csirsrp", "nrcsirsrp"], unit: "dBm", unitVerified: true, colorMetric: "rsrp" },
  { key: "lte_rsrq", label: "LTE RSRQ", aliases: ["rsrq", "lter srq"], unit: "dB", unitVerified: true, colorMetric: "rsrq" },
  { key: "nr_ss_rsrq", label: "NR SS-RSRQ", aliases: ["ssrsrq", "nrssrsrq"], unit: "dB", unitVerified: true, colorMetric: "rsrq" },
  { key: "nr_csi_rsrq", label: "NR CSI-RSRQ", aliases: ["csirsrq", "nrcsirsrq"], unit: "dB", unitVerified: true, colorMetric: "rsrq" },
  { key: "lte_rssnr", label: "LTE RSSNR", aliases: ["rssnr", "lterssnr"], unit: "dB", unitVerified: true, colorMetric: "rssnr" },
  { key: "nr_ss_sinr", label: "NR SS-SINR", aliases: ["sssinr", "nrsssinr"], unit: "dB", unitVerified: true, colorMetric: "sinr" },
  { key: "lte_cqi", label: "LTE CQI", aliases: ["cqi", "ltecqi"], unit: null, unitVerified: false, colorMetric: "cqi" },
  { key: "lte_mimo_rank", label: "LTE MIMO Rank", aliases: ["ltemimorank", "mimorank", "rank"], unit: null, unitVerified: false, colorMetric: "rank" },
];

const UNAVAILABLE_WORDS = /^(?:unavailable|unknown|n\/?a|not\s+available|invalid|null|none|nan|—|-)$/i;
const NUMBER_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*(dBm|dB))?$/i;

function objectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && /^\s*\{/.test(value)) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Raw JSON is optional metadata; malformed text is left as source evidence.
    }
  }
  return null;
}

function containers(row) {
  return [objectValue(row?.metadata ?? row?.Metadata), objectValue(row?.raw ?? row?.Raw), row].filter(Boolean);
}

function valueOf(row, keys) {
  for (const container of containers(row)) {
    for (const key of keys) {
      const pascal = key[0]?.toUpperCase() + key.slice(1);
      const value = container?.[key] ?? container?.[pascal];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
  }
  return null;
}

const normalizeKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function getMetric(row) {
  const names = [
    valueOf(row, ["eventKey", "EventKey"]),
    valueOf(row, ["message", "Message"]),
  ].filter(Boolean);
  for (const name of names) {
    const head = String(name).trim().split(/\s*[:=]\s*/, 1)[0];
    const normalized = normalizeKey(head);
    const metric = METRICS.find((candidate) => candidate.aliases.some((alias) => normalizeKey(alias) === normalized));
    if (metric) return metric;
  }
  return null;
}

function isCellMeasurement(row) {
  return ["sourceCategory", "category"].some((field) => {
    const category = valueOf(row, [field]);
    return category != null && normalizeKey(category) === "cellmeas";
  });
}

function parseValue(value) {
  let text = String(value ?? "").trim().replace(/[−–]/g, "-");
  text = text.replace(/\s*\[?provisional\]?\s*$/i, "").trim();
  text = text.replace(/^\(new\)\s*/i, "").trim();
  text = text.replace(/^(?:rank|value)\s*=\s*/i, "").trim();
  if (UNAVAILABLE_WORDS.test(text) || text === "2147483647" || text === "+2147483647") {
    return { value: null, status: "unavailable", sourceUnit: null };
  }
  const match = text.match(NUMBER_RE);
  if (!match) return { value: null, status: "invalid", sourceUnit: null };
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric === 2147483647) return { value: null, status: "unavailable", sourceUnit: match[2] || null };
  return { value: numeric, status: "valid", sourceUnit: match[2] || null };
}

function parseChange(text) {
  const cleaned = String(text ?? "").trim().replace(/^[A-Za-z][A-Za-z0-9 _-]*\s*[:=]\s*/, "");
  const provisional = /\bprovisional\b/i.test(cleaned);
  const arrows = cleaned.split(/\s*(?:->|→)\s*/);
  if (arrows.length === 2) {
    return { pre: parseValue(arrows[0]), post: parseValue(arrows[1]), provisional, formatStatus: "change" };
  }
  if (arrows.length > 2) return { pre: null, post: null, provisional, formatStatus: "unsupported" };
  const value = parseValue(cleaned);
  return { pre: { value: null, status: "missing", sourceUnit: null }, post: value, provisional, formatStatus: "single" };
}

function coordinate(value, min, max) {
  if (value == null || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function sourceIdentity(row, index) {
  const id = row?.id ?? row?.Id ?? row?.sourceId ?? row?.SourceId ?? row?.rowId ?? row?.RowId
    ?? valueOf(row, ["id", "sourceId", "rowId", "rowNumber", "sourceIndex"]);
  const sessionId = valueOf(row, ["sessionId", "session_id", "SessionId"]);
  const timestampLabel = valueOf(row, ["timestampLabel", "TimestampLabel", "timestampText", "TimestampText"]);
  const fallback = [sessionId ?? "session-unknown", timestampLabel ?? "time-unknown", valueOf(row, ["sourceFile", "source_file", "fileName"]) ?? "file-unknown", index].join(":");
  return { id: String(id ?? fallback), sessionId: sessionId == null ? null : String(sessionId) };
}

function cellIdentityOf(row) {
  const direct = valueOf(row, ["cellId", "cell_id", "CellId", "ci", "CI", "cid", "CID", "pci", "PCI", "nci", "NCI"]);
  if (direct !== null && typeof direct !== "object") return direct;
  const identity = objectValue(valueOf(row, ["cellIdentity", "cell_identity", "CellIdentity"])) || (typeof direct === "object" ? direct : null);
  if (!identity) return null;
  const parts = ["mcc", "mnc", "tac", "ci", "cellId", "pci", "nci"].flatMap((key) => {
    const value = identity[key] ?? identity[key.toUpperCase()];
    return value === null || value === undefined || String(value).trim() === "" ? [] : [`${key.toUpperCase()}=${value}`];
  });
  return parts.length ? parts.join(" · ") : JSON.stringify(identity);
}

function parseOne(row, index) {
  if (!row || typeof row !== "object" || !isCellMeasurement(row)) return null;
  const metric = getMetric(row);
  const originalText = valueOf(row, ["rawMessage", "RawMessage", "message", "Message", "eventKey", "EventKey"]);
  const parsed = metric ? parseChange(originalText ?? "") : { pre: null, post: null, provisional: false, formatStatus: "unsupported" };
  const identity = sourceIdentity(row, index);
  const latitude = coordinate(valueOf(row, ["latitude", "lat", "Latitude"]), -90, 90);
  const longitude = coordinate(valueOf(row, ["longitude", "lon", "lng", "Longitude"]), -180, 180);
  const gpsValid = latitude !== null && longitude !== null;
  const sourceUnitMismatch = [parsed.pre, parsed.post].some((side) => side?.sourceUnit && metric?.unit && side.sourceUnit.toLowerCase() !== metric.unit.toLowerCase());
  const hasValidValue = !sourceUnitMismatch && [parsed.pre, parsed.post].some((side) => side?.status === "valid");
  const status = !metric || parsed.formatStatus === "unsupported"
    ? "unsupported"
    : sourceUnitMismatch
      ? "unit-mismatch"
      : hasValidValue
        ? parsed.provisional ? "provisional" : "valid"
        : [parsed.pre, parsed.post].some((side) => side?.status === "unavailable") ? "unavailable" : "invalid";
  return {
    id: identity.id,
    sourceRowId: identity.id,
    sessionId: identity.sessionId,
    metricKey: metric?.key ?? null,
    metricLabel: metric?.label ?? "Unsupported CELL_MEAS metric",
    unit: metric?.unit ?? null,
    unitVerified: metric?.unitVerified ?? false,
    colorMetric: metric?.colorMetric ?? null,
    preValue: hasValidValue && parsed.pre?.status === "valid" ? parsed.pre.value : null,
    postValue: hasValidValue && parsed.post?.status === "valid" ? parsed.post.value : null,
    preStatus: sourceUnitMismatch && parsed.pre?.status === "valid" ? "invalid-unit" : parsed.pre?.status ?? "missing",
    postStatus: sourceUnitMismatch && parsed.post?.status === "valid" ? "invalid-unit" : parsed.post?.status ?? "missing",
    status,
    provisional: parsed.provisional,
    formatStatus: parsed.formatStatus,
    timestampLabel: valueOf(row, ["timestampLabel", "TimestampLabel", "timestampText", "TimestampText"]) ?? "",
    latitude,
    longitude,
    gpsValid,
    sourceFile: valueOf(row, ["sourceFile", "sourceFileName", "source_file", "fileName", "SourceFile"]) ?? "",
    cellIdentity: cellIdentityOf(row),
    originalText: String(originalText ?? ""),
    sourceRow: row,
    comparable: Boolean(metric && !sourceUnitMismatch),
  };
}

export function parseCellMeasurements(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(parseOne).filter(Boolean);
}

export const CELL_MEASUREMENT_METRICS = METRICS.map(({ key, label, unit, unitVerified }) => ({ key, label, unit, unitVerified }));

export function isCellMeasurementRow(row) {
  return Boolean(row && typeof row === "object" && isCellMeasurement(row));
}

export function getVisibleCellMeasurements(measurements, points, { currentIndex = 0, showAllPoints = false, datasetKey, sourceDatasetKey } = {}) {
  if (datasetKey !== sourceDatasetKey) return [];
  const pointIndices = new Map();
  (Array.isArray(points) ? points : []).forEach((point, index) => {
    const sourceId = String(point?.sourceRowId ?? point?.id ?? "");
    if (sourceId) pointIndices.set(sourceId, index);
  });
  return (Array.isArray(measurements) ? measurements : []).flatMap((measurement) => {
    if (!measurement?.gpsValid || (measurement.preValue === null && measurement.postValue === null)) return [];
    const playbackIndex = pointIndices.get(String(measurement.sourceRowId));
    if (playbackIndex === undefined || (!showAllPoints && playbackIndex > currentIndex)) return [];
    return [{ ...measurement, playbackIndex }];
  });
}
