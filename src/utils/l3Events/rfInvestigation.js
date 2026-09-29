export const RF_MATCH_TOLERANCE_MS = 2000;

const rowTime = (row) => row?.timestampMs ?? timestampOf(row);

function lowerBoundTimestamp(rows, target) {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rowTime(rows[mid]) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function nearestRfRow(rows, timeMs) {
  if (!rows?.length || !Number.isFinite(timeMs)) return null;
  const index = lowerBoundTimestamp(rows, timeMs);
  const before = rows[index - 1] || null;
  const after = rows[index] || null;
  if (!before) return after;
  if (!after) return before;
  return timeMs - rowTime(before) <= rowTime(after) - timeMs ? before : after;
}

const read = (row, ...keys) => {
  for (const key of keys) {
    const pascal = key ? key[0].toUpperCase() + key.slice(1) : key;
    const value = row?.[key] ?? row?.[pascal];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
};

export function normalizeRfTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  // Time-of-day-only strings have no date and cannot be safely aligned across midnight.
  if (/^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRfTimestamp(row) {
  const label = read(row, "timestampLabel", "timestampText", "TimestampLabel", "TimestampText");
  if (typeof label === "string" && /^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?$/.test(label.trim())) return null;
  return normalizeRfTimestamp(read(row, "timestamp", "timestampText", "timestampLabel", "time_stamp", "log_time"));
}

const timestampOf = getRfTimestamp;
const idOf = (row, index, source) => String(read(row, "id", "sourceId", "rowId", "log_id", "sourceIndex", "rowNo") ?? `${source}-${index}`);
const sessionOf = (row) => {
  const value = read(row, "session_id", "sessionId", "SessionId");
  return value == null ? null : String(value).trim();
};
const deviceOf = (row) => {
  const value = read(row, "device_id", "deviceId", "sim_id", "simId", "sim_identity", "subscriber_id", "phone_number", "imei", "imsi");
  return value == null ? null : String(value).trim().toLowerCase();
};
const num = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

function firstMetric(row, fields) {
  for (const field of fields) {
    const value = read(row, field);
    const parsed = num(value);
    if (parsed !== null) return { value: parsed, sourceName: field, sourceValue: value };
  }
  return null;
}

function normalizeSample(row, index, sourceDatasetId) {
  const timestampMs = timestampOf(row);
  if (timestampMs === null) return null;
  const lte = /lte|4g/i.test(String(read(row, "technology", "network", "networkType", "rat") || ""));
  const nr = /nr|5g/i.test(String(read(row, "technology", "network", "networkType", "rat") || ""));
  const metrics = [];
  const add = (technology, metric, found, unit) => {
    if (found) metrics.push({ technology, metric, value: found.value, sourceName: found.sourceName, sourceValue: found.sourceValue, unit });
  };
  add("LTE", "RSRP", firstMetric(row, ["lte_rsrp", "LTE_RSRP"]), "dBm");
  add("NR", "RSRP", firstMetric(row, ["nr_rsrp", "NR_RSRP", "nrRsrp", "NRRSRP"]), "dBm");
  const genericRsrp = firstMetric(row, ["rsrp", "RSRP", "Rsrp"]);
  if (genericRsrp) add(nr ? "NR" : lte ? "LTE" : String(read(row, "technology", "network", "networkType") || "Unknown"), "RSRP", genericRsrp, "dBm");
  add("LTE", "RSRQ", firstMetric(row, ["lte_rsrq", "LTE_RSRQ"]), "dB");
  add("NR", "RSRQ", firstMetric(row, ["nr_rsrq", "NR_RSRQ", "nrRsrq", "NRRSRQ"]), "dB");
  const genericRsrq = firstMetric(row, ["rsrq", "RSRQ", "Rsrq"]);
  if (genericRsrq) add(nr ? "NR" : lte ? "LTE" : String(read(row, "technology", "network", "networkType") || "Unknown"), "RSRQ", genericRsrq, "dB");
  add("LTE", "SINR", firstMetric(row, ["lte_sinr", "LTE_SINR"]), "dB");
  add("NR", "SINR", firstMetric(row, ["nr_sinr", "NR_SINR", "nrSinr", "NRSINR"]), "dB");
  const genericSinr = firstMetric(row, ["sinr", "SINR", "Sinr"]);
  if (genericSinr) add(nr ? "NR" : lte ? "LTE" : String(read(row, "technology", "network", "networkType") || "Unknown"), "SINR", genericSinr, "dB");
  for (const [metric, fields, unitFields] of [
    ["Downlink throughput", ["dl_thpt", "dl_tpt", "dl_throughput"], ["dl_thpt_unit", "dl_tpt_unit", "dl_unit", "throughput_unit", "throughputUnit", "unit"]],
    ["Uplink throughput", ["ul_thpt", "ul_tpt", "ul_throughput"], ["ul_thpt_unit", "ul_tpt_unit", "ul_unit", "throughput_unit", "throughputUnit", "unit"]],
  ]) {
    const found = firstMetric(row, fields);
    const unit = read(row, ...unitFields);
    if (found && unit) add(String(read(row, "technology", "network", "networkType") || "Unknown"), metric, found, String(unit));
  }
  const lat = num(read(row, "lat", "latitude"));
  const lon = num(read(row, "lon", "lng", "longitude"));
  return {
    id: `${sourceDatasetId}:network:${idOf(row, index, "network")}`,
    rowId: idOf(row, index, "network"),
    sourceDatasetId,
    timestampMs,
    timestamp: read(row, "timestamp", "Timestamp", "time_stamp", "log_time"),
    sessionId: sessionOf(row),
    deviceId: deviceOf(row),
    technology: String(read(row, "technology", "network", "networkType", "rat") || "Unknown"),
    cell: read(row, "cell_id", "cellId", "CellId", "pci", "PCI"),
    frequency: read(row, "earfcn", "nrarfcn", "arfcn", "frequency", "band"),
    latitude: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    longitude: lon !== null && lon >= -180 && lon <= 180 ? lon : null,
    metrics,
    raw: row,
  };
}

export function prepareRfInvestigation({ timeline = [], networkRows = [], datasetId = "dataset" } = {}) {
  const samples = networkRows.map((row, index) => normalizeSample(row, index, datasetId)).filter(Boolean).sort((a, b) => a.timestampMs - b.timestampMs);
  const messages = timeline.map((row, index) => {
    const timestampMs = timestampOf(row);
    if (timestampMs === null) return null;
    return {
      ...row,
      id: String(row.id ?? `${datasetId}:message:${index}`),
      sourceDatasetId: datasetId,
      timestampMs,
      sessionId: sessionOf(row),
      deviceId: deviceOf(row),
      latitude: num(read(row, "latitude", "lat")),
      longitude: num(read(row, "longitude", "lon", "lng")),
    };
  }).filter(Boolean);
  return { samples, messages };
}

function identityCompatible(message, sample, scopedSessionIds) {
  if (message.sessionId && sample.sessionId) {
    if (message.sessionId !== sample.sessionId) return false;
  } else if (message.sessionId || sample.sessionId) {
    const known = message.sessionId || sample.sessionId;
    if (!scopedSessionIds || scopedSessionIds.length !== 1 || known !== String(scopedSessionIds[0])) return false;
  } else if (!scopedSessionIds || scopedSessionIds.length !== 1) return false;
  if (message.deviceId && sample.deviceId && message.deviceId !== sample.deviceId) return false;
  if (Boolean(message.deviceId) !== Boolean(sample.deviceId)) return false;
  return true;
}

export function matchRfMeasurement(message, samples, { toleranceMs = RF_MATCH_TOLERANCE_MS, sessionIds = [] } = {}) {
  const time = message?.timestampMs ?? timestampOf(message);
  if (time === null || time === undefined) return { status: "unmatched", sample: null, differenceMs: null };
  const start = lowerBoundTimestamp(samples, time - toleranceMs);
  const candidates = [];
  for (let index = start; index < samples.length && samples[index].timestampMs <= time + toleranceMs; index += 1) {
    const sample = samples[index];
    if (!identityCompatible(message, sample, sessionIds)) continue;
    candidates.push({ sample, differenceMs: sample.timestampMs - time });
  }
  candidates.sort((a, b) => Math.abs(a.differenceMs) - Math.abs(b.differenceMs));
  if (!candidates.length) return { status: "unmatched", sample: null, differenceMs: null };
  if (candidates.length > 1 && Math.abs(candidates[0].differenceMs) === Math.abs(candidates[1].differenceMs)) {
    return { status: "ambiguous", sample: null, differenceMs: null, candidates: candidates.slice(0, 2).map(({ sample }) => sample) };
  }
  const [{ sample, differenceMs }] = candidates;
  return { status: differenceMs === 0 ? "exact" : "nearby", sample, differenceMs };
}

export function resolveRfHover(timeMs, messages, samples, options = {}) {
  if (!Number.isFinite(timeMs)) return { message: null, match: null, mapPosition: null };
  const message = nearestRfRow(messages, timeMs);
  const match = message ? matchRfMeasurement(message, samples, options) : null;
  const hasGps = (row) => row?.latitude !== null && row?.latitude !== undefined && row?.longitude !== null && row?.longitude !== undefined
    && String(row.latitude).trim() !== "" && String(row.longitude).trim() !== ""
    && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
    && Number(row.latitude) >= -90 && Number(row.latitude) <= 90
    && Number(row.longitude) >= -180 && Number(row.longitude) <= 180;
  const mapPosition = hasGps(message)
    ? { latitude: Number(message.latitude), longitude: Number(message.longitude), sourceId: message.id }
    : hasGps(match?.sample)
      ? { latitude: Number(match.sample.latitude), longitude: Number(match.sample.longitude), sourceId: match.sample.id }
      : null;
  return { message, match, mapPosition };
}

export function getRfWindow(selection, marginSeconds = 10) {
  const margin = Math.max(0, Number(marginSeconds) || 0) * 1000;
  const start = selection?.startTime ? normalizeRfTimestamp(selection.startTime) : null;
  const end = selection?.endTime ? normalizeRfTimestamp(selection.endTime) : null;
  const selectedTime = selection?.timestampMs ?? timestampOf(selection) ?? (selection?.startTime ? normalizeRfTimestamp(selection.startTime) : null);
  const anchorStart = start ?? selectedTime;
  const anchorEnd = end ?? selectedTime;
  if (anchorStart === null || anchorEnd === null) return null;
  return { startMs: anchorStart - margin, endMs: anchorEnd + margin };
}

