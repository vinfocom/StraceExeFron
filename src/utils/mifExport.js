import {
  getEarfcnColor,
  getMetricConfig,
  getMetricValueFromLog,
  getPciColor,
} from "@/utils/metrics";
import { getLogColor } from "@/utils/colorUtils";

const EXPORT_COLUMNS = [
  ["Id", "Char(64)"],
  ["Timestamp", "Char(40)"],
  ["KPI", "Char(40)"],
  ["KPIValue", "Float"],
  ["KPIUnit", "Char(20)"],
  ["Provider", "Char(80)"],
  ["Technology", "Char(40)"],
  ["Band", "Char(40)"],
  ["PCI", "Char(40)"],
  ["EARFCN", "Char(40)"],
  ["CellId", "Char(80)"],
  ["SessionId", "Char(80)"],
  ["Message", "Char(254)"],
  ["StyleColor", "Char(20)"],
];

const FIELD_CANDIDATES = {
  latitude: ["latitude", "Latitude", "lat", "Lat"],
  longitude: ["longitude", "Longitude", "lng", "Lng", "lon", "Lon"],
  timestamp: [
    "timestamp",
    "Timestamp",
    "time",
    "Time",
    "datetime",
    "date_time",
    "event_time",
    "start_time",
  ],
  provider: ["provider", "Provider", "operator", "operator_name", "network_provider"],
  technology: ["technology", "Technology", "network_type", "networkType", "rat", "RAT"],
  band: ["band", "Band", "lte_band", "nr_band", "serving_band"],
  pci: ["pci", "PCI", "best_pci", "physical_cell_id"],
  earfcn: ["earfcn", "EARFCN", "arfcn", "dl_earfcn", "nr_arfcn", "nrarfcn"],
  cellId: ["cell_id", "cellId", "CellId", "CELL_ID", "ecgi", "cgi"],
  sessionId: ["session_id", "sessionId", "SessionId", "session"],
  message: ["message", "Message", "event_name", "eventName", "event_type", "detail"],
};

const toFiniteNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstValue = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const asText = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || fallback;
};

const quoteMidValue = (value) => {
  if (value === undefined || value === null || value === "") return "";
  return `"${String(value).replace(/"/g, '""')}"`;
};

const sanitizeFilePart = (value) =>
  String(value || "logs")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "logs";

const hexToMapInfoColor = (hexColor) => {
  const normalized = String(hexColor || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return 255;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red + green * 256 + blue * 65536;
};

const metricColorFromValue = (metricKey, value, row) => {
  if (metricKey === "pci" || metricKey === "best_pci") {
    return getPciColor(value || firstValue(row, FIELD_CANDIDATES.pci));
  }
  if (metricKey === "earfcn") {
    return getEarfcnColor(value || firstValue(row, FIELD_CANDIDATES.earfcn));
  }
  if (metricKey === "band") {
    return getLogColor("band", value || firstValue(row, FIELD_CANDIDATES.band), "#3B82F6");
  }
  if (metricKey === "technology" || metricKey === "best_technology") {
    return getLogColor("technology", value || firstValue(row, FIELD_CANDIDATES.technology), "#3B82F6");
  }
  if (metricKey === "provider" || metricKey === "best_operator") {
    return getLogColor("provider", value || firstValue(row, FIELD_CANDIDATES.provider), "#3B82F6");
  }

  const numericValue = toFiniteNumber(value);
  if (!Number.isFinite(numericValue)) return "#3B82F6";

  if (metricKey === "rsrp" || metricKey === "level") {
    if (numericValue >= -90) return "#22C55E";
    if (numericValue >= -105) return "#EAB308";
    if (numericValue >= -115) return "#F97316";
    return "#EF4444";
  }
  if (metricKey === "rsrq") {
    if (numericValue >= -10) return "#22C55E";
    if (numericValue >= -15) return "#EAB308";
    return "#EF4444";
  }
  if (metricKey === "sinr") {
    if (numericValue >= 20) return "#22C55E";
    if (numericValue >= 10) return "#EAB308";
    if (numericValue >= 0) return "#F97316";
    return "#EF4444";
  }
  if (metricKey === "dl_thpt" || metricKey === "ul_thpt") {
    if (numericValue >= 50) return "#22C55E";
    if (numericValue >= 10) return "#EAB308";
    if (numericValue > 0) return "#F97316";
    return "#EF4444";
  }

  return "#3B82F6";
};

const downloadTextFile = (fileName, text) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const buildMifMidForLogs = ({ locations = [], selectedMetric = "rsrp" } = {}) => {
  const metricConfig = getMetricConfig(selectedMetric);
  const metricKey = metricConfig.key || selectedMetric || "rsrp";
  const metricLabel = metricConfig.label || String(selectedMetric || "KPI").toUpperCase();
  const metricUnit = metricConfig.unit || "";

  const rows = [];
  const midRows = [];

  locations.forEach((row, index) => {
    const latitude = toFiniteNumber(firstValue(row, FIELD_CANDIDATES.latitude));
    const longitude = toFiniteNumber(firstValue(row, FIELD_CANDIDATES.longitude));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const metricValue = getMetricValueFromLog(row, metricKey);
    const metricValueForExport = Number.isFinite(metricValue) ? metricValue : "";
    const color = metricColorFromValue(metricKey, metricValueForExport, row);
    const mapInfoColor = hexToMapInfoColor(color);
    const id = asText(row?.id ?? row?.log_id ?? row?.sample_id ?? index + 1);

    rows.push(`Point ${longitude} ${latitude}\n    Symbol (35,${mapInfoColor},12)`);
    midRows.push(
      [
        id,
        asText(firstValue(row, FIELD_CANDIDATES.timestamp)),
        metricLabel,
        metricValueForExport,
        metricUnit,
        asText(firstValue(row, FIELD_CANDIDATES.provider), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.technology), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.band), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.pci), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.earfcn), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.cellId), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.sessionId), "Unknown"),
        asText(firstValue(row, FIELD_CANDIDATES.message), "Log point").slice(0, 254),
        color,
      ]
        .map(quoteMidValue)
        .join(","),
    );
  });

  const mif = [
    "Version 300",
    'Charset "WindowsLatin1"',
    'Delimiter ","',
    "CoordSys Earth Projection 1, 104",
    `Columns ${EXPORT_COLUMNS.length}`,
    ...EXPORT_COLUMNS.map(([name, type]) => `  ${name} ${type}`),
    "Data",
    ...rows,
    "",
  ].join("\n");

  return {
    mif,
    mid: `${midRows.join("\n")}\n`,
    exportedCount: rows.length,
    fileStem: `unified-map-${sanitizeFilePart(metricKey)}-${new Date().toISOString().slice(0, 10)}`,
  };
};

export const downloadMifMidForLogs = ({ locations = [], selectedMetric = "rsrp" } = {}) => {
  const result = buildMifMidForLogs({ locations, selectedMetric });
  if (result.exportedCount <= 0) {
    throw new Error("No valid plotted log points found for MIF export.");
  }

  downloadTextFile(`${result.fileStem}.mif`, result.mif);
  downloadTextFile(`${result.fileStem}.mid`, result.mid);
  return result;
};
