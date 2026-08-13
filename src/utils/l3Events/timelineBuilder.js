import { decodeL3Item, decodeEventItem } from "./eventDecoder.js";
import { extractEmbeddedTimestamp, isStaleEvent } from "./timestampUtils.js";

// Real exports often log a bare time-of-day like "17:34:50.306" with no date
// at all. Anchor those to a fixed arbitrary date so same-session rows still
// sort correctly relative to each other (a session crossing midnight is the
// one edge case this won't get right).
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

function toFiniteCoordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

// Best-effort timestamp parsing: numeric epoch (ms or s), a bare time-of-day,
// or any Date-parseable string. Returns null when the value can't be
// interpreted, so unsortable rows fall back to a stable position instead of
// crashing.
export function parseTimestampValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;

  const trimmed = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (numeric > 1e12) return new Date(numeric);
    if (numeric > 1e9) return new Date(numeric * 1000);
  }

  const timeOnlyMatch = trimmed.match(TIME_ONLY_RE);
  if (timeOnlyMatch) {
    const [, hours, minutes, seconds, fraction = "0"] = timeOnlyMatch;
    const millis = Math.round(Number(`0.${fraction}`) * 1000);
    return new Date(Date.UTC(1970, 0, 1, Number(hours), Number(minutes), Number(seconds), millis));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Timestamps are anchored to a fixed UTC date (see parseTimestampValue) so
// they must always be read back in UTC too - otherwise the viewer's local
// timezone silently shifts the displayed hour/minute away from what the log
// actually said.
export function formatTimelineTimestamp(date) {
  if (!date) return "--:--:--";
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join(":") + `.${pad(date.getUTCMilliseconds(), 3)}`;
}

let idCounter = 0;
const nextId = () => `l3evt-${++idCounter}`;

function buildItem(row, type, decoded) {
  const capturedTimestamp = parseTimestampValue(row.timestamp);
  const rawMessage = type === "l3" ? row.decodedText || row.message || "" : row.value || row.eventName || "";
  const embeddedTimestamp = extractEmbeddedTimestamp(rawMessage, capturedTimestamp);
  const latitude = toFiniteCoordinate(row.latitude, -90, 90);
  const longitude = toFiniteCoordinate(row.longitude, -180, 180);

  const item = {
    id: nextId(),
    timestamp: capturedTimestamp,
    capturedTimestamp,
    embeddedTimestamp,
    timestampLabel: row.timestamp || formatTimelineTimestamp(capturedTimestamp),
    type,
    category: decoded.category,
    sourceCategory: type === "l3" ? row.layer : row.category,
    domain: decoded.domain,
    title: decoded.title,
    icon: decoded.icon,
    summary: decoded.summary,
    details: decoded.details,
    rawMessage,
    sourceFile: row.sourceFile,
    originSource: row.originSource,
    sourceIndex: row.sourceIndex,
    severity: row.severity,
    eventKey: decoded.eventKey || null,
    latitude,
    longitude,
    metadata: row.raw || {},
  };
  const isStale = isStaleEvent(item);
  return {
    ...item,
    // Fresh embedded logcat timestamps are closer to the actual modem event
    // than the delayed CSV capture time and produce accurate setup/duration.
    timestamp: embeddedTimestamp instanceof Date && !isStale ? embeddedTimestamp : capturedTimestamp,
    isStale,
  };
}

// Merges parsed L3 + Event rows into one chronological timeline. Rows with
// an unparsable timestamp are pushed to the end rather than dropped.
export function mergeTimeline(l3Rows = [], eventRows = []) {
  const l3Items = l3Rows.map((row) => buildItem(row, "l3", decodeL3Item(row)));
  const eventItems = eventRows.map((row) => buildItem(row, "event", decodeEventItem(row)));

  const merged = [...l3Items, ...eventItems];

  merged.sort((a, b) => {
    const aTime = a.timestamp ? a.timestamp.getTime() : null;
    const bTime = b.timestamp ? b.timestamp.getTime() : null;
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });

  return merged;
}
