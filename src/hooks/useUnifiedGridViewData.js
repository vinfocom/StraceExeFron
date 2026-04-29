import { useMemo } from "react";
import { getMetricValueFromLog } from "@/utils/metrics";
import {
  normalizeBandName,
  normalizeProviderName,
  normalizeTechName,
} from "@/utils/colorUtils";

const EMPTY_ARRAY = Object.freeze([]);
const METRICS_TO_AGGREGATE = [
  "rsrp",
  "rsrq",
  "sinr",
  "dl_thpt",
  "ul_thpt",
  "mos",
  "jitter",
  "latency",
  "packet_loss",
  "num_cells",
  "level",
];
const CATEGORY_GRID_METRICS = new Set([
  "best_operator",
  "best_technology",
  "best_pci",
]);

const toFiniteNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.length > 0 ? total / values.length : null;
};

const median = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const min = (values = []) =>
  Array.isArray(values) && values.length > 0 ? Math.min(...values) : null;

const max = (values = []) =>
  Array.isArray(values) && values.length > 0 ? Math.max(...values) : null;

const getAggregateValue = (values = [], method = "median") => {
  const normalizedMethod = String(method || "median").trim().toLowerCase();
  if (!Array.isArray(values) || values.length === 0) return null;
  if (normalizedMethod === "avg" || normalizedMethod === "mean") {
    return mean(values);
  }
  if (normalizedMethod === "min") return min(values);
  if (normalizedMethod === "max") return max(values);
  return median(values);
};

const pickTopCategory = (counter) => {
  if (!(counter instanceof Map) || counter.size === 0) return "Unknown";
  let winner = "Unknown";
  let count = -1;
  counter.forEach((value, key) => {
    if (value > count) {
      count = value;
      winner = key;
    }
  });
  return winner;
};

const incrementCounter = (counter, rawValue, normalizer = (value) => value) => {
  const normalized = String(normalizer(rawValue) || "").trim();
  const key = normalized || "Unknown";
  counter.set(key, (counter.get(key) || 0) + 1);
};

const getTopCount = (counter) => {
  if (!(counter instanceof Map) || counter.size === 0) return 0;
  let best = 0;
  counter.forEach((value) => {
    if (value > best) best = value;
  });
  return best;
};

const buildGridBounds = (locations = []) => {
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const loc of locations) {
    const lat = Number(loc?.lat ?? loc?.latitude);
    const lng = Number(loc?.lng ?? loc?.lon ?? loc?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  }

  if (![north, south, east, west].every(Number.isFinite)) return null;

  // Ensure a tiny non-zero extent for very tight selections.
  if (north === south) {
    north += 0.00005;
    south -= 0.00005;
  }
  if (east === west) {
    east += 0.00005;
    west -= 0.00005;
  }

  return { north, south, east, west };
};

