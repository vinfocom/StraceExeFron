import {
  getEarfcnColor,
  getMetricConfig,
  getMetricValueFromLog,
  getPciColor,
} from "@/utils/metrics";
import { getLogColor } from "@/utils/colorUtils";

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

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const sanitizeFilePart = (value) =>
  String(value || "logs")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "logs";

const toKmlColor = (hexColor) => {
  const normalized = String(hexColor || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "ff3b82f6";

  // KML uses alpha + blue + green + red, unlike CSS hex colors.
  return `ff${normalized.slice(4, 6)}${normalized.slice(2, 4)}${normalized.slice(0, 2)}`;
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
    return getLogColor(
      "technology",
      value || firstValue(row, FIELD_CANDIDATES.technology),
      "#3B82F6",
    );
  }
  if (metricKey === "provider" || metricKey === "best_operator") {
    return getLogColor(
      "provider",
      value || firstValue(row, FIELD_CANDIDATES.provider),
      "#3B82F6",
    );
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

const downloadKmlFile = (fileName, kml) => {
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildExtendedData = (fields) =>
  Object.entries(fields)
    .map(
      ([name, value]) =>
        `      <Data name="${escapeXml(name)}"><value>${escapeXml(value)}</value></Data>`,
    )
    .join("\n");

export const buildKmlForLogs = ({ locations = [], selectedMetric = "rsrp" } = {}) => {
  const metricConfig = getMetricConfig(selectedMetric);
  const metricKey = metricConfig.key || selectedMetric || "rsrp";
  const metricLabel = metricConfig.label || String(selectedMetric || "KPI").toUpperCase();
  const metricUnit = metricConfig.unit || "";
  const placemarks = [];

  locations.forEach((row, index) => {
    const latitude = toFiniteNumber(firstValue(row, FIELD_CANDIDATES.latitude));
    const longitude = toFiniteNumber(firstValue(row, FIELD_CANDIDATES.longitude));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const metricValue = getMetricValueFromLog(row, metricKey);
    const metricValueText = Number.isFinite(metricValue) ? metricValue : "";
    const color = metricColorFromValue(metricKey, metricValueText, row);
    const id = asText(row?.id ?? row?.log_id ?? row?.sample_id ?? index + 1);
    const name = `${metricLabel}: ${metricValueText || "N/A"}${metricUnit ? ` ${metricUnit}` : ""}`;
    const fields = {
      ID: id,
      Timestamp: asText(firstValue(row, FIELD_CANDIDATES.timestamp), "Unknown"),
      KPI: metricLabel,
      KPIValue: metricValueText,
      KPIUnit: metricUnit,
      Provider: asText(firstValue(row, FIELD_CANDIDATES.provider), "Unknown"),
      Technology: asText(firstValue(row, FIELD_CANDIDATES.technology), "Unknown"),
      Band: asText(firstValue(row, FIELD_CANDIDATES.band), "Unknown"),
      PCI: asText(firstValue(row, FIELD_CANDIDATES.pci), "Unknown"),
      EARFCN: asText(firstValue(row, FIELD_CANDIDATES.earfcn), "Unknown"),
      CellId: asText(firstValue(row, FIELD_CANDIDATES.cellId), "Unknown"),
      SessionId: asText(firstValue(row, FIELD_CANDIDATES.sessionId), "Unknown"),
      Message: asText(firstValue(row, FIELD_CANDIDATES.message), "Log point").slice(0, 254),
    };

    placemarks.push(`    <Placemark>
      <name>${escapeXml(name)}</name>
      <Style>
        <IconStyle>
          <color>${toKmlColor(color)}</color>
          <scale>0.8</scale>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
          </Icon>
        </IconStyle>
      </Style>
      <ExtendedData>
${buildExtendedData(fields)}
      </ExtendedData>
      <Point>
        <coordinates>${longitude},${latitude},0</coordinates>
      </Point>
    </Placemark>`);
  });

  return {
    kml: `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Unified Map Logs - ${escapeXml(metricLabel)}</name>
${placemarks.join("\n")}
  </Document>
</kml>
`,
    exportedCount: placemarks.length,
    fileStem: `unified-map-${sanitizeFilePart(metricKey)}-${new Date().toISOString().slice(0, 10)}`,
  };
};

export const downloadKmlForLogs = ({ locations = [], selectedMetric = "rsrp" } = {}) => {
  const result = buildKmlForLogs({ locations, selectedMetric });
  if (result.exportedCount <= 0) {
    throw new Error("No valid plotted log points found for KML export.");
  }

  downloadKmlFile(`${result.fileStem}.kml`, result.kml);
  return result;
};
