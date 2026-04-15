import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { IconLayer, PolygonLayer } from "@deck.gl/layers";
import {
  normalizeBandName,
  normalizeProviderName,
  normalizeTechName,
} from "@/utils/colorUtils";

const FALLBACK_COLORS = [
  { min: 0.8, color: "#16a34a" },
  { min: 0.6, color: "#65a30d" },
  { min: 0.4, color: "#ca8a04" },
  { min: 0.2, color: "#ea580c" },
  { min: 0.0, color: "#dc2626" },
];
const METRIC_RANGE_EPSILON = 1e-9;

const AGGREGATION_METHODS = {
  median: (values) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  mean: (values) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },
  avg: (values) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },
  min: (values) => (Array.isArray(values) && values.length ? Math.min(...values) : null),
  max: (values) => (Array.isArray(values) && values.length ? Math.max(...values) : null),
};

const normalizeDeltaVariant = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "baseline") return "baseline";
  if (normalized === "optimized" || normalized === "optimised") return "optimized";
  return "";
};

const toRgbaArray = (hexOrCss, alpha = 220) => {
  if (!hexOrCss || typeof hexOrCss !== "string") return [107, 114, 128, alpha];
  const hex = hexOrCss.trim().replace("#", "");
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      alpha,
    ];
  }
  return [107, 114, 128, alpha];
};

const getThresholdKey = (metric) => {
  if (metric === "dl_tpt" || metric === "dl_rpt") return "dl_thpt";
  if (metric === "ul_tpt" || metric === "ul_rpt") return "ul_thpt";
  return metric;
};

const getColorFromThresholds = (value, selectedMetric, thresholds) => {
  const ranges = thresholds?.[getThresholdKey(selectedMetric)];
  if (!Array.isArray(ranges) || ranges.length === 0 || value == null || Number.isNaN(value)) {
    return null;
  }

  const sorted = [...ranges].sort((a, b) => Number(a.min) - Number(b.min));
  for (const range of sorted) {
    const min = Number(range.min);
    const max = Number(range.max);
    if (Number.isFinite(min) && Number.isFinite(max) && value >= min && value <= max) {
      return range.color || null;
    }
  }
  return null;
};

const getFallbackColor = (value, selectedMetric) => {
  if (value == null || Number.isNaN(value)) return "#6b7280";
  const metric = String(selectedMetric || "rsrp").toLowerCase();

  let min = -140;
  let max = -44;
  if (metric === "rsrq") {
    min = -20;
    max = -3;
  } else if (metric === "sinr") {
    min = -10;
    max = 30;
  }

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  for (const step of FALLBACK_COLORS) {
    if (normalized >= step.min) return step.color;
  }
  return "#dc2626";
};