export const useUnifiedGridViewData = ({
  enabled = false,
  locations = EMPTY_ARRAY,
  selectedMetric = "rsrp",
  gridSizeMeters = 20,
  aggregationMethod = "median",
}) => {
  return useMemo(() => {
    if (!enabled || !Array.isArray(locations) || locations.length === 0) {
      return {
        gridLocations: EMPTY_ARRAY,
        summary: {
          totalCells: 0,
          populatedCells: 0,
          totalSamples: 0,
          averageSamplesPerCell: 0,
          selectedMetricAverage: null,
          selectedMetricStats: {
            avg: null,
            median: null,
            min: null,
            max: null,
          },
          selectedMetricKey: String(selectedMetric || "rsrp").trim().toLowerCase(),
        },
      };
    }

    const bounds = buildGridBounds(locations);
    if (!bounds) {
      return {
        gridLocations: EMPTY_ARRAY,
        summary: {
          totalCells: 0,
          populatedCells: 0,
          totalSamples: 0,
          averageSamplesPerCell: 0,
          selectedMetricAverage: null,
          selectedMetricStats: {
            avg: null,
            median: null,
            min: null,
            max: null,
          },
          selectedMetricKey: String(selectedMetric || "rsrp").trim().toLowerCase(),
        },
      };
    }

    const avgLat = (bounds.north + bounds.south) * 0.5;
    const latDegPerMeter = 1 / 111320;
    const lngDegPerMeter = 1 / (111320 * Math.cos((avgLat * Math.PI) / 180));
    const safeGridSizeMeters = Math.max(5, Number(gridSizeMeters) || 20);
    const cellHeight = safeGridSizeMeters * latDegPerMeter;
    const cellWidth = safeGridSizeMeters * lngDegPerMeter;
    const selectedMetricKey = String(selectedMetric || "rsrp").trim().toLowerCase();
    const normalizedAggregationMethod = String(aggregationMethod || "median")
      .trim()
      .toLowerCase();

    const buckets = new Map();

    for (const loc of locations) {
      const lat = Number(loc?.lat ?? loc?.latitude);
      const lng = Number(loc?.lng ?? loc?.lon ?? loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const row = Math.floor((lat - bounds.south) / cellHeight);
      const col = Math.floor((lng - bounds.west) / cellWidth);
      const bucketKey = `${row}|${col}`;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          row,
          col,
          centerLat: bounds.south + row * cellHeight + cellHeight / 2,
          centerLng: bounds.west + col * cellWidth + cellWidth / 2,
          sampleCount: 0,
          metrics: new Map(METRICS_TO_AGGREGATE.map((metric) => [metric, []])),
          providers: new Map(),
          bands: new Map(),
          technologies: new Map(),
          pcis: new Map(),
          sessions: new Set(),
        });
      }

      const bucket = buckets.get(bucketKey);
      bucket.sampleCount += 1;

      const sessionId = String(
        loc?.session_id ?? loc?.sessionId ?? loc?.session ?? "",
      ).trim();
      if (sessionId) bucket.sessions.add(sessionId);

      for (const metricKey of METRICS_TO_AGGREGATE) {
        const value = toFiniteNumber(getMetricValueFromLog(loc, metricKey));
        if (value !== null) {
          bucket.metrics.get(metricKey).push(value);
        }
      }

      incrementCounter(
        bucket.providers,
        loc?.provider ?? loc?.operator ?? loc?.m_alpha_long ?? loc?.network,
        normalizeProviderName,
      );
      incrementCounter(
        bucket.bands,
        loc?.band ?? loc?.primaryBand,
        normalizeBandName,
      );
      incrementCounter(
        bucket.technologies,
        loc?.technology ?? loc?.networkType ?? loc?.network,
        (value) => normalizeTechName(value, loc?.band ?? loc?.primaryBand),
      );
      incrementCounter(
        bucket.pcis,
        loc?.pci,
        (value) => {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) ? String(parsed) : "Unknown";
        },
      );
    }

    const gridLocations = Array.from(buckets.values())
      .map((bucket, index) => {
        const aggregatedMetrics = {};
        const metricStats = {};
        METRICS_TO_AGGREGATE.forEach((metricKey) => {
          const metricValues = bucket.metrics.get(metricKey) || EMPTY_ARRAY;
          metricStats[metricKey] = {
            avg: mean(metricValues),
            mean: mean(metricValues),
            median: median(metricValues),
            min: min(metricValues),
            max: max(metricValues),
          };
          aggregatedMetrics[metricKey] = getAggregateValue(
            metricValues,
            normalizedAggregationMethod,
          );
        });

        const dominantPciRaw = pickTopCategory(bucket.pcis);
        const dominantPci =
          dominantPciRaw !== "Unknown" && Number.isFinite(Number(dominantPciRaw))
            ? Number(dominantPciRaw)
            : null;
        const dominantProvider = pickTopCategory(bucket.providers);
        const dominantBand = pickTopCategory(bucket.bands);
        const dominantTechnology = pickTopCategory(bucket.technologies);
        const selectedMetricValue = CATEGORY_GRID_METRICS.has(selectedMetricKey)
          ? selectedMetricKey === "best_pci"
            ? dominantPci
            : null
          : aggregatedMetrics[selectedMetricKey] ?? null;

        return {
          id: `grid-${index}-${bucket.row}-${bucket.col}`,
          grid_id: `${bucket.row}_${bucket.col}`,
          lat: bucket.centerLat,
          lng: bucket.centerLng,
          latitude: bucket.centerLat,
          longitude: bucket.centerLng,
          sample_count: bucket.sampleCount,
          total_logs: bucket.sampleCount,
          session_count: bucket.sessions.size,
          provider: dominantProvider,
          operator: dominantProvider,
          best_operator: dominantProvider,
          band: dominantBand,
          technology: dominantTechnology,
          best_technology: dominantTechnology,
          networkType: dominantTechnology,
          pci: dominantPci,
          best_pci: dominantPci,
          provider_count: getTopCount(bucket.providers),
          technology_count: getTopCount(bucket.technologies),
          pci_count: getTopCount(bucket.pcis),
          value: selectedMetricValue,
          metric_value: selectedMetricValue,
          is_grid_cell: true,
          grid_row: bucket.row,
          grid_col: bucket.col,
          ...aggregatedMetrics,
          metric_stats: metricStats,
          dl_tpt: aggregatedMetrics.dl_thpt,
          dl_rpt: aggregatedMetrics.dl_thpt,
          ul_tpt: aggregatedMetrics.ul_thpt,
          ul_rpt: aggregatedMetrics.ul_thpt,
          [selectedMetricKey]:
            selectedMetricKey === "best_operator"
              ? dominantProvider
              : selectedMetricKey === "best_technology"
                ? dominantTechnology
                : selectedMetricValue,
        };
      })
      .filter((row) => row.sample_count > 0);

    const selectedMetricValues = gridLocations
      .map((row) => toFiniteNumber(row[selectedMetricKey]))
      .filter((value) => value !== null);

    const selectedMetricStats = CATEGORY_GRID_METRICS.has(selectedMetricKey)
      ? {
          avg: null,
          median: null,
          min: null,
          max: null,
        }
      : {
          avg: mean(selectedMetricValues),
          median: median(selectedMetricValues),
          min: min(selectedMetricValues),
          max: max(selectedMetricValues),
        };

    return {
      gridLocations,
      summary: {
        totalCells: buckets.size,
        populatedCells: gridLocations.length,
        totalSamples: gridLocations.reduce(
          (sum, row) => sum + (Number(row.sample_count) || 0),
          0,
        ),
        averageSamplesPerCell:
          gridLocations.length > 0
            ? gridLocations.reduce(
                (sum, row) => sum + (Number(row.sample_count) || 0),
                0,
              ) / gridLocations.length
            : 0,
        selectedMetricAverage: selectedMetricStats.avg,
        selectedMetricStats,
        selectedMetricKey,
        aggregationMethod: normalizedAggregationMethod,
      },
    };
  }, [enabled, locations, selectedMetric, gridSizeMeters, aggregationMethod]);
};

export default useUnifiedGridViewData;
