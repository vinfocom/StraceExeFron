// src/components/MapWithMultipleCircles.jsx
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { GoogleMap, PolygonF, RectangleF, InfoWindow } from "@react-google-maps/api";
import { mapViewApi } from "@/api/apiEndpoints";
import DeckGLOverlay from "@/components/maps/DeckGLOverlay";
import { Zap, Layers, Radio, Square, Circle } from "lucide-react";
// import TechHandoverMarkers from "../unifiedMap/TechHandoverMarkers";
import useColorForLog from "@/hooks/useColorForLog";
import { getMetricValueFromLog, COLOR_SCHEMES } from "@/utils/metrics";
import { normalizeProviderName, normalizeTechName, getLogColor, generateColorFromHash } from "@/utils/colorUtils";

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };
const CSHARP_API_BASE_URL = (
  import.meta.env.DEV ? "" : (import.meta.env.VITE_CSHARP_API_URL || "")
).replace(/\/+$/, "");
const EMPTY_ARRAY = [];
const MAX_IMAGE_LOG_SCAN_POINTS = 12000;
const METRIC_RANGE_EPSILON = 1e-9;

const matchesLegendMetricRange = (value, legendFilter) => {
  const min = Number(legendFilter?.min);
  const max = Number(legendFilter?.max);
  const includeMax = Boolean(legendFilter?.includeMax);
  if (![value, min, max].every(Number.isFinite)) return false;

  const lowerMatch = value >= min - METRIC_RANGE_EPSILON;
  const upperMatch = includeMax
    ? value <= max + METRIC_RANGE_EPSILON
    : value < max - METRIC_RANGE_EPSILON;
  return lowerMatch && upperMatch;
};

const normalizeImagePath = (rawPath) => {
  if (rawPath === null || rawPath === undefined) return null;
  const normalized = String(rawPath).trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "n/a" || lower === "na") {
    return null;
  }
  return normalized;
};

const resolveImageUrl = (rawPath) => {
  const normalized = normalizeImagePath(rawPath);
  if (!normalized) return null;

  if (
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:") ||
    /^(https?:)?\/\//i.test(normalized)
  ) {
    return normalized;
  }

  let path = normalized.replace(/\\/g, "/");
  const lowerPath = path.toLowerCase();

  const knownRoots = ["uploadedexcels/", "uploaded_images/", "wwwroot/"];
  const matchedRoot = knownRoots.find((root) => lowerPath.includes(root));
  if (matchedRoot) {
    const rootIndex = lowerPath.indexOf(matchedRoot);
    path = path.slice(rootIndex);
  }

  if (/^[a-zA-Z]:\//.test(path)) {
    return null;
  }

  if (path.toLowerCase().startsWith("wwwroot/")) {
    path = path.slice("wwwroot".length);
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  path = path.replace(/\/{2,}/g, "/");
  return CSHARP_API_BASE_URL ? `${CSHARP_API_BASE_URL}${path}` : path;
};

// ============== Spatial Hash Grid ==============
class SpatialHashGrid {
  constructor(cellSize = 0.001) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.bounds = null;
  }

  getCellKey(lat, lng) {
    return `${Math.floor(lng / this.cellSize)},${Math.floor(lat / this.cellSize)}`;
  }

  build(locations) {
    this.grid.clear();
    if (!locations?.length) return this;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
      
      const key = this.getCellKey(loc.lat, loc.lng);
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key).push(i);

      minLat = Math.min(minLat, loc.lat);
      maxLat = Math.max(maxLat, loc.lat);
      minLng = Math.min(minLng, loc.lng);
      maxLng = Math.max(maxLng, loc.lng);
    }

    this.bounds = { north: maxLat, south: minLat, east: maxLng, west: minLng };
    return this;
  }

  queryBounds(bounds, locations) {
    const results = [];
    const startX = Math.floor(bounds.west / this.cellSize);
    const endX = Math.floor(bounds.east / this.cellSize);
    const startY = Math.floor(bounds.south / this.cellSize);
    const endY = Math.floor(bounds.north / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const indices = this.grid.get(`${x},${y}`);
        if (indices) {
          for (const idx of indices) {
            const loc = locations[idx];
            if (loc.lat >= bounds.south && loc.lat <= bounds.north &&
                loc.lng >= bounds.west && loc.lng <= bounds.east) {
              results.push(idx);
            }
          }
        }
      }
    }
    return results;
  }
}

// ============== Polygon Checker ==============
class PolygonChecker {
  constructor(polygonData) {
    this.polygons = [];
    this.hasPolygons = false;
    
    if (polygonData?.length) {
      this.hasPolygons = true;
      this.polygons = polygonData.map(({ path, bbox }) => ({
        bbox,
        edges: path.map((p, i, arr) => {
          const next = arr[(i + 1) % arr.length];
          return {
            x1: p.lng, y1: p.lat,
            x2: next.lng, y2: next.lat,
            minY: Math.min(p.lat, next.lat),
            maxY: Math.max(p.lat, next.lat),
          };
        })
      }));
    }
  }

  isInside(lat, lng) {
    if (!this.hasPolygons) return true;
    
    for (const { edges, bbox } of this.polygons) {
      if (bbox && (lat < bbox.south || lat > bbox.north || 
                   lng < bbox.west || lng > bbox.east)) {
        continue;
      }

      let inside = false;
      for (const e of edges) {
        if (lat < e.minY || lat > e.maxY) continue;
        if (e.y1 > lat !== e.y2 > lat) {
          if (lng < ((e.x2 - e.x1) * (lat - e.y1)) / (e.y2 - e.y1) + e.x1) {
            inside = !inside;
          }
        }
      }
      if (inside) return true;
    }
    return false;
  }

  filterLocations(locations) {
    if (!this.hasPolygons) return locations;
    if (!locations?.length) return [];
    
    const result = new Array(locations.length);
    let count = 0;
    
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const latRaw = loc.lat ?? loc.latitude ?? loc.Lat ?? loc.Latitude ?? loc.LAT;
      const lngRaw = loc.lng ?? loc.lon ?? loc.longitude ?? loc.Lng ?? loc.Longitude ?? loc.LNG;
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      
      if (Number.isFinite(lat) && Number.isFinite(lng) && this.isInside(lat, lng)) {
        result[count++] = loc;
      }
    }
    
    result.length = count;
    return result;
  }
}

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [168, 166, 162]; // Default gray if invalid
};

// ============== Aggregation Methods ==============
const AGGREGATION_METHODS = {
  median: (values) => {
    if (!values.length) return null;
    const sorted = Float64Array.from(values).sort();
    const mid = sorted.length >> 1;
    return sorted.length & 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
  },
  mean: (values) => {
    if (!values.length) return null;
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  },
  min: (values) => values.length ? Math.min(...values) : null,
  max: (values) => values.length ? Math.max(...values) : null,
};

