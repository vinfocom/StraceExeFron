import { parseCSV, getField, findColumn } from "./csvParser.js";
import { parseTimestampValue } from "./timelineBuilder.js";

const TIMESTAMP_PATTERNS = ["timestamp", "time stamp", "datetime", "date time", "time", "date"];

function normalizeHeader(header = "") {
  return String(header).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findRsrpColumn(headers = []) {
  const exact = headers.find((header) => normalizeHeader(header) === "rsrp");
  if (exact) return exact;

  const primary = headers.find((header) => {
    const normalized = normalizeHeader(header);
    return normalized.includes("rsrp") && !normalized.includes("scell") && !normalized.includes("csi");
  });
  if (primary) return primary;

  return headers.find((header) => normalizeHeader(header).includes("rsrp")) || null;
}

function parseRsrpValue(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return numeric >= -160 && numeric <= -20 ? numeric : null;
}

function toTimeOfDayMs(date) {
  if (!(date instanceof Date)) return null;
  return (
    date.getUTCHours() * 60 * 60 * 1000
    + date.getUTCMinutes() * 60 * 1000
    + date.getUTCSeconds() * 1000
    + date.getUTCMilliseconds()
  );
}

function parseTimeOfDayMs(value = "") {
  const match = String(value).match(/\b(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\b/);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction = "0"] = match;
  const millis = Math.round(Number(`0.${fraction}`) * 1000);
  return (
    Number(hours) * 60 * 60 * 1000
    + Number(minutes) * 60 * 1000
    + Number(seconds) * 1000
    + millis
  );
}

export function parseNetworkLogCSV(text, sourceName = "") {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) return [];

  const timestampColumn = findColumn(headers, TIMESTAMP_PATTERNS);
  const rsrpColumn = findRsrpColumn(headers);
  if (!timestampColumn || !rsrpColumn) return [];

  return rows
    .map((row, index) => {
      const timestampLabel = getField(row, headers, TIMESTAMP_PATTERNS);
      const timestamp = parseTimestampValue(timestampLabel);
      const rsrp = parseRsrpValue(row[rsrpColumn]);

      return {
        sourceType: "networkLog",
        sourceFile: sourceName,
        sourceIndex: index,
        timestamp,
        timestampLabel,
        timeOfDayMs: parseTimeOfDayMs(timestampLabel) ?? toTimeOfDayMs(timestamp),
        rsrp,
        rsrpColumn,
        raw: row,
      };
    })
    .filter((item) => item.timeOfDayMs !== null && item.rsrp !== null);
}
