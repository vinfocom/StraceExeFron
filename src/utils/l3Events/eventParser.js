import { parseCSV, getField } from "./csvParser";

const TIMESTAMP_PATTERNS = ["timestamp", "time stamp", "datetime", "date time", "time", "date"];
const EVENT_NAME_PATTERNS = ["event name", "eventname", "event type", "eventtype", "event", "name", "type"];
const VALUE_PATTERNS = ["value", "detail", "details", "description", "info", "message", "data"];

// Parses a high-level Event CSV (CELL_MEAS, CONFIG, NSA_SA, IMS, CALL, ...)
// into normalized rows. Header names are located by alias, not fixed index.
export function parseEventCSV(text, sourceName = "") {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) return [];

  return rows
    .map((row, index) => {
      const timestamp = getField(row, headers, TIMESTAMP_PATTERNS);
      const eventName = getField(row, headers, EVENT_NAME_PATTERNS);
      const value = getField(row, headers, VALUE_PATTERNS);

      return {
        sourceType: "event",
        sourceFile: sourceName,
        sourceIndex: index,
        timestamp,
        eventName,
        value,
        raw: row,
      };
    })
    .filter((item) => item.eventName);
}
