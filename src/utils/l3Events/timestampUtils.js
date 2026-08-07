const TIME_ONLY_RE = /\b(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?\b/;
const MONTH_DAY_TIME_RE = /\b(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?\b/;
const ISO_LIKE_RE = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?\b/;

const DEFAULT_STALE_TOLERANCE_MS = 30_000;

function milliseconds(fraction = "0") {
  return Math.round(Number(`0.${String(fraction).slice(0, 3).padEnd(3, "0")}`) * 1000);
}

function withCsvDate(csvTimestamp, hours, minutes, seconds, fraction) {
  const base = csvTimestamp instanceof Date ? csvTimestamp : new Date(Date.UTC(1970, 0, 1));
  return new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    Number(hours),
    Number(minutes),
    Number(seconds),
    milliseconds(fraction),
  ));
}

function hasSyntheticCsvDate(csvTimestamp) {
  return csvTimestamp instanceof Date && csvTimestamp.getUTCFullYear() === 1970;
}

function nearestToCsv(candidate, csvTimestamp) {
  if (!(csvTimestamp instanceof Date) || !(candidate instanceof Date)) return candidate;
  const variants = [-1, 0, 1].map((dayOffset) => {
    const next = new Date(candidate);
    next.setUTCDate(next.getUTCDate() + dayOffset);
    return next;
  });
  return variants.sort((left, right) => (
    Math.abs(left.getTime() - csvTimestamp.getTime()) - Math.abs(right.getTime() - csvTimestamp.getTime())
  ))[0];
}

export function extractEmbeddedTimestamp(text = "", csvTimestamp = null) {
  const value = String(text || "");
  let match = value.match(ISO_LIKE_RE);
  if (match) {
    const [, year, month, day, hours, minutes, seconds, fraction] = match;
    if (hasSyntheticCsvDate(csvTimestamp)) {
      return nearestToCsv(withCsvDate(csvTimestamp, hours, minutes, seconds, fraction), csvTimestamp);
    }
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds), milliseconds(fraction)));
  }

  match = value.match(MONTH_DAY_TIME_RE);
  if (match) {
    const [, month, day, hours, minutes, seconds, fraction] = match;
    // Time-only CSV exports are anchored to 1970 by timelineBuilder. Their
    // embedded logcat value still carries the real month/day, so comparing
    // those calendar dates directly makes old buffered rows look newer rather
    // than stale. In that case only the embedded time-of-day is comparable.
    if (hasSyntheticCsvDate(csvTimestamp)) {
      return nearestToCsv(withCsvDate(csvTimestamp, hours, minutes, seconds, fraction), csvTimestamp);
    }
    const year = csvTimestamp instanceof Date ? csvTimestamp.getUTCFullYear() : 1970;
    const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds), milliseconds(fraction)));
    return nearestToCsv(candidate, csvTimestamp);
  }

  match = value.match(TIME_ONLY_RE);
  if (match) {
    const [, hours, minutes, seconds, fraction] = match;
    return nearestToCsv(withCsvDate(csvTimestamp, hours, minutes, seconds, fraction), csvTimestamp);
  }

  return null;
}

export function isStaleEvent(item, toleranceMs = DEFAULT_STALE_TOLERANCE_MS) {
  const csvTimestamp = item?.timestamp instanceof Date ? item.timestamp : null;
  if (!csvTimestamp) return false;

  const embeddedTimestamp = item.embeddedTimestamp instanceof Date
    ? item.embeddedTimestamp
    : extractEmbeddedTimestamp([
      item?.rawMessage,
      item?.summary,
      item?.title,
      JSON.stringify(item?.metadata || {}),
    ].filter(Boolean).join(" "), csvTimestamp);

  if (!(embeddedTimestamp instanceof Date)) return false;
  return csvTimestamp.getTime() - embeddedTimestamp.getTime() > toleranceMs;
}

export function normalizeTimestamp(item) {
  if (!item) return null;
  if (item.embeddedTimestamp instanceof Date && !isStaleEvent(item)) return item.embeddedTimestamp;
  return item.timestamp || null;
}