const parseWKTToPolygons = (wkt) => {
  if (!wkt?.trim()) return [];
  try {
    const match = wkt.trim().match(/POLYGON\s*\(\(([^)]+)\)\)/i);
    if (!match) return [];
    const coords = match[1].split(",");
    const points = [];
    
    for (let i = 0; i < coords.length; i++) {
      const parts = coords[i].trim().split(/\s+/);
      const val1 = parseFloat(parts[0]);
      const val2 = parseFloat(parts[1]);
      
      let lat, lng;

      if (Math.abs(val1) > 40 && Math.abs(val2) < 40) {
        lng = val1;
        lat = val2;
      } else if (Math.abs(val1) < 40 && Math.abs(val2) > 40) {
        lat = val1;
        lng = val2;
      } else if (Math.abs(val1) > 90) {
        lng = val1;
        lat = val2;
      } else {
        lat = val1;
        lng = val2;
      }

      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng });
      }
    }
    
    return points.length >= 3 ? [points] : [];
  } catch (err) {
    console.error("WKT Parse Error:", err);
    return [];
  }
};

const getPolygonBounds = (path) => {
  if (!path?.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of path) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { north: maxLat, south: minLat, east: maxLng, west: minLng };
};

const normalizeExternalPathPoint = (point) => {
  if (!point) return null;

  const rawLat = point.lat ?? point.Lat ?? point.latitude;
  const rawLng = point.lng ?? point.Lng ?? point.longitude ?? point.lon;

  const lat = typeof rawLat === "function" ? Number(rawLat()) : Number(rawLat);
  const lng = typeof rawLng === "function" ? Number(rawLng()) : Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const normalizeExternalPolygonData = (polygons = []) => {
  if (!Array.isArray(polygons) || polygons.length === 0) return [];

  return polygons
    .map((poly, idx) => {
      const rawPath = Array.isArray(poly?.paths?.[0])
        ? poly.paths[0]
        : Array.isArray(poly?.paths)
          ? poly.paths
          : Array.isArray(poly?.path)
            ? poly.path
            : [];

      const path = rawPath.map(normalizeExternalPathPoint).filter(Boolean);
      if (path.length < 3) return null;

      return {
        id: poly?.id ?? poly?.uid ?? `external-${idx}`,
        path,
        bbox: poly?.bbox || getPolygonBounds(path),
      };
    })
    .filter(Boolean);
};

// ============== Helper: Color Resolution ==============
const getColorFromThresholds = (value, metricThresholds) => {
  if (value == null || isNaN(value)) return "#808080";
  if (!metricThresholds?.length) return "#808080";

  const sorted = [...metricThresholds].sort((a, b) => parseFloat(a.min) - parseFloat(b.min));

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const min = parseFloat(t.min);
    const max = parseFloat(t.max);
    const isLast = i === sorted.length - 1;
    if (value >= min && (isLast ? value <= max : value < max)) {
      return t.color;
    }
  }
  
  if (value < parseFloat(sorted[0].min)) return sorted[0].color;
  if (value > parseFloat(sorted[sorted.length - 1].max)) return sorted[sorted.length - 1].color;

  return "#808080";
};

// ============== Grid Generator ==============
const generateGridCellsOptimized = (
  polygonData, 
  gridSizeMeters, 
  locations, 
  metric, 
  getMetricColor,
  aggregationMethod = 'median',
  spatialIndex,
  colorBy = null
) => {
  if (!polygonData?.length || !locations?.length) return [];

  let globalBounds = null;
  for (const { bbox } of polygonData) {
    if (!bbox) continue;
    if (!globalBounds) {
      globalBounds = { ...bbox };
    } else {
      globalBounds.north = Math.max(globalBounds.north, bbox.north);
      globalBounds.south = Math.min(globalBounds.south, bbox.south);
      globalBounds.east = Math.max(globalBounds.east, bbox.east);
      globalBounds.west = Math.min(globalBounds.west, bbox.west);
    }
  }
  if (!globalBounds) return [];

  const latDegPerMeter = 1 / 111320;
  const avgLat = (globalBounds.north + globalBounds.south) * 0.5;
  const lngDegPerMeter = 1 / (111320 * Math.cos(avgLat * Math.PI / 180));
  const cellHeight = gridSizeMeters * latDegPerMeter;
  const cellWidth = gridSizeMeters * lngDegPerMeter;

  const checker = new PolygonChecker(polygonData);
  const aggregateFn = AGGREGATION_METHODS[aggregationMethod] || AGGREGATION_METHODS.median;
  const lowerIsBetterMetrics = new Set([
    "latency",
    "jitter",
    "packet_loss",
    "num_cells",
  ]);
  const normalizedMetric = String(metric || "rsrp").trim().toLowerCase();
  const isLowerBetterMetric = lowerIsBetterMetrics.has(normalizedMetric);
  const normalizedColorBy = String(colorBy || "").trim().toLowerCase();
  const getCategoryLabel = (key) => {
    if (key === "provider" || key === "operator") return "Provider";
    if (key === "technology") return "Technology";
    if (key === "band") return "Band";
    return "Category";
  };
  const resolveProviderName = (log) => {
    const raw = log?.provider ?? log?.Provider ?? log?.operator ?? log?.network ?? "";
    const normalized = normalizeProviderName(raw);
    return String(normalized || raw || "").trim() || "Unknown";
  };
  const resolveBandName = (log) => {
    const raw = log?.band ?? log?.primaryBand ?? log?.Band ?? log?.band_name ?? "";
    const band = String(raw || "").trim();
    return band && band !== "-1" ? band : "Unknown";
  };
  const resolveTechnologyName = (log) =>
    normalizeTechName(
      log?.technology ?? log?.networkType ?? log?.network ?? "",
      log?.band ?? log?.primaryBand,
    ) || "Unknown";
  const resolveCategoryValue = (log) => {
    if (normalizedColorBy === "provider" || normalizedColorBy === "operator") {
      return resolveProviderName(log);
    }
    if (normalizedColorBy === "technology") return resolveTechnologyName(log);
    if (normalizedColorBy === "band") return resolveBandName(log);
    return null;
  };

  const cells = [];
  let cellId = 0;
  const valuesBuffer = new Float64Array(1000);

  for (let lat = globalBounds.south; lat < globalBounds.north; lat += cellHeight) {
    for (let lng = globalBounds.west; lng < globalBounds.east; lng += cellWidth) {
      const cellBounds = { 
        north: lat + cellHeight, 
        south: lat, 
        east: lng + cellWidth, 
        west: lng 
      };
      
      const centerLat = (cellBounds.north + cellBounds.south) * 0.5;
      const centerLng = (cellBounds.east + cellBounds.west) * 0.5;

      if (!checker.isInside(centerLat, centerLng)) continue;

      let cellLocationIndices;
      if (spatialIndex) {
        cellLocationIndices = spatialIndex.queryBounds(cellBounds, locations);
      } else {
        cellLocationIndices = [];
        for (let i = 0; i < locations.length; i++) {
          const loc = locations[i];
          if (loc.lat >= cellBounds.south && loc.lat < cellBounds.north &&
              loc.lng >= cellBounds.west && loc.lng < cellBounds.east) {
            cellLocationIndices.push(i);
          }
        }
      }

      const count = cellLocationIndices.length;
      let aggregatedValue = null;
      let fillColor = "#E5E7EB";
      let bestOperator = null;
      let bestByColor = null;

      if (count > 0) {
        const operatorMetricBuckets = new Map();
        const categoryMetricBuckets = new Map();
        let validCount = 0;
        for (const idx of cellLocationIndices) {
          const log = locations[idx];
          const v = getMetricValueFromLog(log, metric);
          if (v != null && !isNaN(v) && Number.isFinite(v)) {
            if (validCount < valuesBuffer.length) {
              valuesBuffer[validCount++] = v;
            }

            const provider = resolveProviderName(log);
            if (provider && provider !== "Unknown") {
              const current = operatorMetricBuckets.get(provider) || {
                sum: 0,
                count: 0,
              };
              current.sum += v;
              current.count += 1;
              operatorMetricBuckets.set(provider, current);
            }

            const categoryValue = resolveCategoryValue(log);
            if (
              categoryValue &&
              categoryValue !== "Unknown" &&
              normalizedColorBy &&
              normalizedColorBy !== "metric"
            ) {
              const current = categoryMetricBuckets.get(categoryValue) || {
                sum: 0,
                count: 0,
              };
              current.sum += v;
              current.count += 1;
              categoryMetricBuckets.set(categoryValue, current);
            }
          }
        }
        
        if (validCount > 0) {
          const values = valuesBuffer.subarray(0, validCount);
          aggregatedValue = aggregateFn(Array.from(values));
          
          if (getMetricColor && aggregatedValue !== null) {
            fillColor = getMetricColor(aggregatedValue, metric);
          }

          const rankedOperators = Array.from(operatorMetricBuckets.entries())
            .map(([name, stat]) => ({
              name,
              count: stat.count,
              average: stat.count > 0 ? stat.sum / stat.count : null,
            }))
            .filter((entry) => Number.isFinite(entry.average))
            .sort((a, b) =>
              isLowerBetterMetric ? a.average - b.average : b.average - a.average,
            );
          if (rankedOperators.length > 0) {
            bestOperator = rankedOperators[0];
          }

          const rankedCategories = Array.from(categoryMetricBuckets.entries())
            .map(([name, stat]) => ({
              name,
              count: stat.count,
              average: stat.count > 0 ? stat.sum / stat.count : null,
            }))
            .filter((entry) => Number.isFinite(entry.average))
            .sort((a, b) =>
              isLowerBetterMetric ? a.average - b.average : b.average - a.average,
            );
          if (rankedCategories.length > 0) {
            bestByColor = {
              label: getCategoryLabel(normalizedColorBy),
              ...rankedCategories[0],
            };
          }
        }
      }

      cells.push({
        id: cellId++,
        bounds: cellBounds,
        count,
        aggregatedValue,
        fillColor,
        bestOperator,
        bestByColor,
      });
    }
  }

  return cells;
};

