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
const CATEGORY_COLOR_MODES = new Set(["provider", "operator", "band", "technology", "pci"]);

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

const pushCategoryMetricValue = (counter, rawCategory, metricValue) => {
  const key = String(rawCategory || "").trim();
  if (!key || key === "Unknown" || !Number.isFinite(metricValue)) return;
  const bucket = counter.get(key) || [];
  bucket.push(metricValue);
  counter.set(key, bucket);
};

const pickBestCategoryByMetric = (counter, method, lowerIsBetter) => {
  if (!(counter instanceof Map) || counter.size === 0) return null;

  let best = null;
  counter.forEach((values, name) => {
    const value = getAggregateValue(values, method);
    if (!Number.isFinite(value)) return;
    if (
      !best ||
      (lowerIsBetter ? value < best.value : value > best.value)
    ) {
      best = { name, value, count: values.length };
    }
  });
  return best;
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
  colorBy = null,
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
    const normalizedColorBy = String(colorBy || "metric").trim().toLowerCase();
    const useCategoryColor = CATEGORY_COLOR_MODES.has(normalizedColorBy);
    const lowerIsBetterMetrics = new Set([
      "latency",
      "jitter",
      "packet_loss",
      "num_cells",
    ]);
    const isLowerBetterMetric = lowerIsBetterMetrics.has(selectedMetricKey);

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
          providerMetrics: new Map(),
          bandMetrics: new Map(),
          technologyMetrics: new Map(),
          pciMetrics: new Map(),
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

      const selectedMetricValue = toFiniteNumber(
        getMetricValueFromLog(loc, selectedMetricKey),
      );
      if (selectedMetricValue !== null) {
        const providerName =
          normalizeProviderName(
            loc?.provider ?? loc?.operator ?? loc?.m_alpha_long ?? loc?.network,
          ) || "Unknown";
        const technologyName =
          normalizeTechName(
            loc?.technology ?? loc?.networkType ?? loc?.network,
            loc?.band ?? loc?.primaryBand,
          ) || "Unknown";
        const bandName = normalizeBandName(loc?.band ?? loc?.primaryBand);
        const pciValue = Number.parseInt(loc?.pci, 10);

        pushCategoryMetricValue(bucket.providerMetrics, providerName, selectedMetricValue);
        pushCategoryMetricValue(bucket.bandMetrics, bandName, selectedMetricValue);
        pushCategoryMetricValue(bucket.technologyMetrics, technologyName, selectedMetricValue);
        pushCategoryMetricValue(
          bucket.pciMetrics,
          Number.isFinite(pciValue) ? String(pciValue) : "Unknown",
          selectedMetricValue,
        );
      }
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
        const bestProviderByMetric = pickBestCategoryByMetric(
          bucket.providerMetrics,
          normalizedAggregationMethod,
          isLowerBetterMetric,
        );
        const bestTechnologyByMetric = pickBestCategoryByMetric(
          bucket.technologyMetrics,
          normalizedAggregationMethod,
          isLowerBetterMetric,
        );
        const bestBandByMetric = pickBestCategoryByMetric(
          bucket.bandMetrics,
          normalizedAggregationMethod,
          isLowerBetterMetric,
        );
        const bestPciByMetric = pickBestCategoryByMetric(
          bucket.pciMetrics,
          normalizedAggregationMethod,
          isLowerBetterMetric,
        );
        const colorProvider =
          useCategoryColor && ["provider", "operator"].includes(normalizedColorBy)
            ? bestProviderByMetric?.name || dominantProvider
            : dominantProvider;
        const colorTechnology =
          useCategoryColor && normalizedColorBy === "technology"
            ? bestTechnologyByMetric?.name || dominantTechnology
            : dominantTechnology;
        const colorBand =
          useCategoryColor && normalizedColorBy === "band"
            ? bestBandByMetric?.name || dominantBand
            : dominantBand;
        const colorPciRaw =
          useCategoryColor && normalizedColorBy === "pci"
            ? bestPciByMetric?.name ?? dominantPciRaw
            : dominantPciRaw;
        const colorPci =
          colorPciRaw !== "Unknown" && Number.isFinite(Number(colorPciRaw))
            ? Number(colorPciRaw)
            : null;
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
          provider: colorProvider,
          operator: colorProvider,
          best_operator: colorProvider,
          band: colorBand,
          best_band: colorBand,
          technology: colorTechnology,
          best_technology: colorTechnology,
          networkType: colorTechnology,
          pci: colorPci,
          best_pci: colorPci,
          dominant_provider: dominantProvider,
          dominant_technology: dominantTechnology,
          dominant_pci: dominantPci,
          best_provider_value: bestProviderByMetric?.value ?? null,
          best_band_value: bestBandByMetric?.value ?? null,
          best_technology_value: bestTechnologyByMetric?.value ?? null,
          best_pci_value: bestPciByMetric?.value ?? null,
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
  }, [enabled, locations, selectedMetric, colorBy, gridSizeMeters, aggregationMethod]);
};

export default useUnifiedGridViewData;
