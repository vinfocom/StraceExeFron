// src/pages/UnifiedMapView.jsx

import React, {
  Suspense,
  lazy,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
  useRef,
} from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useJsApiLoader, Polygon } from "@react-google-maps/api";
import { toast } from "react-toastify";

import { mapViewApi, gridAnalyticsApi } from "../api/apiEndpoints";

// Components
import Spinner from "../components/common/Spinner";
import MapWithMultipleCircles from "@/components/unifiedMap/MapwithMultipleCircle";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import NetworkPlannerMap from "@/components/unifiedMap/NetworkPlannerMap";
import UnifiedHeader from "@/components/unifiedMap/unifiedMapHeader";
import MapLegend from "@/components/map/MapLegend";
import SiteLegend from "@/components/unifiedMap/SiteLegend";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import LoadingProgress from "@/components/LoadingProgress";
import TechHandoverMarkers, {
  clearHandoverPolylines,
} from "@/components/unifiedMap/TechHandoverMarkers";
import SubSessionMarkers from "@/components/unifiedMap/SubSessionMarkers";
import AddSiteFormDialog from "@/components/unifiedMap/AddSiteFormDialog";
import LtePredictionLocationLayer from "@/components/unifiedMap/LtePredictionLocationLayer";
import { normalizeBandName } from "@/utils/colorUtils";

// Hooks
import { useSiteData } from "@/hooks/useSiteData";
import { useNeighborCollisions } from "@/hooks/useNeighborCollisions";
import { useLtePrediction } from "@/hooks/useLtePrediction";
import useColorForLog from "@/hooks/useColorForLog";
import {
  useBestNetworkCalculation,
  DEFAULT_WEIGHTS,
} from "@/hooks/useBestNetworkCalculation";

import { useNetworkSamples } from "@/hooks/useNetworkSamples";
import { usePredictionData } from "@/hooks/usePredictionData";
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import { useSubSessionAnalytics } from "@/hooks/useSubSessionAnalytics";
import { useProjectPolygons } from "@/hooks/useProjectPolygons";
import { useAreaPolygons } from "@/hooks/useAreaPolygons";

// Utils
import {
  normalizeProviderName,
  normalizeTechName,
  getBandColor,
  getTechnologyColor,
  getProviderColor,
  generateColorFromHash,
} from "@/utils/colorUtils";
import { PolygonChecker as FastPolygonChecker } from "@/utils/polygonUtils";
import {
  findProjectInProjectsCache,
  upsertProjectInProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };
const DEFAULT_MAP_ZOOM = 13;
const EMPTY_POLYGONS = Object.freeze([]);
const EMPTY_LIST = Object.freeze([]);
const UnifiedMapSidebar = lazy(
  () => import("@/components/unifiedMap/UnifiedMapSideBar.jsx"),
);
const UnifiedDetailLogs = lazy(
  () => import("@/components/unifiedMap/UnifiedDetailLogs"),
);
const SESSION_QUERY_KEYS = Object.freeze([
  "sessionId",
  "session",
  "sessionIds",
  "session_ids",
  "session_Ids",
  "SessionId",
  "SessionID",
  "SessionIds",
  "Session_Ids",
]);

const DEFAULT_COVERAGE_FILTERS = {
  rsrp: { enabled: false, threshold: -110 },
  rsrq: { enabled: false, threshold: -15 },
  sinr: { enabled: false, threshold: 0 },
};

const DEFAULT_DATA_FILTERS = {
  providers: [],
  bands: [],
  technologies: [],
  indoorOutdoor: [],
};

const hexToRgbaArray = (hexColor, alpha = 190) => {
  const hex = String(hexColor || "").trim();
  const short = /^#([a-fA-F0-9]{3})$/;
  const full = /^#([a-fA-F0-9]{6})$/;

  if (short.test(hex)) {
    const [, part] = hex.match(short);
    const r = parseInt(part[0] + part[0], 16);
    const g = parseInt(part[1] + part[1], 16);
    const b = parseInt(part[2] + part[2], 16);
    return [r, g, b, alpha];
  }
  if (full.test(hex)) {
    const [, part] = hex.match(full);
    const r = parseInt(part.slice(0, 2), 16);
    const g = parseInt(part.slice(2, 4), 16);
    const b = parseInt(part.slice(4, 6), 16);
    return [r, g, b, alpha];
  }
  return [107, 114, 128, alpha];
};

const METRIC_CONFIG = {
  rsrp: {
    higherIsBetter: true,
    unit: "dBm",
    label: "RSRP",
    min: -140,
    max: -44,
  },
  rsrq: { higherIsBetter: true, unit: "dB", label: "RSRQ", min: -20, max: -3 },
  sinr: { higherIsBetter: true, unit: "dB", label: "SINR", min: -10, max: 30 },
  dl_thpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  dl_tpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  dl_rpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  ul_thpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  ul_tpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  ul_rpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  mos: { higherIsBetter: true, unit: "", label: "MOS", min: 1, max: 5 },
  lte_bler: {
    higherIsBetter: false,
    unit: "%",
    label: "BLER",
    min: 0,
    max: 100,
  },
  num_cells: {
    higherIsBetter: false,
    unit: "",
    label: "Pilot Pollution",
    min: 1,
    max: 20,
  },
  level: {
    higherIsBetter: true,
    unit: "dB",
    label: "SSI",
    min: -120,
    max: -30,
  },
  jitter: {
    higherIsBetter: false,
    unit: "ms",
    label: "Jitter",
    min: 0,
    max: 100,
  },
  latency: {
    higherIsBetter: false,
    unit: "ms",
    label: "Latency",
    min: 0,
    max: 500,
  },
  packet_loss: {
    higherIsBetter: false,
    unit: "%",
    label: "Packet Loss",
    min: 0,
    max: 100,
  },
};

const COLOR_GRADIENT = [
  { min: 0.8, color: "#22C55E" },
  { min: 0.6, color: "#84CC16" },
  { min: 0.4, color: "#EAB308" },
  { min: 0.2, color: "#F97316" },
  { min: 0.0, color: "#EF4444" },
];

const debounce = (fn, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

const toFiniteNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatIndoorOutdoorValue = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Keep only the label part before "(...)" e.g. "Ouotdot (1.13)" -> "Ouotdot"
  const labelBeforeBracket = raw.split("(")[0].trim().toLowerCase();
  if (!labelBeforeBracket) return null;

  // Common misspellings seen in source data
  if (["ouotdot", "outdot", "oudoor", "outdor"].includes(labelBeforeBracket)) {
    return "outdoor";
  }
  if (["indor", "indoorr", "inodor"].includes(labelBeforeBracket)) {
    return "indoor";
  }

  if (labelBeforeBracket.includes("indoor")) return "indoor";
  if (labelBeforeBracket.includes("outdoor")) return "outdoor";
  if (labelBeforeBracket === "in") return "indoor";
  if (labelBeforeBracket === "out") return "outdoor";

  return null;
};

const getIndoorOutdoorBucket = (value) => {
  return formatIndoorOutdoorValue(value);
};

const buildIndoorOutdoorFromLogs = (logs = []) => {
  const indoor = [];
  const outdoor = [];

  (logs || []).forEach((loc) => {
    const bucket = getIndoorOutdoorBucket(loc?.indoor_outdoor);
    if (!bucket) return;

    const entry = {
      Operator: loc?.provider || loc?.m_alpha_long || "Unknown",
      Technology: loc?.technology || loc?.network || loc?.networkType || "Unknown",
      KPIs: {
        avg_rsrp: toFiniteNumber(loc?.rsrp),
        avg_rsrq: toFiniteNumber(loc?.rsrq),
        avg_sinr: toFiniteNumber(loc?.sinr),
        avg_mos: toFiniteNumber(loc?.mos),
        avg_dl_tpt: toFiniteNumber(loc?.dl_tpt ?? loc?.dl_thpt ?? loc?.dl_rpt),
        avg_ul_tpt: toFiniteNumber(loc?.ul_tpt ?? loc?.ul_thpt ?? loc?.ul_rpt),
      },
      AppUsage: [],
    };

    if (bucket === "indoor") indoor.push(entry);
    if (bucket === "outdoor") outdoor.push(entry);
  });

  return { indoor, outdoor };
};

const areCentersEqual = (a, b, tolerance = 1e-7) => {
  if (!a || !b) return false;
  return (
    Math.abs(Number(a.lat) - Number(b.lat)) <= tolerance &&
    Math.abs(Number(a.lng) - Number(b.lng)) <= tolerance
  );
};

const normalizeMetric = (metric) => {
  if (!metric) return "rsrp";
  const lower = metric.toLowerCase();
  if (["dl_thpt", "dl_tpt", "dl_rpt", "dl_throughput", "tpt_dl", "throughput_dl"].includes(lower)) return "dl_thpt";
  if (["ul_thpt", "ul_tpt", "ul_rpt", "ul_throughput", "tpt_ul", "throughput_ul"].includes(lower)) return "ul_thpt";
  return lower;
};

const normalizeMetricValue = (value, metric) => {
  const normalizedKey = normalizeMetric(metric);
  const config = METRIC_CONFIG[normalizedKey] || METRIC_CONFIG[metric];
  if (!config || value == null || isNaN(value)) return null;

  let normalized = (value - config.min) / (config.max - config.min);
  normalized = Math.max(0, Math.min(1, normalized));

  if (!config.higherIsBetter) {
    normalized = 1 - normalized;
  }

  return normalized;
};

const getColorFromNormalizedValue = (normalizedValue) => {
  if (normalizedValue == null || isNaN(normalizedValue)) return "#999999";
  for (const { min, color } of COLOR_GRADIENT) {
    if (normalizedValue >= min) return color;
  }
  return "#EF4444";
};

const getColorForMetricValue = (value, metric) => {
  const normalizedKey = normalizeMetric(metric);
  const normalized = normalizeMetricValue(value, normalizedKey);
  return getColorFromNormalizedValue(normalized);
};

const getColorFromValueOrMetric = (value, thresholds, metric) => {
  if (value == null || isNaN(value)) return "#999999";

  if (thresholds?.length > 0) {
    const sorted = [...thresholds]
      .filter((t) => t.min != null && t.max != null)
      .sort((a, b) => parseFloat(a.min) - parseFloat(b.min));

    let matchedThreshold = null;
    for (const t of sorted) {
      const min = parseFloat(t.min);
      const max = parseFloat(t.max);
      const isLastRange = t === sorted[sorted.length - 1];
      if (value >= min && (isLastRange ? value <= max : value < max)) {
        matchedThreshold = t;
      }
    }
    if (matchedThreshold?.color) return matchedThreshold.color;
    if (sorted.length > 0) {
      if (value < sorted[0].min) return sorted[0].color;
      if (value > sorted[sorted.length - 1].max)
        return sorted[sorted.length - 1].color;
    }
    return "#999999";
  }
  return getColorForMetricValue(value, metric);
};

const getThresholdKey = (metric) => {
  return normalizeMetric(metric);
};

const parseSessionIds = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === "number") return [String(value)];
  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    const fromSessionIds = parseSessionIds(value.sessionIds);
    if (fromSessionIds.length > 0) return fromSessionIds;
    const fromSessionIdsSnake = parseSessionIds(value.session_ids);
    if (fromSessionIdsSnake.length > 0) return fromSessionIdsSnake;
    const fromSessionId = parseSessionIds(value.sessionId);
    if (fromSessionId.length > 0) return fromSessionId;
    return parseSessionIds(value.session);
  }
  return [];
};

const toSessionCsv = (value) => {
  const ids = parseSessionIds(value);
  return ids.length > 0 ? ids.join(",") : "";
};

const isPointInPolygon = (point, polygon) => {
  const path = polygon?.paths?.[0];
  if (!path?.length) return false;
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  if (lat == null || lng == null) return false;
  const bbox = polygon?.bbox;
  if (
    bbox &&
    (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east)
  ) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const filterPointsInsidePolygons = (points = [], polygonChecker = null) => {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (!polygonChecker) return points;
  return polygonChecker.filter(points);
};

const normalizeKey = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const num = Number(raw);
  if (Number.isFinite(num) && Number.isInteger(num)) return String(num);
  return raw;
};

const getLocationIdKey = (loc) =>
  normalizeKey(
    loc?.id ??
    loc?.Id ??
    loc?.ID ??
    loc?.log_id ??
    loc?.LogId ??
    loc?.logId ??
    loc?.logID,
  );

const getLocationPciKey = (loc) =>
  normalizeKey(
    loc?.pci ??
    loc?.Pci ??
    loc?.PCI ??
    loc?.physical_cell_id ??
    loc?.physicalCellId ??
    loc?.cell_id ??
    loc?.CellId ??
    loc?.cellId,
  );