// ============== InfoWindows ==============
const NeighborInfoWindow = React.memo(({ neighbor, onClose, resolveColor, selectedMetric }) => {
  if (!neighbor) return null;
  const isRsrp = selectedMetric === 'rsrp';
  const isRsrq = selectedMetric === 'rsrq';
  const isSinr = selectedMetric === 'sinr';
  const displayColor = neighbor.displayColor || resolveColor(neighbor.rsrp, 'rsrp');

  return (
    <InfoWindow
      position={{ lat: neighbor.lat, lng: neighbor.lng }}
      onCloseClick={onClose}
      options={{ pixelOffset: new window.google.maps.Size(0, -15), maxWidth: 320, disableAutoPan: false }}
    >
      <div className="p-2 min-w-[280px] font-sans text-gray-800">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Square className="w-4 h-4" style={{ color: displayColor }} fill={displayColor} />
            <span className="font-bold text-sm">PCI: {neighbor.pci ?? 'N/A'}</span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${displayColor}20`, color: displayColor, border: `1px solid ${displayColor}40` }}>
            {neighbor.quality || 'Unknown'}
          </span>
        </div>
        
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">📡 Primary Cell</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {neighbor.band && <div className="flex justify-between text-xs"><span className="text-gray-500">Band</span><span className="font-semibold text-blue-600">{neighbor.band}</span></div>}
            {neighbor.pci && <div className="flex justify-between text-xs"><span className="text-gray-500">PCI</span><span className="font-medium">{neighbor.pci}</span></div>}
          </div>
          {neighbor.rsrp !== null && <div className="flex justify-between text-xs items-center"><span className={`text-gray-500 ${isRsrp ? 'font-bold text-gray-700' : ''}`}>RSRP</span><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: resolveColor(neighbor.rsrp, 'rsrp') }} /><span className="font-semibold" style={{ color: resolveColor(neighbor.rsrp, 'rsrp') }}>{neighbor.rsrp?.toFixed?.(1)} dBm</span></div></div>}
          {neighbor.rsrq !== null && <div className="flex justify-between text-xs items-center"><span className={`text-gray-500 ${isRsrq ? 'font-bold text-gray-700' : ''}`}>RSRQ</span><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: resolveColor(neighbor.rsrq, 'rsrq') }} /><span className="font-medium">{neighbor.rsrq?.toFixed?.(1)} dB</span></div></div>}
          {neighbor.sinr !== null && <div className="flex justify-between text-xs items-center"><span className={`text-gray-500 ${isSinr ? 'font-bold text-gray-700' : ''}`}>SINR</span><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: resolveColor(neighbor.sinr, 'sinr') }} /><span className="font-medium">{neighbor.sinr?.toFixed?.(1)} dB</span></div></div>}
        </div>

        {(neighbor.neighbourRsrp !== null || neighbor.neighbourBand) && (
          <div className="space-y-1.5 mt-3 pt-2 border-t border-gray-100">
            <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">📶 Neighbour Cell</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {neighbor.neighbourBand && <div className="flex justify-between text-xs"><span className="text-gray-500">Band</span><span className="font-semibold text-purple-600">{neighbor.neighbourBand}</span></div>}
              {neighbor.neighbourPci && <div className="flex justify-between text-xs"><span className="text-gray-500">PCI</span><span className="font-medium">{neighbor.neighbourPci}</span></div>}
            </div>
            {neighbor.neighbourRsrp !== null && <div className="flex justify-between text-xs items-center"><span className={`text-gray-500 ${isRsrp ? 'font-bold text-gray-700' : ''}`}>RSRP</span><span className="font-semibold" style={{ color: resolveColor(neighbor.neighbourRsrp, 'rsrp') }}>{neighbor.neighbourRsrp?.toFixed?.(1)} dBm</span></div>}
            {neighbor.neighbourRsrq !== null && <div className="flex justify-between text-xs items-center"><span className={`text-gray-500 ${isRsrq ? 'font-bold text-gray-700' : ''}`}>RSRQ</span><span className="font-semibold" style={{ color: resolveColor(neighbor.neighbourRsrq, 'rsrq') }}>{neighbor.neighbourRsrq?.toFixed?.(1)} dB</span></div>}
            {neighbor.neighbourSinr !== null && <div className="flex justify-between text-xs items-center"><span className={`text-gray-500 ${isSinr ? 'font-bold text-gray-700' : ''}`}>SINR</span><span className="font-semibold" style={{ color: resolveColor(neighbor.neighbourSinr, 'sinr') }}>{neighbor.neighbourSinr?.toFixed?.(1)} dB</span></div>}
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {neighbor.sessionId && <div className="flex justify-between text-xs"><span className="text-gray-500">Session</span><span className="font-medium">{neighbor.sessionId}</span></div>}
          <div className="text-[10px] text-gray-400 font-mono text-center">📍 {neighbor.lat.toFixed(6)}, {neighbor.lng.toFixed(6)}</div>
        </div>
      </div>
    </InfoWindow>
  );
});
NeighborInfoWindow.displayName = 'NeighborInfoWindow';

const getThroughputValue = (log, direction = "dl") => {
  const fields =
    direction === "dl"
      ? ["dl_thpt", "dl_tpt", "dl_rpt", "dl_throughput", "throughput_dl", "download"]
      : ["ul_thpt", "ul_tpt", "ul_rpt", "ul_throughput", "throughput_ul", "upload"];

  for (const field of fields) {
    const raw = log?.[field];
    if (raw !== null && raw !== undefined && raw !== "") {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const PrimaryLogInfoWindow = React.memo(({ log, onClose, resolveColor, selectedMetric }) => {
  if (!log) return null;
  const metricValue = getMetricValueFromLog(log, selectedMetric);
  const metricColor = resolveColor(metricValue, selectedMetric);
  const dlValue = getThroughputValue(log, "dl");
  const ulValue = getThroughputValue(log, "ul");

  return (
    <InfoWindow
      position={{ lat: log.lat, lng: log.lng }}
      onCloseClick={onClose}
      options={{ pixelOffset: new window.google.maps.Size(0, -15), maxWidth: 320 }}
    >
      <div className="p-2 min-w-[260px] font-sans text-gray-800">
        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-200">
          <Circle className="w-4 h-4" style={{ color: metricColor }} fill={metricColor} />
          <span className="font-bold text-sm">Primary Log</span>
        </div>
        <div className="space-y-1.5">
          {log.provider && <div className="flex justify-between text-xs"><span className="text-gray-500">Provider</span><span className="font-medium">{log.provider}</span></div>}
          {log.technology && <div className="flex justify-between text-xs"><span className="text-gray-500">Technology</span><span className="font-medium">{log.technology}</span></div>}
          {log.band && <div className="flex justify-between text-xs"><span className="text-gray-500">Band</span><span className="font-semibold text-blue-600">{log.band}</span></div>}
          {log.rsrp !== null && log.rsrp !== undefined && <div className="flex justify-between text-xs items-center"><span className="text-gray-500">RSRP</span><span className="font-semibold" style={{ color: resolveColor(log.rsrp, 'rsrp') }}>{log.rsrp?.toFixed?.(1)} dBm</span></div>}
          {log.rsrq !== null && log.rsrq !== undefined && <div className="flex justify-between text-xs items-center"><span className="text-gray-500">RSRQ</span><span className="font-medium" style={{ color: resolveColor(log.rsrq, 'rsrq') }}>{log.rsrq?.toFixed?.(1)} dB</span></div>}
          {log.sinr !== null && log.sinr !== undefined && <div className="flex justify-between text-xs items-center"><span className="text-gray-500">SINR</span><span className="font-medium" style={{ color: resolveColor(log.sinr, 'sinr') }}>{log.sinr?.toFixed?.(1)} dB</span></div>}
          {dlValue !== null && <div className="flex justify-between text-xs"><span className="text-gray-500">DL Throughput</span><span className="font-medium">{dlValue.toFixed(2)} Mbps</span></div>}
          {ulValue !== null && <div className="flex justify-between text-xs"><span className="text-gray-500">UL Throughput</span><span className="font-medium">{ulValue.toFixed(2)} Mbps</span></div>}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100"><div className="text-[10px] text-gray-400 font-mono text-center">📍 {log.lat.toFixed(6)}, {log.lng.toFixed(6)}</div></div>
      </div>
    </InfoWindow>
  );
});
PrimaryLogInfoWindow.displayName = 'PrimaryLogInfoWindow';

// ============== Main Component ==============
const containerStyle = { width: "100%", height: "100%" };

const MapWithMultipleCircles = ({
  onMarkerHover, 
  hoveredCellId,
  isLoaded,
  loadError,
  showNumCells = false,
  areaData = [],
  locations = [],
  selectedMetric = "rsrp",
  colorBy = null,
  activeMarkerIndex,
  onMarkerClick,
  options,
  center = DEFAULT_CENTER,
  defaultZoom = 14,
  fitToLocations = true,
  onLoad: onLoadProp,
  pointRadius = 10,
  children,
  projectId = null,
  polygonSource = "map",
  enablePolygonFilter = true,
  filterInsidePolygons = false,
  filterPolygons = null,
  externalPolygonsLoading = false,
  showPolygonBoundary = true,
  enableGrid = false,
  gridSizeMeters = 50,
  gridAggregationMethod = 'median',
  areaEnabled = false,
  showControls = true,
  showStats = true,
  // technologyTransitions = [],
  // techHandOver = false,
  onFilteredLocationsChange,
  opacity = 1,
  showPoints: showPointsProp = true,
  thresholds = {},
  neighborData = [],
  showNeighbors = false,
  neighborSquareSize = 4,
  neighborMinSquareSize = 3,
  neighborOpacity = 0.45,
  disableDeckInteractions = false,
  onNeighborClick,
  onFilteredNeighborsChange,
  onGridCellsStatsChange,
  debugMode = false,
  legendFilter = null,
  drawingEnabled = false,
  drawingShapeMode = null,
  polygonOpacity = 0.35,
}) => {
  const { 
    getMetricColor: getMetricColorFromHook, 
    getThresholdInfo, 
    thresholds: hookThresholds, 
    loading: thresholdsLoading, 
    isReady: thresholdsReady 
  } = useColorForLog();

  const [map, setMap] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [hoveredCellTooltipPos, setHoveredCellTooltipPos] = useState(null);
  const [polygonData, setPolygonData] = useState([]);
  const [polygonsFetched, setPolygonsFetched] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [selectedNeighbor, setSelectedNeighbor] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedImageLog, setSelectedImageLog] = useState(null);
  const [selectedImageLoadFailed, setSelectedImageLoadFailed] = useState(false);
  
  const onFilteredLocationsChangeRef = useRef(onFilteredLocationsChange);
  const onFilteredNeighborsChangeRef = useRef(onFilteredNeighborsChange);
  const spatialIndexRef = useRef(null);
  const mapContainerRef = useRef(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onNeighborClickRef = useRef(onNeighborClick);

  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);
  useEffect(() => { onNeighborClickRef.current = onNeighborClick; }, [onNeighborClick]);
  useEffect(() => { onFilteredLocationsChangeRef.current = onFilteredLocationsChange; }, [onFilteredLocationsChange]);
  useEffect(() => { onFilteredNeighborsChangeRef.current = onFilteredNeighborsChange; }, [onFilteredNeighborsChange]);

  // ✅ Unified Color Resolver - UPDATED TO SUPPORT TAC
  const resolvedPolygonOpacity = Math.max(
    0,
    Math.min(1, Number.isFinite(Number(polygonOpacity)) ? Number(polygonOpacity) : 0.35),
  );

  const resolveColor = useCallback((value, metricOrType) => {
    if (!metricOrType) return "#808080";

    const typeKey = metricOrType.toLowerCase();
    
    // ✅ 1. Explicitly handle TAC (Tracking Area Code) to use dynamic hashing
    if (typeKey === 'tac') {
      return generateColorFromHash(String(value));
    }
    
    // ✅ 2. Categorical Coloring
    if (['provider', 'technology', 'band', 'operator'].includes(typeKey)) {
        return getLogColor(typeKey, value);
    }
    
    // ✅ 3. Threshold-based Coloring
    const metricKey =
      typeKey === 'dl_tpt' || typeKey === 'dl_rpt' ? 'dl_thpt' :
      typeKey === 'ul_tpt' || typeKey === 'ul_rpt' ? 'ul_thpt' : typeKey;

    if (thresholds && thresholds[metricKey]?.length > 0) {
      return getColorFromThresholds(value, thresholds[metricKey]);
    }
    
    // 4. Fallback to hook if ready
    if (thresholdsReady) {
      return getMetricColorFromHook(value, metricOrType);
    }
    
    return "#808080";
  }, [thresholds, thresholdsReady, getMetricColorFromHook]);


  // Fetch polygons
  useEffect(() => {
    const hasExternalPolygonControl = Array.isArray(filterPolygons);

    if (hasExternalPolygonControl) {
      setPolygonData([]);
      setPolygonsFetched(!externalPolygonsLoading);
      setFetchError(null);
      return;
    }

    const fetchPolygons = async () => {
      if (!projectId || !enablePolygonFilter) {
        setPolygonData([]);
        setPolygonsFetched(true);
        return;
      }

      try {
        const res = await mapViewApi.getProjectPolygonsV2(projectId, polygonSource);
        const items = res?.Data || res?.data?.Data || (Array.isArray(res) ? res : []);
        
        const allPaths = [];
        for (const item of items) {
          const wkt = item.Wkt || item.wkt;
          if (wkt) {
            const paths = parseWKTToPolygons(wkt);
            for (const path of paths) {
              if (path.length >= 3) {
                allPaths.push({ 
                  path, 
                  bbox: getPolygonBounds(path),
                  id: item.Id || item.id 
                });
              }
            }
          }
        }
        
        setPolygonData(allPaths);
        setPolygonsFetched(true);
        setFetchError(null);
      } catch (err) {
        setPolygonData([]);
        setPolygonsFetched(true);
        setFetchError(err.message);
      }
    };
    
    fetchPolygons();
  }, [projectId, polygonSource, enablePolygonFilter, filterPolygons, externalPolygonsLoading]);

  const externalPolygonData = useMemo(
    () => normalizeExternalPolygonData(filterPolygons),
    [filterPolygons],
  );
  const hasExternalPolygonControl = Array.isArray(filterPolygons);

  const activePolygonData = useMemo(() => {
    if (hasExternalPolygonControl) return externalPolygonData;
    if (externalPolygonData.length > 0) return externalPolygonData;
    return polygonData;
  }, [hasExternalPolygonControl, externalPolygonData, polygonData]);

  const activePolygonChecker = useMemo(
    () => new PolygonChecker(activePolygonData),
    [activePolygonData],
  );

  const hasActivePolygons = activePolygonData.length > 0;
  const activePolygonsReady = hasExternalPolygonControl
    ? !externalPolygonsLoading
    : externalPolygonData.length > 0 || polygonsFetched;

  // Filter primary locations by polygon & Legend
  const locationsToRender = useMemo(() => {
    if (!locations?.length) return EMPTY_ARRAY;
    
    let filtered = locations;

    // A. Apply Polygon Filter — only when filtering is explicitly requested
    if (filterInsidePolygons && enablePolygonFilter) {
      // Wait for polygons to be ready before filtering — prevents flash of all points
      if (!activePolygonsReady) return EMPTY_ARRAY;
      if (hasActivePolygons) {
        filtered = activePolygonChecker.filterLocations(filtered);
      }
    }
    // NOTE: When filterInsidePolygons is false, we must NEVER block on activePolygonsReady.
    //       Polygons may still be loading (for boundary drawing) but that doesn't affect point visibility.

    // B. Apply Legend Filter (Highlight)
    if (legendFilter) {
      filtered = filtered.filter(log => {
        if (legendFilter.type === 'metric') {
          const val = getMetricValueFromLog(log, legendFilter.metric);
          return Number.isFinite(val) && matchesLegendMetricRange(val, legendFilter);
        }

        if (legendFilter.type === 'pci') {
          const val = getMetricValueFromLog(log, 'pci');
          return Math.floor(val) === legendFilter.value;
        }

        if (legendFilter.type === 'tac') {
            const val = log.tac || log.TAC;
            return String(val) === String(legendFilter.value);
        }

        if (legendFilter.type === 'category') {
           const scheme = COLOR_SCHEMES[legendFilter.key];
           let key = "Unknown";
           if (legendFilter.key === 'provider') {
             key = normalizeProviderName(log.provider || log.Provider || log.carrier) || "Unknown";
           } else if (legendFilter.key === 'technology') {
             const tech = log.network || log.Network || log.technology || log.networkType;
             const band = log.band || log.Band || log.neighbourBand || log.neighborBand || log.neighbour_band;
             key = normalizeTechName(tech, band);
           } else if (legendFilter.key === 'band') {
             const b = String(log.neighbourBand || log.neighborBand || log.neighbour_band || log.band || log.Band || "").trim();
             key = (b === "-1" || b === "") ? "Unknown" : (scheme?.[b] ? b : "Unknown");
           }
           
           return key === legendFilter.value;
        }
        
        return true;
      });
    }

    return filtered;
  }, [
    locations,
    enablePolygonFilter,
    filterInsidePolygons,
    legendFilter,
    selectedMetric,
    activePolygonChecker,
    activePolygonsReady,
    hasActivePolygons,
  ]);

  const handleHover = useCallback((info) => {
    if (info.object) {
      onMarkerHover?.(info.object);
    } else {
      onMarkerHover?.(null);
    }
  }, [onMarkerHover]);

  // Process and filter neighbor data by polygon AND Legend
  const processedNeighbors = useMemo(() => {
    if (!showNeighbors || !neighborData?.length) return EMPTY_ARRAY;

    let parsed = neighborData
      .filter(n => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
      })
      .map((n, idx) => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        
        const rsrp = parseFloat(n.primaryRsrp ?? n.primary_rsrp ?? n.rsrp) || null;
        const rsrq = parseFloat(n.primaryRsrq ?? n.primary_rsrq ?? n.rsrq) || null;
        const sinr = parseFloat(n.primarySinr ?? n.primary_sinr ?? n.sinr) || null;
        const pci = n.primaryPci ?? n.primary_pci ?? n.pci;
        const band = n.primaryBand ?? n.primary_band ?? n.band;
        const neighbourRsrp = n.neighbourRsrp ?? n.neighbour_rsrp;
        const neighbourRsrq = n.neighbourRsrq ?? n.neighbour_rsrq;
        const neighbourPci = n.neighbourPci ?? n.neighbour_pci;
        const neighbourBand = n.neighbourBand ?? n.neighbour_band;
        const neighbourSinr = n.neighbourSinr ?? n.neighbour_sinr;

        let metricValue = null;
        let metricType = 'rsrp';

        const targetMetric = selectedMetric?.toLowerCase();

        if (targetMetric === 'rsrq') {
            metricValue = neighbourRsrq !== null ? parseFloat(neighbourRsrq) : null;
            metricType = 'rsrq';
        } else if (targetMetric === 'sinr') {
            metricValue = neighbourSinr !== null ? parseFloat(neighbourSinr) : null;
            metricType = 'sinr';
        } else {
            metricValue = neighbourRsrp !== null ? parseFloat(neighbourRsrp) : null;
            metricType = 'rsrp';
        }

        const thresholdInfo = getThresholdInfo?.(rsrp, 'rsrp'); 
        const quality = thresholdInfo?.label || 'Unknown';
        
        return {
          ...n,
          id: n.id || idx,
          lat,
          lng,
          rsrp: isNaN(rsrp) ? null : rsrp,
          rsrq: isNaN(rsrq) ? null : rsrq,
          sinr: isNaN(sinr) ? null : sinr,
          pci,
          band,
          neighbourRsrp: neighbourRsrp !== null ? parseFloat(neighbourRsrp) : null,
          neighbourRsrq: neighbourRsrq !== null ? parseFloat(neighbourRsrq) : null,
          neighbourSinr: neighbourSinr !== null ? parseFloat(neighbourSinr) : null,
          neighbourPci,
          neighbourBand,
          metricValue,
          metricType,
          quality,
        };
      });

    if (filterInsidePolygons && enablePolygonFilter) {
      if (!activePolygonsReady) return [];
      if (hasActivePolygons) {
        parsed = activePolygonChecker.filterLocations(parsed);
      }
    }

    if (legendFilter) {
      parsed = parsed.filter(n => {
        if (legendFilter.type === 'metric') {
          const val = n.metricValue;
          return Number.isFinite(val) && matchesLegendMetricRange(val, legendFilter);
        }
        if (legendFilter.type === 'pci') {
          const val = n.neighbourPci || n.pci;
          return Math.floor(val) === legendFilter.value;
        }
        if (legendFilter.type === 'category') {
           const scheme = COLOR_SCHEMES[legendFilter.key];
           let key = "Unknown";
           if (legendFilter.key === 'provider') {
             key = normalizeProviderName(n.provider) || "Unknown";
           } else if (legendFilter.key === 'technology') {
             key = normalizeTechName(n.technology || n.networkType, n.band);
           } else if (legendFilter.key === 'band') {
             const b = String(n.neighbourBand || n.neighborBand || n.band || "").trim();
             key = (b === "-1" || b === "") ? "Unknown" : (scheme?.[b] ? b : "Unknown");
           }
           return key === legendFilter.value;
        }
        return true;
      });
    }

    return parsed;
  }, [
    neighborData,
    showNeighbors,
    enablePolygonFilter,
    filterInsidePolygons,
    selectedMetric,
    getThresholdInfo,
    legendFilter,
    activePolygonChecker,
    activePolygonsReady,
    hasActivePolygons,
  ]);

  useEffect(() => {
    if (locationsToRender.length > 1000) {
      const index = new SpatialHashGrid(0.001);
      index.build(locationsToRender);
      spatialIndexRef.current = index;
    } else {
      spatialIndexRef.current = null;
    }
  }, [locationsToRender]);

  useEffect(() => {
    const callback = onFilteredLocationsChangeRef.current;
    if (callback) callback(locationsToRender);
  }, [locationsToRender]);

  useEffect(() => {
    const callback = onFilteredNeighborsChangeRef.current;
    if (callback) callback(processedNeighbors);
  }, [processedNeighbors]);

  const gridCells = useMemo(() => {
    if (!enableGrid || !activePolygonData.length || !locationsToRender.length) return [];
    
    return generateGridCellsOptimized(
      activePolygonData, 
      gridSizeMeters, 
      locationsToRender, 
      selectedMetric, 
      resolveColor, 
      gridAggregationMethod,
      spatialIndexRef.current,
      colorBy
    );
  }, [enableGrid, gridSizeMeters, activePolygonData, locationsToRender, selectedMetric, gridAggregationMethod, resolveColor, colorBy]);

  useEffect(() => {
    if (typeof onGridCellsStatsChange !== "function") return;
    if (!enableGrid) {
      onGridCellsStatsChange({ total: 0, populated: 0 });
      return;
    }
    const populated = gridCells.reduce(
      (acc, cell) => acc + (cell.count > 0 ? 1 : 0),
      0,
    );
    onGridCellsStatsChange({ total: gridCells.length, populated });
  }, [enableGrid, gridCells, onGridCellsStatsChange]);

  const getPrimaryColor = useCallback((loc) => {
    if (colorBy && colorBy !== 'metric') {
        const key = colorBy.toLowerCase();
        const value = loc?.[key];
        return resolveColor(value, colorBy);
    }
    const value = getMetricValueFromLog(loc, selectedMetric);
    return resolveColor(value, selectedMetric);
  }, [selectedMetric, colorBy, resolveColor]);

  const getNeighborColor = useCallback((neighbor) => {
    if (colorBy && colorBy !== 'metric') {
        const key = colorBy.toLowerCase();
        let value;
        if (key === 'technology') {
             const rawTech = neighbor?.technology || neighbor?.networkType;
             const bandForTech = neighbor?.neighbourBand || neighbor?.neighborBand || neighbor?.band;
             value = normalizeTechName(rawTech, bandForTech);
        } else if (key === 'band') {
             value = neighbor?.neighbourBand || neighbor?.neighborBand || neighbor?.band;
        } else {
             value = neighbor?.[key];
        }
        return resolveColor(value, colorBy);
    }
    const value = neighbor?.metricValue;
    const type = neighbor?.metricType || selectedMetric; 
    return resolveColor(value, type);
  }, [selectedMetric, colorBy, resolveColor]);

  const computedCenter = useMemo(() => {
    const allPoints = [...locationsToRender, ...processedNeighbors];
    const locs = allPoints.length > 0 ? allPoints : 
                 locations.length > 0 ? locations : null;
    if (!locs?.length) return center;
    const sampleSize = Math.min(locs.length, 1000);
    const step = Math.max(1, Math.floor(locs.length / sampleSize));
    let sumLat = 0, sumLng = 0, count = 0;
    for (let i = 0; i < locs.length; i += step) {
      sumLat += locs[i].lat;
      sumLng += locs[i].lng;
      count++;
    }
    return { lat: sumLat / count, lng: sumLng / count };
  }, [locationsToRender, processedNeighbors, locations, center]);

  const autoFitSignature = useMemo(() => {
    const allPoints = [...locationsToRender, ...processedNeighbors];
    const locs = allPoints.length > 0 ? allPoints : locations;
    if (!Array.isArray(locs) || locs.length === 0) return "empty";

    const first = locs[0];
    const last = locs[locs.length - 1];
    return [
      locs.length,
      Number(first?.lat).toFixed(5),
      Number(first?.lng).toFixed(5),
      Number(last?.lat).toFixed(5),
      Number(last?.lng).toFixed(5),
    ].join("|");
  }, [locationsToRender, processedNeighbors, locations]);

  const lastAutoFitSignatureRef = useRef("");

  const applyAutoViewport = useCallback((mapInstance) => {
    if (!mapInstance) return;

    const allPoints = [...locationsToRender, ...processedNeighbors];
    const locs = allPoints.length > 0 ? allPoints : locations;
    if (fitToLocations && locs?.length && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      const sampleSize = Math.min(locs.length, 500);
      const step = Math.max(1, Math.floor(locs.length / sampleSize));
      for (let i = 0; i < locs.length; i += step) {
        bounds.extend({ lat: locs[i].lat, lng: locs[i].lng });
      }
      mapInstance.fitBounds(bounds, 50);
      return;
    }

    mapInstance.setCenter(computedCenter);
    mapInstance.setZoom(defaultZoom);
  }, [locationsToRender, processedNeighbors, locations, fitToLocations, computedCenter, defaultZoom]);

  const handleMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
    applyAutoViewport(mapInstance);
    lastAutoFitSignatureRef.current = autoFitSignature;
    onLoadProp?.(mapInstance);
  }, [applyAutoViewport, autoFitSignature, onLoadProp]);

  useEffect(() => {
    if (!map) return;
    if (autoFitSignature === "empty") return;
    if (lastAutoFitSignatureRef.current === autoFitSignature) return;

    applyAutoViewport(map);
    lastAutoFitSignatureRef.current = autoFitSignature;
  }, [map, autoFitSignature, applyAutoViewport]);

  const handleMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const resolvedNeighborSquareSize = useMemo(() => {
    const base = Number(neighborSquareSize);
    const minSize = Number(neighborMinSquareSize);
    const safeBase = Number.isFinite(base) && base > 0 ? base : 8;
    const safeMin = Number.isFinite(minSize) && minSize > 0 ? minSize : 3;
    return Math.max(safeMin, Math.min(80, safeBase));
  }, [neighborSquareSize, neighborMinSquareSize]);

  const handlePrimaryClick = useCallback((index, loc) => {
    setSelectedLog(loc);
    setSelectedNeighbor(null);
    setSelectedImageLog(null);
    setSelectedImageLoadFailed(false);
    onMarkerClickRef.current?.(index, loc);
  }, []); 

  const handleNeighborClick = useCallback((neighbor) => {
    setSelectedNeighbor(neighbor);
    setSelectedLog(null);
    setSelectedImageLog(null);
    setSelectedImageLoadFailed(false);
    onNeighborClickRef.current?.(neighbor);
  }, []);

  const isMeasurementMode =
    Boolean(drawingEnabled) &&
    String(drawingShapeMode || "").toLowerCase() === "polyline";
  const showPoints =
    showPointsProp && ((!enableGrid && !areaEnabled) || isMeasurementMode);
  const showImageIcons = showPointsProp && locationsToRender.length > 0;

  const imageLogs = useMemo(() => {
    if (!showImageIcons || !locationsToRender?.length) return EMPTY_ARRAY;

    const step = Math.max(
      1,
      Math.ceil(locationsToRender.length / MAX_IMAGE_LOG_SCAN_POINTS),
    );
    const sampled = [];

    for (let i = 0; i < locationsToRender.length; i += step) {
      const log = locationsToRender[i];
      const rawImagePath = normalizeImagePath(log?.image_path);
      if (!rawImagePath) continue;
      sampled.push({
        ...log,
        rawImagePath,
        imageUrl: resolveImageUrl(rawImagePath),
      });
    }

    return sampled;
  }, [locationsToRender, showImageIcons]);

  const shouldRenderDeckOverlay =
    (showPoints && locationsToRender.length > 0) ||
    (showNeighbors && processedNeighbors.length > 0) ||
    (showImageIcons && imageLogs.length > 0);

  const handleImageLogClick = useCallback((log) => {
    setSelectedImageLog(log);
    setSelectedImageLoadFailed(false);
    setSelectedLog(null);
    setSelectedNeighbor(null);
  }, []);

  const getGridTooltipPosition = useCallback((event) => {
    const domEvent = event?.domEvent;
    const container = mapContainerRef.current;
    if (!domEvent || !container) return null;

    const rect = container.getBoundingClientRect();
    const rawX = domEvent.clientX - rect.left + 14;
    const rawY = domEvent.clientY - rect.top + 14;

    const maxX = Math.max(12, rect.width - 250);
    const maxY = Math.max(12, rect.height - 170);

    return {
      x: Math.min(Math.max(12, rawX), maxX),
      y: Math.min(Math.max(12, rawY), maxY),
    };
  }, []);

  const handleGridCellMouseOver = useCallback((cell, event) => {
    setHoveredCell(cell);
    setHoveredCellTooltipPos(getGridTooltipPosition(event));
  }, [getGridTooltipPosition]);

  const handleGridCellMouseMove = useCallback((cell, event) => {
    setHoveredCell(cell);
    setHoveredCellTooltipPos(getGridTooltipPosition(event));
  }, [getGridTooltipPosition]);

  const handleGridCellMouseOut = useCallback(() => {
    setHoveredCell(null);
    setHoveredCellTooltipPos(null);
  }, []);

  if (loadError) return <div className="flex items-center justify-center w-full h-full text-red-500">Failed to load Google Maps</div>;
  if (!isLoaded) return null;

  const isLoadingPolygons = enablePolygonFilter && projectId &&
    (hasExternalPolygonControl ? externalPolygonsLoading : !polygonsFetched);

  return (
    <div ref={mapContainerRef} className="relative w-full h-full">
      <GoogleMap
        mapContainerStyle={containerStyle}
        onLoad={handleMapLoad}
        onUnmount={handleMapUnmount}
        options={{ ...options, gestureHandling: 'greedy', disableDefaultUI: false }}
        defaultCenter={computedCenter}
        zoom={defaultZoom}
      >
        {showPolygonBoundary && activePolygonData.map(({ path }, idx) => (
          <PolygonF
            key={`polygon-${idx}`}
            paths={path}
            options={{ fillColor: "transparent", fillOpacity: 0, strokeColor: "#2563eb", strokeWeight: 1, strokeOpacity: resolvedPolygonOpacity, zIndex: 2500,clickable: false


             }}
            
          />
        ))}

        {areaEnabled && areaData.map((zone) => (
         <PolygonF
           key={zone.uid}
           paths={zone.paths}
           options={{ fillColor: "#3b82f6", fillOpacity: resolvedPolygonOpacity, strokeColor: "#2563eb", strokeOpacity: resolvedPolygonOpacity, strokeWeight: 1, zIndex: 5, clickable: false }}
         />
       ))}
       
        {enableGrid && gridCells.map((cell) => (
          <RectangleF
            key={`grid-${cell.id}`}
            bounds={cell.bounds}
            options={{ fillColor: cell.fillColor, fillOpacity: cell.count > 0 ? 0.7 : 0.2, strokeColor: "transparent", strokeWeight: 0, zIndex: 2, clickable: true }}
            onMouseOver={(event) => handleGridCellMouseOver(cell, event)}
            onMouseMove={(event) => handleGridCellMouseMove(cell, event)}
            onMouseOut={handleGridCellMouseOut}
          />
        ))}

        {map && shouldRenderDeckOverlay && (
          <DeckGLOverlay
            map={map}
            locations={showPoints ? locationsToRender : []}
            imageLogs={imageLogs}
            getColor={getPrimaryColor}
            radius={pointRadius}
            opacity={opacity}
            selectedIndex={activeMarkerIndex}
            onClick={handlePrimaryClick}
            radiusMinPixels={4}
            radiusMaxPixels={40}
            showPrimaryLogs={showPoints}
            showNumCells={showNumCells}
            onHover={handleHover}
            neighbors={processedNeighbors}
            getNeighborColor={getNeighborColor}
            neighborSquareSize={resolvedNeighborSquareSize}
            neighborOpacity={neighborOpacity}
            onNeighborClick={handleNeighborClick}
            onImageLogClick={handleImageLogClick}
            showImageLogs={showImageIcons}
            showNeighbors={showNeighbors}
            pickable={!disableDeckInteractions}
            autoHighlight={!disableDeckInteractions}
          />
        )}

        {selectedNeighbor && <NeighborInfoWindow neighbor={selectedNeighbor} onClose={() => setSelectedNeighbor(null)} resolveColor={resolveColor} selectedMetric={selectedMetric} />}
        {selectedLog && <PrimaryLogInfoWindow log={selectedLog} onClose={() => setSelectedLog(null)} resolveColor={resolveColor} selectedMetric={selectedMetric} />}
        {selectedImageLog && (
          <InfoWindow
            position={{ lat: selectedImageLog.lat, lng: selectedImageLog.lng }}
            onCloseClick={() => {
              setSelectedImageLog(null);
              setSelectedImageLoadFailed(false);
            }}
            options={{ pixelOffset: new window.google.maps.Size(0, -18), maxWidth: 380 }}
          >
            <div className="p-2 min-w-[280px] font-sans text-gray-800">
              <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-200">
                <span className="text-base leading-none">📷</span>
                <span className="font-bold text-sm">Log Image</span>
              </div>

              {selectedImageLog.imageUrl && !selectedImageLoadFailed ? (
                <img
                  src={selectedImageLog.imageUrl}
                  alt="Log capture"
                  className="w-full max-h-64 object-contain rounded border border-gray-200 bg-gray-50"
                  loading="lazy"
                  onError={() => setSelectedImageLoadFailed(true)}
                />
              ) : (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Unable to load image preview for this log.
                </div>
              )}

              <div className="mt-2 space-y-1 text-xs">
                {selectedImageLog.timestamp && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Timestamp</span>
                    <span className="font-medium">{selectedImageLog.timestamp}</span>
                  </div>
                )}
                {selectedImageLog.apps && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">App</span>
                    <span className="font-medium">{selectedImageLog.apps}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Coordinates</span>
                  <span className="font-mono">{selectedImageLog.lat?.toFixed?.(6)}, {selectedImageLog.lng?.toFixed?.(6)}</span>
                </div>
              </div>

              {selectedImageLog.imageUrl && (
                <div className="mt-3">
                  <a
                    href={selectedImageLog.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 underline"
                  >
                    Open image in new tab
                  </a>
                </div>
              )}

              {selectedImageLog.rawImagePath && !selectedImageLog.imageUrl && (
                <div className="mt-2 text-[11px] text-gray-500 break-all">
                  Path: {selectedImageLog.rawImagePath}
                </div>
              )}
            </div>
          </InfoWindow>
        )}

        

        {children}
      </GoogleMap>

      {(isLoadingPolygons || thresholdsLoading) && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-20 text-sm">
          <span className="animate-pulse">{thresholdsLoading ? 'Loading color thresholds...' : 'Loading polygon boundaries...'}</span>
        </div>
      )}

      {enableGrid && hoveredCell && (
        <div
          className="absolute bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-20 min-w-[190px] text-xs pointer-events-none"
          style={{
            left: `${hoveredCellTooltipPos?.x ?? 16}px`,
            top: `${hoveredCellTooltipPos?.y ?? 16}px`,
          }}
        >
          <div className="font-semibold text-gray-800 mb-2">Grid Cell</div>
          <div className="space-y-1">
            <div className="flex justify-between text-blue-600"><span>Logs:</span><span className="font-bold">{hoveredCell.count}</span></div>
            {hoveredCell.aggregatedValue !== null && (<div className="flex justify-between text-gray-600"><span>{gridAggregationMethod.charAt(0).toUpperCase() + gridAggregationMethod.slice(1)} {selectedMetric.toUpperCase()}:</span><span className="font-medium">{hoveredCell.aggregatedValue.toFixed(1)}</span></div>)}
            {hoveredCell.bestByColor && (
              <div className="flex justify-between text-gray-700 gap-2">
                <span>Best {hoveredCell.bestByColor.label}:</span>
                <span className="font-medium text-right">
                  {hoveredCell.bestByColor.name} ({hoveredCell.bestByColor.average?.toFixed?.(1)})
                </span>
              </div>
            )}
            {!hoveredCell.bestByColor && hoveredCell.bestOperator && (
              <div className="flex justify-between text-gray-700 gap-2">
                <span>Best Operator:</span>
                <span className="font-medium text-right">
                  {hoveredCell.bestOperator.name} ({hoveredCell.bestOperator.average?.toFixed?.(1)})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      

      
    </div>
  );
};

export default React.memo(MapWithMultipleCircles);
