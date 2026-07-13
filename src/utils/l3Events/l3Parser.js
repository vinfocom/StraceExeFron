import { parseCSV, getField, findColumn } from "./csvParser";

const TIMESTAMP_PATTERNS = ["timestamp", "time stamp", "datetime", "date time", "time", "date"];
const LAYER_PATTERNS = ["layer", "protocol", "stack", "channel"];
const MESSAGE_PATTERNS = [
  "message name",
  "messagename",
  "msg name",
  "message type",
  "messagetype",
  "message",
  "msg",
  "name",
];
const DECODE_PATTERNS = ["decode", "decoded", "detail", "details", "text", "content", "info", "description"];

// Parses an L3 signaling CSV (LTE-RRC / NR-RRC / NAS) into normalized rows.
// Header names vary between exports, so columns are located by alias rather
// than by fixed index.
export function parseL3CSV(text, sourceName = "") {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) return [];

  return rows
    .map((row, index) => {
      const timestamp = getField(row, headers, TIMESTAMP_PATTERNS);
      const layer = getField(row, headers, LAYER_PATTERNS);
      const message = getField(row, headers, MESSAGE_PATTERNS);
      const decodeColumn = findColumn(headers, DECODE_PATTERNS);
      const decodedText = decodeColumn ? String(row[decodeColumn] ?? "").trim() : "";

      return {
        sourceType: "l3",
        sourceFile: sourceName,
        sourceIndex: index,
        timestamp,
        layer,
        message,
        decodedText: decodedText || message,
        raw: row,
      };
    })
    .filter((item) => item.message || item.decodedText);
}