const toCoordinateKey = (latValue, lngValue) => {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)}|${lng.toFixed(6)}`;
};

const getLocationCoordinateKey = (loc) =>
  toCoordinateKey(
    loc?.lat ?? loc?.latitude ?? loc?.Lat,
    loc?.lng ?? loc?.lon ?? loc?.longitude ?? loc?.Lng,
  );

const setLookupCount = (lookup, key, count) => {
  if (!key || !Number.isFinite(count)) return;
  const prev = lookup.get(key);
  if (prev == null || count > prev) {
    lookup.set(key, count);
  }
};

const getLookupCountForLocation = (loc, lookup) => {
  if (!(lookup instanceof Map)) return null;
  const idKey = getLocationIdKey(loc);
  if (idKey && lookup.has(`id:${idKey}`)) return lookup.get(`id:${idKey}`);
  const coordKey = getLocationCoordinateKey(loc);
  if (coordKey && lookup.has(`coord:${coordKey}`))
    return lookup.get(`coord:${coordKey}`);
  return null;
};

const getLocationIdentityKey = (loc) =>
  getLocationIdKey(loc) || getLocationCoordinateKey(loc);

const isUnknownOption = (value) => {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  return (
    !normalized ||
    normalized === "unknown" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "-"
  );
};

const getLocationSessionKey = (loc) =>
  normalizeKey(
    loc?.session_id ??
    loc?.sessionId ??
    loc?.SessionId ??
    loc?.session ??
    loc?.Session,
  );

const toEpochMilliseconds = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1e11) return Math.trunc(numeric); // already in ms
  if (numeric > 1e8) return Math.trunc(numeric * 1000); // epoch seconds
  return null;
};

const getLocationTimestampMs = (loc) => {
  const candidates = [
    loc?.timestamp,
    loc?.time_stamp,
    loc?.timeStamp,
    loc?.log_time,
    loc?.logTime,
    loc?.created_at,
    loc?.createdAt,
  ];

  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;

    const numericEpoch = toEpochMilliseconds(candidate);
    if (numericEpoch !== null) return numericEpoch;

    const parsed = Date.parse(String(candidate));
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const compareNullableNumbers = (a, b) => {
  const aMissing = a == null;
  const bMissing = b == null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
};

const buildOrderedDriveLogs = (logs = []) =>
  (logs || [])
    .map((loc, originalIndex) => {
      const logIdRaw = getLocationIdKey(loc);
      const logIdNumber = Number(logIdRaw);

      return {
        loc,
        originalIndex,
        sessionKey: getLocationSessionKey(loc) ?? "__session_missing__",
        logIdRaw,
        logIdNumber: Number.isFinite(logIdNumber) ? logIdNumber : null,
        timestampMs: getLocationTimestampMs(loc),
      };
    })
    .sort((a, b) => {
      const sessionCompare = String(a.sessionKey).localeCompare(
        String(b.sessionKey),
        undefined,
        { numeric: true, sensitivity: "base" },
      );
      if (sessionCompare !== 0) return sessionCompare;

      const idCompare = compareNullableNumbers(a.logIdNumber, b.logIdNumber);
      if (idCompare !== 0) return idCompare;

      const timeCompare = compareNullableNumbers(a.timestampMs, b.timestampMs);
      if (timeCompare !== 0) return timeCompare;

      if (a.logIdRaw && b.logIdRaw && a.logIdRaw !== b.logIdRaw) {
        const rawIdCompare = a.logIdRaw.localeCompare(
          b.logIdRaw,
          undefined,
          { numeric: true, sensitivity: "base" },
        );
        if (rawIdCompare !== 0) return rawIdCompare;
      }

      return a.originalIndex - b.originalIndex;
    });

const buildHandoverTransitions = (logs = []) => {
  const orderedLogs = buildOrderedDriveLogs(logs);
  if (orderedLogs.length < 2) {
    return {
      technologyTransitions: [],
      bandTransitions: [],
      pciTransitions: [],
    };
  }

  const technologyTransitions = [];
  const bandTransitions = [];
  const pciTransitions = [];

  let prevTech = normalizeTechName(orderedLogs[0].loc?.technology);
  let prevBand = orderedLogs[0].loc?.band;
  let prevPci = orderedLogs[0].loc?.pci;
  let prevSessionKey = orderedLogs[0].sessionKey;
  let prevEntry = orderedLogs[0];

  for (let i = 1; i < orderedLogs.length; i++) {
    const currentEntry = orderedLogs[i];
    const loc = currentEntry.loc;
    if (!loc) continue;

    if (currentEntry.sessionKey !== prevSessionKey) {
      prevTech = normalizeTechName(loc.technology);
      prevBand = loc.band;
      prevPci = loc.pci;
      prevSessionKey = currentEntry.sessionKey;
      prevEntry = currentEntry;
      continue;
    }

    const lat = Number(loc.lat ?? loc.latitude);
    const lng = Number(loc.lng ?? loc.longitude);
    const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
    const displaySessionId =
      loc?.session_id ?? loc?.sessionId ?? loc?.SessionId ?? null;
    const transitionMeta = {
      atIndex: currentEntry.originalIndex,
      orderIndex: i,
      sequenceLogId: currentEntry.logIdRaw ?? null,
      sequenceTimestamp: currentEntry.timestampMs,
      sessionGroup: currentEntry.sessionKey,
      timestamp:
        loc?.timestamp ??
        loc?.time_stamp ??
        loc?.timeStamp ??
        loc?.log_time ??
        loc?.logTime ??
        null,
      session_id: displaySessionId,
      previousSequenceLogId: prevEntry?.logIdRaw ?? null,
      previousSequenceTimestamp: prevEntry?.timestampMs ?? null,
    };
    const prevLat = Number(prevEntry?.loc?.lat ?? prevEntry?.loc?.latitude);
    const prevLng = Number(prevEntry?.loc?.lng ?? prevEntry?.loc?.longitude);
    if (Number.isFinite(prevLat) && Number.isFinite(prevLng) && hasCoordinates) {
      transitionMeta.fromLat = prevLat;
      transitionMeta.fromLng = prevLng;
      transitionMeta.toLat = lat;
      transitionMeta.toLng = lng;
    }

    const currTech = normalizeTechName(loc.technology);
    if (hasCoordinates && currTech && prevTech && currTech !== prevTech) {
      technologyTransitions.push({
        from: prevTech,
        to: currTech,
        lat,
        lng,
        ...transitionMeta,
        type: "technology",
      });
    }
    prevTech = currTech;

    const currBand = loc.band;
    if (
      hasCoordinates &&
      currBand &&
      prevBand &&
      String(currBand) !== String(prevBand)
    ) {
      bandTransitions.push({
        from: String(prevBand),
        to: String(currBand),
        lat,
        lng,
        ...transitionMeta,
        type: "band",
      });
    }
    prevBand = currBand;

    const currPci = loc.pci;
    if (
      hasCoordinates &&
      currPci !== "" &&
      currPci !== null &&
      currPci !== undefined &&
      prevPci !== "" &&
      prevPci !== null &&
      prevPci !== undefined &&
      String(currPci) !== String(prevPci)
    ) {
      pciTransitions.push({
        from: String(prevPci),
        to: String(currPci),
        lat,
        lng,
        ...transitionMeta,
        type: "pci",
      });
    }
    prevPci = currPci;
    prevEntry = currentEntry;
  }

  return { technologyTransitions, bandTransitions, pciTransitions };
};

const calculateMedian = (values) => {
  if (!values?.length) return null;
  const validValues = values.filter((v) => v != null && !isNaN(v));
  if (!validValues.length) return null;
  const sorted = [...validValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calculateCategoryStats = (points, category, metric) => {
  if (!points?.length) return null;
  const grouped = {};
  points.forEach((pt) => {
    const key = String(pt[category] || "Unknown").trim();
    if (!grouped[key]) grouped[key] = { count: 0, values: [] };
    grouped[key].count++;
    const val = parseFloat(pt[metric]);
    if (!isNaN(val) && val != null) grouped[key].values.push(val);
  });

  const stats = Object.entries(grouped)
    .map(([name, { count, values }]) => {
      const sortedValues = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sortedValues.length / 2);
      const medianValue =
        sortedValues.length > 0
          ? sortedValues.length % 2
            ? sortedValues[mid]
            : (sortedValues[mid - 1] + sortedValues[mid]) / 2
          : null;

      return {
        name,
        count,
        percentage: ((count / points.length) * 100).toFixed(1),
        avgValue: values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null,
        medianValue,
        minValue: values.length ? Math.min(...values) : null,
        maxValue: values.length ? Math.max(...values) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { stats, dominant: stats[0], total: points.length };
};

// --- Sub Components ---

// ... (ZoneTooltip and BestNetworkLegend remain unchanged) ...
const ZoneTooltip = React.memo(
  ({ polygon, position, selectedMetric, selectedCategory }) => {
    if (!selectedCategory) return null;
    if (!polygon || !position) return null;

    const {
      name,
      pointCount,
      fillColor,
      area,
      medianValue,
      bestProvider,
      bestProviderValue,
      bestBand,
      bestBandValue,
      bestTechnology,
      bestTechnologyValue,
      categoryStats,
    } = polygon;

    const config = METRIC_CONFIG[selectedMetric] || {
      unit: "",
      higherIsBetter: true,
    };
    const unit = config.unit || "";
    const parsedArea = Number(area);
    const areaLabel =
      Number.isFinite(parsedArea) && parsedArea > 0
        ? parsedArea >= 1_000_000
          ? `${(parsedArea / 1_000_000).toFixed(3)} km²`
          : `${parsedArea.toFixed(0)} m²`
        : null;

    if (!pointCount || pointCount === 0) {
      return (
        <div
          className="fixed z-[1000] bg-white rounded-lg shadow-xl border border-gray-300 p-4"
          style={{
            left: Math.min(position.x + 15, window.innerWidth - 220),
            top: Math.min(position.y - 10, window.innerHeight - 100),
            pointerEvents: "none",
          }}
        >
          <div className="font-semibold text-gray-800 mb-1">
            {name || "Zone"}
          </div>
          <div className="text-sm text-gray-500">No data available</div>
        </div>
      );
    }

    return (
      <div
        className="fixed z-[1000] bg-white rounded-xl shadow-2xl border-2 overflow-hidden"
        style={{
          left: Math.min(position.x + 15, window.innerWidth - 400),
          top: Math.min(position.y - 10, window.innerHeight - 400),
          pointerEvents: "none",
          borderColor: fillColor || "#3B82F6",
          minWidth: "360px",
          maxWidth: "420px",
        }}
      >
        <div
          className="px-4 py-3"
          style={{ backgroundColor: fillColor || "#3B82F6" }}
        >
          <span className="text-white font-semibold text-sm">
            {name} - {pointCount} samples
          </span>
        </div>

        <div className="p-4 space-y-3">
          {areaLabel && (
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-sm font-medium text-gray-600">Area:</span>
              <span className="text-base font-semibold text-gray-900">{areaLabel}</span>
            </div>
          )}

          {selectedCategory === "provider" && bestProvider && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">
                Best Provider
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: getProviderColor(bestProvider) }}
                  />
                  <span className="text-sm font-medium">{bestProvider}</span>
                </div>
                {bestProviderValue !== null && (
                  <span className="text-sm text-gray-600">
                    {bestProviderValue.toFixed(2)} {unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {medianValue !== null && medianValue !== undefined && (
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-sm font-medium text-gray-600">
                Median {config.label}:
              </span>
              <span className="text-base font-bold text-gray-900">
                {medianValue.toFixed(2)} {unit}
              </span>
            </div>
          )}

          {selectedCategory === "band" && bestBand && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">
                Best Band
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: getBandColor(bestBand) }}
                  />
                  <span className="text-sm font-medium">Band {bestBand}</span>
                </div>
                {bestBandValue !== null && (
                  <span className="text-sm text-gray-600">
                    {bestBandValue.toFixed(2)} {unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {selectedCategory === "technology" && bestTechnology && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">
                Best Technology
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor: getTechnologyColor(bestTechnology),
                    }}
                  />
                  <span className="text-sm font-medium">{bestTechnology}</span>
                </div>
                {bestTechnologyValue !== null && (
                  <span className="text-sm text-gray-600">
                    {bestTechnologyValue.toFixed(2)} {unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {categoryStats &&
            selectedCategory &&
            categoryStats[selectedCategory]?.stats && (
              <div className="pt-2 border-t">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  All {selectedCategory}s
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {categoryStats[selectedCategory].stats
                    .slice(0, 5)
                    .map((stat) => (
                      <div
                        key={stat.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-600">{stat.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            {stat.count} pts
                          </span>
                          {stat.medianValue !== null && (
                            <span className="font-medium">
                              {stat.medianValue.toFixed(1)} {unit}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
        </div>
      </div>
    );
  },
);
ZoneTooltip.displayName = "ZoneTooltip";

const BestNetworkLegend = React.memo(({ stats, providerColors, enabled }) => {
  if (!enabled || !stats || Object.keys(stats).length === 0) return null;
  const sortedProviders = Object.entries(stats).sort(
    (a, b) => b[1].locationsWon - a[1].locationsWon,
  );
  const totalZones = sortedProviders.reduce(
    (sum, [, d]) => sum + d.locationsWon,
    0,
  );

  return (
    <div className="absolute bottom-4 left-4 z-[500] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 min-w-[220px] max-w-[280px]">
      <div className="font-bold text-sm mb-2 text-gray-800 border-b pb-2 flex items-center gap-2">
        <span>Best Network by Zone</span>
      </div>
      <div className="space-y-1.5">
        {sortedProviders.map(([provider, data]) => (
          <div key={provider} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{
                  backgroundColor:
                    data.color ||
                    providerColors?.[provider] ||
                    getProviderColor(provider),
                }}
              />
              <span className="text-sm font-medium text-gray-700">
                {provider}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {data.locationsWon}/{totalZones}
              </span>
              <span className="text-xs font-bold text-gray-800 min-w-[40px] text-right">
                {data.percentage?.toFixed(0) || 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t text-[10px] text-gray-400 text-center">
        Based on weighted composite score
      </div>
    </div>
  );
});
BestNetworkLegend.displayName = "BestNetworkLegend";

// --- Main Component ---

const UnifiedMapView = () => {
  // ... (State hooks remain exactly the same) ...
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSideOpen, setIsSideOpen] = useState(false);
  const [shouldRenderSidebar, setShouldRenderSidebar] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsActiveTab, setAnalyticsActiveTab] = useState("overview");
  const [selectedMetric, setSelectedMetricState] = useState("rsrp");
  const setSelectedMetric = useCallback((nextMetric) => {
    setSelectedMetricState((prevMetric) => {
      const resolvedMetric =
        typeof nextMetric === "function" ? nextMetric(prevMetric) : nextMetric;
      return normalizeMetric(resolvedMetric);
    });
  }, []);
  const [viewport, setViewport] = useState(null);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [mapCenterFallback, setMapCenterFallback] = useState(DEFAULT_CENTER);
  const [isZoomLocked, setIsZoomLocked] = useState(false);
  const [colorBy, setColorBy] = useState(null);
  const [highlightedLogs, setHighlightedLogs] = useState(null);

  const [enableDataToggle, setEnableDataToggle] = useState(true);
  const [dataToggle, setDataToggle] = useState("sample");
  const isSampleMode = enableDataToggle && dataToggle === "sample";
  const [enableSiteToggle, setEnableSiteToggle] = useState(false);
  const [siteToggle, setSiteToggle] = useState("Cell");
  const [sitePredictionVersion, setSitePredictionVersion] = useState("original");
  const [modeMethod, setModeMethod] = useState("Operator");
  const [showSiteMarkers, setShowSiteMarkers] = useState(true);
  const [showSiteSectors, setShowSiteSectors] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [showSubSession, setShowSubSession] = useState(false);
  const [selectedSubSessionTarget, setSelectedSubSessionTarget] = useState(null);

  const [showPolygons, setShowPolygons] = useState(false);
  const [polygonSource, setPolygonSource] = useState("map");
  const [onlyInsidePolygons] = useState(true);
  const [areaEnabled, setAreaEnabled] = useState(false);
  const [coverageViolationThreshold, setCoverageViolationThreshold] =
    useState(null);

  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [dominanceThreshold, setDominanceThreshold] = useState(null);
  const [hoveredCellId, setHoveredCellId] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);
  const [selectedSites, setSelectedSites] = useState([]);
  const [sectorPredictionGridPoints, setSectorPredictionGridPoints] = useState([]);

  const [ui, setUi] = useState({
    basemapStyle: "roadmap",
    drawEnabled: false,
    shapeMode: "polygon",
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
  });

  const [drawnPoints, setDrawnPoints] = useState(null);
  const [drawnShapeAnalytics, setDrawnShapeAnalytics] = useState([]);
  const [legendFilter, setLegendFilter] = useState(null);
  const [opacity, setOpacity] = useState(0.8);
  const [logRadius, setLogRadius] = useState(10);
  const [neighborSquareSize, setNeighborSquareSize] = useState(4);
  const [triangleScaleMultiplier, setTriangleScaleMultiplier] = useState(1);
  const [showSessionNeighbors, setShowSessionNeighbors] = useState(true);

  const [bestNetworkEnabled, setBestNetworkEnabled] = useState(false);
  const [bestNetworkWeights, setBestNetworkWeights] = useState(DEFAULT_WEIGHTS);
  const [bestNetworkOptions, setBestNetworkOptions] = useState({
    gridSize: 0.0005,
    minSamples: 3,
    minMetrics: 2,
    removeOutliersEnabled: true,
    calculationMethod: "median",
    percentileValue: 50,
    outlierMultiplier: 1.5,
  });

  const [coverageHoleFilters, setCoverageHoleFilters] = useState(
    DEFAULT_COVERAGE_FILTERS,
  );
  const [dataFilters, setDataFilters] = useState(DEFAULT_DATA_FILTERS);
  const [enableGrid, setEnableGrid] = useState(false);
  const [gridSizeMeters, setGridSizeMeters] = useState(20);
  const [gridCellStats, setGridCellStats] = useState({ total: 0, populated: 0 });
  const [lteGridEnabled, setLteGridEnabled] = useState(false);
  const [lteGridSizeMeters, setLteGridSizeMeters] = useState(50);
  const [lteGridAggregationMethod, setLteGridAggregationMethod] =
    useState("median");
  const [storedGridMetricMode, setStoredGridMetricMode] = useState("max");
  const [deltaGridScope, setDeltaGridScope] = useState("selected");
  const [deltaGridApiState, setDeltaGridApiState] = useState({
    computing: false,
    fetching: false,
    gridVisible: false,
    firstFetchDone: false,
    requestedGridSize: null,
    gridSizeMeters: null,
    lastStatus: "idle",
    lastMessage: "",
    lastError: "",
    gridsCount: 0,
    grids: [],
    lastUpdatedAt: null,
  });
  const [mlGridEnabled, setMlGridEnabled] = useState(false);
  const [mlGridSize, setMlGridSize] = useState(50);
  const [mlGridAggregation, setMlGridAggregation] = useState("mean");
  const [durationTime, setDurationTime] = useState([]);
  const [techHandOver, setTechHandOver] = useState(false);
  const [bandHandover, setBandHandover] = useState(false);
  const [pciHandover, setPciHandover] = useState(false);
  const [showNumCells, setShowNumCells] = useState(false);
  const [indoor, setIndoor] = useState([]);
  const [outdoor, setOutdoor] = useState([]);
  const [distance, setDistance] = useState(null);
  const [pciDistData, setPciDistData] = useState(null);
  const [pciThreshold, setPciThreshold] = useState(0);
  const [dominanceData, setDominanceData] = useState([]);
  const [manualSiteData, setManualSiteData] = useState([]);
  const [manualSiteLoading, setManualSiteLoading] = useState(false);

  useEffect(() => {
    if (isSideOpen) {
      setShouldRenderSidebar(true);
    }
  }, [isSideOpen]);

  useEffect(() => {
    if (!enableSiteToggle) {
      setManualSiteData([]);
      setSelectedSites([]);
    }
  }, [enableSiteToggle]);

  useEffect(() => {
    if (!enableDataToggle) {
      setShowSessionNeighbors(false);
    }
  }, [enableDataToggle]);

  useEffect(() => {
    if (!showSubSession) {
      setSelectedSubSessionTarget(null);
    }
  }, [showSubSession]);

  useEffect(() => {
    if (!techHandOver) {
      clearHandoverPolylines("technology");
    }
  }, [techHandOver]);

  useEffect(() => {
    if (!bandHandover) {
      clearHandoverPolylines("band");
    }
  }, [bandHandover]);

  useEffect(() => {
    if (!pciHandover) {
      clearHandoverPolylines("pci");
    }
  }, [pciHandover]);

  useEffect(() => {
    return () => {
      clearHandoverPolylines();
    };
  }, []);

  // ... (All existing useEffects and handlers remain exactly the same) ...
  const handleSitesLoaded = useCallback((data, isLoading) => {
    setManualSiteData(data);
    setManualSiteLoading(isLoading);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setSelectedMetric((currentMetric) => {
      if (!isSampleMode) {
        if (
          currentMetric === "dominance" ||
          currentMetric === "coverage_violation"
        ) {
          return "rsrp";
        }
        return currentMetric;
      }

      if (dominanceThreshold !== null) {
        return "dominance";
      } else if (coverageViolationThreshold !== null) {
        return "coverage_violation";
      } else if (
        currentMetric === "dominance" ||
        currentMetric === "coverage_violation"
      ) {
        // Revert to default RSRP only if we just turned off dominance/violation
        return "rsrp";
      }
      return currentMetric;
    });
  }, [
    isSampleMode,
    dominanceThreshold,
    coverageViolationThreshold,
  ]);

  const [dominanceSettings, setDominanceSettings] = useState({
    enabled: false,
    threshold: 6,
    showOverlap: false,
    showCoverageViolation: false,
  });

  const mapRef = useRef(null);
  const viewportRef = useRef(null);
  const zoomLockEnabledRef = useRef(false);
  const lockedZoomRef = useRef(null);
  const pciDistributionRequestRef = useRef(0);
  const dominanceRequestRef = useRef(0);
  const hoverRafRef = useRef(null);
  const pendingHoverLogRef = useRef(null);
  const lastHoverIdentityRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(hoverRafRef.current);
      }
      hoverRafRef.current = null;
      pendingHoverLogRef.current = null;
      lastHoverIdentityRef.current = null;
    };
  }, []);

  useEffect(() => {
    zoomLockEnabledRef.current = Boolean(isZoomLocked);
    if (!isZoomLocked) {
      lockedZoomRef.current = null;
      return;
    }

    const currentZoom = mapRef.current?.getZoom?.();
    const lockZoom = Number.isFinite(currentZoom) ? currentZoom : mapZoom;
    lockedZoomRef.current = lockZoom;
    if (Number.isFinite(lockZoom)) {
      setMapZoom((prev) => (prev === lockZoom ? prev : lockZoom));
    }
  }, [isZoomLocked, mapZoom]);

  // --- Add Site Mode ---
  const [addSiteMode, setAddSiteMode] = useState(false);
  const [pickedLatLng, setPickedLatLng] = useState(null);
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const addSiteModeRef = useRef(false);

  // --- Handling Passed State from MultiView ---
  const passedState = location.state;
  const passedLocations = passedState?.locations;
  const passedNeighbors = passedState?.neighborData;
  const passedProject = passedState?.project;
  const hasPassedLocations =
    Array.isArray(passedLocations) && passedLocations.length > 0;
  const hasPassedNeighbors =
    Array.isArray(passedNeighbors) && passedNeighbors.length > 0;

  const [project, setProject] = useState(passedProject || null);

  const projectGridSizeMeters = useMemo(() => {
    const raw =
      project?.grid_size ??
      project?.gridSize ??
      project?.GridSize ??
      passedProject?.grid_size ??
      passedProject?.gridSize ??
      passedProject?.GridSize;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(5, Math.round(parsed));
  }, [project, passedProject]);

  const projectId = useMemo(() => {
    const param = searchParams.get("project_id") ?? searchParams.get("project");
    return param ? Number(param) : null;
  }, [searchParams]);

  const querySessionParam = useMemo(() => {
    for (const key of SESSION_QUERY_KEYS) {
      const value = searchParams.get(key);
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    for (const [key, value] of searchParams.entries()) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (key.toLowerCase().includes("session")) {
        return value.trim();
      }
    }

    return "";
  }, [searchParams]);

  const stateSessionParam = useMemo(() => {
    return (
      toSessionCsv(passedState?.sessionIds) ||
      toSessionCsv(passedState?.session_ids) ||
      toSessionCsv(passedState?.sessionId) ||
      toSessionCsv(passedState?.session)
    );
  }, [passedState]);

  const projectSessionParam = useMemo(() => {
    return (
      toSessionCsv(project?.ref_session_id) ||
      toSessionCsv(project?.session_ids) ||
      toSessionCsv(project?.sessionIds) ||
      toSessionCsv(project?.SessionIds) ||
      toSessionCsv(passedProject?.ref_session_id) ||
      toSessionCsv(passedProject?.session_ids) ||
      toSessionCsv(passedProject?.sessionIds) ||
      toSessionCsv(passedProject?.SessionIds)
    );
  }, [project, passedProject]);

  useEffect(() => {
    if (passedProject?.id == null) return;
    upsertProjectInProjectsCache(passedProject);
  }, [passedProject]);

  useEffect(() => {
    if (!projectId || project?.id != null) return;
    const cachedProject = findProjectInProjectsCache(projectId);
    if (cachedProject) {
      setProject(cachedProject);
    }
  }, [projectId, project?.id]);

  useEffect(() => {
    if (project?.id == null) return;
    upsertProjectInProjectsCache(project);
  }, [project]);

  useEffect(() => {
    if (!Number.isFinite(projectGridSizeMeters) || projectGridSizeMeters <= 0) {
      return;
    }
    setLteGridSizeMeters((prev) =>
      Math.abs((Number(prev) || 0) - projectGridSizeMeters) < 0.001
        ? prev
        : projectGridSizeMeters,
    );
    setGridSizeMeters((prev) =>
      Math.abs((Number(prev) || 0) - projectGridSizeMeters) < 0.001
        ? prev
        : projectGridSizeMeters,
    );
  }, [projectGridSizeMeters]);

  useEffect(() => {
    if (!projectId || projectSessionParam) return;

    let active = true;
    const fetchProjectForSessions = async () => {
      const cachedProject = findProjectInProjectsCache(projectId);
      if (cachedProject && active) {
        setProject((prev) => {
          if (Number(prev?.id) === Number(cachedProject.id)) return prev;
          return cachedProject;
        });
        const cachedCsv =
          toSessionCsv(cachedProject?.ref_session_id) ||
          toSessionCsv(cachedProject?.session_ids) ||
          toSessionCsv(cachedProject?.sessionIds) ||
          toSessionCsv(cachedProject?.SessionIds);
        if (cachedCsv) return;
      }

      try {
        const response = await mapViewApi.getProjects();
        const projects = response?.Data || [];
        if (!Array.isArray(projects) || !active) return;
        writeProjectsListCache(projects);
        const matchedProject = projects.find((p) => Number(p?.id) === Number(projectId));
        if (!matchedProject) return;

        setProject((prev) => {
          if (Number(prev?.id) === Number(matchedProject.id)) return prev;
          return matchedProject;
        });

        const nextCsv =
          toSessionCsv(matchedProject?.ref_session_id) ||
          toSessionCsv(matchedProject?.session_ids) ||
          toSessionCsv(matchedProject?.sessionIds) ||
          toSessionCsv(matchedProject?.SessionIds);
        if (!nextCsv || !active) return;
      } catch (error) {
        console.warn("[UnifiedMap] Could not resolve project sessions", {
          projectId,
          message: error?.message || String(error),
        });
      }
    };

    fetchProjectForSessions();
    return () => {
      active = false;
    };
  }, [projectId, projectSessionParam]);

  const fallbackSessionParam = useMemo(
    () => stateSessionParam || projectSessionParam || "",
    [stateSessionParam, projectSessionParam],
  );

  const inferredSessionIdsFromPassedLogs = useMemo(() => {
    if (!hasPassedLocations) return [];
    const ids = new Set();
    for (const loc of passedLocations || EMPTY_LIST) {
      const raw =
        loc?.session_id ??
        loc?.sessionId ??
        loc?.session ??
        loc?.sessionID;
      const id = String(raw ?? "").trim();
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [hasPassedLocations, passedLocations]);

  const sessionIds = useMemo(() => {
    const explicit = parseSessionIds(querySessionParam || fallbackSessionParam);
    if (explicit.length > 0) return explicit;
    if (inferredSessionIdsFromPassedLogs.length > 0) {
      return inferredSessionIdsFromPassedLogs;
    }
    return [];
  }, [querySessionParam, fallbackSessionParam, inferredSessionIdsFromPassedLogs]);
  const sessionKey = useMemo(() => sessionIds.join(","), [sessionIds]);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const {
    thresholds: baseThresholds,
    getMetricColor: getMetricColorForLog,
    refetch: refetchColors,
  } = useColorForLog();
  // Always load polygons when a project is open so boundary always draws and polygon-based filtering works
  const shouldLoadProjectPolygons = Boolean(projectId);
  const {
    polygons,
    loading: polygonLoading,
    refetch: refetchPolygons,
  } = useProjectPolygons(projectId, shouldLoadProjectPolygons, polygonSource);

  // ✅ 5. Use Area Polygons Hook
  const {
    areaData, // The hook now returns data from areaBreakdownApi
    loading: areaLoading,
    refetch: refetchAreaPolygons,
  } = useAreaPolygons(projectId, areaEnabled);

  const rawFilteringPolygons = useMemo(
    () => [
      ...(polygons ? polygons : []),
      ...(areaEnabled && areaData ? areaData : []),
    ],
    [polygons, areaEnabled, areaData],
  );
  const hasFilteringPolygons = rawFilteringPolygons.length > 0;
  const filteringPolygonChecker = useMemo(
    () =>
      rawFilteringPolygons?.length
        ? new FastPolygonChecker(rawFilteringPolygons)
        : null,
    [rawFilteringPolygons],
  );
  const siteLayerPolygonFiltering = Boolean(enableSiteToggle && rawFilteringPolygons.length > 0);

  const shouldFetchSamples =
    isSampleMode && sessionIds.length > 0 && !hasPassedLocations;

  const {
    locations: fetchedSamples,
    appSummary,
    inpSummary,
    tptVolume,
    loading: sampleLoading,
    progress: sampleProgress,
    error: sampleError,
    refetch: refetchSample,
  } = useNetworkSamples(
    sessionIds,
    shouldFetchSamples,
    false,
    EMPTY_POLYGONS,
  );

  // Prefer live fetched data whenever sample fetch is enabled.
  const sampleLocations = shouldFetchSamples
    ? (fetchedSamples || EMPTY_LIST)
    : (hasPassedLocations ? passedLocations : fetchedSamples);

  const isDataPredictionMode = enableDataToggle && dataToggle === "prediction";
  const isSitePredictionMode =
    enableSiteToggle && siteToggle === "sites-prediction";
  const shouldFetchPredictionLogs = isDataPredictionMode || isSitePredictionMode;
  const isCellSiteGridMode =
    Boolean(enableSiteToggle) &&
    String(siteToggle || "").toLowerCase() === "cell";
  const isDeltaSiteGridMode =
    isCellSiteGridMode &&
    String(sitePredictionVersion || "").trim().toLowerCase() === "delta";
  const lteGridAvailable =
    Boolean(enableSiteToggle) &&
    (selectedSites.length > 0 || sectorPredictionGridPoints.length > 0 || isCellSiteGridMode);
  const shouldFetchLtePrediction =
    Boolean(enableSiteToggle && selectedSites.length > 0);
  const isDeltaGridCompleteMode =
    isDeltaSiteGridMode &&
    String(deltaGridScope || "").trim().toLowerCase() === "complete";

  useEffect(() => {
    if (!lteGridAvailable && lteGridEnabled) {
      setLteGridEnabled(false);
    }
  }, [lteGridAvailable, lteGridEnabled]);

  useEffect(() => {
    if (!isCellSiteGridMode || !lteGridAvailable) return;
    if (!lteGridEnabled) {
      setLteGridEnabled(true);
    }
  }, [isCellSiteGridMode, lteGridAvailable, lteGridEnabled]);

  useEffect(() => {
    if (!isDeltaSiteGridMode && deltaGridScope !== "selected") {
      setDeltaGridScope("selected");
    }
  }, [isDeltaSiteGridMode, deltaGridScope]);

  useEffect(() => {
    if (!isDeltaGridCompleteMode || !lteGridEnabled) return;
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("map:selectAllSectors"));
  }, [isDeltaGridCompleteMode, lteGridEnabled]);

  const handleDeltaGridFetchStored = useCallback(async () => {
    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a valid project before fetching grid analytics.");
      return false;
    }

    const requestedGridSize = Math.max(5, Number(lteGridSizeMeters) || 50);
    setDeltaGridApiState((prev) => ({
      ...prev,
      fetching: true,
      lastStatus: "fetching",
      lastError: "",
      lastMessage: "",
      requestedGridSize,
    }));

    try {
      const response = await gridAnalyticsApi.getGridAnalytics({
        projectId: numericProjectId,
      });
      const root =
        response?.data && typeof response.data === "object" ? response.data : response || {};
      const data =
        root?.Data && typeof root.Data === "object"
          ? root.Data
          : root?.data && typeof root.data === "object"
            ? root.data
            : null;
      const gridsCount = Array.isArray(data?.grids)
        ? data.grids.length
        : Number(data?.total_grids_with_data) || 0;
      const grids = Array.isArray(data?.grids) ? data.grids : [];
      const fetchedGridSize =
        Number(data?.grid_size_meters ?? data?.gridSizeMeters) || requestedGridSize;
      const message = String(root?.Message ?? root?.message ?? "Grid analytics fetched.").trim();

      setDeltaGridApiState((prev) => ({
        ...prev,
        fetching: false,
        firstFetchDone: true,
        lastStatus: "fetched",
        lastMessage: message,
        lastError: "",
        gridsCount,
        grids,
        gridVisible: true,
        gridSizeMeters: fetchedGridSize,
        requestedGridSize,
        lastUpdatedAt: new Date().toISOString(),
      }));
      setLteGridSizeMeters((prev) =>
        Math.abs((Number(prev) || 0) - fetchedGridSize) < 0.001
          ? prev
          : fetchedGridSize,
      );
      toast.success(`Grid fetched (${fetchedGridSize}m). ${gridsCount} grid(s).`);
      return true;
    } catch (error) {
      const message =
        String(error?.message || "").trim() || "Failed to fetch stored grid analytics.";
      setDeltaGridApiState((prev) => ({
        ...prev,
        fetching: false,
        lastStatus: "error",
        lastError: message,
        lastMessage: "",
        grids: [],
        gridVisible: false,
        requestedGridSize,
        lastUpdatedAt: new Date().toISOString(),
      }));
      toast.error(message);
      return false;
    }
  }, [projectId, lteGridSizeMeters, setLteGridSizeMeters]);

  const handleDeltaGridComputeStore = useCallback(
    async ({ showGridAfterCompute = false } = {}) => {
    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a valid project before computing grid analytics.");
      return false;
    }

    const requestedGridSize = Math.max(5, Number(lteGridSizeMeters) || 50);
    const computeToastId = toast.loading(`Computing grid (${requestedGridSize}m)...`);
    setDeltaGridApiState((prev) => ({
      ...prev,
      computing: true,
      lastStatus: "computing",
      lastError: "",
      lastMessage: "",
      requestedGridSize,
      gridVisible: false,
    }));

    try {
      const response = await gridAnalyticsApi.computeAndStoreGridAnalytics({
        projectId: numericProjectId,
        gridSize: requestedGridSize,
      });
      const root =
        response?.data && typeof response.data === "object" ? response.data : response || {};
      const data =
        root?.Data && typeof root.Data === "object"
          ? root.Data
          : root?.data && typeof root.data === "object"
            ? root.data
            : null;
      const gridsCount = Number(data?.total_grids_with_data);
      const resolvedCount = Number.isFinite(gridsCount)
        ? gridsCount
        : Array.isArray(data?.grids)
          ? data.grids.length
          : 0;
      const grids = Array.isArray(data?.grids) ? data.grids : [];
      const message = String(
        root?.Message ?? root?.message ?? "Grid analytics computed and stored.",
      ).trim();
      const gridVisible = Boolean(showGridAfterCompute) && grids.length > 0;

      setDeltaGridApiState((prev) => ({
        ...prev,
        computing: false,
        firstFetchDone: true,
        lastStatus: showGridAfterCompute ? "fetched" : "computed",
        lastMessage: message,
        lastError: "",
        gridsCount: resolvedCount,
        grids: showGridAfterCompute ? grids : [],
        gridVisible,
        gridSizeMeters: requestedGridSize,
        requestedGridSize,
        lastUpdatedAt: new Date().toISOString(),
      }));
      setProject((prevProject) => {
        if (!prevProject) return prevProject;
        const prevSize = Number(
          prevProject?.grid_size ?? prevProject?.gridSize ?? prevProject?.GridSize,
        );
        if (Number.isFinite(prevSize) && Math.abs(prevSize - requestedGridSize) < 0.001) {
          return prevProject;
        }
          return { ...prevProject, grid_size: String(requestedGridSize) };
      });
      toast.update(computeToastId, {
        render: showGridAfterCompute
          ? `Grid computed (${requestedGridSize}m) and shown. ${resolvedCount} grid(s).`
          : `Grid computed (${requestedGridSize}m). ${resolvedCount} grid(s) ready.`,
        type: "success",
        isLoading: false,
        autoClose: 2800,
      });
      return true;
    } catch (error) {
      const message =
        String(error?.message || "").trim() || "Failed to compute/store grid analytics.";
      setDeltaGridApiState((prev) => ({
        ...prev,
        computing: false,
        lastStatus: "error",
        lastError: message,
        lastMessage: "",
        grids: [],
        gridVisible: false,
        requestedGridSize,
        lastUpdatedAt: new Date().toISOString(),
      }));
      toast.update(computeToastId, {
        render: message,
        type: "error",
        isLoading: false,
        autoClose: 3600,
      });
      return false;
    }
  }, [projectId, lteGridSizeMeters, setProject]);

  const handleDeltaGridManualFetch = useCallback(async () => {
    if (deltaGridApiState?.computing || deltaGridApiState?.fetching) return false;

    if (Boolean(deltaGridApiState?.gridVisible)) {
      setDeltaGridApiState((prev) => ({
        ...prev,
        gridVisible: false,
        lastStatus: "idle",
        lastMessage: "",
        lastError: "",
        grids: [],
        gridsCount: 0,
        lastUpdatedAt: new Date().toISOString(),
      }));
      toast.info("Stored grid hidden.");
      return true;
    }
    return handleDeltaGridFetchStored();
  }, [
    deltaGridApiState?.computing,
    deltaGridApiState?.fetching,
    deltaGridApiState?.gridVisible,
    handleDeltaGridFetchStored,
  ]);

  const storedDeltaGridCells = useMemo(() => {
    if (!isCellSiteGridMode) return [];
    if (!Boolean(deltaGridApiState?.gridVisible)) return [];
    const rows = Array.isArray(deltaGridApiState?.grids) ? deltaGridApiState.grids : [];
    if (rows.length === 0) return [];

    const metricKey = String(selectedMetric || "rsrp").trim().toLowerCase();
    const normalizedStoredGridMetricMode = String(storedGridMetricMode || "max")
      .trim()
      .toLowerCase();
    const metricMode =
      normalizedStoredGridMetricMode === "avg" ||
      normalizedStoredGridMetricMode === "median" ||
      normalizedStoredGridMetricMode === "max" ||
      normalizedStoredGridMetricMode === "min"
        ? normalizedStoredGridMetricMode
        : "max";
    const isBestOperatorGridMode = normalizedStoredGridMetricMode === "best_operator";
    const bestOperatorMode = metricMode === "median" ? "avg" : metricMode;
    const normalizedVersion = String(sitePredictionVersion || "").trim().toLowerCase();
    const isDeltaView = normalizedVersion === "delta";
    const isOptimizedView =
      normalizedVersion === "updated" ||
      normalizedVersion === "optimized" ||
      normalizedVersion === "optimised";
    const hasDeltaThresholds =
      Array.isArray(baseThresholds?.delta) && baseThresholds.delta.length > 0;

    const pickDiffValue = (row = {}) => {
      const diff = row?.difference || {};
      if (metricKey === "rsrq") {
        return toFiniteNumber(diff?.[`diff_${metricMode}_rsrq`]);
      }
      if (metricKey === "sinr" || metricKey === "snr") {
        return toFiniteNumber(diff?.[`diff_${metricMode}_sinr`]);
      }
      return toFiniteNumber(diff?.[`diff_${metricMode}_rsrp`]);
    };

    const pickBaselineAvg = (row = {}) => {
      const base = row?.baseline || {};
      if (metricKey === "rsrq") return toFiniteNumber(base?.[`${metricMode}_rsrq`]);
      if (metricKey === "sinr" || metricKey === "snr") return toFiniteNumber(base?.[`${metricMode}_sinr`]);
      return toFiniteNumber(base?.[`${metricMode}_rsrp`]);
    };

    const pickOptimizedAvg = (row = {}) => {
      const opt = row?.optimized || {};
      if (metricKey === "rsrq") return toFiniteNumber(opt?.[`${metricMode}_rsrq`]);
      if (metricKey === "sinr" || metricKey === "snr") return toFiniteNumber(opt?.[`${metricMode}_sinr`]);
      return toFiniteNumber(opt?.[`${metricMode}_rsrp`]);
    };

    const pickBestOperator = (row = {}, variant = "baseline") => {
      const source = variant === "optimized" ? row?.optimized || {} : row?.baseline || {};
      if (bestOperatorMode === "min") return String(source?.best_operator_min || "").trim() || null;
      if (bestOperatorMode === "max") return String(source?.best_operator_max || "").trim() || null;
      return String(source?.best_operator_avg || "").trim() || null;
    };

    const resolveGridColor = (value, metricName, isDeltaMetric) => {
      if (Number.isFinite(value) && typeof getMetricColorForLog === "function") {
        const color = getMetricColorForLog(value, metricName);
        if (color && color !== "#808080") {
          return hexToRgbaArray(color, 190);
        }
      }

      if (isDeltaMetric && Number.isFinite(value) && !hasDeltaThresholds) {
        if (value > 0) return [22, 163, 74, 190];
        if (value < 0) return [220, 38, 38, 190];
      }
      return [107, 114, 128, 190];
    };

    return rows
      .map((row, idx) => {
        const minLat = Number(row?.min_lat);
        const minLon = Number(row?.min_lon);
        const maxLat = Number(row?.max_lat);
        const maxLon = Number(row?.max_lon);
        const centerLat = Number(row?.center_lat);
        const centerLon = Number(row?.center_lon);
        if (
          ![minLat, minLon, maxLat, maxLon, centerLat, centerLon].every(Number.isFinite)
        ) {
          return null;
        }

        const baselineAvg = pickBaselineAvg(row);
        const optimizedAvg = pickOptimizedAvg(row);
        const difference = pickDiffValue(row);
        const baselineBestOperator = pickBestOperator(row, "baseline");
        const optimizedBestOperator = pickBestOperator(row, "optimized");
        const resolvedBestOperator = isOptimizedView
          ? optimizedBestOperator
          : baselineBestOperator;

        const displayValue = isDeltaView
          ? Number.isFinite(difference)
            ? difference
            : null
          : isOptimizedView
            ? Number.isFinite(optimizedAvg)
              ? optimizedAvg
              : null
            : Number.isFinite(baselineAvg)
              ? baselineAvg
              : null;

        const rawBestOperator = String(resolvedBestOperator || "").trim();
        const normalizedBestOperator = normalizeProviderName(rawBestOperator) || null;
        const providerLabel = normalizedBestOperator || "Unknown";
        const color = isBestOperatorGridMode
          ? normalizedBestOperator
            ? hexToRgbaArray(getProviderColor(normalizedBestOperator), 190)
            : hexToRgbaArray(generateColorFromHash(providerLabel), 190)
          : resolveGridColor(
            displayValue,
            isDeltaView ? "delta" : selectedMetric,
            isDeltaView,
          );

        return {
          kind: "grid",
          id: String(row?.grid_id || `stored-grid-${idx}`),
          polygon: [
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
          ],
          value: Number.isFinite(displayValue) ? displayValue : null,
          pointCount:
            Number(row?.baseline?.point_count || 0) + Number(row?.optimized?.point_count || 0),
          sampleCount:
            Number(row?.baseline?.point_count || 0) + Number(row?.optimized?.point_count || 0),
          deltaCompare: isDeltaView,
          baselineAvg: Number.isFinite(baselineAvg) ? baselineAvg : null,
          optimizedAvg: Number.isFinite(optimizedAvg) ? optimizedAvg : null,
          difference: Number.isFinite(difference) ? difference : null,
          baselinePointCount: Number(row?.baseline?.point_count || 0),
          optimizedPointCount: Number(row?.optimized?.point_count || 0),
          baselineSampleCount: Number(row?.baseline?.point_count || 0),
          optimizedSampleCount: Number(row?.optimized?.point_count || 0),
          bestOperatorMode,
          baselineBestOperator,
          optimizedBestOperator,
          bestOperator: providerLabel,
          provider: providerLabel,
          lat: centerLat,
          lng: centerLon,
          color,
        };
      })
      .filter(Boolean);
  }, [
    isCellSiteGridMode,
    deltaGridApiState?.gridVisible,
    deltaGridApiState?.grids,
    selectedMetric,
    storedGridMetricMode,
    sitePredictionVersion,
    baseThresholds,
    getMetricColorForLog,
  ]);

  const isFetchedStoredGridVisible = useMemo(
    () =>
      Boolean(isCellSiteGridMode) &&
      Boolean(deltaGridApiState?.gridVisible) &&
      storedDeltaGridCells.length > 0,
    [isCellSiteGridMode, deltaGridApiState?.gridVisible, storedDeltaGridCells.length],
  );
  const isStoredGridOverlayVisible = useMemo(
    () => Boolean(isFetchedStoredGridVisible) && !enableGrid,
    [isFetchedStoredGridVisible, enableGrid],
  );

  // ✅ 2. Use Prediction Data Hook
  const {
    locations: predictionLocations,
    colorSettings: predictionColorSettings,
    loading: predictionLoading,
    error: predictionError,
    refetch: refetchPrediction,
  } = usePredictionData(
    projectId,
    selectedMetric,
    shouldFetchPredictionLogs,
  );

  // ✅ 2b. Use LTE Prediction Hook
  const {
    locations: ltePredictionLocations,
    loading: ltePredictionLoading,
  } = useLtePrediction({
    projectId,
    siteId: selectedSites.join(","),
    metric: selectedMetric,
    sitePredictionVersion,
    enabled: shouldFetchLtePrediction,
    filterEnabled: false,
    polygons: EMPTY_POLYGONS,
  });

  // ✅ 3. Use Session Neighbors Hook
  const shouldFetchNeighbors = !hasPassedNeighbors && showSessionNeighbors;

  const {
    neighborData: fetchedNeighbors,
    stats: sessionNeighborStats,
    loading: sessionNeighborLoading,
    error: sessionNeighborError,
    refetch: refetchSessionNeighbors,
  } = useSessionNeighbors(
    sessionIds,
    shouldFetchNeighbors,
    false,
    EMPTY_POLYGONS,
  );

  const sessionNeighborData = hasPassedNeighbors
    ? passedNeighbors
    : fetchedNeighbors;

  const ioFallbackFromLogs = useMemo(
    () => buildIndoorOutdoorFromLogs(sampleLocations || EMPTY_LIST),
    [sampleLocations],
  );

  const {
    sessions: subSessionData,
    summary: subSessionSummary,
    requestedSessionIds: subSessionRequestedIds,
    markers: subSessionMarkers,
    loading: subSessionLoading,
    refetch: refetchSubSessionAnalytics,
  } = useSubSessionAnalytics(sessionIds, showSubSession);

  useEffect(() => {
    if (!isSampleMode || sessionIds.length > 0) return;
    console.warn(
      "[UnifiedMap] Sample mode is active but no session IDs were resolved from URL/state/project. Sample and PCI APIs will not be called.",
      {
        querySessionParam,
        querySessionPairs: Array.from(searchParams.entries()).filter(([k, v]) =>
          k.toLowerCase().includes("session") && String(v ?? "").trim(),
        ),
        stateSessionParam,
        projectSessionParam,
        fallbackSessionParam,
      },
    );
  }, [
    isSampleMode,
    sessionIds,
    searchParams,
    querySessionParam,
    stateSessionParam,
    projectSessionParam,
    fallbackSessionParam,
  ]);

  // ✅ 6. Use Site Data (Existing)
  const {
    siteData: rawSiteData,
    loading: siteLoading,
    error: siteError,
    refetch: refetchSites,
  } = useSiteData({
    enableSiteToggle,
    siteToggle,
    sitePredictionVersion,
    projectId,
    sessionIds,
    autoFetch: true,
    filterEnabled: false,
    polygons: EMPTY_POLYGONS,
  });

  const siteData = rawSiteData || [];
  const {
    allNeighbors: rawAllNeighbors,
    stats: neighborStats,
    loading: neighborLoading,
    refetch: refetchNeighbors,
  } = useNeighborCollisions({
    sessionIds,
    enabled: showNeighbors,
  });

  const allNeighbors = rawAllNeighbors || [];

  // Effect hooks for duration, distance, and IO — each with active guards to prevent stale state updates
  useEffect(() => {
    if (!sessionIds?.length) return;
    let active = true;
    const fetchDuration = async () => {
      try {
        const res = await mapViewApi.getDuration({
          sessionIds: sessionIds.join(","),
        });
        if (!active) return;
        const dataArray = res?.Data || res?.data?.data || res?.data || [];
        if (Array.isArray(dataArray)) {
          setDurationTime(
            dataArray.map((item) => ({
              provider: normalizeProviderName(item.Provider || item.provider || ""),
              networkType: normalizeTechName(item.Network || item.network || ""),
              totaltime: item.TotalDurationHours
                ? `${item.TotalDurationHours.toFixed(2)} hrs`
                : item.timeReadable || "0s",
            })),
          );
        }
      } catch (err) {
        if (active) console.error("Failed to fetch duration data", err);
      }
    };
    fetchDuration();
    return () => { active = false; };
  }, [sessionIds]);

  useEffect(() => {
    if (!sessionIds?.length) return;
    let active = true;
    const fetchDistance = async () => {
      try {
        const res = await mapViewApi.getDistanceSession({
          sessionIds: sessionIds.join(","),
        });
        if (active) setDistance(res?.TotalDistanceKm || null);
      } catch (error) { }
    };
    fetchDistance();
    return () => { active = false; };
  }, [sessionIds]);

  useEffect(() => {
    if (!sessionIds?.length) {
      setIndoor([]);
      setOutdoor([]);
      return;
    }
    let active = true;
    const fetchIO = async () => {
      try {
        const sessionCsv = sessionIds.join(",");
        const res = await mapViewApi.getIOAnalysis({
          sessionIds: sessionCsv,
          session_ids: sessionCsv,
          session_Ids: sessionCsv,
          sessionId: sessionCsv,
        });

        const payload =
          res?.Data && typeof res.Data === "object"
            ? res.Data
            : res?.data && typeof res.data === "object"
              ? res.data
              : res;

        const indoorRows = Array.isArray(payload?.Indoor)
          ? payload.Indoor
          : Array.isArray(payload?.indoor)
            ? payload.indoor
            : [];
        const outdoorRows = Array.isArray(payload?.Outdoor)
          ? payload.Outdoor
          : Array.isArray(payload?.outdoor)
            ? payload.outdoor
            : [];

        if (active) {
          setIndoor(indoorRows);
          setOutdoor(outdoorRows);
        }
      } catch (error) {
        if (active) {
          setIndoor([]);
          setOutdoor([]);
        }
      }
    };
    fetchIO();
    return () => { active = false; };
  }, [sessionIds]);

  useEffect(() => {
    const hasIoApiData = (indoor?.length || 0) > 0 || (outdoor?.length || 0) > 0;
    if (hasIoApiData) return;

    if (
      (ioFallbackFromLogs.indoor?.length || 0) > 0 ||
      (ioFallbackFromLogs.outdoor?.length || 0) > 0
    ) {
      setIndoor(ioFallbackFromLogs.indoor);
      setOutdoor(ioFallbackFromLogs.outdoor);
    }
  }, [indoor, outdoor, ioFallbackFromLogs]);

  useEffect(() => {
    if (!isSampleMode) {
      setPciDistData(null);
      return;
    }

    if (!sessionKey) {
      setPciDistData(null);
      return;
    }

    const currentSessionIds = sessionKey.split(",").filter(Boolean);
    let active = true;
    const requestId = ++pciDistributionRequestRef.current;

    const fetchDist = async () => {
      try {
        const data = await mapViewApi.getPciDistribution(currentSessionIds);
        if (!active || requestId !== pciDistributionRequestRef.current) return;

        if (data?.success) {
          // Store only the primary_yes data as requested
          setPciDistData(data.primary_yes || null);
        } else {
          setPciDistData(null);
        }
      } catch (error) {
        if (!active || requestId !== pciDistributionRequestRef.current) return;
        setPciDistData(null);
        console.error("Failed to fetch PCI distribution", error);
      }
    };

    fetchDist();
    return () => {
      active = false;
    };
  }, [sessionKey, isSampleMode]);

  const shouldFetchDominanceDetails =
    isSampleMode &&
    Boolean(sessionKey) &&
    (dominanceThreshold !== null || coverageViolationThreshold !== null);

  const refetchDominanceDetails = useCallback(async () => {
    if (!isSampleMode) {
      setDominanceData([]);
      return;
    }

    if (!sessionKey) {
      setDominanceData([]);
      return;
    }

    const currentSessionIds = sessionKey.split(",").filter(Boolean);
    const requestId = ++dominanceRequestRef.current;

    try {
      const res = await mapViewApi.getDominanceDetails(currentSessionIds);
      if (requestId !== dominanceRequestRef.current) return;

      const payload = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.Data)
          ? res.Data
          : Array.isArray(res)
            ? res
            : [];
      const isSuccess =
        res?.success === true ||
        res?.Status === 1 ||
        Array.isArray(payload);

      if (isSuccess && Array.isArray(payload) && payload.length > 0) {
        setDominanceData(payload);
      } else {
        setDominanceData([]);
      }
    } catch (err) {
      if (requestId !== dominanceRequestRef.current) return;
      setDominanceData([]);
      console.error("Failed to fetch dominance details", err);
    }
  }, [sessionKey, isSampleMode]);

  useEffect(() => {
    if (!shouldFetchDominanceDetails) {
      setDominanceData([]);
      return;
    }

    refetchDominanceDetails();
  }, [
    shouldFetchDominanceDetails,
    refetchDominanceDetails,
    isSampleMode,
    sessionKey,
  ]);

  // ... (Rest of Derived State & Computations logic is same) ...
  const pciAppearanceByKey = useMemo(() => {
    const result = new Map();
    if (!pciDistData || typeof pciDistData !== "object") return result;
    Object.entries(pciDistData).forEach(([rawPci, pciGroup]) => {
      const key = normalizeKey(rawPci);
      if (!key || !pciGroup || typeof pciGroup !== "object") return;
      const totalWeight = Object.values(pciGroup).reduce(
        (sum, value) => sum + (parseFloat(value) || 0),
        0,
      );
      result.set(key, totalWeight * 100);
    });
    return result;
  }, [pciDistData]);

  const pciRange = useMemo(() => {
    const percentages = [...pciAppearanceByKey.values()].filter((v) =>
      Number.isFinite(v),
    );
    if (!percentages.length) {
      return { min: 0, max: 100 };
    }
    const min = Math.min(...percentages);
    const max = Math.max(...percentages);
    return {
      min: Number.isFinite(min) ? Math.floor(min) : 0,
      max: Number.isFinite(max) ? Math.ceil(max) : 100,
    };
  }, [pciAppearanceByKey]);

  const locations = useMemo(() => {
    if (!enableDataToggle && !enableSiteToggle) return [];
    let mainLogs = [];
    if (enableDataToggle) {
      mainLogs =
        dataToggle === "sample"
          ? sampleLocations || []
          : predictionLocations || [];
    } else if (enableSiteToggle && siteToggle === "sites-prediction") {
      mainLogs = predictionLocations || [];
    }

    if (!onlyInsidePolygons || !hasFilteringPolygons) return mainLogs;
    if (!filteringPolygonChecker) return mainLogs;
    return filterPointsInsidePolygons(mainLogs, filteringPolygonChecker);
  }, [
    enableDataToggle,
    enableSiteToggle,
    dataToggle,
    siteToggle,
    sampleLocations,
    predictionLocations,
    onlyInsidePolygons,
    hasFilteringPolygons,
    filteringPolygonChecker,
  ]);

 
  const isLoading =
    (shouldFetchSamples && sampleLoading) ||
    predictionLoading ||
    siteLoading ||
    neighborLoading ||
    polygonLoading ||
    areaLoading ||
    (shouldFetchNeighbors && sessionNeighborLoading);

  const error = sampleError || predictionError;

  const polygonFilteredNeighborData = useMemo(() => {
    const data = sessionNeighborData || [];
    if (!onlyInsidePolygons || !hasFilteringPolygons) return data;
    if (!filteringPolygonChecker) return data;
    return filterPointsInsidePolygons(data, filteringPolygonChecker);
  }, [
    sessionNeighborData,
    onlyInsidePolygons,
    hasFilteringPolygons,
    filteringPolygonChecker,
  ]);

  const shouldUsePredictionThresholds = useMemo(() => {
    if (enableDataToggle) return dataToggle === "prediction";
    return isSitePredictionMode;
  }, [enableDataToggle, dataToggle, isSitePredictionMode]);

  const effectiveThresholds = useMemo(() => {
    if (!predictionColorSettings?.length || !shouldUsePredictionThresholds) {
      return baseThresholds;
    }

    const thresholdKey = getThresholdKey(selectedMetric);
    const normalizedPredictionThresholds = predictionColorSettings
      .map((s) => ({
        min: parseFloat(s.min),
        max: parseFloat(s.max),
        color: s.color,
      }))
      .filter((range) => Number.isFinite(range.min) && Number.isFinite(range.max))
      .sort((a, b) => a.min - b.min);

    if (!normalizedPredictionThresholds.length) return baseThresholds;

    return {
      ...baseThresholds,
      [thresholdKey]: normalizedPredictionThresholds,
    };
  }, [
    baseThresholds,
    predictionColorSettings,
    selectedMetric,
    shouldUsePredictionThresholds,
  ]);

  const {
    processedPolygons: bestNetworkPolygons,
    stats: bestNetworkStats,
    providerColors: bestNetworkProviderColors,
  } = useBestNetworkCalculation(
    locations,
    bestNetworkWeights,
    bestNetworkEnabled,
    bestNetworkOptions,
    areaData,
  );

  const availableFilterOptions = useMemo(() => {
    const providers = new Set();
    const bands = new Set();
    const technologies = new Set();

    (locations || []).forEach((loc) => {
      const providerName = normalizeProviderName(
        loc?.provider ?? loc?.Provider ?? loc?.network ?? loc?.Network ?? "",
      );
      if (providerName && !isUnknownOption(providerName)) {
        providers.add(providerName);
      }
      if (loc.band) {
        const norm = normalizeBandName(loc.band);
        if (norm && norm !== "Unknown") bands.add(norm);
      }
      const technologyName = normalizeTechName(
        loc?.technology ?? loc?.networkType ?? "",
        loc?.band,
      );
      if (technologyName && !isUnknownOption(technologyName)) {
        technologies.add(technologyName);
      }
    });

    (polygonFilteredNeighborData || []).forEach((n) => {
      const providerName = normalizeProviderName(n?.provider ?? "");
      if (providerName && !isUnknownOption(providerName)) {
        providers.add(providerName);
      }
      if (n.primaryBand) {
        const norm = normalizeBandName(n.primaryBand);
        if (norm && norm !== "Unknown") bands.add(norm);
      }
      if (n.neighbourBand) {
        const norm = normalizeBandName(n.neighbourBand);
        if (norm && norm !== "Unknown") bands.add(norm);
      }
      if (n.networkType) {
        const technologyName = normalizeTechName(
          n.networkType,
          n.neighbourBand,
        );
        if (technologyName && !isUnknownOption(technologyName)) {
          technologies.add(technologyName);
        }
      }
    });

    return {
      providers: [...providers].sort(),
      bands: [...bands].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      }),
      technologies: [...technologies].sort(),
    };
  }, [locations, polygonFilteredNeighborData]);

  const dominanceByLogId = useMemo(() => {
    if (
      dominanceThreshold === null ||
      !dominanceData ||
      !Array.isArray(dominanceData)
    ) {
      return null;
    }
    const idMap = new Map();
    const limit = Math.abs(Number(dominanceThreshold));
    if (!Number.isFinite(limit)) return null;
    dominanceData.forEach((item) => {
      const logId = normalizeKey(
        item?.LogId ?? item?.log_id ?? item?.id ?? item?.Id,
      );
      const values = Array.isArray(item?.dominance) ? item.dominance : [];
      const countInRange = values.filter((val) => {
        const num = parseFloat(val);
        return Number.isFinite(num) && num >= -limit && num <= limit;
      }).length;
      if (countInRange > 0) {
        if (logId) {
          setLookupCount(idMap, `id:${logId}`, countInRange);
        }
        const coordKey = toCoordinateKey(item?.lat, item?.lon);
        if (coordKey) {
          setLookupCount(idMap, `coord:${coordKey}`, countInRange);
        }
      }
    });
    return idMap;
  }, [dominanceData, dominanceThreshold]);

  const coverageViolationByLogId = useMemo(() => {
    if (
      coverageViolationThreshold === null ||
      !dominanceData ||
      !Array.isArray(dominanceData)
    ) {
      return null;
    }
    const start = Number(coverageViolationThreshold);
    if (!Number.isFinite(start)) return null;
    const idMap = new Map();
    dominanceData.forEach((item) => {
      const logId = normalizeKey(
        item?.LogId ?? item?.log_id ?? item?.id ?? item?.Id,
      );
      const values = Array.isArray(item?.dominance) ? item.dominance : [];
      const countInRange = values.filter((val) => {
        const num = parseFloat(val);
        return Number.isFinite(num) && num >= start && num <= 0;
      }).length;
      if (countInRange > 0) {
        if (logId) {
          setLookupCount(idMap, `id:${logId}`, countInRange);
        }
        const coordKey = toCoordinateKey(item?.lat, item?.lon);
        if (coordKey) {
          setLookupCount(idMap, `coord:${coordKey}`, countInRange);
        }
      }
    });
    return idMap;
  }, [dominanceData, coverageViolationThreshold]);

  const filteredLocations = useMemo(() => {
    let result = [...(locations || [])];
    const activeCoverageFilters = Object.entries(coverageHoleFilters).filter(
      ([, config]) => config.enabled,
    );
    if (activeCoverageFilters.length > 0) {
      result = result.filter((loc) =>
        activeCoverageFilters.every(([metric, { threshold }]) => {
          const val = parseFloat(loc[metric]);
          return !isNaN(val) && val < threshold;
        }),
      );
    }
    const { providers, bands, technologies, indoorOutdoor } = dataFilters;
    if (providers?.length)
      result = result.filter((l) => {
        const providerName = normalizeProviderName(
          l?.provider ?? l?.Provider ?? l?.network ?? l?.Network ?? "",
        );
        return providerName ? providers.includes(providerName) : false;
      });
    if (bands?.length)
      result = result.filter((l) => bands.includes(String(l.band)));
    if (technologies?.length)
      result = result.filter((l) =>
        technologies.includes(normalizeTechName(l.technology)),
      );
    if (indoorOutdoor?.length > 0) {
      const lowerFilters = indoorOutdoor.map((v) => v.toLowerCase());
      result = result.filter(
        (l) => lowerFilters.includes(formatIndoorOutdoorValue(l?.indoor_outdoor)),
      );
    }
    if (isSampleMode && pciThreshold > 0) {
      let pciLookup = pciAppearanceByKey;
      if (pciLookup.size === 0 && result.length > 0) {
        const total = result.length;
        const counts = new Map();
        result.forEach((loc) => {
          const key = getLocationPciKey(loc);
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        pciLookup = new Map();
        counts.forEach((count, key) => {
          pciLookup.set(key, (count / total) * 100);
        });
      }
      result = result.filter((loc) => {
        const logPci = getLocationPciKey(loc);
        if (!logPci) return true;
        const totalPercentage = pciLookup.get(logPci);
        if (totalPercentage !== undefined) {
          return totalPercentage >= pciThreshold;
        }
        return true;
      });
    }
    if (
      isSampleMode &&
      dominanceThreshold !== null &&
      dominanceByLogId instanceof Map
    ) {
      result = result
        .filter((loc) => {
          const count = getLookupCountForLocation(loc, dominanceByLogId);
          return Number.isFinite(count) && count > 0;
        })
        .map((loc) => ({
          ...loc,
          dominance: getLookupCountForLocation(loc, dominanceByLogId),
        }));
    }
    if (
      isSampleMode &&
      coverageViolationThreshold !== null &&
      coverageViolationByLogId instanceof Map
    ) {
      result = result
        .filter((loc) => {
          const count = getLookupCountForLocation(loc, coverageViolationByLogId);
          return Number.isFinite(count) && count > 0;
        })
        .map((loc) => ({
          ...loc,
          coverage_violation: getLookupCountForLocation(
            loc,
            coverageViolationByLogId,
          ),
        }));
    }
    return result;
  }, [
    locations,
    coverageHoleFilters,
    dataFilters,
    isSampleMode,
    pciAppearanceByKey,
    pciThreshold,
    dominanceByLogId,
    dominanceThreshold,
    coverageViolationByLogId,
    coverageViolationThreshold,
  ]);

  const finalDisplayLocations = useMemo(() => {
    let prioritized = filteredLocations;
    if (drawnPoints !== null) {
      prioritized = drawnPoints;
    } else if (Array.isArray(highlightedLogs)) {
      if (highlightedLogs.length === 0) {
        prioritized = filteredLocations;
      } else {
        const allowedKeys = new Set(
          (filteredLocations || [])
            .map(getLocationIdentityKey)
            .filter(Boolean),
        );
        prioritized = highlightedLogs.filter((loc) => {
          const key = getLocationIdentityKey(loc);
          return key ? allowedKeys.has(key) : true;
        });
      }
    }
    if (!onlyInsidePolygons || !hasFilteringPolygons) return prioritized;
    if (!filteringPolygonChecker) return prioritized;
    return filterPointsInsidePolygons(prioritized, filteringPolygonChecker);
  }, [
    drawnPoints,
    highlightedLogs,
    filteredLocations,
    onlyInsidePolygons,
    hasFilteringPolygons,
    filteringPolygonChecker,
  ]);

  const lteLayerLocations = useMemo(() => {
    const baseLocations = Array.isArray(ltePredictionLocations)
      ? ltePredictionLocations
      : EMPTY_LIST;
    const sectorPoints = Array.isArray(sectorPredictionGridPoints)
      ? sectorPredictionGridPoints
      : EMPTY_LIST;

    if (isDataPredictionMode) return finalDisplayLocations || EMPTY_LIST;

    if (isDeltaSiteGridMode) {
      // Delta grid compares baseline vs optimized from sector prediction points.
      if (isDeltaGridCompleteMode) {
        return sectorPoints;
      }

      if (!Array.isArray(selectedSites) || selectedSites.length === 0) {
        return sectorPoints;
      }

      const selectedSiteSet = new Set(
        selectedSites.map((siteId) => String(siteId || "").trim()).filter(Boolean),
      );
      if (selectedSiteSet.size === 0) return sectorPoints;

      const filtered = sectorPoints.filter((point) => {
        const rowSiteId = String(point?.siteId ?? point?.site_id ?? point?.site ?? "").trim();
        return rowSiteId && selectedSiteSet.has(rowSiteId);
      });
      return filtered.length > 0 ? filtered : sectorPoints;
    }

    if (!enableSiteToggle || sectorPoints.length === 0) {
      return baseLocations;
    }

    const merged = [...baseLocations, ...sectorPoints];
    const seen = new Set();
    return merged.filter((point) => {
      const key = [
        Number(point?.lat ?? point?.latitude).toFixed(6),
        Number(point?.lng ?? point?.lon ?? point?.longitude).toFixed(6),
        Number.isFinite(Number(point?.value)) ? Number(point.value).toFixed(2) : "na",
        String(point?.siteId ?? point?.site_id ?? "").trim(),
        String(point?.deltaVariant ?? point?.delta_variant ?? "").trim().toLowerCase(),
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    enableSiteToggle,
    finalDisplayLocations,
    isDataPredictionMode,
    isDeltaGridCompleteMode,
    isDeltaSiteGridMode,
    ltePredictionLocations,
    selectedSites,
    sectorPredictionGridPoints,
  ]);

  const legendLogs = useMemo(() => {
    const shouldRenderDataCircles =
      enableDataToggle || (enableSiteToggle && siteToggle === "sites-prediction");
    const shouldRenderLtePredictionLayer =
      isDataPredictionMode ||
      lteGridEnabled ||
      isStoredGridOverlayVisible ||
      (enableSiteToggle && selectedSites.length > 0) ||
      sectorPredictionGridPoints.length > 0;

    if (isStoredGridOverlayVisible) {
      const selectedMetricKey = String(selectedMetric || "rsrp").trim().toLowerCase();
      const normalizedVersion = String(sitePredictionVersion || "").trim().toLowerCase();
      const isDeltaView = normalizedVersion === "delta";
      const isOptimizedView =
        normalizedVersion === "updated" ||
        normalizedVersion === "optimized" ||
        normalizedVersion === "optimised";

      return storedDeltaGridCells.map((cell) => {
        const deltaValue = Number(cell?.difference);
        const deltaClass = isDeltaView
          ? Number.isFinite(deltaValue)
            ? deltaValue > 0
              ? "upgraded"
              : deltaValue < 0
                ? "degraded"
                : "no_change"
            : "unknown"
          : isOptimizedView
            ? "optimized"
            : "baseline";

        return {
          id: cell.id,
          lat: cell.lat,
          lng: cell.lng,
          provider: String(cell.provider || cell.bestOperator || "Unknown").trim() || "Unknown",
          bestOperator:
            String(cell.bestOperator || cell.provider || "Unknown").trim() || "Unknown",
          delta: cell.difference,
          difference: cell.difference,
          value: Number.isFinite(cell.value) ? cell.value : null,
          metric_value: Number.isFinite(cell.value) ? cell.value : null,
          rsrp: Number.isFinite(cell.value) ? cell.value : null,
          [selectedMetricKey]: Number.isFinite(cell.value) ? cell.value : null,
          deltaVariant: deltaClass,
          delta_class: deltaClass,
        };
      });
    }

    // Legend should represent only map-drawn data/grid layers (not site marker/sector layer).
    if (shouldRenderLtePredictionLayer) {
      return lteLayerLocations || EMPTY_LIST;
    }

    if (shouldRenderDataCircles) {
      return finalDisplayLocations || EMPTY_LIST;
    }

    return EMPTY_LIST;
  }, [
    enableDataToggle,
    enableSiteToggle,
    siteToggle,
    isDataPredictionMode,
    lteGridEnabled,
    selectedSites,
    sectorPredictionGridPoints.length,
    lteLayerLocations,
    finalDisplayLocations,
    isStoredGridOverlayVisible,
    storedDeltaGridCells,
    sitePredictionVersion,
    selectedMetric,
  ]);

  const analyticsPanelLocations = useMemo(
    () => (isStoredGridOverlayVisible ? legendLogs : finalDisplayLocations),
    [isStoredGridOverlayVisible, legendLogs, finalDisplayLocations],
  );

  const analyticsPanelFilteredLocations = useMemo(
    () => (isStoredGridOverlayVisible ? legendLogs : filteredLocations),
    [isStoredGridOverlayVisible, legendLogs, filteredLocations],
  );
  const deferredAnalyticsPanelLocations = useDeferredValue(analyticsPanelLocations);
  const deferredAnalyticsPanelFilteredLocations = useDeferredValue(
    analyticsPanelFilteredLocations,
  );

  const legendSelectedMetric = useMemo(
    () => {
      if (!isStoredGridOverlayVisible) return selectedMetric;
      const normalizedVersion = String(sitePredictionVersion || "").trim().toLowerCase();
      return normalizedVersion === "delta" ? "delta" : selectedMetric;
    },
    [isStoredGridOverlayVisible, selectedMetric, sitePredictionVersion],
  );
  const legendColorBy = useMemo(() => {
    const isBestOperatorGridMode =
      String(storedGridMetricMode || "").trim().toLowerCase() === "best_operator";
    if (isStoredGridOverlayVisible && isBestOperatorGridMode) return "provider";
    return colorBy;
  }, [isStoredGridOverlayVisible, storedGridMetricMode, colorBy]);

  

  const {
    technologyTransitions,
    bandTransitions,
    pciTransitions,
  } = useMemo(() => {
    if (!finalDisplayLocations?.length) {
      return {
        technologyTransitions: [],
        bandTransitions: [],
        pciTransitions: [],
      };
    }
    return buildHandoverTransitions(finalDisplayLocations);
  }, [finalDisplayLocations]);

  const polygonsWithColors = useMemo(() => {
    if (!showPolygons || !polygons?.length) return [];
    if (!onlyInsidePolygons || !locations?.length) {
      return polygons.map((p) => ({
        ...p,
        fillColor: "#4285F4",
        fillOpacity: 0.35,
        pointCount: 0,
      }));
    }
    const thresholdKey = getThresholdKey(selectedMetric);
    const currentThresholds = effectiveThresholds[thresholdKey] || [];
    return polygons.map((poly) => {
      const pointsInside = locations.filter((pt) => isPointInPolygon(pt, poly));
      const values = pointsInside
        .map((p) => parseFloat(p[selectedMetric]))
        .filter((v) => !isNaN(v));
      if (!values.length) {
        return {
          ...poly,
          fillColor: "#ccc",
          fillOpacity: 0.3,
          pointCount: pointsInside.length,
        };
      }
      const median = calculateMedian(values);
      const fillColor = getColorFromValueOrMetric(
        median,
        currentThresholds,
        selectedMetric,
      );
      return {
        ...poly,
        fillColor,
        fillOpacity: 0.7,
        pointCount: pointsInside.length,
        medianValue: median,
      };
    });
  }, [
    showPolygons,
    polygons,
    onlyInsidePolygons,
    locations,
    selectedMetric,
    effectiveThresholds,
  ]);

  const areaPolygonsWithColors = useMemo(() => {
    if (!areaEnabled || !areaData?.length) return [];
    if (!filteredLocations?.length) {
      return areaData.map((p) => ({
        ...p,
        fillColor: "#9333ea",
        fillOpacity: 0.25,
        pointCount: 0,
        medianValue: null,
        categoryStats: null,
        bestProvider: null,
        bestBand: null,
        bestTechnology: null,
      }));
    }
    const thresholdKey = getThresholdKey(selectedMetric);
    const currentThresholds = baseThresholds[thresholdKey] || [];
    const useCategorical =
      colorBy && ["provider", "band", "technology"].includes(colorBy);
    const metricConfig = METRIC_CONFIG[selectedMetric] || {
      higherIsBetter: true,
    };
    return areaData.map((poly) => {
      const pointsInside = filteredLocations.filter((pt) =>
        isPointInPolygon(pt, poly),
      );
      if (!pointsInside.length) {
        return {
          ...poly,
          fillColor: "#ccc",
          fillOpacity: 0.3,
          pointCount: 0,
          medianValue: null,
          categoryStats: null,
          bestProvider: null,
          bestBand: null,
          bestTechnology: null,
        };
      }
      const providerStats = calculateCategoryStats(
        pointsInside,
        "provider",
        selectedMetric,
      );
      const bandStats = calculateCategoryStats(
        pointsInside,
        "band",
        selectedMetric,
      );
      const technologyStats = calculateCategoryStats(
        pointsInside,
        "technology",
        selectedMetric,
      );
      const values = pointsInside
        .map((p) => parseFloat(p[selectedMetric]))
        .filter((v) => !isNaN(v) && v != null);
      const medianValue = calculateMedian(values);
      const findBestByMetric = (stats) => {
        if (!stats?.stats?.length) return { best: null, value: null };
        let best = null;
        let bestValue = metricConfig.higherIsBetter ? -Infinity : Infinity;
        stats.stats.forEach((stat) => {
          const median = stat.medianValue ?? stat.avgValue;
          if (median != null) {
            const isBetter = metricConfig.higherIsBetter
              ? median > bestValue
              : median < bestValue;
            if (isBetter) {
              bestValue = median;
              best = stat.name;
            }
          }
        });
        return {
          best,
          value:
            bestValue === -Infinity || bestValue === Infinity
              ? null
              : bestValue,
        };
      };
      const { best: bestProvider, value: bestProviderValue } =
        findBestByMetric(providerStats);
      const { best: bestBand, value: bestBandValue } =
        findBestByMetric(bandStats);
      const { best: bestTechnology, value: bestTechnologyValue } =
        findBestByMetric(technologyStats);
      let fillColor;
      if (useCategorical) {
        switch (colorBy) {
          case "provider":
            fillColor = bestProvider
              ? getProviderColor(bestProvider)
              : providerStats?.dominant
                ? getProviderColor(providerStats.dominant.name)
                : "#ccc";
            break;
          case "band":
            fillColor = bestBand
              ? getBandColor(bestBand)
              : bandStats?.dominant
                ? getBandColor(bandStats.dominant.name)
                : "#ccc";
            break;
          case "technology":
            fillColor = bestTechnology
              ? getTechnologyColor(bestTechnology)
              : technologyStats?.dominant
                ? getTechnologyColor(technologyStats.dominant.name)
                : "#ccc";
            break;
          default:
            fillColor = "#ccc";
        }
      } else {
        fillColor =
          medianValue !== null
            ? getColorFromValueOrMetric(
              medianValue,
              currentThresholds,
              selectedMetric,
            )
            : "#ccc";
      }
      return {
        ...poly,
        fillColor,
        fillOpacity: 0.7,
        strokeWeight: 2.5,
        pointCount: pointsInside.length,
        medianValue,
        bestProvider,
        bestProviderValue,
        bestBand,
        bestBandValue,
        bestTechnology,
        bestTechnologyValue,
        categoryStats: {
          provider: providerStats,
          band: bandStats,
          technology: technologyStats,
        },
      };
    });
  }, [
    areaEnabled,
    areaData,
    filteredLocations,
    selectedMetric,
    baseThresholds,
    colorBy,
  ]);

  const visiblePolygons = useMemo(() => {
    if (!showPolygons || !polygonsWithColors?.length) return [];
    if (!viewport) return polygonsWithColors;
    return polygonsWithColors.filter((poly) => {
      if (!poly.bbox) return true;
      return !(
        poly.bbox.west > viewport.east ||
        poly.bbox.east < viewport.west ||
        poly.bbox.south > viewport.north ||
        poly.bbox.north < viewport.south
      );
    });
  }, [showPolygons, polygonsWithColors, viewport]);

  const mapCenter = useMemo(() => {
    if (!locations?.length) return mapCenterFallback || DEFAULT_CENTER;
    const sum = locations.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    return { lat: sum.lat / locations.length, lng: sum.lng / locations.length };
  }, [locations, mapCenterFallback]);

  const showDataCircles =
    enableDataToggle || (enableSiteToggle && siteToggle === "sites-prediction");
  const shouldRenderLtePredictionLayer = useMemo(
    () =>
      isDataPredictionMode ||
      lteGridEnabled ||
      isStoredGridOverlayVisible ||
      (enableSiteToggle && selectedSites.length > 0) ||
      sectorPredictionGridPoints.length > 0,
    [
      isDataPredictionMode,
      lteGridEnabled,
      isStoredGridOverlayVisible,
      enableSiteToggle,
      selectedSites.length,
      sectorPredictionGridPoints.length,
    ],
  );
  const shouldRenderSiteLayer =
    Boolean(showSiteMarkers || showSiteSectors) && !isStoredGridOverlayVisible;
  const triangleSizeAvailable =
    Boolean(enableSiteToggle) && Boolean(showSiteSectors) && shouldRenderSiteLayer;
  const shouldShowLegend = useMemo(() => {
    if (!Array.isArray(legendLogs) || legendLogs.length === 0) return false;
    return Boolean(showDataCircles || shouldRenderLtePredictionLayer);
  }, [legendLogs, showDataCircles, shouldRenderLtePredictionLayer]);

  const locationsToDisplay = useMemo(() => {
    if (!showDataCircles) return [];
    return finalDisplayLocations;
  }, [showDataCircles, finalDisplayLocations]);

  const mapOptions = useMemo(
    () => ({
      mapTypeId: ui.basemapStyle,
      disableDefaultUI: false,
      streetViewControl: false,
      zoomControl: !isZoomLocked,
      scrollwheel: !isZoomLocked,
      disableDoubleClickZoom: isZoomLocked,
      keyboardShortcuts: !isZoomLocked,
    }),
    [ui.basemapStyle, isZoomLocked],
  );

  const updateViewportRef = useCallback((newViewport) => {
    viewportRef.current = newViewport;
    setViewport(newViewport);
  }, []);

  const debouncedSetViewport = useMemo(
    () => debounce(updateViewportRef, 300),
    [updateViewportRef],
  );

  const mapListenerHandlesRef = useRef([]);
  const [isZoomMemoryArmed, setIsZoomMemoryArmed] = useState(false);
  const zoomMemoryArmedRef = useRef(false);
  const storedZoomMemoryRef = useRef(null);
  const storedCenterMemoryRef = useRef(null);
  const zoomLockControlRef = useRef({
    map: null,
    button: null,
    container: null,
    clickHandler: null,
  });

  const applyZoomLockControlStyle = useCallback(() => {
    const btn = zoomLockControlRef.current.button;
    if (!btn) return;
    if (isZoomMemoryArmed) {
      btn.style.background = "#2563eb";
      btn.style.color = "#ffffff";
      btn.style.borderColor = "#1d4ed8";
    } else {
      btn.style.background = "#ffffff";
      btn.style.color = "#1f2937";
      btn.style.borderColor = "#cbd5e1";
    }
  }, [isZoomMemoryArmed]);

  const teardownZoomLockControl = useCallback(() => {
    const current = zoomLockControlRef.current;
    if (current.button && current.clickHandler) {
      current.button.removeEventListener("click", current.clickHandler);
    }

    const map = current.map;
    const container = current.container;
    if (map && container && window.google?.maps?.ControlPosition) {
      const controls = map.controls[window.google.maps.ControlPosition.RIGHT_TOP];
      if (controls?.getLength) {
        for (let i = controls.getLength() - 1; i >= 0; i -= 1) {
          if (controls.getAt(i) === container) {
            controls.removeAt(i);
            break;
          }
        }
      }
    }

    zoomLockControlRef.current = {
      map: null,
      button: null,
      container: null,
      clickHandler: null,
    };
  }, []);

  useEffect(() => {
    applyZoomLockControlStyle();
  }, [applyZoomLockControlStyle]);

  useEffect(() => {
    zoomMemoryArmedRef.current = Boolean(isZoomMemoryArmed);
  }, [isZoomMemoryArmed]);

  const handleMapLoad = useCallback(
    (map) => {
      mapRef.current = map;
      teardownZoomLockControl();
      // Store all listener handles so we can remove them on unmount / re-mount
      const handles = [];

      handles.push(map.addListener("maptypeid_changed", () => {
        const currentType = map.getMapTypeId();
        setUi((prev) => {
          if (prev.basemapStyle === currentType) return prev;
          return { ...prev, basemapStyle: currentType };
        });
      }));

      const updateViewport = () => {
        const bounds = map.getBounds();
        if (!bounds) return;
        const newViewport = {
          north: bounds.getNorthEast().lat(),
          south: bounds.getSouthWest().lat(),
          east: bounds.getNorthEast().lng(),
          west: bounds.getSouthWest().lng(),
        };
        debouncedSetViewport(newViewport);

        const center = map.getCenter?.();
        if ((locations?.length || 0) === 0 && center) {
          const nextCenter = { lat: center.lat(), lng: center.lng() };
          setMapCenterFallback((prev) =>
            areCentersEqual(prev, nextCenter) ? prev : nextCenter,
          );
        }

        const currentZoom = map.getZoom?.();
        if (Number.isFinite(currentZoom)) {
          if (
            zoomLockEnabledRef.current &&
            Number.isFinite(lockedZoomRef.current) &&
            currentZoom !== lockedZoomRef.current
          ) {
            map.setZoom(lockedZoomRef.current);
          } else {
            setMapZoom((prev) => (prev === currentZoom ? prev : currentZoom));
          }
        }
      };

      handles.push(map.addListener("zoom_changed", () => {
        const currentZoom = map.getZoom?.();
        if (!Number.isFinite(currentZoom)) return;

        if (
          zoomLockEnabledRef.current &&
          Number.isFinite(lockedZoomRef.current) &&
          currentZoom !== lockedZoomRef.current
        ) {
          map.setZoom(lockedZoomRef.current);
          return;
        }

        setMapZoom((prev) => (prev === currentZoom ? prev : currentZoom));
      }));

      handles.push(map.addListener("idle", updateViewport));
      updateViewport();

      // Add site click listener
      handles.push(map.addListener("click", (e) => {
        if (
          zoomLockEnabledRef.current &&
          Number.isFinite(lockedZoomRef.current)
        ) {
          const currentZoom = map.getZoom?.();
          if (
            Number.isFinite(currentZoom) &&
            currentZoom !== lockedZoomRef.current
          ) {
            map.setZoom(lockedZoomRef.current);
          }
        }

        if (addSiteModeRef.current) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          setPickedLatLng({ lat, lng });
          setAddSiteMode(false);
          addSiteModeRef.current = false;
          setShowAddSiteDialog(true);
        }
      }));

      const lockContainer = document.createElement("div");
      lockContainer.style.margin = "10px";

      const lockButton = document.createElement("button");
      lockButton.type = "button";
      lockButton.title = "Zoom Memory";
      lockButton.setAttribute("aria-label", "Zoom Memory");
      lockButton.textContent = "🔒";
      lockButton.style.width = "34px";
      lockButton.style.height = "34px";
      lockButton.style.borderRadius = "6px";
      lockButton.style.border = "1px solid #cbd5e1";
      lockButton.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
      lockButton.style.cursor = "pointer";
      lockButton.style.fontSize = "16px";
      lockButton.style.display = "flex";
      lockButton.style.alignItems = "center";
      lockButton.style.justifyContent = "center";
      lockButton.style.transition = "all 0.2s ease";

      const lockClickHandler = () => {
        const currentZoom = map.getZoom?.();
        const currentCenter = map.getCenter?.();
        if (!zoomMemoryArmedRef.current) {
          const zoomToStore = Number.isFinite(currentZoom) ? currentZoom : mapZoom;
          const centerToStore =
            currentCenter && Number.isFinite(currentCenter.lat?.()) && Number.isFinite(currentCenter.lng?.())
              ? { lat: currentCenter.lat(), lng: currentCenter.lng() }
              : null;
          if (Number.isFinite(zoomToStore)) {
            storedZoomMemoryRef.current = zoomToStore;
            setMapZoom((prev) => (prev === zoomToStore ? prev : zoomToStore));
          }
          storedCenterMemoryRef.current = centerToStore;
          zoomMemoryArmedRef.current = true;
          setIsZoomMemoryArmed(true);
          return;
        }

        const savedZoom = Number(storedZoomMemoryRef.current);
        const savedCenter = storedCenterMemoryRef.current;
        if (
          savedCenter &&
          Number.isFinite(savedCenter.lat) &&
          Number.isFinite(savedCenter.lng)
        ) {
          map.setCenter(savedCenter);
          setMapCenterFallback((prev) =>
            areCentersEqual(prev, savedCenter) ? prev : savedCenter,
          );
        }
        if (Number.isFinite(savedZoom)) {
          map.setZoom(savedZoom);
          setMapZoom((prev) => (prev === savedZoom ? prev : savedZoom));
        }
        storedCenterMemoryRef.current = null;
        zoomMemoryArmedRef.current = false;
        setIsZoomMemoryArmed(false);
      };

      lockButton.addEventListener("click", lockClickHandler);
      lockContainer.appendChild(lockButton);
      map.controls[window.google.maps.ControlPosition.RIGHT_TOP].push(lockContainer);

      zoomLockControlRef.current = {
        map,
        button: lockButton,
        container: lockContainer,
        clickHandler: lockClickHandler,
      };
      applyZoomLockControlStyle();

      mapListenerHandlesRef.current = handles;
    },
    [
      applyZoomLockControlStyle,
      debouncedSetViewport,
      locations?.length,
      mapZoom,
      teardownZoomLockControl,
    ],
  );

  // Clean up Google Maps listeners when the component unmounts
  useEffect(() => {
    return () => {
      mapListenerHandlesRef.current.forEach((handle) => {
        if (handle && window.google?.maps?.event) {
          window.google.maps.event.removeListener(handle);
        }
      });
      mapListenerHandlesRef.current = [];
      teardownZoomLockControl();
    };
  }, [teardownZoomLockControl]);

  const handleResetZoom = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      setMapZoom(DEFAULT_MAP_ZOOM);
      if (isZoomLocked) {
        lockedZoomRef.current = DEFAULT_MAP_ZOOM;
      }
      return;
    }

    const center = map.getCenter?.();
    if (center) {
      const nextCenter = { lat: center.lat(), lng: center.lng() };
      setMapCenterFallback((prev) =>
        areCentersEqual(prev, nextCenter) ? prev : nextCenter,
      );
    }

    map.setZoom(DEFAULT_MAP_ZOOM);
    setMapZoom(DEFAULT_MAP_ZOOM);
    if (isZoomLocked) {
      lockedZoomRef.current = DEFAULT_MAP_ZOOM;
    }
  }, [isZoomLocked]);

  const handleUIChange = useCallback((newUI) => {
    setUi((prev) => {
      const updated = { ...prev, ...newUI };
      return updated;
    });
  }, []);

  const handleDrawingsChange = useCallback((drawings) => {
    // If drawings array is empty/null → clear the filter (show all logs)
    if (!drawings || drawings.length === 0) {
      setDrawnPoints(null);
      setDrawnShapeAnalytics([]);
      return;
    }

    // Check whether any drawing has a computed `logs` array (even empty).
    // Geometry-only snapshots have `logs: undefined` (key absent).
    // Skip updating if this is a geometry-only call — the log-enriched update arrives next.
    const hasLogsKey = drawings.some((drawing) => Object.prototype.hasOwnProperty.call(drawing, "logs"));
    if (!hasLogsKey) return;

    // Collect all unique logs from inside all drawn shapes
    const uniqueLogs = new Map();
    drawings.forEach((drawing) => {
      if (Array.isArray(drawing.logs)) {
        drawing.logs.forEach((log) => {
          const key = log.id || `${log.lat}-${log.lng}-${log.timestamp}`;
          uniqueLogs.set(key, log);
        });
      }
    });

    const newPoints = Array.from(uniqueLogs.values());
    setDrawnPoints((prev) => {
      if (prev === null) return newPoints;
      if (prev.length !== newPoints.length) return newPoints;
      const prevIds = new Set(prev.map((p) => p.id));
      const hasDiff = newPoints.some((p) => !prevIds.has(p.id));
      return hasDiff ? newPoints : prev;
    });

    const drawingAnalytics = drawings.map((drawing) => {
      const areaMeters = Number(drawing?.area);
      const areaSqKmFromMeters =
        Number.isFinite(areaMeters) && areaMeters > 0 ? areaMeters / 1e6 : null;
      const areaSqKmFromField = Number(drawing?.areaInSqKm);
      const areaInSqKm = Number.isFinite(areaSqKmFromMeters)
        ? areaSqKmFromMeters
        : Number.isFinite(areaSqKmFromField)
          ? areaSqKmFromField
          : null;

      const grid = drawing?.grid || null;
      const gridCells = Number(grid?.cells);
      const gridCellsWithLogs = Number(grid?.cellsWithLogs);

      return {
        id: drawing?.id ?? null,
        type: drawing?.type ?? "shape",
        count: Number(drawing?.count) || 0,
        area: Number.isFinite(areaMeters) ? areaMeters : null,
        areaInSqKm,
        grid: grid
          ? {
            cells: Number.isFinite(gridCells) ? gridCells : 0,
            cellsWithLogs: Number.isFinite(gridCellsWithLogs) ? gridCellsWithLogs : 0,
            gridRows: Number.isFinite(Number(grid?.gridRows))
              ? Number(grid.gridRows)
              : 0,
            gridCols: Number.isFinite(Number(grid?.gridCols))
              ? Number(grid.gridCols)
              : 0,
            cellSizeMeters: Number.isFinite(Number(grid?.cellSizeMeters))
              ? Number(grid.cellSizeMeters)
              : null,
          }
          : null,
      };
    });

    setDrawnShapeAnalytics(drawingAnalytics);
  }, []);

  const reloadData = useCallback(() => {
    refetchColors();
    if (enableSiteToggle && typeof refetchSites === "function") refetchSites();
    if (enableDataToggle && dataToggle === "sample") refetchSample();
    if (
      (enableDataToggle && dataToggle === "prediction") ||
      (enableSiteToggle && siteToggle === "sites-prediction")
    ) {
      refetchPrediction();
    }
    if (showPolygons) refetchPolygons();
    if (areaEnabled) refetchAreaPolygons();
    if (showNeighbors) refetchNeighbors();
    if (showSessionNeighbors) refetchSessionNeighbors();
    if (showSubSession) refetchSubSessionAnalytics();
    if (shouldFetchDominanceDetails) refetchDominanceDetails();
  }, [
    enableDataToggle,
    enableSiteToggle,
    dataToggle,
    siteToggle,
    showPolygons,
    areaEnabled,
    showNeighbors,
    showSessionNeighbors,
    showSubSession,
    refetchSample,
    refetchPrediction,
    refetchPolygons,
    refetchAreaPolygons,
    refetchSites,
    refetchNeighbors,
    refetchSessionNeighbors,
    refetchSubSessionAnalytics,
    shouldFetchDominanceDetails,
    refetchDominanceDetails,
  ]);

  const filteredNeighbors = useMemo(() => {
    let data = polygonFilteredNeighborData || [];
    if (!data.length) return [];
    const { providers, bands, technologies } = dataFilters;
    const hasProviderFilter = providers?.length > 0;
    const hasBandFilter = bands?.length > 0;
    const hasTechFilter = technologies?.length > 0;
    if (hasProviderFilter || hasBandFilter || hasTechFilter) {
      data = data.filter((item) => {
        if (
          hasProviderFilter &&
          !providers.includes(normalizeProviderName(item?.provider ?? ""))
        )
          return false;
        if (
          hasTechFilter &&
          !technologies.includes(normalizeTechName(item.networkType))
        )
          return false;
        if (hasBandFilter) {
          const nb = String(item.neighbourBand);
          const pb = String(item.primaryBand);
          if (!bands.includes(nb) && !bands.includes(pb)) return false;
        }
        return true;
      });
    }
    return data;
  }, [
    polygonFilteredNeighborData,
    dataFilters,
  ]);

  const neighborLogsAvailable = useMemo(() => {
    const statsTotal =
      Number(sessionNeighborStats?.total) ||
      Number(sessionNeighborStats?.count) ||
      Number(sessionNeighborStats?.totalNeighbors) ||
      0;

    return Boolean(
      hasPassedNeighbors ||
        statsTotal > 0 ||
        (Array.isArray(sessionNeighborData) && sessionNeighborData.length > 0) ||
        (Array.isArray(filteredNeighbors) && filteredNeighbors.length > 0),
    );
  }, [
    hasPassedNeighbors,
    sessionNeighborStats,
    sessionNeighborData,
    filteredNeighbors,
  ]);

  const handlePolygonMouseOver = useCallback((poly, e) => {
    setHoveredPolygon(poly);
    setHoverPosition({ x: e.domEvent.clientX, y: e.domEvent.clientY });
  }, []);

  const handlePolygonMouseMove = useCallback((e) => {
    setHoverPosition({ x: e.domEvent.clientX, y: e.domEvent.clientY });
  }, []);

  const handlePolygonMouseOut = useCallback(() => {
    setHoveredPolygon(null);
    setHoverPosition(null);
  }, []);

  const handleNavigateToMultiView = useCallback(() => {
    const url = `/multi-map?session=${sessionIds.join(",")}&project_id=${projectId || ""}`;
    navigate(url, {
      state: {
        locations: finalDisplayLocations,
        neighborData: filteredNeighbors,
        thresholds: effectiveThresholds,
        project: project,
      },
    });
  }, [
    sessionIds,
    projectId,
    navigate,
    finalDisplayLocations,
    filteredNeighbors,
    effectiveThresholds,
    project,
  ]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/viewProject", { replace: true });
  }, [navigate]);

  const handleToggleControls = useCallback(() => {
    setIsSideOpen((prev) => !prev);
  }, []);

  const handleToggleAnalytics = useCallback(() => {
    setShowAnalytics((prev) => !prev);
  }, []);

  const handleCloseAnalytics = useCallback(() => {
    setShowAnalytics(false);
  }, []);

  const handleSidebarOpenChange = useCallback((isOpen) => {
    setIsSideOpen(isOpen);
    if (!isOpen) {
      // Reset all handover toggles when sidebar is closed to clear ghost lines.
      setTechHandOver(false);
      setBandHandover(false);
      setPciHandover(false);
    }
  }, []);

  const handleAddSiteClick = useCallback(() => {
    if (!Number.isFinite(Number(projectId)) || Number(projectId) <= 0) {
      toast.error("Please select a valid project before adding a site.");
      return;
    }
    setAddSiteMode(true);
    addSiteModeRef.current = true;
    toast.info("Click on the map to pick a location for the new site", {
      autoClose: 4000,
    });
  }, [projectId]);



  const applyHoveredLog = useCallback(() => {
    const log = pendingHoverLogRef.current;

    if (!log) {
      if (lastHoverIdentityRef.current !== null) {
        lastHoverIdentityRef.current = null;
        setHoveredLog(null);
        setHoveredCellId(null);
      }
      return;
    }

    const pci = log?.pci ?? log?.PCI ?? log?.cell_id ?? log?.physical_cell_id;
    const normalizedPci = pci !== null && pci !== undefined ? String(pci).trim() : null;
    const normalizedLat =
      log?.lat ?? log?.latitude ?? log?.Lat ?? log?.Latitude ?? null;
    const normalizedLng =
      log?.lng ?? log?.lon ?? log?.longitude ?? log?.Lng ?? log?.Longitude ?? null;
    const hoverIdentity = [
      String(log?.id ?? log?.Id ?? ""),
      String(log?.session_id ?? log?.sessionId ?? ""),
      String(log?.timestamp ?? ""),
      String(normalizedLat ?? ""),
      String(normalizedLng ?? ""),
      String(normalizedPci ?? ""),
    ].join("|");

    if (hoverIdentity === lastHoverIdentityRef.current) {
      return;
    }

    lastHoverIdentityRef.current = hoverIdentity;
    setHoveredLog({
      lat: normalizedLat,
      lng: normalizedLng,
      latitude: normalizedLat,
      longitude: normalizedLng,
      pci: log?.pci ?? log?.PCI ?? null,
      PCI: log?.PCI ?? log?.pci ?? null,
      cell_id: log?.cell_id ?? null,
      physical_cell_id: log?.physical_cell_id ?? null,
    });
    setHoveredCellId(normalizedPci);
  }, []);

  const handleMarkerHover = useCallback((hoverInfo) => {
    pendingHoverLogRef.current = hoverInfo?.object || hoverInfo || null;
    if (hoverRafRef.current != null || typeof window === "undefined") return;

    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = null;
      applyHoveredLog();
    });
  }, [applyHoveredLog]);

  const handleSubSessionSelect = useCallback((target) => {
    if (!target) {
      setSelectedSubSessionTarget(null);
      return;
    }

    setSelectedSubSessionTarget({
      sessionId: target.sessionId ?? null,
      subSessionId: target.subSessionId ?? null,
      markerId: target.markerId ?? null,
      source: target.source ?? "sub-session",
    });

    const position = target.position;
    const lat = Number(position?.lat);
    const lng = Number(position?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!mapRef.current) return;

    mapRef.current.panTo({ lat, lng });
    const currentZoom = mapRef.current.getZoom?.();
    if (!Number.isFinite(currentZoom) || currentZoom < 17) {
      mapRef.current.setZoom(17);
    }
  }, []);

  const handleSubSessionMarkerSelect = useCallback((marker) => {
    if (!marker) {
      setSelectedSubSessionTarget(null);
      return;
    }

    handleSubSessionSelect({
      sessionId: marker.sessionId,
      subSessionId: marker.subSessionId,
      markerId: marker.id,
      position: marker.position,
      resultStatus: marker.resultStatus,
      source: "marker",
    });
  }, [handleSubSessionSelect]);

  const uniqueBands = useMemo(() => {
    if (!siteData || !siteData.length) return [];
    const paramSet = new Set();
    siteData.forEach((s) => {
      const bandVal = s.Band || s.band;
      if (bandVal) {
        const normalized = normalizeBandName(bandVal);
        if (normalized && normalized !== "Unknown") {
          paramSet.add(normalized);
        }
      }
    });
    return Array.from(paramSet).sort();
  }, [siteData]);

  const uniquePcis = useMemo(() => {
    if (!siteData || !siteData.length) return [];
    const paramSet = new Set();
    siteData.forEach((s) => {
      // Check various casing for PCI
      const val = s.Pci !== undefined ? s.Pci : (s.pci !== undefined ? s.pci : s.PCI);
      if (val !== undefined && val !== null && val !== "") {
        const num = Number(val);
        if (!isNaN(num)) paramSet.add(num);
      }
    });
    return Array.from(paramSet).sort((a, b) => a - b);
  }, [siteData]);

  const uniquePcisFromLogs = useMemo(() => {
    const pciSet = new Set();
    const processItem = (item) => {
      const pci = item.pci ?? item.PCI ?? item.cell_id ?? item.physical_cell_id;
      if (pci !== undefined && pci !== null && pci !== "") {
        const num = Number(pci);
        if (!isNaN(num)) pciSet.add(num);
      }
    };
    (locations || []).forEach(processItem);
    (polygonFilteredNeighborData || []).forEach(processItem);
    return pciSet;
  }, [locations, polygonFilteredNeighborData]);

  const combinedBands = useMemo(() => {
    // Merge bands from logs (availableFilterOptions) and sites (uniqueBands)
    const set = new Set([...(availableFilterOptions?.bands || []), ...uniqueBands]);
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  }, [availableFilterOptions, uniqueBands]);

  const combinedPcis = useMemo(() => {
    // Merge PCIs from logs and sites
    const set = new Set([...uniquePcisFromLogs, ...uniquePcis]);
    return Array.from(set).sort((a, b) => a - b);
  }, [uniquePcisFromLogs, uniquePcis]);

  if (!isLoaded)
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  if (loadError)
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Map loading error: {loadError.message}
      </div>
    );

  return (
    <div className="h-screen flex flex-col bg-gray-800">
      <UnifiedHeader
        onSettingsSaved={refetchColors}
        onBack={handleBack}
        onToggleControls={handleToggleControls}
        onLeftToggle={handleToggleAnalytics}
        isControlsOpen={isSideOpen}
        showAnalytics={showAnalytics}
        projectId={projectId}
        sessionIds={sessionIds}
        project={project}
        setProject={setProject}
        opacity={opacity}
        setOpacity={setOpacity}
        logRadius={logRadius}
        setLogRadius={setLogRadius}
        neighborLogsAvailable={neighborLogsAvailable}
        neighborSquareSize={neighborSquareSize}
        setNeighborSquareSize={setNeighborSquareSize}
        triangleSizeAvailable={triangleSizeAvailable}
        triangleScaleMultiplier={triangleScaleMultiplier}
        setTriangleScaleMultiplier={setTriangleScaleMultiplier}
        ui={ui}
        onUIChange={handleUIChange}
        onOpenMultiView={handleNavigateToMultiView}
      />

      {showAnalytics && (
        <Suspense
          fallback={
            <div className="fixed right-4 top-20 z-[1000] rounded-lg bg-slate-900/90 p-3 shadow-lg">
              <Spinner />
            </div>
          }
        >
          <UnifiedDetailLogs
            locations={deferredAnalyticsPanelLocations}
            allFilteredLocations={deferredAnalyticsPanelFilteredLocations}
            onHighlightLogs={setHighlightedLogs}
            totalLocations={locations?.length || 0}
            filteredCount={finalDisplayLocations?.length || 0}
            dataToggle={dataToggle}
            enableDataToggle={enableDataToggle}
            selectedMetric={selectedMetric}
            siteData={siteData}
            durationTime={durationTime}
            siteToggle={siteToggle}
            enableSiteToggle={enableSiteToggle}
            showSiteMarkers={showSiteMarkers}
            showSiteSectors={showSiteSectors}
            polygons={polygonsWithColors}
            visiblePolygons={visiblePolygons}
            polygonSource={polygonSource}
            showPolygons={showPolygons}
            onlyInsidePolygons={onlyInsidePolygons}
            coverageHoleFilters={coverageHoleFilters}
            viewport={viewport}
            distance={distance}
            mapCenter={mapCenter}
            projectId={projectId}
            sessionIds={sessionIds}
            isLoading={isLoading}
            thresholds={effectiveThresholds}
            appSummary={appSummary}
            InpSummary={inpSummary}
            tptVolume={tptVolume}
            logArea={inpSummary}
            indoor={indoor}
            outdoor={outdoor}
            technologyTransitions={technologyTransitions}
            techHandOver={techHandOver}
            dataFilters={dataFilters}
            bestNetworkEnabled={bestNetworkEnabled}
            bestNetworkStats={bestNetworkStats}
            onClose={handleCloseAnalytics}
            n78NeighborLoading={sessionNeighborLoading}
            showN78Neighbors={showSessionNeighbors}
            n78NeighborStats={sessionNeighborStats}
            n78NeighborData={filteredNeighbors}
            showSubSession={showSubSession}
            subSessionData={subSessionData}
            subSessionSummary={subSessionSummary}
            subSessionLoading={subSessionLoading}
            subSessionRequestedIds={subSessionRequestedIds}
            selectedSubSessionTarget={selectedSubSessionTarget}
            onSubSessionSelect={handleSubSessionSelect}
            drawnShapeAnalytics={drawnShapeAnalytics}
            activeTabExternal={analyticsActiveTab}
            onActiveTabExternalChange={setAnalyticsActiveTab}
            sitePredictionVersion={sitePredictionVersion}
            enableGrid={enableGrid}
            gridCellStats={gridCellStats}
            lteGridEnabled={lteGridEnabled}
            lteGridSizeMeters={lteGridSizeMeters}
            isCellSiteGridMode={isCellSiteGridMode}
            isDeltaSiteGridMode={isDeltaSiteGridMode}
            deltaGridScope={deltaGridScope}
            storedGridMetricMode={storedGridMetricMode}
            conditionLogsLocations={legendLogs}
            conditionSectorLocations={finalDisplayLocations}
          />
        </Suspense>
      )}

      <div className="flex flex-1 min-h-0">
        {shouldRenderSidebar && (
          <Suspense fallback={null}>
            <UnifiedMapSidebar
        open={isSideOpen}
        pciThreshold={pciThreshold}
        supportsSessionFilters={isSampleMode}
        dominanceThreshold={dominanceThreshold}
        setDominanceThreshold={setDominanceThreshold}
        setPciThreshold={setPciThreshold}
        onOpenChange={handleSidebarOpenChange}
        enableDataToggle={enableDataToggle}
        setEnableDataToggle={setEnableDataToggle}
        dataToggle={dataToggle}
        modeMethod={modeMethod}
        setModeMethod={setModeMethod}
        setTechHandover={setTechHandOver}
        techHandover={techHandOver}
        technologyTransitions={technologyTransitions}
        setDataToggle={setDataToggle}
        enableSiteToggle={enableSiteToggle}
        setEnableSiteToggle={setEnableSiteToggle}
        bandHandover={bandHandover}
        setBandHandover={setBandHandover}
        bandTransitions={bandTransitions}
        pciHandover={pciHandover}
        setPciHandover={setPciHandover}
        pciTransitions={pciTransitions}
        siteToggle={siteToggle}
        sitePredictionVersion={sitePredictionVersion}
        setSitePredictionVersion={setSitePredictionVersion}
        showSessionNeighbors={showSessionNeighbors}
        setShowSessionNeighbors={setShowSessionNeighbors}
        gridCellStats={gridCellStats}
        showNumCells={showNumCells}
        setShowNumCells={setShowNumCells}
        setSiteToggle={setSiteToggle}
        projectId={projectId}
        sessionIds={sessionIds}
        metric={selectedMetric}
        setMetric={setSelectedMetric}
        coverageHoleFilters={coverageHoleFilters}
        setCoverageHoleFilters={setCoverageHoleFilters}
        dataFilters={dataFilters}
        setDataFilters={setDataFilters}
        availableFilterOptions={availableFilterOptions}
        colorBy={colorBy}
        setColorBy={setColorBy}
        ui={ui}
        pciRange={pciRange}
        onUIChange={handleUIChange}
        onOpenMultiView={handleNavigateToMultiView}
        showPolygons={showPolygons}
        setShowPolygons={setShowPolygons}
        polygonSource={polygonSource}
        setPolygonSource={setPolygonSource}
        onlyInsidePolygons={onlyInsidePolygons}
        polygonCount={polygons?.length || 0}
        showSiteMarkers={showSiteMarkers}
        setShowSiteMarkers={setShowSiteMarkers}
        showSiteSectors={showSiteSectors}
        setShowSiteSectors={setShowSiteSectors}
        loading={isLoading}
        reloadData={reloadData}
        isZoomLocked={isZoomLocked}
        setIsZoomLocked={setIsZoomLocked}
        currentZoom={mapZoom}
        onResetZoom={handleResetZoom}
        showNeighbors={showNeighbors}
        setShowNeighbors={setShowNeighbors}
        showSubSession={showSubSession}
        setShowSubSession={setShowSubSession}
        subSessionMarkerCount={subSessionMarkers?.length || 0}
        subSessionLoading={subSessionLoading}
        neighborStats={neighborStats}
        areaEnabled={areaEnabled}
        setAreaEnabled={setAreaEnabled}
        enableGrid={enableGrid}
        setEnableGrid={setEnableGrid}
        gridSizeMeters={gridSizeMeters}
        setGridSizeMeters={setGridSizeMeters}
        lteGridAvailable={lteGridAvailable}
        lteGridSizeMeters={lteGridSizeMeters}
        setLteGridSizeMeters={setLteGridSizeMeters}
        lteGridAggregationMethod={lteGridAggregationMethod}
        setLteGridAggregationMethod={setLteGridAggregationMethod}
        storedGridMetricMode={storedGridMetricMode}
        setStoredGridMetricMode={setStoredGridMetricMode}
        deltaGridScope={deltaGridScope}
        setDeltaGridScope={setDeltaGridScope}
        deltaGridApiState={deltaGridApiState}
        onDeltaGridComputeStore={handleDeltaGridComputeStore}
        onDeltaGridFetchStored={handleDeltaGridManualFetch}
        mlGridEnabled={mlGridEnabled}
        setMlGridEnabled={setMlGridEnabled}
        mlGridSize={mlGridSize}
        setMlGridSize={setMlGridSize}
        mlGridAggregation={mlGridAggregation}
        setMlGridAggregation={setMlGridAggregation}
        bestNetworkEnabled={bestNetworkEnabled}
        setBestNetworkEnabled={setBestNetworkEnabled}
        bestNetworkWeights={bestNetworkWeights}
        setBestNetworkWeights={setBestNetworkWeights}
        bestNetworkOptions={bestNetworkOptions}
        setBestNetworkOptions={setBestNetworkOptions}
        bestNetworkStats={bestNetworkStats}
        coverageViolationThreshold={coverageViolationThreshold}
        setCoverageViolationThreshold={setCoverageViolationThreshold}
        onAddSiteClick={handleAddSiteClick}
      />
          </Suspense>
        )}

      <div className="flex-1 relative overflow-hidden min-w-0">
        <LoadingProgress
          progress={sampleProgress}
          loading={sampleLoading && enableDataToggle && dataToggle === "sample"}
        />

        {shouldShowLegend && !bestNetworkEnabled && (
          <MapLegend
            thresholds={effectiveThresholds}
            selectedMetric={legendSelectedMetric}
            colorBy={legendColorBy}
            showOperators={legendColorBy === "provider"}
            showBands={legendColorBy === "band"}
            showTechnologies={legendColorBy === "technology"}
            showSignalQuality={!legendColorBy || legendColorBy === "metric"}
            availableFilterOptions={availableFilterOptions}
            logs={legendLogs}
            activeFilter={legendFilter}
            onFilterChange={setLegendFilter}
          />
        )}

        <SiteLegend
          enabled={enableSiteToggle && !isStoredGridOverlayVisible}
          sites={manualSiteData}
          colorMode={modeMethod}
          isLoading={manualSiteLoading}
          sitePredictionVersion={sitePredictionVersion}
        />

        <BestNetworkLegend
          stats={bestNetworkStats}
          providerColors={bestNetworkProviderColors}
          enabled={bestNetworkEnabled}
        />

        <div className="relative h-full w-full">
          {isLoading &&
            (locations?.length || 0) === 0 &&
            (siteData?.length || 0) === 0 ? (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <Spinner />
            </div>
          ) : error || siteError ? (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <div className="text-center space-y-2">
                {error && <p className="text-red-500">Data Error: {error}</p>}
                {siteError && (
                  <p className="text-red-500">
                    Site Error: {siteError.message}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <MapWithMultipleCircles
              isLoaded={isLoaded}
              loadError={loadError}
              locations={isDataPredictionMode ? EMPTY_LIST : finalDisplayLocations}
              thresholds={effectiveThresholds}
              selectedMetric={selectedMetric}
              areaData={areaData}
              // REMOVED legacy props to prevent ghost lines:
              // technologyTransitions={technologyTransitions}
              // techHandOver={techHandOver}
              onMarkerHover={handleMarkerHover} // Pass the new handler
              hoveredCellId={hoveredCellId}
              colorBy={colorBy}
              activeMarkerIndex={null}
              onMarkerClick={() => { }}
              options={mapOptions}
              center={mapCenter}
              defaultZoom={mapZoom}
              fitToLocations={(locationsToDisplay?.length || 0) > 0}
              showNumCells={showNumCells}
              onLoad={handleMapLoad}
              pointRadius={logRadius}
              projectId={projectId}
              polygonSource={polygonSource}
              enablePolygonFilter={true}
              filterPolygons={rawFilteringPolygons}
              externalPolygonsLoading={polygonLoading || areaLoading}
              showPolygonBoundary={true}
              enableGrid={enableGrid}
              gridSizeMeters={gridSizeMeters}
              areaEnabled={areaEnabled}
              filterInsidePolygons={onlyInsidePolygons}
              opacity={opacity}
              neighborData={filteredNeighbors}
              showNeighbors={showSessionNeighbors}
              neighborSquareSize={neighborSquareSize}
              neighborOpacity={0.45}
              onNeighborClick={(neighbor) => { }}
              onGridCellsStatsChange={setGridCellStats}
              debugNeighbors={false}
              legendFilter={legendFilter}
              drawingEnabled={ui.drawEnabled}
              drawingShapeMode={ui.shapeMode}
            >
              <DrawingToolsLayer
                map={mapRef.current}
                enabled={ui.drawEnabled}
                logs={finalDisplayLocations}
                sessions={EMPTY_LIST}
                selectedMetric={selectedMetric}
                thresholds={effectiveThresholds}
                pixelateRect={ui.drawPixelateRect}
                cellSizeMeters={ui.drawCellSizeMeters}
                colorizeCells={ui.colorizeCells}
                shapeMode={ui.shapeMode}
                onUIChange={handleUIChange}
                clearSignal={ui.drawClearSignal}
                onDrawingsChange={handleDrawingsChange}
              />

              {/* LTE Prediction Layer — renders for prediction mode, LTE grid, or selected sites */}
              {shouldRenderLtePredictionLayer && (
                <LtePredictionLocationLayer
                  enabled={true}
                  map={mapRef.current}
                  locations={lteLayerLocations}
                  selectedMetric={selectedMetric}
                  thresholds={effectiveThresholds}
                  getMetricColor={getMetricColorForLog}
                  filterPolygons={rawFilteringPolygons}
                  filterInsidePolygons={onlyInsidePolygons}
                  maxPoints={sectorPredictionGridPoints.length > 0 ? 120000 : 20000}
                  enableGrid={lteGridEnabled || isStoredGridOverlayVisible}
                  gridSizeMeters={lteGridSizeMeters || 50}
                  gridAggregationMethod={lteGridAggregationMethod || "median"}
                  deltaComparisonMode={isDeltaSiteGridMode}
                  externalGridCells={
                    isStoredGridOverlayVisible ? storedDeltaGridCells : EMPTY_LIST
                  }
                  mlGridEnabled={mlGridEnabled}
                  mlGridSize={mlGridSize}
                  mlGridAggregation={mlGridAggregation}
                  legendFilter={legendFilter}
                />
              )}

              {showPolygons &&
                (visiblePolygons || []).map((poly) => (
                  <Polygon
                    key={poly.uid}
                    paths={poly.paths[0]}
                    options={{
                      fillColor: poly.fillColor || "#4285F4",
                      fillOpacity: poly.fillOpacity || 0.35,
                      strokeColor: onlyInsidePolygons
                        ? poly.fillColor
                        : "#2563eb",
                      strokeWeight: 2,
                      strokeOpacity: 0.9,
                      clickable: true,
                      zIndex: 50,
                    }}
                    onMouseOver={(e) => handlePolygonMouseOver(poly, e)}
                    onMouseMove={handlePolygonMouseMove}
                    onMouseOut={handlePolygonMouseOut}
                  />
                ))}

              {areaEnabled &&
                (areaPolygonsWithColors || []).map((poly) => (
                  <Polygon
                    key={poly.uid}
                    paths={poly.paths[0]}
                    options={{
                      fillColor: poly.fillColor || "#9333ea",
                      fillOpacity: poly.fillOpacity ?? 0.25,
                      strokeColor: poly.fillColor || "#7e22ce",
                      strokeWeight: 2,
                      strokeOpacity: 0.9,
                      clickable: true,
                      zIndex: 60,
                    }}
                    onMouseOver={(e) => handlePolygonMouseOver(poly, e)}
                    onMouseMove={handlePolygonMouseMove}
                    onMouseOut={handlePolygonMouseOut}
                  />
                ))}

              {shouldRenderSiteLayer && (
                <NetworkPlannerMap
                  key={`site-layer-${projectId || "none"}-${siteToggle}-${sitePredictionVersion}`}
                  projectId={projectId}
                  sessionIds={sessionIds}
                  siteToggle={siteToggle}
                  sitePredictionVersion={sitePredictionVersion}
                  enableSiteToggle={enableSiteToggle}
                  showSiteMarkers={showSiteMarkers}
                  showSiteSectors={showSiteSectors}
                  map={mapRef.current}
                  selectedMetric={selectedMetric}
                  onlyInsidePolygons={siteLayerPolygonFiltering || onlyInsidePolygons}
                  filterPolygons={rawFilteringPolygons}
                  hoveredCellId={hoveredCellId}
                  hoveredLog={hoveredLog}
                  locations={finalDisplayLocations}
                  onDataLoaded={handleSitesLoaded}
                  colorMode={modeMethod}
                  viewport={viewport}
                  thresholds={effectiveThresholds}
                  getMetricColor={getMetricColorForLog}
                  onSiteSelect={setSelectedSites}
                  onSectorPredictionPointsChange={setSectorPredictionGridPoints}
                  triangleScaleMultiplier={triangleScaleMultiplier}
                  options={{
                    scale: 0.6,
                    zIndex: 1000,
                    opacity: opacity,
                  }}
                />
              )}

              {/* Handover Layers - New Implementation */}
              {techHandOver && (
                <TechHandoverMarkers
                  key="technology-handover-layer"
                  transitions={technologyTransitions}
                  show={true}
                  type="technology"
                  showConnections={false}
                />
              )}

              {bandHandover && (
                <TechHandoverMarkers
                  key="band-handover-layer"
                  transitions={bandTransitions}
                  show={true}
                  type="band"
                  showConnections={false}
                />
              )}

              {pciHandover && (
                <TechHandoverMarkers
                  key="pci-handover-layer"
                  transitions={pciTransitions}
                  show={true}
                  type="pci"
                  showConnections={false}
                />
              )}

              <SubSessionMarkers
                show={showSubSession}
                markers={subSessionMarkers}
                selectedMarkerId={selectedSubSessionTarget?.markerId ?? null}
                onMarkerSelect={handleSubSessionMarkerSelect}
              />

            </MapWithMultipleCircles>
          )}
        </div>
      </div>
      </div>

      {hoveredPolygon && hoverPosition && (
        <ZoneTooltip
          polygon={hoveredPolygon}
          position={hoverPosition}
          selectedMetric={selectedMetric}
          selectedCategory={colorBy}
        />
      )}

      {/* Add Site Cursor Indicator */}
      {addSiteMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[2000] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse">
          Click on the map to select a location
          <button
            onClick={() => { setAddSiteMode(false); addSiteModeRef.current = false; }}
            className="ml-2 bg-white/20 hover:bg-white/30 rounded-full px-2 py-0.5 text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add Site Dialog */}
      <AddSiteFormDialog
        open={showAddSiteDialog}
        onOpenChange={setShowAddSiteDialog}
        projectId={projectId}
        pickedLatLng={pickedLatLng}
        onSuccess={refetchSites}
        availableBands={combinedBands}
        availablePcis={combinedPcis}
      />
    </div>
  );
};

export default UnifiedMapView;
