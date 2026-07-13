import { parseCSV, getField } from "./csvParser";

const TIMESTAMP_PATTERNS = ["timestamp", "time stamp", "datetime", "date time", "time", "date"];
// "category" is the coarse bucket (CELL_MEAS, CONFIG, NSA_SA, IMS, CALL, HANDOVER, ...);
// "event"/"eventName" is the specific sub-event id (mPreciseCallState, CALL_DIAL_INITIATED, ...).
// Both are looked up separately - real exports carry both columns side by side.
const CATEGORY_PATTERNS = ["category", "event category", "class", "group"];
const EVENT_NAME_PATTERNS = ["event name", "eventname", "event type", "eventtype", "event", "name", "type"];
const VALUE_PATTERNS = ["value", "detail", "details", "description", "info", "message", "data"];
const SOURCE_PATTERNS = ["source", "origin", "producer"];
const SEVERITY_PATTERNS = ["severity", "level", "priority"];

// Parses a high-level Event CSV (CELL_MEAS, CONFIG, NSA_SA, IMS, CALL, ...)
// into normalized rows. Header names are located by alias, not fixed index.
export function parseEventCSV(text, sourceName = "") {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) return [];

  return rows
    .map((row, index) => {
      const timestamp = getField(row, headers, TIMESTAMP_PATTERNS);
      const category = getField(row, headers, CATEGORY_PATTERNS);
      const eventName = getField(row, headers, EVENT_NAME_PATTERNS);
      const value = getField(row, headers, VALUE_PATTERNS);
      const originSource = getField(row, headers, SOURCE_PATTERNS);
      const severity = getField(row, headers, SEVERITY_PATTERNS);

      return {
        sourceType: "event",
        sourceFile: sourceName,
        sourceIndex: index,
        timestamp,
        category,
        eventName,
        value,
        originSource,
        severity,
        raw: row,
      };
    })
    .filter((item) => item.eventName || item.category);
}