const getCoordValue = (coord, fallbackCoord, keyA, keyB, keyC) => {
  const direct = coord?.[keyA] ?? coord?.[keyB] ?? coord?.[keyC];
  const fallback = fallbackCoord?.[keyA] ?? fallbackCoord?.[keyB] ?? fallbackCoord?.[keyC];
  const value = direct ?? fallback;
  if (typeof value === "function") {
    const fnVal = value();
    const num = Number(fnVal);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePathPoint = (p) => {
  if (!p) return null;
  const lat = getCoordValue(p, p, "lat", "Lat", "latitude");
  const lng = getCoordValue(p, p, "lng", "Lng", "lon") ?? getCoordValue(p, p, "longitude", "Lon", "LONGITUDE");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const normalizePath = (poly) => {
  const rawPath = Array.isArray(poly?.paths?.[0])
    ? poly.paths[0]
    : Array.isArray(poly?.paths)
      ? poly.paths
      : Array.isArray(poly?.path)
        ? poly.path
        : [];
  if (!Array.isArray(rawPath) || rawPath.length === 0) return [];
  return rawPath.map((p) => normalizePathPoint(p)).filter(Boolean);
};

const getMetricValueFromPoint = (point, metric) => {
  const m = String(metric || "").toLowerCase();
  const aliases = {
    dl_thpt: ["dl_thpt", "dl_tpt", "dl_rpt", "dl_throughput", "throughput_dl", "download"],
    ul_thpt: ["ul_thpt", "ul_tpt", "ul_rpt", "ul_throughput", "throughput_ul", "upload"],
  };
  const keys = aliases[m] || [m];
  for (const key of keys) {
    const raw = point?.[key];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  if (m === String(point?.selectedMetric || "").toLowerCase()) {
    const value = Number(point?.value);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const getLegendCategoryValue = (point, key) => {
  if (key === "provider") {
    return normalizeProviderName(
      point?.provider ?? point?.Provider ?? point?.network ?? point?.Network ?? "",
    ) || "Unknown";
  }

  if (key === "technology") {
    return normalizeTechName(
      point?.technology ?? point?.networkType ?? point?.network ?? "",
      point?.band,
    );
  }

  if (key === "band") {
    return normalizeBandName(
      point?.band ?? point?.Band ?? point?.neighbourBand ?? point?.neighborBand ?? "",
    );
  }

  return "Unknown";
};

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

const matchesLegendFilter = (point, legendFilter, selectedMetric) => {
  if (!legendFilter) return true;

  if (legendFilter.type === "metric") {
    const metric = legendFilter.metric || selectedMetric;
    const value = getMetricValueFromPoint(point, metric);
    return Number.isFinite(value) && matchesLegendMetricRange(value, legendFilter);
  }

  if (legendFilter.type === "category") {
    const current = getLegendCategoryValue(point, legendFilter.key);
    return String(current) === String(legendFilter.value);
  }

  if (legendFilter.type === "pci") {
    const pci = Number(point?.pci ?? point?.PCI ?? point?.cell_id);
    return Number.isFinite(pci) && Math.floor(pci) === Number(legendFilter.value);
  }

  if (legendFilter.type === "tac") {
    const tac = point?.tac ?? point?.TAC;
    return String(tac ?? "") === String(legendFilter.value ?? "");
  }

  return true;
};

const getPathBounds = (path) => {
  if (!Array.isArray(path) || path.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const point of path) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    north = Math.max(north, lat);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    west = Math.min(west, lng);
  }
  if (![north, south, east, west].every(Number.isFinite)) return null;
  return { north, south, east, west };
};

const mergeBounds = (boundsList = []) => {
  if (!Array.isArray(boundsList) || boundsList.length === 0) return null;
  let merged = null;
  for (const bounds of boundsList) {
    if (!bounds) continue;
    if (!merged) {
      merged = { ...bounds };
      continue;
    }
    merged.north = Math.max(merged.north, bounds.north);
    merged.south = Math.min(merged.south, bounds.south);
    merged.east = Math.max(merged.east, bounds.east);
    merged.west = Math.min(merged.west, bounds.west);
  }
  return merged;
};

const getBoundsFromPoints = (points = []) => {
  if (!Array.isArray(points) || points.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const point of points) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    north = Math.max(north, lat);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    west = Math.min(west, lng);
  }
  if (![north, south, east, west].every(Number.isFinite)) return null;
  return { north, south, east, west };
};

const isPointInPolygon = (point, path) => {
  if (!Array.isArray(path) || path.length < 3) return false;
  const lat = point.lat;
  const lng = point.lng;
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].lng;
    const yi = path[i].lat;
    const xj = path[j].lng;
    const yj = path[j].lat;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const makeSquareAtlas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL("image/png");
};

const LtePredictionLocationLayer = ({
  enabled = false,
  map = null,
  locations = [],
  selectedMetric = "rsrp",
  thresholds = {},
  getMetricColor = null,
  filterPolygons = [],
  filterInsidePolygons = true,
  maxPoints = 20000,
  enableGrid = false,
  gridSizeMeters = 50,
  gridAggregationMethod = "median",
  deltaComparisonMode = false,
  externalGridCells = [],
  aggregateOverlaps = false,
  mlGridEnabled = false,
  mlGridSize = 50,
  mlGridAggregation = "mean",
  legendFilter = null,
}) => {
  const overlayRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(13);
  const [hovered, setHovered] = useState(null);

  const squareAtlas = useMemo(() => makeSquareAtlas(), []);
  const squareIconMapping = useMemo(
    () => ({
      square: { x: 0, y: 0, width: 64, height: 64, mask: true },
    }),
    [],
  );

  const polygonPaths = useMemo(() => {
    if (!Array.isArray(filterPolygons) || filterPolygons.length === 0) return [];
    return filterPolygons
      .map(normalizePath)
      .filter((path) => Array.isArray(path) && path.length >= 3);
  }, [filterPolygons]);

  const parsedPoints = useMemo(() => {
    if (!enabled || !Array.isArray(locations) || locations.length === 0) return [];

    return locations
      .map((p) => {
        const lat = Number(p.lat ?? p.latitude);
        const lng = Number(p.lng ?? p.lon ?? p.longitude);
        const value = Number(p.value);
        const sampleCount = Number(p.sampleCount ?? 0);
        const siteId = String(p.siteId ?? p.site_id ?? "").trim();
        const deltaVariant = normalizeDeltaVariant(p.deltaVariant ?? p.delta_variant);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          ...p,
          lat,
          lng,
          value: Number.isFinite(value) ? value : null,
          sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0,
          siteId,
          deltaVariant: deltaVariant || null,
          selectedMetric,
        };
      })
      .filter(Boolean);
  }, [enabled, locations, selectedMetric]);

  const filteredPoints = useMemo(() => {
    if (!Array.isArray(parsedPoints) || parsedPoints.length === 0) return [];

    let points = parsedPoints.filter((point) =>
      matchesLegendFilter(point, legendFilter, selectedMetric),
    );

    if (mlGridEnabled || aggregateOverlaps) {
      const grouped = new Map();
      const safeMlGridSize = Math.max(5, Number(mlGridSize) || 50);
      const metersPerDegLat = 111320;

      for (const point of points) {
        let key;
        let polygon = null;
        let cellLat = point.lat;
        let cellLng = point.lng;

        if (mlGridEnabled) {
          const stepLat = safeMlGridSize / metersPerDegLat;
          const cosLat = Math.max(Math.abs(Math.cos((point.lat * Math.PI) / 180)), 1e-6);
          const stepLng = safeMlGridSize / (metersPerDegLat * cosLat);
          const row = Math.floor(point.lat / stepLat);
          const col = Math.floor(point.lng / stepLng);
          key = `grid-${row},${col}`;

          const south = row * stepLat;
          const west = col * stepLng;
          const north = south + stepLat;
          const east = west + stepLng;
          polygon = [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
          ];
          cellLat = (south + north) * 0.5;
          cellLng = (west + east) * 0.5;
        } else {
          key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
        }

        if (!grouped.has(key)) {
          grouped.set(key, { points: [], polygon, cellLat, cellLng });
        }
        grouped.get(key).points.push(point);
      }

      points = Array.from(grouped.values()).map((cell) => {
        if (cell.points.length === 1 && !mlGridEnabled) return cell.points[0];

        const values = cell.points
          .map((p) => p.value)
          .filter((v) => Number.isFinite(v));
        const sampleCount = cell.points.reduce(
          (sum, p) => sum + (Number.isFinite(p.sampleCount) ? p.sampleCount : 0),
          0,
        );
        const aggregatedSites = [
          ...new Set(cell.points.map((p) => p.siteId).filter(Boolean)),
        ];

        if (values.length === 0) {
          return {
            ...cell.points[0],
            lat: cell.cellLat,
            lng: cell.cellLng,
            isAggregated: true,
            isGridCell: mlGridEnabled,
            overlapCount: cell.points.length,
            aggregatedSites,
            polygon: cell.polygon,
            sampleCount,
          };
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median =
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];

        const counts = new Map();
        let mode = values[0];
        let maxCount = 0;
        for (const v of values) {
          const count = (counts.get(v) || 0) + 1;
          counts.set(v, count);
          if (count > maxCount) {
            maxCount = count;
            mode = v;
          }
        }

        let aggValue = mean;
        if (mlGridEnabled) {
          if (mlGridAggregation === "median") aggValue = median;
          if (mlGridAggregation === "mode") aggValue = mode;
        }

        return {
          ...cell.points[0],
          lat: cell.cellLat,
          lng: cell.cellLng,
          value: aggValue,
          mean,
          median,
          mode,
          isAggregated: true,
          isGridCell: mlGridEnabled,
          overlapCount: cell.points.length,
          aggregatedSites,
          polygon: cell.polygon,
          sampleCount,
        };
      });
    }

    if (filterInsidePolygons && polygonPaths.length > 0) {
      points = points.filter((point) => polygonPaths.some((path) => isPointInPolygon(point, path)));
    }

    return points;
  }, [
    parsedPoints,
    legendFilter,
    selectedMetric,
    filterInsidePolygons,
    polygonPaths,
    aggregateOverlaps,
    mlGridEnabled,
    mlGridSize,
    mlGridAggregation,
  ]);

  const sampledPoints = useMemo(() => {
    if (!Array.isArray(filteredPoints) || filteredPoints.length === 0) return [];
    if (filteredPoints.length <= maxPoints) return filteredPoints;
    const step = Math.ceil(filteredPoints.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < filteredPoints.length; i += step) sampled.push(filteredPoints[i]);
    return sampled;
  }, [filteredPoints, maxPoints]);

  const resolveMetricColor = useCallback(
    (value) => {
      const thresholdColor = getColorFromThresholds(value, selectedMetric, thresholds);
      if (thresholdColor) return thresholdColor;

      const hookColor =
        typeof getMetricColor === "function"
          ? getMetricColor(value, selectedMetric)
          : null;
      if (hookColor && hookColor !== "#808080") return hookColor;
      return getFallbackColor(value, selectedMetric);
    },
    [getMetricColor, selectedMetric, thresholds],
  );

  const pointLayerData = useMemo(() => {
    return sampledPoints.map((point) => {
      const colorHex = resolveMetricColor(point.value);

      return {
        kind: "point",
        ...point,
        position: [point.lng, point.lat],
        polygon: point.polygon,
        color: toRgbaArray(colorHex, mlGridEnabled ? 180 : 220),
        size: Math.max(1, Math.log2((point.sampleCount || 1) + 1)),
      };
    });
  }, [sampledPoints, resolveMetricColor]);

  const gridLayerData = useMemo(() => {
    if (
      enabled &&
      enableGrid &&
      Array.isArray(externalGridCells) &&
      externalGridCells.length > 0
    ) {
      return externalGridCells
        .map((cell, index) => ({
          kind: "grid",
          id: cell?.id || `external-grid-${index}`,
          polygon: Array.isArray(cell?.polygon) ? cell.polygon : null,
          value: Number.isFinite(Number(cell?.value)) ? Number(cell.value) : null,
          pointCount: Number(cell?.pointCount || 0),
          sampleCount: Number(cell?.sampleCount || 0),
          deltaCompare: Boolean(cell?.deltaCompare),
          baselineAvg: Number.isFinite(Number(cell?.baselineAvg))
            ? Number(cell.baselineAvg)
            : null,
          optimizedAvg: Number.isFinite(Number(cell?.optimizedAvg))
            ? Number(cell.optimizedAvg)
            : null,
          difference: Number.isFinite(Number(cell?.difference))
            ? Number(cell.difference)
            : null,
          baselinePointCount: Number(cell?.baselinePointCount || 0),
          optimizedPointCount: Number(cell?.optimizedPointCount || 0),
          baselineSampleCount: Number(cell?.baselineSampleCount || 0),
          optimizedSampleCount: Number(cell?.optimizedSampleCount || 0),
          lat: Number(cell?.lat),
          lng: Number(cell?.lng),
          color: Array.isArray(cell?.color) ? cell.color : [107, 114, 128, 190],
        }))
        .filter((cell) => Array.isArray(cell.polygon) && cell.polygon.length >= 3)
        .filter((cell) => {
          if (!filterInsidePolygons || polygonPaths.length === 0) return true;
          if (!Number.isFinite(cell.lat) || !Number.isFinite(cell.lng)) return false;
          return polygonPaths.some((path) => isPointInPolygon(cell, path));
        });
    }

    if (!enabled || !enableGrid || !Array.isArray(filteredPoints) || filteredPoints.length === 0) {
      return [];
    }

    const safeGridSizeMeters = Math.max(5, Number(gridSizeMeters) || 50);
    const polygonBounds = polygonPaths.map((path) => getPathBounds(path)).filter(Boolean);
    const pointBounds = getBoundsFromPoints(filteredPoints);
    const globalBounds = polygonBounds.length > 0 ? mergeBounds(polygonBounds) : pointBounds;
    if (!globalBounds) return [];

    const avgLat = (globalBounds.north + globalBounds.south) * 0.5;
    const latDegPerMeter = 1 / 111320;
    const cosLat = Math.cos((avgLat * Math.PI) / 180);
    const lngDegPerMeter = 1 / (111320 * Math.max(Math.abs(cosLat), 1e-6));

    const cellHeight = safeGridSizeMeters * latDegPerMeter;
    const cellWidth = safeGridSizeMeters * lngDegPerMeter;
    if (!Number.isFinite(cellHeight) || !Number.isFinite(cellWidth) || cellHeight <= 0 || cellWidth <= 0) {
      return [];
    }

    const aggregateFn =
      AGGREGATION_METHODS[gridAggregationMethod] || AGGREGATION_METHODS.median;

    const cellBuckets = new Map();
    for (const point of filteredPoints) {
      const row = Math.floor((point.lat - globalBounds.south) / cellHeight);
      const col = Math.floor((point.lng - globalBounds.west) / cellWidth);
      if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

      const key = `${row}|${col}`;
      let bucket = cellBuckets.get(key);
      if (!bucket) {
        bucket = {
          row,
          col,
          values: [],
          pointCount: 0,
          sampleCount: 0,
          baselineValues: [],
          optimizedValues: [],
          baselinePointCount: 0,
          optimizedPointCount: 0,
          baselineSampleCount: 0,
          optimizedSampleCount: 0,
        };
        cellBuckets.set(key, bucket);
      }

      bucket.pointCount += 1;
      bucket.sampleCount += Number.isFinite(point.sampleCount) ? point.sampleCount : 0;
      const variant = normalizeDeltaVariant(point?.deltaVariant ?? point?.delta_variant);
      if (variant === "baseline") {
        bucket.baselinePointCount += 1;
        bucket.baselineSampleCount += Number.isFinite(point.sampleCount) ? point.sampleCount : 0;
      } else if (variant === "optimized") {
        bucket.optimizedPointCount += 1;
        bucket.optimizedSampleCount += Number.isFinite(point.sampleCount) ? point.sampleCount : 0;
      }
      if (Number.isFinite(point.value)) {
        bucket.values.push(point.value);
        if (variant === "baseline") bucket.baselineValues.push(point.value);
        if (variant === "optimized") bucket.optimizedValues.push(point.value);
      }
    }

    const cells = [];
    cellBuckets.forEach((bucket) => {
      const south = globalBounds.south + bucket.row * cellHeight;
      const north = south + cellHeight;
      const west = globalBounds.west + bucket.col * cellWidth;
      const east = west + cellWidth;
      const center = { lat: (south + north) * 0.5, lng: (west + east) * 0.5 };

      if (
        polygonPaths.length > 0 &&
        !polygonPaths.some((path) => isPointInPolygon(center, path))
      ) {
        return;
      }

      let aggregatedValue = aggregateFn(bucket.values);
      let colorHex = Number.isFinite(aggregatedValue)
        ? resolveMetricColor(aggregatedValue)
        : "#6b7280";
      let baselineAvg = null;
      let optimizedAvg = null;
      let difference = null;
      const isDeltaCompareCell = Boolean(deltaComparisonMode);

      if (isDeltaCompareCell) {
        baselineAvg = aggregateFn(bucket.baselineValues);
        optimizedAvg = aggregateFn(bucket.optimizedValues);
        const hasBaseline = Number.isFinite(baselineAvg);
        const hasOptimized = Number.isFinite(optimizedAvg);

        if (hasBaseline && hasOptimized) {
          difference = optimizedAvg - baselineAvg;
          aggregatedValue = difference;
          if (difference > 0) colorHex = "#16a34a";
          else if (difference < 0) colorHex = "#dc2626";
          else colorHex = "#6b7280";
        } else if (hasOptimized) {
          aggregatedValue = optimizedAvg;
          colorHex = "#16a34a";
        } else if (hasBaseline) {
          aggregatedValue = baselineAvg;
          colorHex = "#dc2626";
        } else {
          aggregatedValue = null;
          colorHex = "#6b7280";
        }
      }

      cells.push({
        kind: "grid",
        id: `${bucket.row}-${bucket.col}`,
        polygon: [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
        ],
        value: Number.isFinite(aggregatedValue) ? aggregatedValue : null,
        pointCount: bucket.pointCount,
        sampleCount: bucket.sampleCount,
        deltaCompare: isDeltaCompareCell,
        baselineAvg: Number.isFinite(baselineAvg) ? baselineAvg : null,
        optimizedAvg: Number.isFinite(optimizedAvg) ? optimizedAvg : null,
        difference: Number.isFinite(difference) ? difference : null,
        baselinePointCount: bucket.baselinePointCount,
        optimizedPointCount: bucket.optimizedPointCount,
        baselineSampleCount: bucket.baselineSampleCount,
        optimizedSampleCount: bucket.optimizedSampleCount,
        lat: center.lat,
        lng: center.lng,
        color: toRgbaArray(colorHex, 190),
      });
    });

    return cells;
  }, [
    enabled,
    enableGrid,
    filteredPoints,
    filterInsidePolygons,
    gridSizeMeters,
    gridAggregationMethod,
    polygonPaths,
    selectedMetric,
    thresholds,
    getMetricColor,
    resolveMetricColor,
    deltaComparisonMode,
    externalGridCells,
  ]);

  const isGridMode = enableGrid && gridLayerData.length > 0;

  const sizeScale = useMemo(() => {
    return Math.max(8, Math.min(28, zoomLevel * 1.6));
  }, [zoomLevel]);

  const validMap = useMemo(() => {
    return map && typeof map.getDiv === "function" && Boolean(map.getDiv());
  }, [map]);

  useEffect(() => {
    if (!enabled || !validMap) return;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        interleaved: true,
        glOptions: { preserveDrawingBuffer: false },
      });
    }

    // Guard against cases where map exists but is mid-teardown (deck.gl google-maps overlay can call addListener on null)
    try {
      overlayRef.current.setMap(map);
    } catch (e) {
      // If map is not ready, avoid throwing and let next render attach again
      return;
    }

    // Only set zoom if it actually changed to avoid update loops
    const nextZoom = map.getZoom?.() ?? 13;
    setZoomLevel((prev) => (prev === nextZoom ? prev : nextZoom));

    const listener =
      typeof map.addListener === "function"
        ? map.addListener("zoom_changed", () => {
            const z = map.getZoom?.() ?? 13;
            setZoomLevel((prev) => (prev === z ? prev : z));
          })
        : null;

    return () => {
      if (listener && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(listener);
      }
      if (overlayRef.current) {
        try {
          overlayRef.current.setProps({ layers: [] });
          overlayRef.current.setMap(null);
        } catch (e) {
          // ignore detach errors
        }
      }
    };
  }, [enabled, validMap, map]);

  const handleHover = useCallback((info) => {
    if (!info?.object) {
      setHovered(null);
      return;
    }
    setHovered({
      x: info.x,
      y: info.y,
      object: info.object,
    });
  }, []);

  useEffect(() => {
    if (!enabled || !overlayRef.current || !validMap) return;

    const layers = [];

    if (isGridMode) {
      layers.push(
        new PolygonLayer({
          id: "lte-prediction-grid-layer",
          data: gridLayerData,
          pickable: true,
          autoHighlight: true,
          filled: true,
          stroked: false,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          onHover: handleHover,
            updateTriggers: {
              getFillColor: [selectedMetric, thresholds, gridAggregationMethod, deltaComparisonMode],
            },
          }),
      );
    } else if (mlGridEnabled) {
      const mlGridData = pointLayerData.filter(
        (d) => Array.isArray(d.polygon) && d.polygon.length >= 3,
      );
      if (mlGridData.length > 0) {
        layers.push(
          new PolygonLayer({
            id: "lte-prediction-ml-grid-layer",
            data: mlGridData,
            pickable: true,
            stroked: false,
            filled: true,
            extruded: false,
            getPolygon: (d) => d.polygon,
            getFillColor: (d) => d.color,
            onHover: handleHover,
            updateTriggers: {
              getFillColor: [selectedMetric, thresholds, mlGridAggregation],
            },
          }),
        );
      }
    }

    if (!isGridMode && (!mlGridEnabled || layers.length === 0) && squareAtlas) {
      layers.push(
        new IconLayer({
            id: "lte-prediction-square-layer",
            data: pointLayerData,
            pickable: true,
            autoHighlight: true,
            getPosition: (d) => d.position,
            iconAtlas: squareAtlas,
            iconMapping: squareIconMapping,
            getIcon: () => "square",
            sizeUnits: "pixels",
            sizeScale,
            sizeMinPixels: 3,
            sizeMaxPixels: 42,
            getSize: (d) => d.size,
            getColor: (d) => d.color,
            onHover: handleHover,
            updateTriggers: {
              getColor: [selectedMetric, thresholds],
              getSize: [zoomLevel],
            },
          }),
      );
    }

    overlayRef.current.setProps({ layers });
  }, [
    enabled,
    validMap,
    isGridMode,
    gridLayerData,
    pointLayerData,
    selectedMetric,
    thresholds,
    gridAggregationMethod,
    deltaComparisonMode,
    mlGridEnabled,
    mlGridAggregation,
    sizeScale,
    zoomLevel,
    squareAtlas,
    squareIconMapping,
    handleHover,
  ]);

  useEffect(() => {
    return () => {
      if (!overlayRef.current) return;
      overlayRef.current.setProps({ layers: [] });
      overlayRef.current.setMap(null);
      overlayRef.current.finalize();
      overlayRef.current = null;
    };
  }, []);

  if (!enabled) return null;

  const isHoveredGrid = hovered?.object?.kind === "grid";
  const isHoveredMlGrid = Boolean(hovered?.object?.isGridCell);
  const hoveredMetricLabel = String(selectedMetric || "rsrp").toUpperCase();
  const hoveredValue = Number.isFinite(hovered?.object?.value)
    ? hovered.object.value.toFixed(2)
    : "N/A";

  return hovered?.object ? (
    <div
      className="pointer-events-none absolute z-[1200] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-lg"
      style={{
        left: `${(hovered.x || 0) + 12}px`,
        top: `${(hovered.y || 0) + 12}px`,
      }}
    >
      <div className="font-semibold">
        {isHoveredGrid || isHoveredMlGrid ? "LTE Prediction Grid" : "LTE Prediction"}
      </div>
      <div>Metric: {hoveredMetricLabel}</div>

      {isHoveredGrid ? (
        hovered.object.deltaCompare ? (
          <>
            <div>Baseline Avg: {Number.isFinite(hovered.object.baselineAvg) ? hovered.object.baselineAvg.toFixed(2) : "N/A"}</div>
            <div>Optimized Avg: {Number.isFinite(hovered.object.optimizedAvg) ? hovered.object.optimizedAvg.toFixed(2) : "N/A"}</div>
            <div className={Number(hovered.object.difference) >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
              Difference (Opt - Base): {Number.isFinite(hovered.object.difference) ? hovered.object.difference.toFixed(2) : "N/A"}
            </div>
            <div className="text-[10px] text-slate-600">
              Points B/O: {hovered.object.baselinePointCount ?? 0}/{hovered.object.optimizedPointCount ?? 0}
            </div>
            <div className="text-[10px] text-slate-600">
              Samples B/O: {hovered.object.baselineSampleCount ?? 0}/{hovered.object.optimizedSampleCount ?? 0}
            </div>
          </>
        ) : (
          <>
            <div>Value: {hoveredValue}</div>
            <div>Grid Points: {hovered.object.pointCount ?? 0}</div>
            <div>Samples: {hovered.object.sampleCount ?? 0}</div>
          </>
        )
      ) : isHoveredMlGrid ? (
        <>
          <div className="mt-1 font-semibold text-[11px] text-blue-600 border-b pb-0.5 mb-0.5">
            Cell ({hovered.object.overlapCount ?? 0} samples)
          </div>
          <div>Aggregated ({mlGridAggregation}): {hoveredValue}</div>
          <div className="text-[10px] text-slate-500">
            Mean: {Number.isFinite(hovered.object.mean) ? hovered.object.mean.toFixed(2) : "N/A"} | Median: {Number.isFinite(hovered.object.median) ? hovered.object.median.toFixed(2) : "N/A"}
          </div>
        </>
      ) : hovered.object.isAggregated ? (
        <>
          <div className="mt-1 font-semibold text-[11px] text-blue-600 border-b pb-0.5 mb-0.5">
            Aggregated ({hovered.object.overlapCount ?? 0} overlaps)
          </div>
          <div>Mean: {Number.isFinite(hovered.object.mean) ? hovered.object.mean.toFixed(2) : "N/A"}</div>
          <div>Median: {Number.isFinite(hovered.object.median) ? hovered.object.median.toFixed(2) : "N/A"}</div>
          <div>Mode: {Number.isFinite(hovered.object.mode) ? hovered.object.mode.toFixed(2) : "N/A"}</div>
          <div
            className="text-[10px] italic text-slate-500 max-w-[150px] truncate"
            title={hovered.object.aggregatedSites?.join(", ")}
          >
            Sites: {hovered.object.aggregatedSites?.join(", ") || "N/A"}
          </div>
        </>
      ) : (
        <>
          <div>Value: {hoveredValue}</div>
          <div>Samples: {hovered.object.sampleCount ?? 0}</div>
          <div>Site ID: {hovered.object.siteId || "N/A"}</div>
        </>
      )}

      {!isHoveredGrid && (
        <div>Site ID: {hovered.object.siteId || "N/A"}</div>
      )}
      <div className="text-[10px] text-slate-500 mt-1">
        {hovered.object.lat?.toFixed?.(6)}, {hovered.object.lng?.toFixed?.(6)}
      </div>
    </div>
  ) : null;
};

export default React.memo(LtePredictionLocationLayer);
