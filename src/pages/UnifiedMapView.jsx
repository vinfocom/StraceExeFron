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
import { useJsApiLoader, Polygon, Polyline } from "@react-google-maps/api";
import { toast } from "react-toastify";

import { mapViewApi, gridAnalyticsApi, sitePredictionApi } from "../api/apiEndpoints";

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
import { useUnifiedGridViewData } from "@/hooks/useUnifiedGridViewData";

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
import { getMetricValueFromLog } from "@/utils/metrics";
import {
  findProjectInProjectsCache,
  upsertProjectInProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";
import {
  DEFAULT_CENTER,
  DEFAULT_COVERAGE_FILTERS,
  DEFAULT_DATA_FILTERS,
  DEFAULT_MAP_ZOOM,
  DRAWN_POLYGON_FILL_OPACITY,
  DRAWN_POLYGON_OPACITY,
  EMPTY_LIST,
  EMPTY_POLYGONS,
  GRID_ONLY_METRICS,
  GRID_POLYGON_FILL_OPACITY,
  GRID_POLYGON_STROKE_OPACITY,
  GRID_VIEW_SUPPORTED_METRICS,
  MAP_ZOOM_LOCK_EVENT,
  MAP_ZOOM_LOCK_STORAGE_KEY,
  METRIC_CONFIG,
  SESSION_QUERY_KEYS,
  coordinatesToWktPolygon,
  debounce,
  extractPolygonIdFromSaveResponse,
  getColorForMetricValue,
  hexToRgbaArray,
  normalizeMetric,
  parseSessionIds,
  readInitialMapZoomLock,
  toFiniteNumber,
  toSessionCsv,
} from "@/utils/unifiedMapConfig";

const UnifiedMapSidebar = lazy(
  () => import("@/components/unifiedMap/UnifiedMapSideBar.jsx"),
);
const UnifiedDetailLogs = lazy(
  () => import("@/components/unifiedMap/UnifiedDetailLogs"),
);

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

const readLogTimestampMs = (loc) => {
  const raw =
    loc?.timestamp ??
    loc?.Timestamp ??
    loc?.time_stamp ??
    loc?.timeStamp ??
    loc?.log_time ??
    loc?.logTime;
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const readLogSessionKey = (loc) => {
  const value = loc?.session_id ?? loc?.sessionId ?? loc?.SessionId ?? loc?.sessionID;
  const key = String(value ?? "").trim();
  return key || null;
};

const isWifiLogRow = (row) => {
  const type = String(
    row?.connection_type ?? row?.connectionType ?? row?.log_type ?? row?.type ?? "",
  ).trim().toLowerCase();
  if (type === "wifi" || type === "wi-fi" || row?.is_wifi === true) return true;

  const primaryInfo = String(row?.primary_cell_info_1 ?? row?.primaryCellInfo1 ?? "");
  return primaryInfo.includes("SSID:") || primaryInfo.includes("BSSID:");
};

const cleanWifiProviderName = (value) => {
  const text = String(value ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (!text) return null;
  if (/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(text)) return null;
  return text;
};

const getProviderDisplayName = (row) => {
  if (isWifiLogRow(row)) {
    return (
      cleanWifiProviderName(row?.provider) ||
      cleanWifiProviderName(row?.Provider) ||
      cleanWifiProviderName(row?.m_alpha_short) ||
      cleanWifiProviderName(row?.m_alpha_long) ||
      null
    );
  }

  return normalizeProviderName(
    row?.provider ?? row?.Provider ?? row?.m_alpha_long ?? row?.operator ?? row?.Operator ?? "",
  );
};

const formatDurationClock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};

const getNormalizedLocationTechnology = (row = {}) => {
  const band =
    row?.band ??
    row?.Band ??
    row?.primaryBand ??
    row?.primary_band ??
    row?.neighbourBand ??
    null;

  const candidates = [
    row?.network,
    row?.Network,
    row?.rat,
    row?.RAT,
    row?.radio_access_technology,
    row?.RadioAccessTechnology,
    row?.technology,
    row?.Technology,
    row?.networkType,
    row?.NetworkType,
    row?.network_type,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTechName(candidate, band);
    if (normalized && String(normalized).trim().toLowerCase() !== "unknown") {
      return normalized;
    }
  }

  return "Unknown";
};

const buildDurationRowsFromNetworkLogs = (logs = []) => {
  if (!Array.isArray(logs) || logs.length < 2) return [];

  const orderedLogs = logs
    .map((loc, index) => ({
      loc,
      index,
      sessionKey: readLogSessionKey(loc),
      timestampMs: readLogTimestampMs(loc),
    }))
    .filter((entry) => entry.sessionKey && Number.isFinite(entry.timestampMs))
    .sort((a, b) => {
      const sessionDiff = String(a.sessionKey).localeCompare(String(b.sessionKey));
      if (sessionDiff !== 0) return sessionDiff;
      if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
      return a.index - b.index;
    });

  const totals = new Map();

  for (let i = 0; i < orderedLogs.length - 1; i += 1) {
    const current = orderedLogs[i];
    const next = orderedLogs[i + 1];
    if (current.sessionKey !== next.sessionKey) continue;

    const diffSeconds = (next.timestampMs - current.timestampMs) / 1000;
    if (diffSeconds <= 0 || diffSeconds > 3600) continue;

    const row = current.loc || {};
    const provider = getProviderDisplayName(row);
    const networkType = getNormalizedLocationTechnology(row);

    if (!provider || String(provider).trim().toLowerCase() === "unknown") continue;
    if (!networkType || String(networkType).trim().toLowerCase() === "unknown") continue;

    const key = `${provider}|${networkType}`;
    totals.set(key, (totals.get(key) || 0) + diffSeconds);
  }

  return Array.from(totals.entries())
    .map(([key, seconds]) => {
      const [provider, networkType] = key.split("|");
      return {
        provider,
        networkType,
        timeSeconds: Math.round(seconds * 100) / 100,
        totaltime: formatDurationClock(seconds),
      };
    })
    .sort((a, b) => b.timeSeconds - a.timeSeconds);
};

const areCentersEqual = (a, b, tolerance = 1e-7) => {
  if (!a || !b) return false;
  return (
    Math.abs(Number(a.lat) - Number(b.lat)) <= tolerance &&
    Math.abs(Number(a.lng) - Number(b.lng)) <= tolerance
  );
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

const isPointInPolygon = (point, polygon) => {
  const path = getPolygonPath(polygon);
  if (!Array.isArray(path) || path.length < 3) return false;
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
    const xi = Number(path[i]?.lng);
    const yi = Number(path[i]?.lat);
    const xj = Number(path[j]?.lng);
    const yj = Number(path[j]?.lat);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

function getPolygonPath(polygon) {
  const rawPaths = polygon?.paths;
  if (Array.isArray(polygon?.path)) return polygon.path;
  if (Array.isArray(rawPaths?.[0])) return rawPaths[0];
  if (Array.isArray(rawPaths)) return rawPaths;
  return [];
}

const getGridCellBounds = (point = {}) => {
  if (Array.isArray(point?.polygon) && point.polygon.length >= 4) {
    const coords = point.polygon
      .map((coord) => ({
        lng: Number(coord?.[0] ?? coord?.lng),
        lat: Number(coord?.[1] ?? coord?.lat),
      }))
      .filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lng));
    if (coords.length >= 4) {
      return {
        south: Math.min(...coords.map((coord) => coord.lat)),
        north: Math.max(...coords.map((coord) => coord.lat)),
        west: Math.min(...coords.map((coord) => coord.lng)),
        east: Math.max(...coords.map((coord) => coord.lng)),
      };
    }
  }

  const bounds = point?.bounds || {};
  const south = Number(bounds.south ?? point.min_lat);
  const north = Number(bounds.north ?? point.max_lat);
  const west = Number(bounds.west ?? point.min_lon);
  const east = Number(bounds.east ?? point.max_lon);
  if ([south, north, west, east].every(Number.isFinite) && north > south && east > west) {
    return { south, north, west, east };
  }
  return null;
};

const getPolygonArea = (path = []) => {
  if (!Array.isArray(path) || path.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    area += Number(path[j].lng) * Number(path[i].lat) - Number(path[i].lng) * Number(path[j].lat);
  }
  return Math.abs(area) / 2;
};

const interpolateByLng = (start, end, lng) => {
  const delta = end.lng - start.lng;
  if (Math.abs(delta) < 1e-12) return { lat: start.lat, lng };
  const t = (lng - start.lng) / delta;
  return { lat: start.lat + (end.lat - start.lat) * t, lng };
};

const interpolateByLat = (start, end, lat) => {
  const delta = end.lat - start.lat;
  if (Math.abs(delta) < 1e-12) return { lat, lng: start.lng };
  const t = (lat - start.lat) / delta;
  return { lat, lng: start.lng + (end.lng - start.lng) * t };
};

const clipPolygon = (path, isInside, getIntersection) => {
  if (!Array.isArray(path) || path.length === 0) return [];
  const output = [];
  let previous = path[path.length - 1];
  let previousInside = isInside(previous);

  path.forEach((current) => {
    const currentInside = isInside(current);
    if (currentInside) {
      if (!previousInside) output.push(getIntersection(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(getIntersection(previous, current));
    }
    previous = current;
    previousInside = currentInside;
  });

  return output.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
};

const getPolygonRectOverlapArea = (polygon, bounds) => {
  if (!bounds) return 0;
  const path = getPolygonPath(polygon)
    .map((point) => ({ lat: Number(point?.lat), lng: Number(point?.lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (path.length < 3) return 0;

  let clipped = path;
  clipped = clipPolygon(clipped, (p) => p.lng >= bounds.west, (a, b) => interpolateByLng(a, b, bounds.west));
  clipped = clipPolygon(clipped, (p) => p.lng <= bounds.east, (a, b) => interpolateByLng(a, b, bounds.east));
  clipped = clipPolygon(clipped, (p) => p.lat >= bounds.south, (a, b) => interpolateByLat(a, b, bounds.south));
  clipped = clipPolygon(clipped, (p) => p.lat <= bounds.north, (a, b) => interpolateByLat(a, b, bounds.north));
  return getPolygonArea(clipped);
};

const getWeightedGridAverageForPolygon = (polygon, points = [], metric, useGridWeights) => {
  let weightedSum = 0;
  let totalWeight = 0;
  let contributingCells = 0;

  points.forEach((point) => {
    const direct = parseFloat(point?.[metric]);
    const value = !Number.isNaN(direct)
      ? direct
      : parseFloat(point?.metric_value ?? point?.value);
    if (!Number.isFinite(value)) return;

    let weight = 0;
    if (useGridWeights) {
      weight = getPolygonRectOverlapArea(polygon, getGridCellBounds(point));
    } else if (isPointInPolygon(point, polygon)) {
      weight = 1;
    }

    if (weight <= 0) return;
    weightedSum += value * weight;
    totalWeight += weight;
    contributingCells += 1;
  });

  return {
    average: totalWeight > 0 ? weightedSum / totalWeight : null,
    count: contributingCells,
  };
};

const getGridCellCssColor = (cell, metric, thresholds) => {
  const direct = parseFloat(cell?.[metric]);
  const value = !Number.isNaN(direct)
    ? direct
    : parseFloat(cell?.metric_value ?? cell?.value);
  return Number.isFinite(value)
    ? getColorFromValueOrMetric(value, thresholds, metric)
    : "#64748b";
};

const clipSegmentToBounds = (start, end, bounds) => {
  if (!bounds) return null;
  const x0 = Number(start.lng);
  const y0 = Number(start.lat);
  const x1 = Number(end.lng);
  const y1 = Number(end.lat);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;

  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const checks = [
    [-dx, x0 - bounds.west],
    [dx, bounds.east - x0],
    [-dy, y0 - bounds.south],
    [dy, bounds.north - y0],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      t0 = Math.max(t0, r);
    } else {
      t1 = Math.min(t1, r);
    }
    if (t0 > t1) return null;
  }

  if (t1 - t0 < 1e-6) return null;
  return [
    { lat: y0 + dy * t0, lng: x0 + dx * t0 },
    { lat: y0 + dy * t1, lng: x0 + dx * t1 },
  ];
};

const getSegmentProgress = (point, start, end) => {
  const dx = Number(end.lng) - Number(start.lng);
  const dy = Number(end.lat) - Number(start.lat);
  const denominator = dx * dx + dy * dy;
  if (denominator <= 1e-20) return 0;
  return (((Number(point.lng) - Number(start.lng)) * dx) + ((Number(point.lat) - Number(start.lat)) * dy)) / denominator;
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

const getCircleBoundaryPoints = (circle, pointCount = 48) => {
  const centerLat = Number(circle?.center?.lat);
  const centerLng = Number(circle?.center?.lng);
  const radiusMeters = Number(circle?.radius);
  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0
  ) {
    return [];
  }

  const earthRadiusMeters = 6378137;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const centerLatRad = (centerLat * Math.PI) / 180;
  const centerLngRad = (centerLng * Math.PI) / 180;

  return Array.from({ length: pointCount }, (_, index) => {
    const bearing = (2 * Math.PI * index) / pointCount;
    const latRad = Math.asin(
      Math.sin(centerLatRad) * Math.cos(angularDistance) +
        Math.cos(centerLatRad) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lngRad =
      centerLngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatRad),
        Math.cos(angularDistance) - Math.sin(centerLatRad) * Math.sin(latRad),
      );

    return {
      lat: (latRad * 180) / Math.PI,
      lng: (lngRad * 180) / Math.PI,
    };
  });
};

const getSaveableShapeCoordinates = (shape) => {
  const geometry = shape?.geometry;
  if (!geometry) return [];

  if (
    geometry.type === "polygon" &&
    Array.isArray(geometry.polygon) &&
    geometry.polygon.length >= 3
  ) {
    return geometry.polygon;
  }

  const rectangle = geometry.rectangle;
  if (geometry.type === "rectangle" && rectangle?.sw && rectangle?.ne) {
    const south = Number(rectangle.sw.lat);
    const west = Number(rectangle.sw.lng);
    const north = Number(rectangle.ne.lat);
    const east = Number(rectangle.ne.lng);
    if ([south, west, north, east].every(Number.isFinite)) {
      return [
        { lat: south, lng: west },
        { lat: north, lng: west },
        { lat: north, lng: east },
        { lat: south, lng: east },
      ];
    }
  }

  if (geometry.type === "circle" && geometry.circle) {
    return getCircleBoundaryPoints(geometry.circle);
  }

  return [];
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

const splitAppNames = (value) =>
  String(value ?? "")
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);

const locationMatchesSelectedApps = (location, selectedApps = []) => {
  if (!selectedApps?.length) return true;
  const selected = new Set(
    selectedApps.map((app) => String(app ?? "").trim().toLowerCase()).filter(Boolean),
  );
  if (selected.size === 0) return true;
  const rowApps = splitAppNames(
    location?.apps ??
      location?.app ??
      location?.appName ??
      location?.AppName ??
      location?.application ??
      location?.Application,
  ).map((app) => app.toLowerCase());
  return rowApps.some((app) => selected.has(app));
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

const readHandoverMetric = (loc, keys = []) => {
  for (const key of keys) {
    const value = loc?.[key];
    if (value !== null && value !== undefined && value !== "") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readHandoverValue = (loc, keys = []) => {
  for (const key of keys) {
    const value = loc?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
};

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

  let prevTech = normalizeTechName(
    readHandoverValue(orderedLogs[0].loc, ["technology", "Technology", "networkType", "network"]),
    readHandoverValue(orderedLogs[0].loc, ["band", "Band", "primaryBand"]),
  );
  let prevBand = readHandoverValue(orderedLogs[0].loc, ["band", "Band", "primaryBand"]);
  let prevPci = readHandoverValue(orderedLogs[0].loc, ["pci", "PCI", "Pci", "physical_cell_id", "cell_id"]);
  let prevSessionKey = orderedLogs[0].sessionKey;
  let prevEntry = orderedLogs[0];

  for (let i = 1; i < orderedLogs.length; i++) {
    const currentEntry = orderedLogs[i];
    const loc = currentEntry.loc;
    if (!loc) continue;

    if (currentEntry.sessionKey !== prevSessionKey) {
      prevTech = normalizeTechName(
        readHandoverValue(loc, ["technology", "Technology", "networkType", "network"]),
        readHandoverValue(loc, ["band", "Band", "primaryBand"]),
      );
      prevBand = readHandoverValue(loc, ["band", "Band", "primaryBand"]);
      prevPci = readHandoverValue(loc, ["pci", "PCI", "Pci", "physical_cell_id", "cell_id"]);
      prevSessionKey = currentEntry.sessionKey;
      prevEntry = currentEntry;
      continue;
    }

    const lat = Number(loc.lat ?? loc.latitude);
    const lng = Number(loc.lng ?? loc.longitude);
    const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
    const displaySessionId =
      loc?.session_id ?? loc?.sessionId ?? loc?.SessionId ?? null;
    const previousLog = prevEntry?.loc || {};
    const signalMeta = {
      rsrp: readHandoverMetric(previousLog, ["rsrp", "RSRP", "Rsrp", "lte_rsrp", "nr_rsrp"]),
      nextRsrp: readHandoverMetric(loc, ["rsrp", "RSRP", "Rsrp", "lte_rsrp", "nr_rsrp"]),
      rsrq: readHandoverMetric(previousLog, ["rsrq", "RSRQ", "Rsrq", "lte_rsrq", "nr_rsrq"]),
      nextRsrq: readHandoverMetric(loc, ["rsrq", "RSRQ", "Rsrq", "lte_rsrq", "nr_rsrq"]),
      sinr: readHandoverMetric(previousLog, ["sinr", "SINR", "Sinr", "snr", "SNR", "lte_sinr", "nr_sinr"]),
      nextSinr: readHandoverMetric(loc, ["sinr", "SINR", "Sinr", "snr", "SNR", "lte_sinr", "nr_sinr"]),
      pci: readHandoverValue(previousLog, ["pci", "PCI", "Pci", "physical_cell_id", "cell_id"]),
      nextPci: readHandoverValue(loc, ["pci", "PCI", "Pci", "physical_cell_id", "cell_id"]),
    };
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
      ...signalMeta,
    };
    const prevLat = Number(prevEntry?.loc?.lat ?? prevEntry?.loc?.latitude);
    const prevLng = Number(prevEntry?.loc?.lng ?? prevEntry?.loc?.longitude);
    if (Number.isFinite(prevLat) && Number.isFinite(prevLng) && hasCoordinates) {
      transitionMeta.fromLat = prevLat;
      transitionMeta.fromLng = prevLng;
      transitionMeta.toLat = lat;
      transitionMeta.toLng = lng;
    }

    const currTech = normalizeTechName(
      readHandoverValue(loc, ["technology", "Technology", "networkType", "network"]),
      readHandoverValue(loc, ["band", "Band", "primaryBand"]),
    );
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

    const currBand = readHandoverValue(loc, ["band", "Band", "primaryBand"]);
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

    const currPci = readHandoverValue(loc, ["pci", "PCI", "Pci", "physical_cell_id", "cell_id"]);
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

const calculateAverage = (values) => {
  if (!values?.length) return null;
  const validValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
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

const HANDOVER_LEGEND_META = {
  technology: { label: "Technology", dotClass: "bg-emerald-500" },
  band: { label: "Band", dotClass: "bg-violet-500" },
  pci: { label: "PCI", dotClass: "bg-blue-500" },
};

const getHandoverPairLabel = (transition = {}) => {
  const from = String(transition.from ?? "Unknown").trim() || "Unknown";
  const to = String(transition.to ?? "Unknown").trim() || "Unknown";
  return `${from} -> ${to}`;
};

const summarizeHandoverPairsForLegend = (transitions = [], limit = 8) => {
  const pairCounts = new Map();

  transitions.forEach((transition) => {
    const pair = getHandoverPairLabel(transition);
    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
  });

  const items = Array.from(pairCounts.entries())
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair));

  return {
    items: items.slice(0, limit),
    hiddenCount: Math.max(0, items.length - limit),
    total: transitions.length,
  };
};

const HandoverLegend = React.memo(({
  techEnabled,
  bandEnabled,
  pciEnabled,
  technologyTransitions = [],
  bandTransitions = [],
  pciTransitions = [],
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const sections = useMemo(() => {
    const nextSections = [];
    if (techEnabled && technologyTransitions.length > 0) {
      nextSections.push({
        type: "technology",
        ...summarizeHandoverPairsForLegend(technologyTransitions),
      });
    }
    if (bandEnabled && bandTransitions.length > 0) {
      nextSections.push({
        type: "band",
        ...summarizeHandoverPairsForLegend(bandTransitions),
      });
    }
    if (pciEnabled && pciTransitions.length > 0) {
      nextSections.push({
        type: "pci",
        ...summarizeHandoverPairsForLegend(pciTransitions),
      });
    }
    return nextSections;
  }, [
    bandEnabled,
    bandTransitions,
    pciEnabled,
    pciTransitions,
    techEnabled,
    technologyTransitions,
  ]);

  const totalHandovers = useMemo(
    () => sections.reduce((sum, section) => sum + section.total, 0),
    [sections],
  );

  if (sections.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-[25] w-[min(340px,calc(100vw-32px))] rounded-lg border border-slate-700/70 bg-slate-950/92 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-t-lg px-3 py-2.5 text-left transition hover:bg-white/5"
      >
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-white">Handover Legend</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{totalHandovers} events by from-to case</div>
        </div>
        <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed && (
        <div className="max-h-[360px] overflow-y-auto border-t border-slate-800 px-3 py-3">
          <div className="space-y-4">
            {sections.map((section) => {
              const meta = HANDOVER_LEGEND_META[section.type] || HANDOVER_LEGEND_META.technology;
              return (
                <section key={section.type} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dotClass}`} />
                      <span className="truncate text-xs font-semibold text-slate-100">{meta.label}</span>
                    </div>
                    <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                      {section.total}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {section.items.map((item) => (
                      <div
                        key={`${section.type}-${item.pair}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-slate-900/80 px-2 py-1.5"
                        title={`${item.pair}: ${item.count}`}
                      >
                        <span className="min-w-0 truncate text-[11px] font-medium text-slate-200">
                          {item.pair}
                        </span>
                        <span className="shrink-0 rounded bg-blue-500/15 px-2 py-0.5 text-[11px] font-bold text-blue-100">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>

                  {section.hiddenCount > 0 && (
                    <div className="text-[11px] text-slate-500">
                      +{section.hiddenCount} more cases
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
HandoverLegend.displayName = "HandoverLegend";

// --- Main Component ---

const UnifiedMapView = () => {
  // ... (State hooks remain exactly the same) ...
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSideOpen, setIsSideOpen] = useState(false);
  const [shouldRenderSidebar, setShouldRenderSidebar] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const mapSnapshotContainerRef = useRef(null);
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
  const [isZoomLocked, setIsZoomLocked] = useState(readInitialMapZoomLock);
  const [colorBy, setColorBy] = useState(null);
  const [highlightedLogs, setHighlightedLogs] = useState(null);

  const [enableDataToggle, setEnableDataToggle] = useState(true);
  const [dataToggle, setDataToggle] = useState("sample");
  const isSampleMode = enableDataToggle && dataToggle === "sample";
  const [enableSiteToggle, setEnableSiteToggle] = useState(false);
  const [siteToggle, setSiteToggle] = useState("Cell");
  const [sitePredictionVersion, setSitePredictionVersion] = useState("original");
  const [sitePredictionScenarioId, setSitePredictionScenarioId] = useState(null);
  const [sitePredictionScenarioOptions, setSitePredictionScenarioOptions] = useState([]);
  const [modeMethod, setModeMethod] = useState("Operator");
  const [siteLabelField, setSiteLabelField] = useState("none");
  const [showSiteMarkers, setShowSiteMarkers] = useState(true);
  const [showSiteSectors, setShowSiteSectors] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [showSubSession, setShowSubSession] = useState(false);
  const [selectedSubSessionTarget, setSelectedSubSessionTarget] = useState(null);

  const [showPolygons, setShowPolygons] = useState(false);
  const [polygonSource, setPolygonSource] = useState("map");
  const [projectPolygonEditEnabled, setProjectPolygonEditEnabled] =
    useState(false);
  const [editedProjectPolygons, setEditedProjectPolygons] = useState({});
  const [isSavingEditedProjectPolygons, setIsSavingEditedProjectPolygons] =
    useState(false);
  const polygonOpacity = 1;
  const [onlyInsidePolygons] = useState(true);
  const [areaEnabled, setAreaEnabled] = useState(false);
  const [ltePredictionUseBuildings, setLtePredictionUseBuildings] = useState(true);
  const [buildingBorderEnabled, setBuildingBorderEnabled] = useState(false);
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
    overlapDrawOrder: "original",
  });

  const [drawnPoints, setDrawnPoints] = useState(null);
  const [drawnShapeAnalytics, setDrawnShapeAnalytics] = useState([]);
  const [newProjectPolygonName, setNewProjectPolygonName] = useState("");
  const [isSavingProjectPolygon, setIsSavingProjectPolygon] = useState(false);
  const [legendFilter, setLegendFilter] = useState(null);
  const [siteLegendFilter, setSiteLegendFilter] = useState(null);
  const [siteColorOverrides, setSiteColorOverrides] = useState({});
  const [opacity, setOpacity] = useState(0.8);
  const [logRadius, setLogRadius] = useState(10);
  const [neighborSquareSize, setNeighborSquareSize] = useState(12);
  const [triangleScaleMultiplier, setTriangleScaleMultiplier] = useState(1);
  const [defaultSiteBeamwidth, setDefaultSiteBeamwidth] = useState(30);
  const [showSessionNeighbors, setShowSessionNeighbors] = useState(false);
  const autoShowSessionNeighbors = useMemo(() => {
    const value =
      searchParams.get("showSecondary") ||
      searchParams.get("showSessionNeighbors") ||
      searchParams.get("secondary");
    return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
  }, [searchParams]);

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
  const [renderedGridLegendLogs, setRenderedGridLegendLogs] = useState(EMPTY_LIST);
  const [lteGridEnabled, setLteGridEnabled] = useState(false);
  const [lteGridSizeMeters, setLteGridSizeMeters] = useState(50);
  const [lteGridAggregationMethod, setLteGridAggregationMethod] =
    useState("median");
  const [storedGridMetricMode, setStoredGridMetricMode] = useState("max");
  const [storedGridVersion, setStoredGridVersion] = useState("original");
  const [storedGridScenarioId, setStoredGridScenarioId] = useState(null);
  const [storedGridScenarioOptions, setStoredGridScenarioOptions] = useState([]);
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
  const [showMetricLabels, setShowMetricLabels] = useState(false);
  const [indoor, setIndoor] = useState([]);
  const [outdoor, setOutdoor] = useState([]);
  const [distance, setDistance] = useState(null);
  const [pciDistData, setPciDistData] = useState(null);
  const [pciThreshold, setPciThreshold] = useState(0);
  const [dominanceData, setDominanceData] = useState([]);
  const [manualSiteData, setManualSiteData] = useState([]);
  const [manualSiteLoading, setManualSiteLoading] = useState(false);
  const [manualSiteDataReady, setManualSiteDataReady] = useState(false);

  useEffect(() => {
    if (isSideOpen) {
      setShouldRenderSidebar(true);
    }
  }, [isSideOpen]);

  useEffect(() => {
    if (!enableSiteToggle) {
      setManualSiteData([]);
      setManualSiteLoading(false);
      setManualSiteDataReady(false);
      setSelectedSites([]);
      setSiteLegendFilter(null);
    }
  }, [enableSiteToggle]);

  useEffect(() => {
    if (!enableDataToggle) {
      setShowSessionNeighbors(false);
    }
  }, [enableDataToggle]);

  useEffect(() => {
    const normalizedMetric = String(selectedMetric || "").trim().toLowerCase();
    if (!enableGrid) {
      if (GRID_ONLY_METRICS.includes(normalizedMetric)) {
        setSelectedMetric("rsrp");
      }
      return;
    }

    if (!GRID_VIEW_SUPPORTED_METRICS.includes(normalizedMetric)) {
      setSelectedMetric("rsrp");
    }

  }, [enableGrid, selectedMetric, colorBy, setSelectedMetric]);

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

  const handleSitesLoaded = useCallback((data, isLoading) => {
    setManualSiteData(Array.isArray(data) ? data : []);
    setManualSiteLoading(Boolean(isLoading));
    setManualSiteDataReady(true);
  }, []);

  const handleSitePredictionScenarioSaved = useCallback((scenario) => {
    const scenarioId = Number(scenario);
    if (!Number.isFinite(scenarioId) || scenarioId <= 0) return;

    setSitePredictionVersion("updated");
    setSitePredictionScenarioId(scenarioId);
    setSitePredictionScenarioOptions((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const exists = current.some((item) => Number(item?.scenario_id) === scenarioId);
      const next = exists
        ? current.map((item) =>
            Number(item?.scenario_id) === scenarioId
              ? {
                  ...item,
                  scenario_id: scenarioId,
                  scenario_name: item?.scenario_name || `Scenario ${scenarioId}`,
                  status: item?.status || "updated",
                }
              : item,
          )
        : [
            ...current,
            {
              scenario_id: scenarioId,
              scenario_name: `Scenario ${scenarioId}`,
              status: "updated",
            },
          ];

      return next.sort((a, b) => Number(a?.scenario_id) - Number(b?.scenario_id));
    });
  }, []);

  const handleSiteLegendColorChange = useCallback((item, color) => {
    const mode = String(item?.mode || "").trim().toLowerCase();
    const value = String(item?.value ?? item?.label ?? "").trim().toLowerCase();
    const nextColor = String(color || "").trim();
    if (!mode || !value || !/^#[0-9a-f]{6}$/i.test(nextColor)) return;
    setSiteColorOverrides((prev) => ({
      ...prev,
      [`${mode}:${value}`]: nextColor,
    }));
  }, []);

  useEffect(() => {
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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MAP_ZOOM_LOCK_STORAGE_KEY, isZoomLocked ? "1" : "0");
      window.dispatchEvent(
        new CustomEvent(MAP_ZOOM_LOCK_EVENT, {
          detail: { locked: Boolean(isZoomLocked) },
        }),
      );
    }
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

  useEffect(() => {
    const handleMapZoomLockChange = (event) => {
      if (!event?.detail || typeof event.detail.locked !== "boolean") return;
      setIsZoomLocked(event.detail.locked);
    };

    window.addEventListener(MAP_ZOOM_LOCK_EVENT, handleMapZoomLockChange);
    return () => {
      window.removeEventListener(MAP_ZOOM_LOCK_EVENT, handleMapZoomLockChange);
    };
  }, []);

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

  const projectAreaGridSizeMeters = useMemo(() => {
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

  const projectLogGridSizeMeters = useMemo(() => {
    const raw =
      project?.log_grid ??
      project?.logGrid ??
      project?.LogGrid ??
      project?.LogGridSize ??
      passedProject?.log_grid ??
      passedProject?.logGrid ??
      passedProject?.LogGrid ??
      passedProject?.LogGridSize ??
      projectAreaGridSizeMeters;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(5, Math.round(parsed));
  }, [project, passedProject, projectAreaGridSizeMeters]);

  const projectId = useMemo(() => {
    const param = searchParams.get("project_id") ?? searchParams.get("project");
    return param ? Number(param) : null;
  }, [searchParams]);

  useEffect(() => {
    setSiteLegendFilter(null);
  }, [modeMethod, siteLabelField, sitePredictionVersion, siteToggle, projectId]);

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
    if (
      Number.isFinite(projectAreaGridSizeMeters) &&
      projectAreaGridSizeMeters > 0
    ) {
      setLteGridSizeMeters((prev) =>
        Math.abs((Number(prev) || 0) - projectAreaGridSizeMeters) < 0.001
          ? prev
          : projectAreaGridSizeMeters,
      );
    }

    if (
      Number.isFinite(projectLogGridSizeMeters) &&
      projectLogGridSizeMeters > 0
    ) {
      setGridSizeMeters((prev) =>
        Math.abs((Number(prev) || 0) - projectLogGridSizeMeters) < 0.001
          ? prev
          : projectLogGridSizeMeters,
      );
    }
  }, [projectAreaGridSizeMeters, projectLogGridSizeMeters]);

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
  const [manualSessionIds, setManualSessionIds] = useState(null);

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
    if (Array.isArray(manualSessionIds)) {
      return manualSessionIds;
    }
    const explicit = parseSessionIds(querySessionParam || fallbackSessionParam);
    if (explicit.length > 0) return explicit;
    if (inferredSessionIdsFromPassedLogs.length > 0) {
      return inferredSessionIdsFromPassedLogs;
    }
    return [];
  }, [
    manualSessionIds,
    querySessionParam,
    fallbackSessionParam,
    inferredSessionIdsFromPassedLogs,
  ]);
  const sessionKey = useMemo(() => sessionIds.join(","), [sessionIds]);

  const handleSessionIdsChange = useCallback(
    async (nextSessionIds) => {
      const normalized = parseSessionIds(nextSessionIds);
      const nextSessionParam = normalized.join(",");
      setManualSessionIds(normalized);

      setSearchParams(
        (prevParams) => {
          const nextParams = new URLSearchParams(prevParams);
          SESSION_QUERY_KEYS.forEach((key) => nextParams.delete(key));

          if (nextSessionParam) {
            nextParams.set("session", nextSessionParam);
          }

          return nextParams;
        },
        { replace: true },
      );

      if (!projectId) return;

      try {
        const response = await mapViewApi.updateProjectSessions({
          ProjectId: Number(projectId),
          SessionIds: normalized.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
        });
        const updatedProject = response?.Data || response?.data || null;
        const nextProject = updatedProject
          ? { ...(project || {}), ...updatedProject }
          : { ...(project || {}), id: projectId, ref_session_id: nextSessionParam };

        setProject(nextProject);
        upsertProjectInProjectsCache(nextProject);
        toast.success("Project sessions saved.");
      } catch (error) {
        toast.error(error?.message || "Could not save project sessions.");
      }
    },
    [project, projectId, setSearchParams],
  );

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
    error: areaError,
    refetch: refetchAreaPolygons,
  } = useAreaPolygons(projectId, areaEnabled);

  const effectiveProjectPolygons = useMemo(() => {
    if (!polygons?.length) return [];
    return polygons.map((poly) => {
      const edited = editedProjectPolygons[poly.uid];
      if (!edited) return poly;
      return {
        ...poly,
        paths: edited.paths,
        bbox: edited.bbox || poly.bbox,
      };
    });
  }, [editedProjectPolygons, polygons]);

  const rawFilteringPolygons = useMemo(
    () => [
      ...(effectiveProjectPolygons ? effectiveProjectPolygons : []),
      ...(areaEnabled && areaData ? areaData : []),
    ],
    [effectiveProjectPolygons, areaEnabled, areaData],
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
  const canEnableUnifiedGridView = hasFilteringPolygons;

  useEffect(() => {
    if (enableGrid && !canEnableUnifiedGridView) {
      setEnableGrid(false);
    }
  }, [enableGrid, canEnableUnifiedGridView]);

  const shouldFetchSamples =
    isSampleMode && sessionIds.length > 0;

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
    2000000,
    projectId,
  );

  const sampleLocations = Array.isArray(fetchedSamples) && fetchedSamples.length > 0
    ? fetchedSamples
    : (hasPassedLocations ? passedLocations : fetchedSamples);

  const getCachedNetworkLogsForPrediction = useCallback(
    ({ projectId: requestedProjectId, sessionIds: requestedSessionIds } = {}) => {
      const requestedKey = (Array.isArray(requestedSessionIds) ? requestedSessionIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b)
        .join(",");
      const currentKey = (Array.isArray(sessionIds) ? sessionIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b)
        .join(",");
      const sameProject = String(requestedProjectId ?? "") === String(projectId ?? "");
      const cacheRows = Array.isArray(fetchedSamples) ? fetchedSamples : [];
      if (sameProject && requestedKey && requestedKey === currentKey && cacheRows.length > 0) {
        console.info("[LTE_PREDICTION_INPUT] UnifiedMapView memory cache hit", {
          projectId: requestedProjectId,
          sessionIds: requestedKey,
          rows: cacheRows.length,
        });
        return cacheRows;
      }
      console.info("[LTE_PREDICTION_INPUT] UnifiedMapView memory cache miss", {
        requestedProjectId,
        currentProjectId: projectId,
        requestedSessionIds: requestedKey,
        currentSessionIds: currentKey,
        rows: cacheRows.length,
      });
      return [];
    },
    [fetchedSamples, projectId, sessionIds],
  );

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

  const handleDeltaGridFetchStored = useCallback(async ({ version, scenarioId } = {}) => {
    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a valid project before fetching grid analytics.");
      return false;
    }

    const normalizedVersion = String(version || storedGridVersion || "original")
      .trim()
      .toLowerCase();
    const effectiveScenarioId = Number(scenarioId ?? storedGridScenarioId) || undefined;
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
        version: normalizedVersion,
        scenario_id:
          normalizedVersion === "updated" || normalizedVersion === "optimized" || normalizedVersion === "optimised" || normalizedVersion === "delta"
            ? effectiveScenarioId
            : undefined,
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
        storedGridVersion: normalizedVersion,
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
        storedGridVersion: normalizedVersion,
        gridVisible: false,
        requestedGridSize,
        lastUpdatedAt: new Date().toISOString(),
      }));
      toast.error(message);
      return false;
    }
  }, [projectId, lteGridSizeMeters, setLteGridSizeMeters, storedGridVersion, storedGridScenarioId]);

  useEffect(() => {
    const normalizedVersion = String(storedGridVersion || "original").trim().toLowerCase();
    const shouldLoadScenarios =
      normalizedVersion === "updated" ||
      normalizedVersion === "optimized" ||
      normalizedVersion === "optimised" ||
      normalizedVersion === "delta";
    if (!shouldLoadScenarios) {
      setStoredGridScenarioOptions([]);
      setStoredGridScenarioId(null);
      return;
    }

    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      setStoredGridScenarioOptions([]);
      setStoredGridScenarioId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await gridAnalyticsApi.getOptimizationScenarios({ projectId: numericProjectId });
        const root =
          response?.data && typeof response.data === "object" ? response.data : response || {};
        const rows = Array.isArray(root?.Data)
          ? root.Data
          : Array.isArray(root?.data?.Data)
            ? root.data.Data
            : Array.isArray(root?.data)
              ? root.data
              : [];
        const options = rows
          .map((row) => ({
            scenario_id: Number(row?.public_scenario_id ?? row?.publicScenarioId ?? row?.scenario_id ?? row?.id ?? 0),
            scenario_name: String(row?.scenario_name ?? row?.name ?? "").trim(),
            status: String(row?.status || "").trim(),
            created_at: row?.created_at || null,
          }))
          .filter((row) => Number.isFinite(row.scenario_id) && row.scenario_id > 0);

        if (cancelled) return;
        setStoredGridScenarioOptions(options);
        setStoredGridScenarioId((prev) => {
          if (Number.isFinite(Number(prev)) && options.some((o) => o.scenario_id === Number(prev))) {
            return Number(prev);
          }
          return options.length > 0 ? options[0].scenario_id : null;
        });
      } catch {
        if (cancelled) return;
        setStoredGridScenarioOptions([]);
        setStoredGridScenarioId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, storedGridVersion]);

  const handleDeleteStoredGridScenario = useCallback(async (scenarioIdFromRow = null) => {
    const numericProjectId = Number(projectId);
    const numericScenarioId = Number(scenarioIdFromRow ?? storedGridScenarioId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a valid project before deleting scenario.");
      return;
    }
    if (!Number.isFinite(numericScenarioId) || numericScenarioId <= 0) {
      toast.error("Select a valid scenario to delete.");
      return;
    }

    const confirmed = window.confirm(
      `Delete stored grid Scenario ${numericScenarioId} for project ${numericProjectId}?`,
    );
    if (!confirmed) return;

    try {
      await mapViewApi.deleteLtePredictionOptimisedScenario({
        ProjectId: numericProjectId,
        ScenarioId: numericScenarioId,
      });
      toast.success(`Stored grid scenario ${numericScenarioId} deleted.`);

      const response = await gridAnalyticsApi.getOptimizationScenarios({ projectId: numericProjectId });
      const root =
        response?.data && typeof response.data === "object" ? response.data : response || {};
      const rows = Array.isArray(root?.Data)
        ? root.Data
        : Array.isArray(root?.data?.Data)
          ? root.data.Data
          : Array.isArray(root?.data)
            ? root.data
            : [];
      const options = rows
        .map((row) => ({
          scenario_id: Number(row?.public_scenario_id ?? row?.publicScenarioId ?? row?.scenario_id ?? row?.id ?? 0),
          scenario_name: String(row?.scenario_name ?? row?.name ?? "").trim(),
          status: String(row?.status || "").trim(),
          created_at: row?.created_at || null,
        }))
        .filter(
          (row) =>
            Number.isFinite(row.scenario_id) &&
            row.scenario_id > 0 &&
            row.scenario_id !== numericScenarioId,
        );
      const currentScenarioId = Number(storedGridScenarioId);
      const nextScenarioId =
        Number.isFinite(currentScenarioId) &&
        currentScenarioId > 0 &&
        currentScenarioId !== numericScenarioId &&
        options.some((option) => option.scenario_id === currentScenarioId)
          ? currentScenarioId
          : options.length > 0
            ? options[0].scenario_id
            : null;

      setStoredGridScenarioOptions(options);
      setStoredGridScenarioId(nextScenarioId);

      if (nextScenarioId) {
        await handleDeltaGridFetchStored({
          version: storedGridVersion,
          scenarioId: nextScenarioId,
        });
      } else {
        setDeltaGridApiState((prev) => ({
          ...prev,
          fetching: false,
          lastStatus: "idle",
          lastMessage: "",
          lastError: "",
          grids: [],
          gridsCount: 0,
          gridVisible: false,
          lastUpdatedAt: new Date().toISOString(),
        }));
      }
    } catch (error) {
      const message = String(error?.message || "").trim() || "Failed to delete stored grid scenario.";
      toast.error(message);
    }
  }, [projectId, storedGridScenarioId, storedGridVersion, handleDeltaGridFetchStored]);

  useEffect(() => {
    const normalizedSiteVersion = String(sitePredictionVersion || "original").trim().toLowerCase();
    if (normalizedSiteVersion !== "updated") {
      setSitePredictionScenarioId(null);
      return;
    }
  }, [sitePredictionVersion, sitePredictionScenarioId]);

  useEffect(() => {
    const normalizedSiteVersion = String(sitePredictionVersion || "original").trim().toLowerCase();
    const shouldLoadScenarioOptions =
      enableSiteToggle &&
      String(siteToggle || "").toLowerCase() === "cell" &&
      normalizedSiteVersion === "updated";

    if (!shouldLoadScenarioOptions) return;

    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      setSitePredictionScenarioOptions([]);
      setSitePredictionScenarioId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await sitePredictionApi.getScenarios({ projectId: numericProjectId });
        const root =
          response?.data && typeof response.data === "object" ? response.data : response || {};
        const rows = Array.isArray(root?.Data)
          ? root.Data
          : Array.isArray(root?.data?.Data)
            ? root.data.Data
            : Array.isArray(root?.data)
              ? root.data
              : [];

        const options = rows
          .map((row) => ({
            scenario_id: Number(row?.scenario_id ?? row?.id ?? 0),
            status: String(row?.status || "").trim(),
          }))
          .filter((row) => Number.isFinite(row.scenario_id) && row.scenario_id > 0)
          .sort((a, b) => a.scenario_id - b.scenario_id);

        if (cancelled) return;
        if (options.length > 0) {
          setSitePredictionScenarioOptions(options);
          setSitePredictionScenarioId((prev) => {
            const parsed = Number(prev);
            if (Number.isFinite(parsed) && parsed > 0 && options.some((o) => o.scenario_id === parsed)) {
              return parsed;
            }
            return options[0].scenario_id;
          });
          return;
        }

        setSitePredictionScenarioOptions([]);
        setSitePredictionScenarioId(null);
      } catch {
        if (cancelled) return;
        setSitePredictionScenarioOptions([]);
        setSitePredictionScenarioId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, enableSiteToggle, siteToggle, sitePredictionVersion]);

  

  const handleDeltaGridComputeStore = useCallback(
    async ({ showGridAfterCompute = false, scenarioId } = {}) => {
    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a valid project before computing grid analytics.");
      return false;
    }

    const requestedGridSize = Math.max(5, Number(lteGridSizeMeters) || 50);
    const effectiveScenarioId = Number(scenarioId ?? storedGridScenarioId);
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
        scenario_id:
          Number.isFinite(effectiveScenarioId) && effectiveScenarioId > 0
            ? effectiveScenarioId
            : undefined,
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
  }, [projectId, lteGridSizeMeters, setProject, storedGridScenarioId]);

  const handleDeltaGridManualFetch = useCallback(async ({ version, scenarioId, forceFetch = false } = {}) => {
    if (deltaGridApiState?.computing || deltaGridApiState?.fetching) return false;

    const requestedVersion = String(version || "").trim().toLowerCase();
    const currentVersion = String(
      deltaGridApiState?.storedGridVersion || storedGridVersion || "original",
    )
      .trim()
      .toLowerCase();
    const shouldRefreshVisibleGrid =
      Boolean(deltaGridApiState?.gridVisible) &&
      (forceFetch || (requestedVersion && requestedVersion !== currentVersion));

    if (shouldRefreshVisibleGrid) {
      return handleDeltaGridFetchStored({ version: requestedVersion || currentVersion, scenarioId });
    }

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
    return handleDeltaGridFetchStored({ version, scenarioId });
  }, [
    deltaGridApiState?.computing,
    deltaGridApiState?.fetching,
    deltaGridApiState?.gridVisible,
    deltaGridApiState?.storedGridVersion,
    storedGridVersion,
    handleDeltaGridFetchStored,
  ]);

  const storedDeltaGridCells = useMemo(() => {
    if (!Boolean(deltaGridApiState?.gridVisible)) return [];
    const rows = Array.isArray(deltaGridApiState?.grids) ? deltaGridApiState.grids : [];
    if (rows.length === 0) return [];

    const metricKey = String(selectedMetric || "rsrp").trim().toLowerCase();
    const normalizedStoredGridMetricMode = String(storedGridMetricMode || "max")
      .trim()
      .toLowerCase();
    const isBestOperatorGridMode =
      normalizedStoredGridMetricMode === "best_operator" ||
      normalizedStoredGridMetricMode === "operator_min" ||
      normalizedStoredGridMetricMode === "operator_max";
    const aggregateMode =
      normalizedStoredGridMetricMode === "best_operator"
        ? "avg"
        : normalizedStoredGridMetricMode === "operator_min"
          ? "min"
          : normalizedStoredGridMetricMode === "operator_max"
            ? "max"
            : normalizedStoredGridMetricMode === "avg" ||
                normalizedStoredGridMetricMode === "median" ||
                normalizedStoredGridMetricMode === "max" ||
                normalizedStoredGridMetricMode === "min"
              ? normalizedStoredGridMetricMode
              : "max";
    const metricMode = aggregateMode === "median" ? "avg" : aggregateMode;
    const bestOperatorMode = metricMode;
    const normalizedVersion = String(
      deltaGridApiState?.storedGridVersion || storedGridVersion || sitePredictionVersion || "",
    )
      .trim()
      .toLowerCase();
    const isDeltaView = normalizedVersion === "delta";
    const isOptimizedView =
      normalizedVersion === "updated" ||
      normalizedVersion === "optimized" ||
      normalizedVersion === "optimised";
    const hasDeltaThresholds =
      Array.isArray(baseThresholds?.delta) && baseThresholds.delta.length > 0;
    const expectedStoredGridSizeMeters = Math.max(
      5,
      Number(deltaGridApiState?.gridSizeMeters) ||
        Number(deltaGridApiState?.requestedGridSize) ||
        Number(lteGridSizeMeters) ||
        50,
    );

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

    const renderedCells = rows
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

        const metersPerDegreeLat = 111320;
        const cellHeightMeters = Math.abs(maxLat - minLat) * metersPerDegreeLat;
        const centerLatRadians = (centerLat * Math.PI) / 180;
        const cellWidthMeters =
          Math.abs(maxLon - minLon) *
          metersPerDegreeLat *
          Math.max(Math.abs(Math.cos(centerLatRadians)), 1e-6);
        const maxExpectedCellSize = expectedStoredGridSizeMeters * 1.75;
        if (
          cellHeightMeters > maxExpectedCellSize ||
          cellWidthMeters > maxExpectedCellSize
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

    const cellsByBounds = new Map();
    renderedCells.forEach((cell) => {
      const boundsKey = cell.polygon
        .flat()
        .map((value) => Number(value).toFixed(7))
        .join("|");
      const existing = cellsByBounds.get(boundsKey);
      if (!existing) {
        cellsByBounds.set(boundsKey, cell);
        return;
      }

      const existingHasValue = Number.isFinite(existing.value);
      const nextHasValue = Number.isFinite(cell.value);
      const existingSamples = Number(existing.sampleCount || existing.pointCount || 0);
      const nextSamples = Number(cell.sampleCount || cell.pointCount || 0);
      if (
        (!existingHasValue && nextHasValue) ||
        (existingHasValue === nextHasValue && nextSamples > existingSamples)
      ) {
        cellsByBounds.set(boundsKey, cell);
      }
    });

    return Array.from(cellsByBounds.values());
  }, [
    deltaGridApiState?.gridVisible,
    deltaGridApiState?.grids,
    deltaGridApiState?.storedGridVersion,
    deltaGridApiState?.gridSizeMeters,
    deltaGridApiState?.requestedGridSize,
    selectedMetric,
    storedGridMetricMode,
    storedGridVersion,
    sitePredictionVersion,
    lteGridSizeMeters,
    baseThresholds,
    getMetricColorForLog,
  ]);

  const isFetchedStoredGridVisible = useMemo(
    () =>
      Boolean(deltaGridApiState?.gridVisible) &&
      storedDeltaGridCells.length > 0,
    [deltaGridApiState?.gridVisible, storedDeltaGridCells.length],
  );
  const isStoredGridOverlayVisible = useMemo(
    () => Boolean(isFetchedStoredGridVisible),
    [isFetchedStoredGridVisible],
  );
  useEffect(() => {
    if (!isStoredGridOverlayVisible) {
      setBuildingBorderEnabled(false);
    }
  }, [isStoredGridOverlayVisible]);

  const mapGridEnabled = useMemo(
    () => Boolean(enableGrid) && !isStoredGridOverlayVisible,
    [enableGrid, isStoredGridOverlayVisible],
  );

  const {
    locations: predictionLocations,
    colorSettings: predictionColorSettings,
    loading: predictionLoading,
    error: predictionError,
    hasFetched: predictionHasFetched,
    hasData: predictionHasData,
    refetch: refetchPrediction,
  } = usePredictionData(
    projectId,
    selectedMetric,
    shouldFetchPredictionLogs,
  );

  const predictionDataUnavailable = useMemo(
    () =>
      Boolean(predictionHasFetched) &&
      !predictionLoading &&
      !predictionHasData,
    [predictionHasFetched, predictionLoading, predictionHasData],
  );

  useEffect(() => {
    if (!isDataPredictionMode || !predictionDataUnavailable) return;
    setDataToggle("sample");
  }, [isDataPredictionMode, predictionDataUnavailable]);

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

  const shouldFetchNeighbors = !hasPassedNeighbors && sessionIds.length > 0;

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
    300000,
    projectId,
  );

  const sessionNeighborData = hasPassedNeighbors
    ? passedNeighbors
    : fetchedNeighbors;

  const ioFallbackFromLogs = useMemo(
    () => buildIndoorOutdoorFromLogs(sampleLocations || EMPTY_LIST),
    [sampleLocations],
  );

   // data hook calling for subsession 
  const {
    sessions: subSessionData,
    summary: subSessionSummary,
    requestedSessionIds: subSessionRequestedIds,
    markers: subSessionMarkers,
    loading: subSessionLoading,
    error: subSessionError,
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

  const {
    siteData: rawSiteData,
    loading: siteLoading,
    error: siteError,
    refetch: refetchSites,
  } = useSiteData({
    enableSiteToggle,
    siteToggle,
    sitePredictionVersion,
    sitePredictionScenarioId,
    defaultBeamwidth: defaultSiteBeamwidth,
    projectId,
    sessionIds,
    autoFetch: true,
    filterEnabled: siteLayerPolygonFiltering,
    polygons: siteLayerPolygonFiltering ? rawFilteringPolygons : EMPTY_POLYGONS,
  });
  const handleDeleteSitePredictionScenario = useCallback(async (scenarioIdFromRow = null) => {
    const numericProjectId = Number(projectId);
    const numericScenario = Number(scenarioIdFromRow ?? sitePredictionScenarioId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a valid project before deleting scenario.");
      return;
    }
    if (!Number.isFinite(numericScenario) || numericScenario <= 0) {
      toast.error("Select a valid scenario to delete.");
      return;
    }

    const confirmed = window.confirm(
      `Delete Scenario ${numericScenario} for project ${numericProjectId}?`,
    );
    if (!confirmed) return;

    try {
      await sitePredictionApi.deleteScenario({
        ProjectId: numericProjectId,
        Scenario: numericScenario,
      });
      toast.success(`Scenario ${numericScenario} deleted.`);

      const response = await sitePredictionApi.getScenarios({ projectId: numericProjectId });
      const root = response?.data && typeof response.data === "object" ? response.data : response || {};
      const rows = Array.isArray(root?.Data)
        ? root.Data
        : Array.isArray(root?.data?.Data)
          ? root.data.Data
          : Array.isArray(root?.data)
            ? root.data
            : [];

      const options = rows
        .map((row) => ({
          scenario_id: Number(row?.scenario_id ?? row?.id ?? 0),
          status: String(row?.status || "").trim(),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.scenario_id) &&
            row.scenario_id > 0 &&
            row.scenario_id !== numericScenario,
        )
        .sort((a, b) => a.scenario_id - b.scenario_id);
      const currentScenarioId = Number(sitePredictionScenarioId);
      const nextScenarioId =
        Number.isFinite(currentScenarioId) &&
        currentScenarioId > 0 &&
        currentScenarioId !== numericScenario &&
        options.some((option) => option.scenario_id === currentScenarioId)
          ? currentScenarioId
          : options.length > 0
            ? options[0].scenario_id
            : null;

      setSitePredictionScenarioOptions(options);
      setSitePredictionScenarioId(nextScenarioId);
      setManualSiteData([]);
      setManualSiteDataReady(!nextScenarioId);
    } catch (error) {
      const message = String(error?.message || "").trim() || "Failed to delete site prediction scenario.";
      toast.error(message);
    }
  }, [projectId, sitePredictionScenarioId]);

  const siteData = rawSiteData || [];
  const effectiveSiteData = manualSiteDataReady ? manualSiteData : siteData;
  const effectiveSiteLoading = manualSiteLoading || siteLoading;
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

  // Effect hooks for distance and IO — each with active guards to prevent stale state updates
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

  useEffect(() => {
    if (!sessionIds?.length || !Array.isArray(locations) || locations.length < 2) {
      setDurationTime([]);
      return;
    }
    setDurationTime(buildDurationRowsFromNetworkLogs(locations));
  }, [locations, sessionIds]);

 
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
    const cellIds = new Set();
    const apps = new Set();

    (locations || []).forEach((loc) => {
      const providerName = getProviderDisplayName(loc);
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
      const cellId = String(
        loc?.cell_id ?? loc?.cellId ?? loc?.CellId ?? "",
      ).trim();
      if (cellId && !isUnknownOption(cellId)) {
        cellIds.add(cellId);
      }
      splitAppNames(
        loc?.apps ??
          loc?.app ??
          loc?.appName ??
          loc?.AppName ??
          loc?.application ??
          loc?.Application,
      ).forEach((app) => {
        if (!isUnknownOption(app)) apps.add(app);
      });
    });

    (polygonFilteredNeighborData || []).forEach((n) => {
      const providerName = normalizeProviderName(n?.provider ?? "");
      if (providerName && !isUnknownOption(providerName)) {
        providers.add(providerName);
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
      cellIds: [...cellIds].sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
        return a.localeCompare(b);
      }),
      apps: [...apps].sort((a, b) => a.localeCompare(b)),
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
          const val = getMetricValueFromLog(loc, metric);
          const limit = Number.parseFloat(threshold);
          return Number.isFinite(val) && Number.isFinite(limit) && val < limit;
        }),
      );
    }
    const { providers, bands, technologies, cellIds, apps, indoorOutdoor } = dataFilters;
    if (providers?.length)
      result = result.filter((l) => {
        const providerName = getProviderDisplayName(l);
        return providerName ? providers.includes(providerName) : false;
      });
    if (bands?.length)
      result = result.filter((l) => bands.includes(String(l.band)));
    if (technologies?.length)
      result = result.filter((l) =>
        technologies.includes(
          normalizeTechName(
            l?.technology ?? l?.networkType ?? l?.network ?? "",
            l?.band ?? l?.Band,
          ),
        ),
      );
    if (cellIds?.length)
      result = result.filter((l) =>
        cellIds.includes(String(l?.cell_id ?? l?.cellId ?? l?.CellId ?? "").trim()),
      );
    if (apps?.length)
      result = result.filter((l) => locationMatchesSelectedApps(l, apps));
    if (indoorOutdoor?.length > 0) {
      const lowerFilters = indoorOutdoor.map((v) => v.toLowerCase());
      result = result.filter(
        (l) => lowerFilters.includes(formatIndoorOutdoorValue(l?.indoor_outdoor)),
      );
    }
    const excludedMetricValue = Number.parseFloat(dataFilters?.excludedMetricValue);
    if (Number.isFinite(excludedMetricValue)) {
      result = result.filter(
        (loc) => getMetricValueFromLog(loc, selectedMetric) !== excludedMetricValue,
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
    selectedMetric,
  ]);

  const preDrawingDisplayLocations = useMemo(() => {
    let prioritized = filteredLocations;
    if (Array.isArray(highlightedLogs)) {
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
    highlightedLogs,
    filteredLocations,
    onlyInsidePolygons,
    hasFilteringPolygons,
    filteringPolygonChecker,
  ]);

  const finalDisplayLocations = useMemo(() => {
    if (drawnPoints !== null) return drawnPoints;
    return preDrawingDisplayLocations;
  }, [drawnPoints, preDrawingDisplayLocations]);
  const effectiveGridColorBy = useMemo(() => colorBy, [colorBy]);

  const gridDisplayData = useUnifiedGridViewData({
    enabled: enableGrid,
    locations: finalDisplayLocations,
    selectedMetric,
    colorBy: effectiveGridColorBy,
    gridSizeMeters,
    aggregationMethod: lteGridAggregationMethod,
  });

  const gridFilteredData = useUnifiedGridViewData({
    enabled: enableGrid,
    locations: filteredLocations,
    selectedMetric,
    colorBy: effectiveGridColorBy,
    gridSizeMeters,
    aggregationMethod: lteGridAggregationMethod,
  });

  const isUnifiedGridView = useMemo(
    () => Boolean(mapGridEnabled),
    [mapGridEnabled],
  );

  

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
      const normalizedVersion = String(
        deltaGridApiState?.storedGridVersion || storedGridVersion || sitePredictionVersion || "",
      )
        .trim()
        .toLowerCase();
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

    if (isUnifiedGridView) {
      return renderedGridLegendLogs.length > 0
        ? renderedGridLegendLogs
        : gridDisplayData.gridLocations || EMPTY_LIST;
    }

    // Keep the normal logs legend while sample logs are still drawn, even if
    // the site layer also renders markers/sectors.
    if (enableDataToggle && !isDataPredictionMode) {
      return finalDisplayLocations || EMPTY_LIST;
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
    isUnifiedGridView,
    gridDisplayData.gridLocations,
    renderedGridLegendLogs,
    isStoredGridOverlayVisible,
    storedDeltaGridCells,
    deltaGridApiState?.storedGridVersion,
    storedGridVersion,
    sitePredictionVersion,
    selectedMetric,
  ]);

  const analyticsPanelLocations = useMemo(
    () =>
      isStoredGridOverlayVisible
        ? legendLogs
        : isUnifiedGridView
          ? gridDisplayData.gridLocations
          : finalDisplayLocations,
    [isStoredGridOverlayVisible, isUnifiedGridView, legendLogs, gridDisplayData.gridLocations, finalDisplayLocations],
  );

  const analyticsPanelFilteredLocations = useMemo(
    () =>
      isStoredGridOverlayVisible
        ? legendLogs
        : isUnifiedGridView
          ? gridFilteredData.gridLocations
          : filteredLocations,
    [isStoredGridOverlayVisible, isUnifiedGridView, legendLogs, gridFilteredData.gridLocations, filteredLocations],
  );
  const deferredAnalyticsPanelLocations = useDeferredValue(analyticsPanelLocations);
  const deferredAnalyticsPanelFilteredLocations = useDeferredValue(
    analyticsPanelFilteredLocations,
  );
  const deferredRawAnalyticsLocations = useDeferredValue(finalDisplayLocations);
  const deferredRawAnalyticsFilteredLocations = useDeferredValue(filteredLocations);

  const legendSelectedMetric = useMemo(
    () => {
      if (!isStoredGridOverlayVisible) return selectedMetric;
      const normalizedVersion = String(
        deltaGridApiState?.storedGridVersion || storedGridVersion || sitePredictionVersion || "",
      )
        .trim()
        .toLowerCase();
      return normalizedVersion === "delta" ? "delta" : selectedMetric;
    },
    [
      isStoredGridOverlayVisible,
      selectedMetric,
      sitePredictionVersion,
      storedGridVersion,
      deltaGridApiState?.storedGridVersion,
    ],
  );
  const legendColorBy = useMemo(() => {
    const isBestOperatorGridMode =
      ["best_operator", "operator_min", "operator_max"].includes(
        String(storedGridMetricMode || "").trim().toLowerCase(),
      );
    if (isStoredGridOverlayVisible && isBestOperatorGridMode) return "provider";
    if (!effectiveGridColorBy && String(selectedMetric || "").trim().toLowerCase() === "nodebid") {
      return "nodebid";
    }
    return effectiveGridColorBy;
  }, [isStoredGridOverlayVisible, storedGridMetricMode, effectiveGridColorBy, selectedMetric]);

  const siteLegendColorMode = useMemo(() => {
    const labelField = String(siteLabelField || "").trim().toLowerCase();
    if (["pci", "band", "technology"].includes(labelField)) return labelField;
    return modeMethod;
  }, [siteLabelField, modeMethod]);

  

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

  const polygonGridColorSource = useMemo(() => {
    if (isStoredGridOverlayVisible) {
      return Array.isArray(storedDeltaGridCells) ? storedDeltaGridCells : EMPTY_LIST;
    }

    if (isUnifiedGridView) {
      if (Array.isArray(renderedGridLegendLogs) && renderedGridLegendLogs.length > 0) {
        return renderedGridLegendLogs;
      }
      if (Array.isArray(gridFilteredData?.gridLocations) && gridFilteredData.gridLocations.length > 0) {
        return gridFilteredData.gridLocations;
      }
      return Array.isArray(gridDisplayData?.gridLocations) ? gridDisplayData.gridLocations : EMPTY_LIST;
    }

    return EMPTY_LIST;
  }, [
    isStoredGridOverlayVisible,
    storedDeltaGridCells,
    isUnifiedGridView,
    renderedGridLegendLogs,
    gridFilteredData?.gridLocations,
    gridDisplayData?.gridLocations,
  ]);

  const polygonsWithColors = useMemo(() => {
    const needsBuildingPolygons = Boolean(showPolygons || buildingBorderEnabled);
    if (!needsBuildingPolygons || !effectiveProjectPolygons?.length) return [];
    const useGridForPolygonColor =
      Boolean(isUnifiedGridView) || Boolean(isStoredGridOverlayVisible);
    const polygonColorSource = useGridForPolygonColor
      ? polygonGridColorSource
      : (Array.isArray(locations) ? locations : []);
    if (!polygonColorSource.length) {
      return effectiveProjectPolygons.map((p) => ({
        ...p,
        fillColor: "#ccc",
        fillOpacity: polygonOpacity,
        pointCount: 0,
      }));
    }
    const thresholdKey = getThresholdKey(selectedMetric);
    const currentThresholds = effectiveThresholds[thresholdKey] || [];
    return effectiveProjectPolygons.map((poly) => {
      if (useGridForPolygonColor) {
        const weighted = getWeightedGridAverageForPolygon(
          poly,
          polygonColorSource,
          selectedMetric,
          true,
        );
        if (!Number.isFinite(weighted.average)) {
          return {
            ...poly,
            fillColor: "#ccc",
            fillOpacity: GRID_POLYGON_FILL_OPACITY,
            strokeOpacity: GRID_POLYGON_STROKE_OPACITY,
            pointCount: weighted.count,
            medianValue: null,
          };
        }
        return {
          ...poly,
          fillColor: getColorFromValueOrMetric(
            weighted.average,
            currentThresholds,
            selectedMetric,
          ),
          fillOpacity: GRID_POLYGON_FILL_OPACITY,
          strokeOpacity: GRID_POLYGON_STROKE_OPACITY,
          pointCount: weighted.count,
          medianValue: weighted.average,
          averageValue: weighted.average,
        };
      }

      const pointsInside = polygonColorSource.filter((pt) => isPointInPolygon(pt, poly));
      const values = pointsInside
        .map((p) => {
          const direct = parseFloat(p?.[selectedMetric]);
          if (!Number.isNaN(direct)) return direct;
          const metricValue = parseFloat(p?.metric_value ?? p?.value);
          return Number.isNaN(metricValue) ? NaN : metricValue;
        })
        .filter((v) => !isNaN(v));
      if (!values.length) {
        return {
          ...poly,
          fillColor: "#ccc",
          fillOpacity: polygonOpacity,
          pointCount: pointsInside.length,
        };
      }
      const median = calculateMedian(values);
      const fillColor = getColorFromValueOrMetric(
        useGridForPolygonColor ? calculateAverage(values) : median,
        currentThresholds,
        selectedMetric,
      );
      return {
        ...poly,
        fillColor,
        fillOpacity: polygonOpacity,
        pointCount: pointsInside.length,
        medianValue: useGridForPolygonColor ? calculateAverage(values) : median,
      };
    });
  }, [
    showPolygons,
    buildingBorderEnabled,
    effectiveProjectPolygons,
    locations,
    isUnifiedGridView,
    isStoredGridOverlayVisible,
    polygonGridColorSource,
    selectedMetric,
    effectiveThresholds,
    polygonOpacity,
  ]);

  const areaPolygonsWithColors = useMemo(() => {
    if (!areaEnabled || !areaData?.length) return [];
    const useGridForPolygonColor =
      Boolean(isUnifiedGridView) || Boolean(isStoredGridOverlayVisible);
    const polygonColorSource = useGridForPolygonColor
      ? polygonGridColorSource
      : (Array.isArray(filteredLocations) ? filteredLocations : []);
    if (!polygonColorSource?.length) {
      return areaData.map((p) => ({
        ...p,
        fillColor: "#ccc",
        fillOpacity: polygonOpacity,
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
      if (useGridForPolygonColor) {
        const weighted = getWeightedGridAverageForPolygon(
          poly,
          polygonColorSource,
          selectedMetric,
          true,
        );
        const averageValue = weighted.average;
        return {
          ...poly,
          fillColor: Number.isFinite(averageValue)
            ? getColorFromValueOrMetric(
              averageValue,
              currentThresholds,
              selectedMetric,
            )
            : "#ccc",
          fillOpacity: GRID_POLYGON_FILL_OPACITY,
          strokeOpacity: GRID_POLYGON_STROKE_OPACITY,
          strokeWeight: 1,
          pointCount: weighted.count,
          medianValue: averageValue,
          averageValue,
          categoryStats: null,
          bestProvider: null,
          bestBand: null,
          bestTechnology: null,
        };
      }

      const pointsInside = polygonColorSource.filter((pt) =>
        isPointInPolygon(pt, poly),
      );
      if (!pointsInside.length) {
        return {
          ...poly,
          fillColor: "#ccc",
          fillOpacity: polygonOpacity,
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
        .map((p) => {
          const direct = parseFloat(p?.[selectedMetric]);
          if (!Number.isNaN(direct)) return direct;
          const metricValue = parseFloat(p?.metric_value ?? p?.value);
          return Number.isNaN(metricValue) ? NaN : metricValue;
        })
        .filter((v) => !isNaN(v) && v != null);
      const medianValue = useGridForPolygonColor
        ? calculateAverage(values)
        : calculateMedian(values);
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
        fillOpacity: polygonOpacity,
        strokeWeight: 1,
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
    isUnifiedGridView,
    isStoredGridOverlayVisible,
    polygonGridColorSource,
    selectedMetric,
    baseThresholds,
    colorBy,
    polygonOpacity,
  ]);

  const buildPolygonBBoxFromPaths = useCallback((paths = []) => {
    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;

    paths.forEach((ring) => {
      ring.forEach((point) => {
        const lat = Number(point?.lat);
        const lng = Number(point?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        north = Math.max(north, lat);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        west = Math.min(west, lng);
      });
    });

    if (![north, south, east, west].every(Number.isFinite)) return null;
    return { north, south, east, west };
  }, []);

  const handleProjectPolygonPathChange = useCallback(
    (uid, nextPaths) => {
      if (!uid || !Array.isArray(nextPaths) || nextPaths.length === 0) return;

      setEditedProjectPolygons((prev) => ({
        ...prev,
        [uid]: {
          paths: nextPaths,
          bbox: buildPolygonBBoxFromPaths(nextPaths),
        },
      }));
    },
    [buildPolygonBBoxFromPaths],
  );

  const editedProjectPolygonEntries = useMemo(
    () => Object.entries(editedProjectPolygons),
    [editedProjectPolygons],
  );

  const editedProjectPolygonCount = editedProjectPolygonEntries.length;

  const handleDiscardEditedProjectPolygons = useCallback(() => {
    setEditedProjectPolygons({});
  }, []);

  const handleSaveEditedProjectPolygons = useCallback(async () => {
    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.warn("Open a valid project before saving polygon edits.");
      return;
    }

    if (!editedProjectPolygonEntries.length) {
      toast.info("No polygon edits to save.");
      return;
    }

    const polygonsByUid = new Map(
      effectiveProjectPolygons.map((poly) => [poly.uid, poly]),
    );

    const updates = editedProjectPolygonEntries.map(([uid, edit]) => {
      const polygon = polygonsByUid.get(uid);
      const polygonId = Number(polygon?.id);
      const wkt = coordinatesToWktPolygon(edit?.paths?.[0]);

      if (!Number.isFinite(polygonId) || polygonId <= 0 || !wkt) {
        return null;
      }

      return {
        PolygonId: polygonId,
        ProjectId: numericProjectId,
        Name: polygon?.name || "",
        WKT: wkt,
        Area: Number.isFinite(Number(polygon?.area)) ? Number(polygon.area) : null,
      };
    });

    if (updates.some((payload) => !payload)) {
      toast.error("One or more edited polygons could not be prepared for saving.");
      return;
    }

    setIsSavingEditedProjectPolygons(true);
    try {
      for (const payload of updates) {
        const response = await mapViewApi.updateProjectPolygon(payload);
        if (!(response?.Status === 1 || response?.status === 1)) {
          throw new Error(response?.Message || response?.message || "Failed to save polygon edits.");
        }
      }

      toast.success(
        `${updates.length} polygon${updates.length === 1 ? "" : "s"} updated successfully.`,
      );
      setEditedProjectPolygons({});
      await refetchPolygons?.();
    } catch (error) {
      toast.error(error?.message || "Failed to save polygon edits.");
    } finally {
      setIsSavingEditedProjectPolygons(false);
    }
  }, [
    editedProjectPolygonEntries,
    effectiveProjectPolygons,
    projectId,
    refetchPolygons,
  ]);

  useEffect(() => {
    setEditedProjectPolygons({});
  }, [projectId, polygonSource]);

  useEffect(() => {
    if (polygonSource !== "map") {
      setProjectPolygonEditEnabled(false);
    }
  }, [polygonSource]);

  const displayPolygons = useMemo(
    () => polygonsWithColors,
    [polygonsWithColors],
  );

  const mapBoundaryPolygons = useMemo(
    () => (showPolygons && displayPolygons?.length ? displayPolygons : rawFilteringPolygons),
    [displayPolygons, rawFilteringPolygons, showPolygons],
  );

  const editableBoundaryPolygonIds = useMemo(() => {
    if (!(projectPolygonEditEnabled && polygonSource === "map")) return [];
    return effectiveProjectPolygons.map((poly) => poly.uid).filter(Boolean);
  }, [effectiveProjectPolygons, projectPolygonEditEnabled, polygonSource]);

  const hasExistingProjectPolygonBoundary = effectiveProjectPolygons.length > 0;

  const latestDrawnProjectPolygon = useMemo(() => {
    const saveableShapes = (drawnShapeAnalytics || []).filter(
      (item) => getSaveableShapeCoordinates(item).length >= 3,
    );
    return saveableShapes.length ? saveableShapes[saveableShapes.length - 1] : null;
  }, [drawnShapeAnalytics]);

  const canSaveDrawnPolygonToProject = useMemo(() => {
    return Boolean(latestDrawnProjectPolygon && !hasExistingProjectPolygonBoundary);
  }, [hasExistingProjectPolygonBoundary, latestDrawnProjectPolygon]);

  const saveDrawnPolygonTargetLabel = useMemo(() => {
    const numericProjectId = Number(projectId);
    return Number.isFinite(numericProjectId) && numericProjectId > 0
      ? "this project and selected session"
      : "the opened session";
  }, [projectId]);

  const handleSaveDrawnPolygonToProject = useCallback(async () => {
    const numericProjectId = Number(projectId);
    const hasProject = Number.isFinite(numericProjectId) && numericProjectId > 0;
    const activeSessionIds = (Array.isArray(sessionIds) ? sessionIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!hasProject && activeSessionIds.length === 0) {
      toast.warn("Open a valid project or session before saving a shape.");
      return;
    }
    if (hasExistingProjectPolygonBoundary) {
      toast.info("A project polygon already exists. New drawn shapes are for analysis only.");
      return;
    }
    const saveableShapeCoordinates = getSaveableShapeCoordinates(latestDrawnProjectPolygon);
    if (saveableShapeCoordinates.length < 3) {
      toast.warn("Draw a polygon, square, or circle on the map first.");
      return;
    }
    if (!newProjectPolygonName.trim()) {
      toast.warn("Enter a shape name first.");
      return;
    }

    const wkt = coordinatesToWktPolygon(saveableShapeCoordinates);
    if (!wkt) {
      toast.error("Could not convert the drawn shape into a savable boundary.");
      return;
    }

    const drawnPolygonSessionIds = Array.isArray(latestDrawnProjectPolygon.session)
      ? latestDrawnProjectPolygon.session
      : [];
    const normalizedDrawnSessionIds = drawnPolygonSessionIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const resolvedSessionIds = normalizedDrawnSessionIds.length
      ? normalizedDrawnSessionIds
      : activeSessionIds;

    const payload = {
      ProjectId: hasProject ? numericProjectId : null,
      Name: newProjectPolygonName.trim(),
      WKT: wkt,
      SessionIds: resolvedSessionIds,
      Area: Number.isFinite(Number(latestDrawnProjectPolygon.area))
        ? Number(latestDrawnProjectPolygon.area)
        : null,
    };

    setIsSavingProjectPolygon(true);
    try {
      const saveResponse = await mapViewApi.savePolygon(payload);
      if (!(saveResponse?.Status === 1 || saveResponse?.status === 1)) {
        toast.error(saveResponse?.Message || "Failed to save the drawn shape.");
        return;
      }

      if (!hasProject) {
        toast.success(`Shape "${newProjectPolygonName.trim()}" saved to session ${resolvedSessionIds.join(", ")}.`);
        setNewProjectPolygonName("");
        return;
      }

      const polygonId = extractPolygonIdFromSaveResponse(saveResponse);
      if (!polygonId) {
        toast.warning("Shape was saved, but assignment to the project could not be confirmed automatically.");
        return;
      }

      const assignResponse = await mapViewApi.assignPolygonToProject(
        polygonId,
        numericProjectId,
      );
      if (!(assignResponse?.Status === 1 || assignResponse?.status === 1)) {
        toast.error(assignResponse?.Message || "Shape saved, but project assignment failed.");
        return;
      }

      toast.success(`Shape "${newProjectPolygonName.trim()}" saved to this project.`);
      setNewProjectPolygonName("");
      setShowPolygons(true);
      setPolygonSource("map");
      await refetchPolygons?.();
    } catch (error) {
      toast.error(error?.message || "Failed to save polygon to project.");
    } finally {
      setIsSavingProjectPolygon(false);
    }
  }, [
    latestDrawnProjectPolygon,
    newProjectPolygonName,
    projectId,
    refetchPolygons,
    sessionIds,
    hasExistingProjectPolygonBoundary,
    setPolygonSource,
    setShowPolygons,
  ]);

  const visiblePolygons = useMemo(() => {
    if (!displayPolygons?.length) return [];
    if (!viewport) return displayPolygons;
    return displayPolygons.filter((poly) => {
      if (!poly.bbox) return true;
      return !(
        poly.bbox.west > viewport.east ||
        poly.bbox.east < viewport.west ||
        poly.bbox.south > viewport.north ||
        poly.bbox.north < viewport.south
      );
    });
  }, [displayPolygons, viewport]);

  const buildingBorderSegments = useMemo(() => {
    if (
      !buildingBorderEnabled ||
      polygonSource !== "save" ||
      !isStoredGridOverlayVisible ||
      !Array.isArray(visiblePolygons) ||
      visiblePolygons.length === 0 ||
      !Array.isArray(storedDeltaGridCells) ||
      storedDeltaGridCells.length === 0
    ) {
      return [];
    }

    const thresholdKey = getThresholdKey(legendSelectedMetric);
    const currentThresholds = effectiveThresholds[thresholdKey] || [];
    const segments = [];

    visiblePolygons.forEach((poly, polyIndex) => {
      const path = getPolygonPath(poly);
      if (!Array.isArray(path) || path.length < 2) return;

      for (let i = 0; i < path.length; i += 1) {
        const start = path[i];
        const end = path[(i + 1) % path.length];
        const startPoint = { lat: Number(start?.lat), lng: Number(start?.lng) };
        const endPoint = { lat: Number(end?.lat), lng: Number(end?.lng) };
        if (![startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng].every(Number.isFinite)) {
          continue;
        }

        const edgeBounds = {
          south: Math.min(startPoint.lat, endPoint.lat),
          north: Math.max(startPoint.lat, endPoint.lat),
          west: Math.min(startPoint.lng, endPoint.lng),
          east: Math.max(startPoint.lng, endPoint.lng),
        };
        const edgeFragments = [];

        storedDeltaGridCells.forEach((cell) => {
          const bounds = getGridCellBounds(cell);
          if (
            !bounds ||
            bounds.east < edgeBounds.west ||
            bounds.west > edgeBounds.east ||
            bounds.north < edgeBounds.south ||
            bounds.south > edgeBounds.north
          ) {
            return;
          }

          const clipped = clipSegmentToBounds(startPoint, endPoint, bounds);
          if (!clipped) return;
          const tStart = getSegmentProgress(clipped[0], startPoint, endPoint);
          const tEnd = getSegmentProgress(clipped[1], startPoint, endPoint);
          if (Math.abs(tEnd - tStart) < 1e-5) return;
          edgeFragments.push({
            id: `${poly.uid || poly.id || polyIndex}-${i}-${cell.id}`,
            path: clipped,
            color: getGridCellCssColor(cell, legendSelectedMetric, currentThresholds),
            tStart: Math.min(tStart, tEnd),
            tEnd: Math.max(tStart, tEnd),
          });
        });

        if (edgeFragments.length > 0) {
          edgeFragments
            .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd)
            .forEach(({ tStart, tEnd, ...segment }) => {
              segments.push(segment);
            });
          continue;
        }

        {
          const midpoint = {
            lat: (startPoint.lat + endPoint.lat) / 2,
            lng: (startPoint.lng + endPoint.lng) / 2,
          };
          const cell = storedDeltaGridCells.find((candidate) => {
            const bounds = getGridCellBounds(candidate);
            return (
              bounds &&
              midpoint.lat >= bounds.south &&
              midpoint.lat <= bounds.north &&
              midpoint.lng >= bounds.west &&
              midpoint.lng <= bounds.east
            );
          });
          if (cell) {
            segments.push({
              id: `${poly.uid || poly.id || polyIndex}-${i}-midpoint`,
              path: [startPoint, endPoint],
              color: getGridCellCssColor(cell, legendSelectedMetric, currentThresholds),
            });
          }
        }
      }
    });

    return segments;
  }, [
    buildingBorderEnabled,
    polygonSource,
    isStoredGridOverlayVisible,
    visiblePolygons,
    storedDeltaGridCells,
    legendSelectedMetric,
    effectiveThresholds,
  ]);

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
  const shouldRenderSiteLayer = Boolean(showSiteMarkers || showSiteSectors);
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
    rootButton: null,
    storeButton: null,
    lockButton: null,
    container: null,
    storeHandler: null,
    lockHandler: null,
  });

  const applyZoomLockControlStyle = useCallback(() => {
    const { rootButton, storeButton, lockButton } = zoomLockControlRef.current;
    if (rootButton) {
      rootButton.style.background = isZoomMemoryArmed ? "#2563eb" : "#ffffff";
      rootButton.style.color = isZoomMemoryArmed ? "#ffffff" : "#1f2937";
      rootButton.style.borderColor = isZoomMemoryArmed ? "#1d4ed8" : "#cbd5e1";
      rootButton.textContent = isZoomMemoryArmed ? "ON" : "🔒";
    }
    if (storeButton) {
      storeButton.textContent = isZoomMemoryArmed ? "On" : "Set";
      storeButton.style.background = isZoomMemoryArmed ? "#dbeafe" : "#ffffff";
      storeButton.style.color = isZoomMemoryArmed ? "#1d4ed8" : "#1f2937";
      storeButton.style.fontWeight = isZoomMemoryArmed ? "700" : "600";
      storeButton.title = isZoomMemoryArmed ? "Clear stored map zoom" : "Store current map zoom";
      storeButton.setAttribute(
        "aria-label",
        isZoomMemoryArmed ? "Clear stored map zoom" : "Store current map zoom",
      );
    }
    if (lockButton) {
      lockButton.textContent = "Zoom";
      lockButton.style.background = "#ffffff";
      lockButton.style.color = isZoomMemoryArmed ? "#1d4ed8" : "#94a3b8";
      lockButton.style.fontWeight = "700";
      lockButton.title = "Rezoom to stored map view";
      lockButton.setAttribute("aria-label", "Rezoom to stored map view");
    }
  }, [isZoomMemoryArmed]);

  const storeCurrentZoomMemory = useCallback((map) => {
    if (!map) return null;
    const currentZoom = map.getZoom?.();
    const currentCenter = map.getCenter?.();
    const zoomToStore = Number.isFinite(currentZoom) ? currentZoom : mapZoom;
    const centerToStore =
      currentCenter &&
        Number.isFinite(currentCenter.lat?.()) &&
        Number.isFinite(currentCenter.lng?.())
        ? { lat: currentCenter.lat(), lng: currentCenter.lng() }
        : null;

    if (Number.isFinite(zoomToStore)) {
      storedZoomMemoryRef.current = zoomToStore;
      setMapZoom((prev) => (prev === zoomToStore ? prev : zoomToStore));
    } else {
      storedZoomMemoryRef.current = null;
    }
    storedCenterMemoryRef.current = centerToStore;
    zoomMemoryArmedRef.current = Number.isFinite(zoomToStore);
    setIsZoomMemoryArmed(Number.isFinite(zoomToStore));
    return Number.isFinite(zoomToStore) ? zoomToStore : null;
  }, [mapZoom]);

  const teardownZoomLockControl = useCallback(() => {
    const current = zoomLockControlRef.current;
    if (current.storeButton && current.storeHandler) {
      current.storeButton.removeEventListener("click", current.storeHandler);
    }
    if (current.lockButton && current.lockHandler) {
      current.lockButton.removeEventListener("click", current.lockHandler);
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
      rootButton: null,
      storeButton: null,
      lockButton: null,
      container: null,
      storeHandler: null,
      lockHandler: null,
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
      lockButton.style.width = "52px";
      lockButton.style.height = "52px";
      lockButton.style.borderRadius = "6px";
      lockButton.style.border = "1px solid #cbd5e1";
      lockButton.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
      lockButton.style.cursor = "pointer";
      lockButton.style.fontSize = "20px";
      lockButton.style.display = "flex";
      lockButton.style.alignItems = "center";
      lockButton.style.justifyContent = "center";
      lockButton.style.transition = "all 0.2s ease";
      lockButton.style.fontWeight = "700";
      lockButton.style.userSelect = "none";
      lockButton.style.fontFamily = "Arial, sans-serif";
      lockContainer.style.position = "relative";
      lockContainer.style.width = "52px";
      lockButton.style.width = "52px";
      lockButton.style.fontSize = "13px";
      lockButton.style.letterSpacing = "0";

      const splitPanel = document.createElement("div");
      splitPanel.style.position = "absolute";
      splitPanel.style.top = "0";
      splitPanel.style.right = "0";
      splitPanel.style.width = "52px";
      splitPanel.style.height = "52px";
      splitPanel.style.display = "none";
      splitPanel.style.flexDirection = "column";
      splitPanel.style.overflow = "hidden";
      splitPanel.style.border = "1px solid #cbd5e1";
      splitPanel.style.borderRadius = "6px";
      splitPanel.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
      splitPanel.style.background = "#ffffff";

      const makeSplitButton = (label, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.style.flex = "1 1 0";
        button.style.border = "0";
        button.style.background = "#ffffff";
        button.style.color = "#1f2937";
        button.style.cursor = "pointer";
        button.style.fontSize = "11px";
        button.style.letterSpacing = "0";
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.transition = "background 0.15s ease, color 0.15s ease";
        return button;
      };

      const storeButton = makeSplitButton("Set", "Store current map zoom");
      const splitLockButton = makeSplitButton("Zoom", "Rezoom to stored map view");
      storeButton.style.borderBottom = "1px solid #e2e8f0";

      lockContainer.addEventListener("mouseenter", () => {
        splitPanel.style.display = "flex";
      });
      lockContainer.addEventListener("mouseleave", () => {
        splitPanel.style.display = "none";
      });

      const storeClickHandler = () => {
        if (zoomMemoryArmedRef.current) {
          storedZoomMemoryRef.current = null;
          storedCenterMemoryRef.current = null;
          zoomMemoryArmedRef.current = false;
          setIsZoomMemoryArmed(false);
          return;
        }
        storeCurrentZoomMemory(map);
      };

      const lockClickHandler = () => {
        if (zoomLockEnabledRef.current) {
          zoomLockEnabledRef.current = false;
          lockedZoomRef.current = null;
          setIsZoomLocked(false);
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
      };

      storeButton.addEventListener("click", storeClickHandler);
      splitLockButton.addEventListener("click", lockClickHandler);
      lockContainer.appendChild(lockButton);
      splitPanel.appendChild(storeButton);
      splitPanel.appendChild(splitLockButton);
      lockContainer.appendChild(splitPanel);
      map.controls[window.google.maps.ControlPosition.RIGHT_TOP].push(lockContainer);

      zoomLockControlRef.current = {
        map,
        rootButton: lockButton,
        storeButton,
        lockButton: splitLockButton,
        container: lockContainer,
        storeHandler: storeClickHandler,
        lockHandler: lockClickHandler,
      };
      applyZoomLockControlStyle();

      mapListenerHandlesRef.current = handles;
    },
    [
      applyZoomLockControlStyle,
      debouncedSetViewport,
      locations?.length,
      storeCurrentZoomMemory,
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
      const prevKeys = new Set(prev.map(getLocationIdentityKey).filter(Boolean));
      const hasDiff = newPoints.some((p) => {
        const key = getLocationIdentityKey(p);
        return key ? !prevKeys.has(key) : true;
      });
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
        geometry: drawing?.geometry ?? null,
        session: Array.isArray(drawing?.session) ? drawing.session : [],
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

  const handleMapSnapshot = useCallback(async () => {
    if (!canEnableUnifiedGridView) {
      toast.warn("Raw filter polygon is required before taking a snapshot.");
      return;
    }

    const target = mapSnapshotContainerRef.current;
    if (!target) {
      toast.error("Map area not ready for snapshot.");
      return;
    }

    try {
      const map = mapRef.current;
      if (!map) {
        toast.error("Map is not ready yet.");
        return;
      }

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(target, {
        backgroundColor: null,
        useCORS: true,
        scale: Math.min(2, window.devicePixelRatio || 1),
      });

      const mapBounds = map.getBounds?.();
      const zoom = Number(map.getZoom?.());
      if (!mapBounds || !Number.isFinite(zoom)) {
        toast.error("Map bounds not available for polygon snapshot.");
        return;
      }

      const toMercatorY = (lat) => {
        const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
        const rad = (clampedLat * Math.PI) / 180;
        return Math.log(Math.tan(Math.PI / 4 + rad / 2));
      };

      const ne = mapBounds.getNorthEast();
      const sw = mapBounds.getSouthWest();
      const westLng = sw.lng();
      const eastLng = ne.lng();
      const northY = toMercatorY(ne.lat());
      const southY = toMercatorY(sw.lat());
      const viewWidth = Math.max(1, target.clientWidth);
      const viewHeight = Math.max(1, target.clientHeight);

      const normalizeLng = (lng) => {
        let value = Number(lng);
        while (value < westLng) value += 360;
        return value;
      };

      const lngRange = (() => {
        let range = eastLng - westLng;
        if (range <= 0) range += 360;
        return range;
      })();

      const latLngToPixel = (pt) => {
        const lat = Number(pt?.lat);
        const lng = Number(pt?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const xRatio = (normalizeLng(lng) - westLng) / lngRange;
        const yMerc = toMercatorY(lat);
        const yRatio = (northY - yMerc) / (northY - southY);

        return {
          x: xRatio * viewWidth,
          y: yRatio * viewHeight,
        };
      };

      const polygonRings = rawFilteringPolygons
        .map((poly) => {
          const ring = Array.isArray(poly?.paths?.[0])
            ? poly.paths[0]
            : Array.isArray(poly?.paths)
              ? poly.paths
              : [];
          return ring
            .map((pt) =>
              latLngToPixel({
                lat: pt?.lat ?? pt?.latitude,
                lng: pt?.lng ?? pt?.longitude,
              }),
            )
            .filter(Boolean);
        })
        .filter((ring) => ring.length >= 3);

      if (polygonRings.length === 0) {
        toast.error("No valid raw filter polygon found for snapshot.");
        return;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      polygonRings.forEach((ring) => {
        ring.forEach((pt) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });
      });

      minX = Math.max(0, Math.floor(minX));
      minY = Math.max(0, Math.floor(minY));
      maxX = Math.min(viewWidth, Math.ceil(maxX));
      maxY = Math.min(viewHeight, Math.ceil(maxY));

      const cropWidth = Math.max(1, maxX - minX);
      const cropHeight = Math.max(1, maxY - minY);
      const scaleX = canvas.width / viewWidth;
      const scaleY = canvas.height / viewHeight;

      const outCanvas = document.createElement("canvas");
      outCanvas.width = Math.max(1, Math.round(cropWidth * scaleX));
      outCanvas.height = Math.max(1, Math.round(cropHeight * scaleY));
      const outCtx = outCanvas.getContext("2d");
      if (!outCtx) {
        toast.error("Unable to create snapshot canvas.");
        return;
      }

      outCtx.save();
      outCtx.beginPath();
      polygonRings.forEach((ring) => {
        ring.forEach((pt, index) => {
          const x = (pt.x - minX) * scaleX;
          const y = (pt.y - minY) * scaleY;
          if (index === 0) outCtx.moveTo(x, y);
          else outCtx.lineTo(x, y);
        });
        outCtx.closePath();
      });
      outCtx.clip();

      outCtx.drawImage(
        canvas,
        minX * scaleX,
        minY * scaleY,
        cropWidth * scaleX,
        cropHeight * scaleY,
        0,
        0,
        outCanvas.width,
        outCanvas.height,
      );
      outCtx.restore();

      const dataUrl = outCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeProjectName = String(project?.project_name || "unified-map")
        .trim()
        .replace(/[^a-z0-9_-]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      link.href = dataUrl;
      link.download = `${safeProjectName || "unified-map"}_snapshot_${Date.now()}.png`;
      link.click();
      toast.success("Polygon-only map snapshot downloaded.");
    } catch (error) {
      console.error("Map snapshot failed:", error);
      toast.error("Failed to capture map snapshot.");
    }
  }, [canEnableUnifiedGridView, project?.project_name, rawFilteringPolygons]);

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
          !providers.includes(getProviderDisplayName(item))
        )
          return false;
        if (
          hasTechFilter &&
          !technologies.includes(
            normalizeTechName(item?.networkType ?? item?.network ?? "", item?.neighbourBand ?? item?.primaryBand),
          )
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

  useEffect(() => {
    if (!sessionNeighborLoading && !neighborLogsAvailable && showSessionNeighbors) {
      setShowSessionNeighbors(false);
    }
  }, [neighborLogsAvailable, sessionNeighborLoading, showSessionNeighbors]);

  useEffect(() => {
    if (autoShowSessionNeighbors && neighborLogsAvailable) {
      setShowSessionNeighbors(true);
    }
  }, [autoShowSessionNeighbors, neighborLogsAvailable]);

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

  const siteOperatorOptions = useMemo(() => {
    if (!Array.isArray(siteData) || siteData.length === 0) return [];
    const set = new Set();
    siteData.forEach((s) => {
      const providerName = normalizeProviderName(
        s?.provider ??
          s?.Provider ??
          s?.cluster ??
          s?.Cluster ??
          s?.operator ??
          s?.Operator ??
          s?.network ??
          s?.Network ??
          "",
      );
      if (providerName && !isUnknownOption(providerName)) {
        set.add(providerName);
      }
    });
    return Array.from(set).sort();
  }, [siteData]);

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
        defaultSiteBeamwidth={defaultSiteBeamwidth}
        setDefaultSiteBeamwidth={setDefaultSiteBeamwidth}
        ui={ui}
        onUIChange={handleUIChange}
        onOpenMultiView={handleNavigateToMultiView}
        gridViewEnabled={enableGrid}
        onGridViewToggle={setEnableGrid}
        canEnableGridView={canEnableUnifiedGridView}
        onMapSnapshot={handleMapSnapshot}
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
            rawLocations={deferredRawAnalyticsLocations}
            rawFilteredLocations={deferredRawAnalyticsFilteredLocations}
            onHighlightLogs={setHighlightedLogs}
            totalLocations={locations?.length || 0}
            filteredCount={finalDisplayLocations?.length || 0}
            dataToggle={dataToggle}
            enableDataToggle={enableDataToggle}
            selectedMetric={selectedMetric}
            siteData={effectiveSiteData}
            durationTime={durationTime}
            siteToggle={siteToggle}
            enableSiteToggle={enableSiteToggle}
            showSiteMarkers={showSiteMarkers}
            showSiteSectors={showSiteSectors}
            polygons={displayPolygons}
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
            bandTransitions={bandTransitions}
            pciTransitions={pciTransitions}
            techHandOver={techHandOver}
            bandHandover={bandHandover}
            pciHandover={pciHandover}
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
            canEnableGridView={canEnableUnifiedGridView}
            lteGridEnabled={lteGridEnabled}
            lteGridSizeMeters={lteGridSizeMeters}
            isCellSiteGridMode={isCellSiteGridMode}
            isDeltaSiteGridMode={isDeltaSiteGridMode}
            deltaGridScope={deltaGridScope}
            storedGridMetricMode={storedGridMetricMode}
            conditionLogsLocations={legendLogs}
            conditionSectorLocations={finalDisplayLocations}
            gridViewEnabled={isUnifiedGridView}
            gridViewSummary={gridFilteredData.summary}
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
        predictionLoading={predictionLoading}
        predictionDataUnavailable={predictionDataUnavailable}
        siteLabelField={siteLabelField}
        setSiteLabelField={setSiteLabelField}
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
        siteRowCount={siteData?.length || 0}
        sitePredictionVersion={sitePredictionVersion}
        setSitePredictionVersion={setSitePredictionVersion}
        sitePredictionScenarioId={sitePredictionScenarioId}
        setSitePredictionScenarioId={setSitePredictionScenarioId}
        sitePredictionScenarioOptions={sitePredictionScenarioOptions}
        onDeleteSitePredictionScenario={handleDeleteSitePredictionScenario}
        showSessionNeighbors={showSessionNeighbors}
        setShowSessionNeighbors={setShowSessionNeighbors}
        neighborLogsAvailable={neighborLogsAvailable}
        sessionNeighborLoading={sessionNeighborLoading}
        gridCellStats={gridCellStats}
        showNumCells={showNumCells}
        setShowNumCells={setShowNumCells}
        showMetricLabels={showMetricLabels}
        setShowMetricLabels={setShowMetricLabels}
        setSiteToggle={setSiteToggle}
        projectId={projectId}
        sessionIds={sessionIds}
        getCachedNetworkLogsForPrediction={getCachedNetworkLogsForPrediction}
        metric={selectedMetric}
        setMetric={setSelectedMetric}
        coverageHoleFilters={coverageHoleFilters}
        setCoverageHoleFilters={setCoverageHoleFilters}
        dataFilters={dataFilters}
        setDataFilters={setDataFilters}
        availableFilterOptions={availableFilterOptions}
        siteOperatorOptions={siteOperatorOptions}
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
        buildingBorderEnabled={buildingBorderEnabled}
        setBuildingBorderEnabled={setBuildingBorderEnabled}
        projectPolygonEditEnabled={projectPolygonEditEnabled}
        setProjectPolygonEditEnabled={setProjectPolygonEditEnabled}
        canSaveDrawnPolygonToProject={canSaveDrawnPolygonToProject}
        newProjectPolygonName={newProjectPolygonName}
        setNewProjectPolygonName={setNewProjectPolygonName}
        isSavingProjectPolygon={isSavingProjectPolygon}
        onSaveDrawnPolygonToProject={handleSaveDrawnPolygonToProject}
        editedProjectPolygonCount={editedProjectPolygonCount}
        isSavingEditedProjectPolygons={isSavingEditedProjectPolygons}
        onSaveEditedProjectPolygons={handleSaveEditedProjectPolygons}
        onDiscardEditedProjectPolygons={handleDiscardEditedProjectPolygons}
        ltePredictionUseBuildings={ltePredictionUseBuildings}
        setLtePredictionUseBuildings={setLtePredictionUseBuildings}
        onlyInsidePolygons={onlyInsidePolygons}
        polygonCount={polygons?.length || 0}
        filterPolygons={rawFilteringPolygons}
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
        subSessionError={subSessionError}
        neighborStats={neighborStats}
        areaEnabled={areaEnabled}
        setAreaEnabled={setAreaEnabled}
        areaZoneCount={areaData?.length || 0}
        areaZoneLoading={areaLoading}
        areaZoneError={areaError}
        enableGrid={enableGrid}
        setEnableGrid={setEnableGrid}
        gridSizeMeters={gridSizeMeters}
        setGridSizeMeters={setGridSizeMeters}
        gridAggregationSummary={gridFilteredData.summary}
        canEnableGridView={canEnableUnifiedGridView}
        lteGridAvailable={lteGridAvailable}
        lteGridSizeMeters={lteGridSizeMeters}
        setLteGridSizeMeters={setLteGridSizeMeters}
        lteGridAggregationMethod={lteGridAggregationMethod}
        setLteGridAggregationMethod={setLteGridAggregationMethod}
        storedGridVersion={storedGridVersion}
        setStoredGridVersion={setStoredGridVersion}
        storedGridScenarioId={storedGridScenarioId}
        setStoredGridScenarioId={setStoredGridScenarioId}
        storedGridScenarioOptions={storedGridScenarioOptions}
        storedGridMetricMode={storedGridMetricMode}
        setStoredGridMetricMode={setStoredGridMetricMode}
        deltaGridScope={deltaGridScope}
        setDeltaGridScope={setDeltaGridScope}
        deltaGridApiState={deltaGridApiState}
        onDeltaGridComputeStore={handleDeltaGridComputeStore}
        onDeltaGridFetchStored={handleDeltaGridManualFetch}
        onDeleteStoredGridScenario={handleDeleteStoredGridScenario}
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
        onSessionIdsChange={handleSessionIdsChange}
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
          enabled={enableSiteToggle}
          sites={effectiveSiteData}
          colorMode={siteLegendColorMode}
          isLoading={effectiveSiteLoading}
          sitePredictionVersion={sitePredictionVersion}
          activeFilter={siteLegendFilter}
          onFilterChange={setSiteLegendFilter}
          colorOverrides={siteColorOverrides}
          onColorChange={handleSiteLegendColorChange}
        />

        <BestNetworkLegend
          stats={bestNetworkStats}
          providerColors={bestNetworkProviderColors}
          enabled={bestNetworkEnabled}
        />

        <HandoverLegend
          techEnabled={techHandOver}
          bandEnabled={bandHandover}
          pciEnabled={pciHandover}
          technologyTransitions={technologyTransitions}
          bandTransitions={bandTransitions}
          pciTransitions={pciTransitions}
        />

        {canSaveDrawnPolygonToProject && (
          <div className="absolute bottom-4 right-4 z-[600] w-[280px] rounded-xl border border-blue-500/30 bg-slate-950/92 p-3 shadow-xl backdrop-blur-sm">
            <div className="text-sm font-semibold text-white">
              Save Shape
            </div>
            <div className="mt-1 text-xs text-slate-300">
              Save the drawn shape to {saveDrawnPolygonTargetLabel}.
            </div>
            <input
              value={newProjectPolygonName}
              onChange={(e) => setNewProjectPolygonName(e.target.value)}
              placeholder="Shape name"
              className="mt-3 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none transition focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveDrawnPolygonToProject}
              disabled={isSavingProjectPolygon || !newProjectPolygonName.trim()}
              className="mt-3 h-9 w-full rounded-md bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingProjectPolygon ? "Saving..." : "Save Shape"}
            </button>
          </div>
        )}

        <div ref={mapSnapshotContainerRef} className="relative h-full w-full">
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
              colorBy={effectiveGridColorBy}
              activeMarkerIndex={null}
              onMarkerClick={() => { }}
              options={mapOptions}
              center={mapCenter}
              defaultZoom={mapZoom}
              fitToLocations={(locationsToDisplay?.length || 0) > 0}
              showNumCells={showNumCells}
              showMetricLabels={showMetricLabels}
              overlapDrawOrder={ui.overlapDrawOrder}
              onLoad={handleMapLoad}
              pointRadius={logRadius}
              projectId={projectId}
              polygonSource={polygonSource}
              enablePolygonFilter={true}
              filterPolygons={mapBoundaryPolygons}
              externalPolygonsLoading={polygonLoading || areaLoading}
              showPolygonBoundary={!buildingBorderEnabled}
              projectPolygonEditEnabled={
                projectPolygonEditEnabled && polygonSource === "map"
              }
              editableBoundaryPolygonIds={editableBoundaryPolygonIds}
              onProjectPolygonBoundaryChange={handleProjectPolygonPathChange}
              enableGrid={mapGridEnabled}
              gridSizeMeters={gridSizeMeters}
              gridAggregationMethod={lteGridAggregationMethod || "median"}
              areaEnabled={areaEnabled}
              filterInsidePolygons={onlyInsidePolygons}
              opacity={opacity}
              polygonOpacity={polygonOpacity}
              neighborData={filteredNeighbors}
              showNeighbors={showSessionNeighbors}
              neighborSquareSize={neighborSquareSize}
              neighborOpacity={0.45}
              onNeighborClick={(neighbor) => { }}
              onGridCellsStatsChange={setGridCellStats}
              onGridLegendLocationsChange={setRenderedGridLegendLogs}
              debugNeighbors={false}
              legendFilter={legendFilter}
              drawingEnabled={ui.drawEnabled}
              drawingShapeMode={ui.shapeMode}
              debugMode={true}
            >
              <DrawingToolsLayer
                map={mapRef.current}
                enabled={ui.drawEnabled}
                logs={preDrawingDisplayLocations}
                sessions={EMPTY_LIST}
                selectedMetric={selectedMetric}
                thresholds={effectiveThresholds}
                pixelateRect={ui.drawPixelateRect}
                cellSizeMeters={ui.drawCellSizeMeters}
                colorizeCells={ui.colorizeCells}
                polygonOpacity={DRAWN_POLYGON_OPACITY}
                polygonFillOpacity={DRAWN_POLYGON_FILL_OPACITY}
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
                  enableGrid={
                    (lteGridEnabled || isStoredGridOverlayVisible) &&
                    !(showPolygons || areaEnabled || buildingBorderEnabled)
                  }
                  gridSizeMeters={lteGridSizeMeters || 50}
                  gridAggregationMethod={lteGridAggregationMethod || "median"}
                  deltaComparisonMode={isDeltaSiteGridMode}
                  externalGridCells={
                    isStoredGridOverlayVisible && !buildingBorderEnabled
                      ? storedDeltaGridCells
                      : EMPTY_LIST
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
                      fillOpacity: poly.fillOpacity ?? polygonOpacity,
                      strokeColor: poly.fillColor || "#2563eb",
                      strokeWeight: 1,
                      strokeOpacity: buildingBorderEnabled
                        ? 0.15
                        : poly.strokeOpacity ?? polygonOpacity,
                      clickable: true,
                      zIndex: 50,
                    }}
                    onMouseOver={(e) => handlePolygonMouseOver(poly, e)}
                    onMouseMove={handlePolygonMouseMove}
                    onMouseOut={handlePolygonMouseOut}
                  />
                ))}

              {buildingBorderEnabled &&
                buildingBorderSegments.map((segment) => (
                  <Polyline
                    key={`building-border-${segment.id}`}
                    path={segment.path}
                    options={{
                      strokeColor: segment.color,
                      strokeOpacity: 1,
                      strokeWeight: 3,
                      clickable: false,
                      zIndex: 90,
                    }}
                  />
                ))}

              {areaEnabled &&
                (areaPolygonsWithColors || []).map((poly) => (
                  <Polygon
                    key={poly.uid}
                    paths={poly.paths[0]}
                    options={{
                      fillColor: poly.fillColor || "#9333ea",
                      fillOpacity: poly.fillOpacity ?? polygonOpacity,
                      strokeColor: poly.fillColor || "#7e22ce",
                      strokeWeight: 1,
                      strokeOpacity: poly.strokeOpacity ?? polygonOpacity,
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
                  projectId={projectId}
                  sessionIds={sessionIds}
                  siteToggle={siteToggle}
                  sitePredictionVersion={sitePredictionVersion}
                  sitePredictionScenarioId={sitePredictionScenarioId}
                  defaultBeamwidth={defaultSiteBeamwidth}
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
                  onSitePredictionScenarioSaved={handleSitePredictionScenarioSaved}
                  colorMode={siteLegendColorMode}
                  siteLabelField={siteLabelField}
                  viewport={viewport}
                  thresholds={effectiveThresholds}
                  getMetricColor={getMetricColorForLog}
                  onSiteSelect={setSelectedSites}
                  onSectorPredictionPointsChange={setSectorPredictionGridPoints}
                  triangleScaleMultiplier={triangleScaleMultiplier}
                  siteLegendFilter={siteLegendFilter}
                  siteColorOverrides={siteColorOverrides}
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
              
              {/* // yaha pe subsession ke liye call hai */}
               
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
        siteData={effectiveSiteData}
      />
    </div>
  );
};

export default UnifiedMapView;
