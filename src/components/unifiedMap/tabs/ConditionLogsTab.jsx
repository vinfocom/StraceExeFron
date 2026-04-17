import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Grid3X3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

import { ChartContainer } from "../common/ChartContainer";
import { StatCard } from "../common/StatCard";
import { EmptyState } from "../common/EmptyState";
import { gridAnalyticsApi } from "@/api/apiEndpoints";
import { CHART_CONFIG } from "@/utils/constants";

const CONDITION_COLORS = {
  baseline: "#ef4444",
  optimized: "#22c55e",
  unknown: "#64748b",
};

const METRIC_COLORS = {
  rsrp: "#60a5fa",
  rsrq: "#f59e0b",
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCondition = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "optimised") return "optimized";
  if (normalized === "updated") return "optimized";
  if (normalized === "original") return "baseline";
  return normalized;
};

const resolveSelectedCondition = (sitePredictionVersion) => {
  const normalized = normalizeCondition(sitePredictionVersion || "original");
  if (normalized === "delta") return "delta";
  if (normalized === "optimized") return "optimized";
  return "baseline";
};

const readMetricValue = (row, metric, selectedMetricLower) => {
  const metricKeys =
    metric === "rsrq"
      ? ["rsrq", "pred_rsrq", "reference_signal_quality", "RSRQ"]
      : ["rsrp", "pred_rsrp", "reference_signal_power", "RSRP"];

  for (const key of metricKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = toFiniteNumber(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }

  if (selectedMetricLower === metric) {
    const value = toFiniteNumber(row.value);
    if (Number.isFinite(value)) return value;
  }

  const hintedKey = Object.keys(row || {}).find((key) =>
    String(key || "").toLowerCase().includes(metric),
  );
  if (hintedKey) {
    const hintedValue = toFiniteNumber(row[hintedKey]);
    if (Number.isFinite(hintedValue)) return hintedValue;
  }

  return null;
};

const readSelectedMetricValue = (row, selectedMetricLower) => {
  if (!selectedMetricLower) return null;

  if (selectedMetricLower === "rsrp" || selectedMetricLower === "rsrq") {
    return readMetricValue(row, selectedMetricLower, selectedMetricLower);
  }

  const metricCandidates =
    selectedMetricLower === "sinr" || selectedMetricLower === "snr"
      ? ["sinr", "snr", "pred_sinr", "signal_to_noise_ratio"]
      : [selectedMetricLower];

  const genericCandidates = [
    selectedMetricLower,
    selectedMetricLower.toUpperCase(),
    "value",
    "Value",
    "measured",
    "measured_value",
    "metric_value",
    "avg_value",
  ];

  for (const key of [...metricCandidates, ...genericCandidates]) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) {
      const value = toFiniteNumber(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }

  const metricHint = selectedMetricLower.replace(/[^a-z0-9]/g, "");
  const hintedKey = Object.keys(row || {}).find((key) =>
    String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .includes(metricHint),
  );
  if (hintedKey) {
    const hintedValue = toFiniteNumber(row[hintedKey]);
    if (Number.isFinite(hintedValue)) return hintedValue;
  }

  return null;
};

const readSiteId = (row = {}) =>
  String(
    row.site_id ??
      row.siteId ??
      row.site ??
      row.site_key_inferred ??
      row.siteKeyInferred ??
      row.nodeb_id ??
      row.node_b_id ??
      row.nodebId ??
      "",
  ).trim();

const readSectorId = (row = {}) =>
  String(
    row.sector ??
      row.sector_id ??
      row.sectorId ??
      row.cell_id ??
      row.cellId ??
      row.cell_id_representative ??
      row.cellIdRepresentative ??
      "",
  ).trim();

const summarizeMetric = (rows = [], metric) => {
  const values = rows.map((row) => row[metric]).filter(Number.isFinite);
  if (!values.length) {
    return { count: 0, avg: null, min: null, max: null };
  }

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    avg: total / values.length,
    min: Number.isFinite(minValue) ? minValue : null,
    max: Number.isFinite(maxValue) ? maxValue : null,
  };
};

const buildCdfData = (baselineValues = [], optimizedValues = [], points = 60) => {
  const base = (baselineValues || []).filter(Number.isFinite);
  const opt = (optimizedValues || []).filter(Number.isFinite);
  if (base.length === 0 && opt.length === 0) return [];

  const allValues = [...base, ...opt];
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const value of allValues) {
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [];

  if (minValue === maxValue) {
    return [
      {
        value: minValue,
        baseline: base.length ? 100 : 0,
        optimized: opt.length ? 100 : 0,
      },
    ];
  }

  const totalPoints = Math.max(10, Math.min(200, Number(points) || 60));
  const step = (maxValue - minValue) / totalPoints;
  const computePercent = (values, threshold) =>
    values.length === 0
      ? 0
      : (values.reduce((count, value) => count + (value >= threshold ? 1 : 0), 0) / values.length) * 100;

  const result = [];
  for (let idx = 0; idx <= totalPoints; idx += 1) {
    const x = minValue + step * idx;
    result.push({
      value: x,
      baseline: computePercent(base, x),
      optimized: computePercent(opt, x),
    });
  }
  return result;
};

const toMetricDisplay = (value) =>
  Number.isFinite(value) ? value.toFixed(2) : "N/A";

const buildDeltaCdfData = (values = [], points = 60) => {
  const rows = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (rows.length === 0) return [];
  const minValue = rows[0];
  const maxValue = rows[rows.length - 1];
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [];

  if (minValue === maxValue) {
    return [{ value: minValue, cdf: 100 }];
  }

  const totalPoints = Math.max(10, Math.min(200, Number(points) || 60));
  const step = (maxValue - minValue) / totalPoints;
  const result = [];

  for (let idx = 0; idx <= totalPoints; idx += 1) {
    const x = minValue + step * idx;
    const count = rows.reduce((sum, v) => sum + (v <= x ? 1 : 0), 0);
    result.push({
      value: x,
      cdf: rows.length > 0 ? (count / rows.length) * 100 : 0,
    });
  }
  return result;
};

const normalizeThresholdRanges = (thresholds = []) =>
  (Array.isArray(thresholds) ? thresholds : [])
    .map((item, index) => {
      const min = toFiniteNumber(item?.min);
      const max = toFiniteNumber(item?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return {
        index,
        min,
        max,
        color: String(item?.color || "#64748b"),
        label: String(item?.label || item?.range || `${min} to ${max}`).trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.min - b.min);

const formatThresholdRangeLabel = (min, max) => {
  const safeMin = toFiniteNumber(min);
  const safeMax = toFiniteNumber(max);
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax)) return "";
  if (safeMin <= -1e8) return `< ${safeMax}`;
  if (safeMax >= 1e8) return `>= ${safeMin}`;
  return `${safeMin} to ${safeMax}`;
};

const matchThresholdRange = (value, ranges = []) => {
  if (!Number.isFinite(value) || !Array.isArray(ranges) || ranges.length === 0) return null;
  for (let i = 0; i < ranges.length; i += 1) {
    const current = ranges[i];
    const isLast = i === ranges.length - 1;
    if (value >= current.min && (isLast ? value <= current.max : value < current.max)) {
      return current;
    }
  }
  if (value < ranges[0].min) return ranges[0];
  if (value > ranges[ranges.length - 1].max) return ranges[ranges.length - 1];
  return null;
};

const classifyDeltaQuality = (label = "", value = null) => {
  const normalizedLabel = String(label || "").trim().toLowerCase();
  if (
    normalizedLabel.includes("bad") ||
    normalizedLabel.includes("very poor") ||
    normalizedLabel.includes("worst")
  ) {
    return "bad";
  }
  if (normalizedLabel.includes("poor")) return "poor";
  if (
    normalizedLabel.includes("better") ||
    normalizedLabel.includes("good") ||
    normalizedLabel.includes("excellent") ||
    normalizedLabel.includes("improv")
  ) {
    return "better";
  }
  if (Number.isFinite(value)) {
    if (value > 0) return "better";
    if (value < 0) return "poor";
  }
  return "neutral";
};

const formatMetricLabel = (metric) => {
  const normalized = String(metric || "").trim().toLowerCase();
  if (!normalized) return "Metric";

  const labelMap = {
    rsrp: "RSRP",
    rsrq: "RSRQ",
    sinr: "SINR",
    snr: "SNR",
    dl_thpt: "DL Throughput",
    ul_thpt: "UL Throughput",
    mos: "MOS",
  };

  if (labelMap[normalized]) return labelMap[normalized];
  return normalized.replace(/_/g, " ").toUpperCase();
};

const extractGridAnalyticsEnvelope = (response) => {
  const root =
    response?.data && typeof response.data === "object" ? response.data : response || {};
  const data =
    root?.Data && typeof root.Data === "object"
      ? root.Data
      : root?.data && typeof root.data === "object"
        ? root.data
        : null;

  const gridSizeMeters = toFiniteNumber(data?.grid_size_meters ?? data?.gridSizeMeters);
  const totalGridsWithData = toFiniteNumber(
    data?.total_grids_with_data ?? data?.totalGridsWithData,
  );
  return {
    status: Number(root?.Status ?? root?.status ?? 0),
    message: String(root?.Message ?? root?.message ?? "").trim(),
    grids: Array.isArray(data?.grids) ? data.grids : [],
    gridSizeMeters: Number.isFinite(gridSizeMeters) ? gridSizeMeters : null,
    totalGridsWithData: Number.isFinite(totalGridsWithData)
      ? Number(totalGridsWithData)
      : null,
  };
};

const extractCoverageSummaryEnvelope = (response) => {
  const root =
    response?.data && typeof response.data === "object" ? response.data : response || {};
  const data =
    root?.Data && typeof root.Data === "object"
      ? root.Data
      : root?.data && typeof root.data === "object"
        ? root.data
        : null;

  const toCount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    status: Number(root?.Status ?? root?.status ?? 0),
    message: String(root?.Message ?? root?.message ?? "").trim(),
    projectId: Number(data?.project_id ?? data?.projectId) || null,
    baselineTotalRows: toCount(data?.baseline_total_rows ?? data?.baselineTotalRows),
    optimizedTotalRows: toCount(data?.optimized_total_rows ?? data?.optimizedTotalRows),
    matchedOptimizedRows: toCount(
      data?.matched_optimized_rows ?? data?.matchedOptimizedRows,
    ),
    changedRowCount: toCount(data?.changed_row_count ?? data?.changedRowCount),
    unchangedRowCount: toCount(data?.unchanged_row_count ?? data?.unchangedRowCount),
    changedSectorCount: toCount(data?.changed_sector_count ?? data?.changedSectorCount),
    fieldChanges: Array.isArray(data?.field_changes)
      ? data.field_changes
      : Array.isArray(data?.fieldChanges)
        ? data.fieldChanges
        : [],
    changedSectors: Array.isArray(data?.changed_sectors)
      ? data.changed_sectors
      : Array.isArray(data?.changedSectors)
        ? data.changedSectors
        : [],
  };
};

const normalizeStoredMetricMode = (mode) => {
  const normalized = String(mode || "avg").trim().toLowerCase();
  if (normalized === "median" || normalized === "max" || normalized === "min") return normalized;
  return "avg";
};

const readMetricFromGridMetrics = (
  metrics = {},
  selectedMetricLower = "rsrp",
  storedGridMetricMode = "avg",
) => {
  const normalized = String(selectedMetricLower || "rsrp").trim().toLowerCase();
  const metricMode = normalizeStoredMetricMode(storedGridMetricMode);
  const sanitize = (value) => {
    if (!Number.isFinite(value)) return null;
    // Guard against invalid outliers from incomplete rows that can skew chart axis.
    if (normalized === "rsrp" && (value < -180 || value > -30)) return null;
    if (normalized === "rsrq" && (value < -40 || value > 5)) return null;
    if ((normalized === "sinr" || normalized === "snr") && (value < -30 || value > 80)) return null;
    return value;
  };

  const readPrimaryOrAvgFallback = (primaryKey, avgKey) =>
    toFiniteNumber(
      metrics?.[primaryKey] ??
      (metricMode !== "avg" ? metrics?.[avgKey] : null),
    );

  if (normalized === "rsrq") {
    return sanitize(
      readPrimaryOrAvgFallback(`${metricMode}_rsrq`, "avg_rsrq"),
    );
  }
  if (normalized === "sinr" || normalized === "snr") {
    return sanitize(
      readPrimaryOrAvgFallback(`${metricMode}_sinr`, "avg_sinr"),
    );
  }
  return sanitize(
    readPrimaryOrAvgFallback(`${metricMode}_rsrp`, "avg_rsrp"),
  );
};

const buildGridAnalysisFromStoredGrids = (
  grids = [],
  selectedMetricLower = "rsrp",
  storedGridMetricMode = "avg",
) => {
  if (!Array.isArray(grids) || grids.length === 0) return null;

  const average = (values = []) => {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) return null;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  };

  let baselineDominantCount = 0;
  let optimizedDominantCount = 0;
  let unknownDominantCount = 0;
  let comparableCellCount = 0;
  const gridPointRows = [];
  const baselineDominantMetricValues = [];
  const optimizedDominantMetricValues = [];
  const baselineDominantRsrpValues = [];
  const optimizedDominantRsrpValues = [];
  const baselineDominantRsrqValues = [];
  const optimizedDominantRsrqValues = [];

  grids.forEach((grid) => {
    const baseline = grid?.baseline || {};
    const optimized = grid?.optimized || {};

    const baselineCount = Number(baseline?.point_count) || 0;
    const optimizedCount = Number(optimized?.point_count) || 0;
    if (baselineCount > 0 && optimizedCount > 0) comparableCellCount += 1;

    const baselineMetricAvg = readMetricFromGridMetrics(
      baseline,
      selectedMetricLower,
      storedGridMetricMode,
    );
    const optimizedMetricAvg = readMetricFromGridMetrics(
      optimized,
      selectedMetricLower,
      storedGridMetricMode,
    );

    const baselineRsrpAvg = toFiniteNumber(
      baseline?.avg_rsrp ?? baseline?.median_rsrp ?? baseline?.max_rsrp,
    );
    const optimizedRsrpAvg = toFiniteNumber(
      optimized?.avg_rsrp ?? optimized?.median_rsrp ?? optimized?.max_rsrp,
    );
    const baselineRsrqAvg = toFiniteNumber(
      baseline?.avg_rsrq ?? baseline?.median_rsrq ?? baseline?.max_rsrq,
    );
    const optimizedRsrqAvg = toFiniteNumber(
      optimized?.avg_rsrq ?? optimized?.median_rsrq ?? optimized?.max_rsrq,
    );

    let dominantCondition = "unknown";
    if (baselineCount > optimizedCount) {
      dominantCondition = "baseline";
    } else if (optimizedCount > baselineCount) {
      dominantCondition = "optimized";
    } else if (baselineCount === optimizedCount && baselineCount > 0) {
      if (Number.isFinite(baselineMetricAvg) && Number.isFinite(optimizedMetricAvg)) {
        dominantCondition = optimizedMetricAvg >= baselineMetricAvg ? "optimized" : "baseline";
      }
    }

    if (dominantCondition === "baseline") {
      baselineDominantCount += 1;
      if (Number.isFinite(baselineMetricAvg)) baselineDominantMetricValues.push(baselineMetricAvg);
      if (Number.isFinite(baselineRsrpAvg)) baselineDominantRsrpValues.push(baselineRsrpAvg);
      if (Number.isFinite(baselineRsrqAvg)) baselineDominantRsrqValues.push(baselineRsrqAvg);
    } else if (dominantCondition === "optimized") {
      optimizedDominantCount += 1;
      if (Number.isFinite(optimizedMetricAvg)) optimizedDominantMetricValues.push(optimizedMetricAvg);
      if (Number.isFinite(optimizedRsrpAvg)) optimizedDominantRsrpValues.push(optimizedRsrpAvg);
      if (Number.isFinite(optimizedRsrqAvg)) optimizedDominantRsrqValues.push(optimizedRsrqAvg);
    } else {
      unknownDominantCount += 1;
    }

    const fallbackMetric = average([baselineMetricAvg, optimizedMetricAvg]);
    const dominantMetricValue =
      dominantCondition === "baseline"
        ? baselineMetricAvg
        : dominantCondition === "optimized"
          ? optimizedMetricAvg
          : fallbackMetric;

    gridPointRows.push({
      metricValue: Number.isFinite(dominantMetricValue) ? dominantMetricValue : null,
      condition: dominantCondition,
    });
  });

  return {
    estimatedCells: grids.length,
    comparableCellCount,
    baselineDominantCount,
    optimizedDominantCount,
    unknownDominantCount,
    gridPointRows,
    baselineDominantMetricValues,
    optimizedDominantMetricValues,
    baselineDominantRsrpValues,
    optimizedDominantRsrpValues,
    baselineDominantRsrqValues,
    optimizedDominantRsrqValues,
  };
};

export const ConditionLogsTab = ({
  locations = [],
  sectorSummaryLocations = [],
  projectId = null,
  selectedMetric = "rsrp",
  sitePredictionVersion = "original",
  thresholds = {},
  lteGridEnabled = false,
  lteGridSizeMeters = 50,
  isCellSiteGridMode = false,
  isDeltaSiteGridMode = false,
  storedGridMetricMode = "avg",
  viewport = null,
  expanded = false,
}) => {
  const [showSectorSummary, setShowSectorSummary] = useState(false);
  const [showPoorGridHistogram, setShowPoorGridHistogram] = useState(false);
  const selectedCondition = useMemo(
    () => resolveSelectedCondition(sitePredictionVersion),
    [sitePredictionVersion],
  );
  const selectedMetricLower = useMemo(
    () => String(selectedMetric || "rsrp").trim().toLowerCase(),
    [selectedMetric],
  );
  const normalizedStoredMetricMode = useMemo(
    () => normalizeStoredMetricMode(storedGridMetricMode),
    [storedGridMetricMode],
  );

  const shouldUseStoredGridAnalytics = useMemo(
    () =>
      Boolean(isCellSiteGridMode || isDeltaSiteGridMode) &&
      Number.isFinite(Number(projectId)) &&
      Number(projectId) > 0,
    [isCellSiteGridMode, isDeltaSiteGridMode, projectId],
  );
  const [storedGridState, setStoredGridState] = useState({
    loading: false,
    status: "idle",
    error: "",
    message: "",
    grids: [],
    requestedGridSize: null,
    gridSizeMeters: null,
    totalGridsWithData: 0,
    lastUpdatedAt: null,
  });
  useEffect(() => {
    if (!shouldUseStoredGridAnalytics) {
      setStoredGridState({
        loading: false,
        status: "idle",
        error: "",
        message: "",
        grids: [],
        requestedGridSize: null,
        gridSizeMeters: null,
        totalGridsWithData: 0,
        lastUpdatedAt: null,
      });
      return;
    }

    const normalizedProjectId = Number(projectId);
    const requestedGridSize = Math.max(5, Number(lteGridSizeMeters) || 50);
    let cancelled = false;

    const loadStoredGridAnalytics = async () => {
      setStoredGridState((prev) => ({
        ...prev,
        loading: true,
        status: "fetching",
        error: "",
        message: "",
        requestedGridSize,
      }));

      try {
        let parsed = null;
        const maxAttempts = 1;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const response = await gridAnalyticsApi.getGridAnalytics({
            projectId: normalizedProjectId,
          });
          parsed = extractGridAnalyticsEnvelope(response);

          const shouldRetry =
            parsed.grids.length === 0 &&
            /call computeandstoregridanalytics first|table does not exist|no stored grid analytics found/i.test(
              parsed.message,
            );

          if (!shouldRetry) break;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        if (cancelled) return;

        setStoredGridState({
          loading: false,
          status: "ready",
          error: "",
          message: String(parsed?.message || "").trim(),
          grids: Array.isArray(parsed?.grids) ? parsed.grids : [],
          requestedGridSize,
          gridSizeMeters:
            Number.isFinite(Number(parsed?.gridSizeMeters))
              ? Number(parsed.gridSizeMeters)
              : requestedGridSize,
          totalGridsWithData:
            Number.isFinite(Number(parsed?.totalGridsWithData))
              ? Number(parsed.totalGridsWithData)
              : Array.isArray(parsed?.grids)
                ? parsed.grids.length
                : 0,
          lastUpdatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (cancelled) return;
        setStoredGridState((prev) => ({
          ...prev,
          loading: false,
          status: "error",
          error:
            String(error?.message || "").trim() || "Failed to load delta grid analytics",
          grids: [],
          message: "",
          lastUpdatedAt: new Date().toISOString(),
        }));
      }
    };

    void loadStoredGridAnalytics();

    return () => {
      cancelled = true;
    };
  }, [shouldUseStoredGridAnalytics, projectId, lteGridSizeMeters]);

  const [coverageSummaryState, setCoverageSummaryState] = useState({
    loading: false,
    status: "idle",
    error: "",
    message: "",
    data: null,
    lastUpdatedAt: null,
  });

  useEffect(() => {
    if (!shouldUseStoredGridAnalytics) {
      setCoverageSummaryState({
        loading: false,
        status: "idle",
        error: "",
        message: "",
        data: null,
        lastUpdatedAt: null,
      });
      return;
    }

    const normalizedProjectId = Number(projectId);
    if (!Number.isFinite(normalizedProjectId) || normalizedProjectId <= 0) {
      setCoverageSummaryState({
        loading: false,
        status: "error",
        error: "Invalid project selected.",
        message: "",
        data: null,
        lastUpdatedAt: new Date().toISOString(),
      });
      return;
    }

    let cancelled = false;

    const loadCoverageSummary = async () => {
      setCoverageSummaryState((prev) => ({
        ...prev,
        loading: true,
        status: "fetching",
        error: "",
      }));

      try {
        const response = await gridAnalyticsApi.getCoverageOptimizationSummary({
          projectId: normalizedProjectId,
        });
        const parsed = extractCoverageSummaryEnvelope(response);
        if (cancelled) return;

        setCoverageSummaryState({
          loading: false,
          status: "ready",
          error: "",
          message: parsed.message,
          data: parsed,
          lastUpdatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (cancelled) return;
        setCoverageSummaryState({
          loading: false,
          status: "error",
          error:
            String(error?.message || "").trim() ||
            "Failed to load coverage optimization summary.",
          message: "",
          data: null,
          lastUpdatedAt: new Date().toISOString(),
        });
      }
    };

    void loadCoverageSummary();
    return () => {
      cancelled = true;
    };
  }, [shouldUseStoredGridAnalytics, projectId]);

  const normalizedRows = useMemo(() => {
    if (!Array.isArray(locations) || locations.length === 0) return [];

    return locations
      .map((row, index) => {
        const lat = toFiniteNumber(row.lat ?? row.latitude ?? row.lat_pred);
        const lng = toFiniteNumber(
          row.lng ?? row.lon ?? row.longitude ?? row.lon_pred,
        );

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const rawCondition = normalizeCondition(
          row.deltaVariant ?? row.delta_variant ?? "",
        );

        return {
          id:
            row.id ??
            row.log_id ??
            row.logId ??
            row.cell_id ??
            row.cellId ??
            row.site_id ??
            row.siteId ??
            index,
          lat,
          lng,
          siteId: readSiteId(row),
          sectorId: readSectorId(row),
          rawCondition,
          metricValue: readSelectedMetricValue(row, selectedMetricLower),
          rsrp: readMetricValue(row, "rsrp", selectedMetricLower),
          rsrq: readMetricValue(row, "rsrq", selectedMetricLower),
        };
      })
      .filter(Boolean);
  }, [locations, selectedMetricLower]);

  const normalizedSectorRows = useMemo(() => {
    const sourceRows =
      Array.isArray(sectorSummaryLocations) && sectorSummaryLocations.length > 0
        ? sectorSummaryLocations
        : locations;
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) return [];

    return sourceRows
      .map((row, index) => {
        const lat = toFiniteNumber(row.lat ?? row.latitude ?? row.lat_pred);
        const lng = toFiniteNumber(
          row.lng ?? row.lon ?? row.longitude ?? row.lon_pred,
        );

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const rawCondition = normalizeCondition(
          row.deltaVariant ?? row.delta_variant ?? "",
        );

        return {
          id:
            row.id ??
            row.log_id ??
            row.logId ??
            row.cell_id ??
            row.cellId ??
            row.site_id ??
            row.siteId ??
            index,
          lat,
          lng,
          siteId: readSiteId(row),
          sectorId: readSectorId(row),
          rawCondition,
          metricValue: readSelectedMetricValue(row, selectedMetricLower),
        };
      })
      .filter(Boolean);
  }, [sectorSummaryLocations, locations, selectedMetricLower]);

  const visibleRows = useMemo(() => {
    if (!viewport) return normalizedRows;
    const north = Number(viewport?.north);
    const south = Number(viewport?.south);
    const east = Number(viewport?.east);
    const west = Number(viewport?.west);
    if (![north, south, east, west].every(Number.isFinite)) return normalizedRows;

    return normalizedRows.filter(
      (row) =>
        row.lat <= north &&
        row.lat >= south &&
        row.lng <= east &&
        row.lng >= west,
    );
  }, [normalizedRows, viewport]);

  const classifyRowCondition = useMemo(() => {
    const deltaMode = selectedCondition === "delta";

    return (row) => {
      if (row.rawCondition === "baseline" || row.rawCondition === "optimized") {
        return row.rawCondition;
      }

      if (deltaMode) return "unknown";
      return selectedCondition === "optimized" ? "optimized" : "baseline";
    };
  }, [selectedCondition]);

  const conditionBuckets = useMemo(() => {
    const buckets = {
      baseline: [],
      optimized: [],
      unknown: [],
    };

    visibleRows.forEach((row) => {
      const condition = classifyRowCondition(row);
      if (!buckets[condition]) {
        buckets.unknown.push(row);
        return;
      }
      buckets[condition].push({
        ...row,
        displayCondition: condition,
      });
    });

    return buckets;
  }, [visibleRows, classifyRowCondition]);

  const hasTaggedConditions = useMemo(
    () =>
      visibleRows.some(
        (row) => row.rawCondition === "baseline" || row.rawCondition === "optimized",
      ),
    [visibleRows],
  );

  const tableRows = useMemo(() => {
    if (selectedCondition === "delta") {
      return [
        ...conditionBuckets.baseline,
        ...conditionBuckets.optimized,
        ...conditionBuckets.unknown,
      ];
    }

    if (!hasTaggedConditions) {
      return visibleRows.map((row) => ({
        ...row,
        displayCondition: selectedCondition,
      }));
    }

    if (selectedCondition === "optimized") {
      return conditionBuckets.optimized;
    }

    return conditionBuckets.baseline;
  }, [
    selectedCondition,
    conditionBuckets,
    hasTaggedConditions,
    visibleRows,
  ]);

  const selectedMetricLabel = useMemo(
    () => formatMetricLabel(selectedMetric),
    [selectedMetric],
  );
  const average = (values = []) => {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) return null;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  };

  const computedGridAnalysis = useMemo(() => {
    if (!lteGridEnabled || tableRows.length === 0) {
      return null;
    }

    const safeSize = Math.max(5, Number(lteGridSizeMeters) || 50);
    const meanLat =
      tableRows.reduce((sum, row) => sum + row.lat, 0) / tableRows.length;
    const stepLat = safeSize / 111320;
    const stepLng =
      safeSize /
      (111320 * Math.max(Math.abs(Math.cos((meanLat * Math.PI) / 180)), 1e-6));

    const buckets = new Map();
    tableRows.forEach((row) => {
      const gridRow = Math.floor(row.lat / stepLat);
      const gridCol = Math.floor(row.lng / stepLng);
      const key = `${gridRow}|${gridCol}`;
      const condition = row.displayCondition || classifyRowCondition(row);

      if (!buckets.has(key)) {
        buckets.set(key, {
          baselineCount: 0,
          optimizedCount: 0,
          unknownCount: 0,
          baselineMetricValues: [],
          optimizedMetricValues: [],
          unknownMetricValues: [],
          baselineRsrpValues: [],
          optimizedRsrpValues: [],
          unknownRsrpValues: [],
          baselineRsrqValues: [],
          optimizedRsrqValues: [],
          unknownRsrqValues: [],
          allMetricValues: [],
        });
      }

      const bucket = buckets.get(key);
      if (condition === "baseline") bucket.baselineCount += 1;
      else if (condition === "optimized") bucket.optimizedCount += 1;
      else bucket.unknownCount += 1;

      if (Number.isFinite(row.metricValue)) {
        bucket.allMetricValues.push(row.metricValue);
        if (condition === "baseline") bucket.baselineMetricValues.push(row.metricValue);
        else if (condition === "optimized") bucket.optimizedMetricValues.push(row.metricValue);
        else bucket.unknownMetricValues.push(row.metricValue);
      }
      if (Number.isFinite(row.rsrp)) {
        if (condition === "baseline") bucket.baselineRsrpValues.push(row.rsrp);
        else if (condition === "optimized") bucket.optimizedRsrpValues.push(row.rsrp);
        else bucket.unknownRsrpValues.push(row.rsrp);
      }
      if (Number.isFinite(row.rsrq)) {
        if (condition === "baseline") bucket.baselineRsrqValues.push(row.rsrq);
        else if (condition === "optimized") bucket.optimizedRsrqValues.push(row.rsrq);
        else bucket.unknownRsrqValues.push(row.rsrq);
      }
    });

    let baselineDominantCount = 0;
    let optimizedDominantCount = 0;
    let unknownDominantCount = 0;
    let comparableCellCount = 0;
    const gridPointRows = [];
    const baselineDominantMetricValues = [];
    const optimizedDominantMetricValues = [];
    const baselineDominantRsrpValues = [];
    const optimizedDominantRsrpValues = [];
    const baselineDominantRsrqValues = [];
    const optimizedDominantRsrqValues = [];

    buckets.forEach((bucket) => {
      const baselineMetricAvg = average(bucket.baselineMetricValues);
      const optimizedMetricAvg = average(bucket.optimizedMetricValues);
      const unknownMetricAvg = average(bucket.unknownMetricValues);
      const overallMetricAvg = average(bucket.allMetricValues);
      const baselineRsrpAvg = average(bucket.baselineRsrpValues);
      const optimizedRsrpAvg = average(bucket.optimizedRsrpValues);
      const baselineRsrqAvg = average(bucket.baselineRsrqValues);
      const optimizedRsrqAvg = average(bucket.optimizedRsrqValues);

      if (bucket.baselineCount > 0 && bucket.optimizedCount > 0) {
        comparableCellCount += 1;
      }

      let dominantCondition = "unknown";
      if (bucket.baselineCount > bucket.optimizedCount) {
        dominantCondition = "baseline";
      } else if (bucket.optimizedCount > bucket.baselineCount) {
        dominantCondition = "optimized";
      } else if (bucket.baselineCount === bucket.optimizedCount && bucket.baselineCount > 0) {
        if (Number.isFinite(baselineMetricAvg) && Number.isFinite(optimizedMetricAvg)) {
          dominantCondition = optimizedMetricAvg >= baselineMetricAvg ? "optimized" : "baseline";
        }
      }

      if (dominantCondition === "baseline") {
        baselineDominantCount += 1;
        if (Number.isFinite(baselineMetricAvg)) baselineDominantMetricValues.push(baselineMetricAvg);
        if (Number.isFinite(baselineRsrpAvg)) baselineDominantRsrpValues.push(baselineRsrpAvg);
        if (Number.isFinite(baselineRsrqAvg)) baselineDominantRsrqValues.push(baselineRsrqAvg);
      } else if (dominantCondition === "optimized") {
        optimizedDominantCount += 1;
        if (Number.isFinite(optimizedMetricAvg)) optimizedDominantMetricValues.push(optimizedMetricAvg);
        if (Number.isFinite(optimizedRsrpAvg)) optimizedDominantRsrpValues.push(optimizedRsrpAvg);
        if (Number.isFinite(optimizedRsrqAvg)) optimizedDominantRsrqValues.push(optimizedRsrqAvg);
      } else {
        unknownDominantCount += 1;
      }

      const dominantMetricValue =
        dominantCondition === "baseline"
          ? baselineMetricAvg
          : dominantCondition === "optimized"
            ? optimizedMetricAvg
            : unknownMetricAvg;
      gridPointRows.push({
        metricValue: Number.isFinite(dominantMetricValue)
          ? dominantMetricValue
          : overallMetricAvg,
        condition: dominantCondition,
      });
    });

    return {
      estimatedCells: buckets.size,
      comparableCellCount,
      baselineDominantCount,
      optimizedDominantCount,
      unknownDominantCount,
      gridPointRows,
      baselineDominantMetricValues,
      optimizedDominantMetricValues,
      baselineDominantRsrpValues,
      optimizedDominantRsrpValues,
      baselineDominantRsrqValues,
      optimizedDominantRsrqValues,
    };
  }, [lteGridEnabled, lteGridSizeMeters, tableRows, classifyRowCondition]);

  const storedGridAnalysis = useMemo(
    () =>
      buildGridAnalysisFromStoredGrids(
        storedGridState.grids,
        selectedMetricLower,
        normalizedStoredMetricMode,
      ),
    [storedGridState.grids, selectedMetricLower, normalizedStoredMetricMode],
  );

  const gridAnalysis = useMemo(() => {
    if (!lteGridEnabled) return null;

    if (shouldUseStoredGridAnalytics) {
      return storedGridAnalysis || computedGridAnalysis;
    }

    return computedGridAnalysis;
  }, [
    lteGridEnabled,
    shouldUseStoredGridAnalytics,
    storedGridAnalysis,
    computedGridAnalysis,
  ]);

  const activeMetricSourceRows = useMemo(() => {
    if (lteGridEnabled && gridAnalysis?.gridPointRows?.length) {
      return gridAnalysis.gridPointRows;
    }
    return tableRows;
  }, [lteGridEnabled, gridAnalysis, tableRows]);

  const activeMetricSummary = useMemo(
    () => summarizeMetric(activeMetricSourceRows, "metricValue"),
    [activeMetricSourceRows],
  );

  const baselineRsrpValues = useMemo(
    () => conditionBuckets.baseline.map((row) => row.rsrp).filter(Number.isFinite),
    [conditionBuckets],
  );
  const optimizedRsrpValues = useMemo(
    () => conditionBuckets.optimized.map((row) => row.rsrp).filter(Number.isFinite),
    [conditionBuckets],
  );
  const baselineRsrqValues = useMemo(
    () => conditionBuckets.baseline.map((row) => row.rsrq).filter(Number.isFinite),
    [conditionBuckets],
  );
  const optimizedRsrqValues = useMemo(
    () => conditionBuckets.optimized.map((row) => row.rsrq).filter(Number.isFinite),
    [conditionBuckets],
  );

  const conditionCountData = useMemo(() => {
    if (lteGridEnabled && gridAnalysis) {
      return [
        {
          key: "baseline",
          condition: "Baseline",
          count: gridAnalysis.baselineDominantCount,
          color: CONDITION_COLORS.baseline,
        },
        {
          key: "optimized",
          condition: "Optimized",
          count: gridAnalysis.optimizedDominantCount,
          color: CONDITION_COLORS.optimized,
        },
        {
          key: "unknown",
          condition: "No Difference",
          count: gridAnalysis.unknownDominantCount,
          color: CONDITION_COLORS.unknown,
        },
      ].filter((item) => item.count > 0);
    }

    return [
      {
        key: "baseline",
        condition: "Baseline",
        count: conditionBuckets.baseline.length,
        color: CONDITION_COLORS.baseline,
      },
      {
        key: "optimized",
        condition: "Optimized",
        count: conditionBuckets.optimized.length,
        color: CONDITION_COLORS.optimized,
      },
      {
        key: "unknown",
        condition: "No Difference",
        count: conditionBuckets.unknown.length,
        color: CONDITION_COLORS.unknown,
      },
    ].filter((item) => item.count > 0);
  }, [lteGridEnabled, gridAnalysis, conditionBuckets]);

  const conditionMetricData = useMemo(() => {
    if (lteGridEnabled && gridAnalysis) {
      return [
        {
          key: "baseline",
          condition: "Baseline",
          rsrp: average(gridAnalysis.baselineDominantRsrpValues),
          rsrq: average(gridAnalysis.baselineDominantRsrqValues),
          color: CONDITION_COLORS.baseline,
        },
        {
          key: "optimized",
          condition: "Optimized",
          rsrp: average(gridAnalysis.optimizedDominantRsrpValues),
          rsrq: average(gridAnalysis.optimizedDominantRsrqValues),
          color: CONDITION_COLORS.optimized,
        },
      ].filter((item) => Number.isFinite(item.rsrp) || Number.isFinite(item.rsrq));
    }

    const entries = [
      { key: "baseline", label: "Baseline", rows: conditionBuckets.baseline },
      { key: "optimized", label: "Optimized", rows: conditionBuckets.optimized },
      { key: "unknown", label: "No Difference", rows: conditionBuckets.unknown },
    ];

    return entries
      .map(({ key, label, rows }) => {
        const rsrp = summarizeMetric(rows, "rsrp");
        const rsrq = summarizeMetric(rows, "rsrq");
        return {
          key,
          condition: label,
          rsrp: rsrp.avg,
          rsrq: rsrq.avg,
          color: CONDITION_COLORS[key],
        };
      })
      .filter((item) => Number.isFinite(item.rsrp) || Number.isFinite(item.rsrq));
  }, [lteGridEnabled, gridAnalysis, conditionBuckets]);

  const deltaMetricsData = useMemo(() => {
    if (selectedCondition !== "delta") return [];

    const baselineRsrp =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.baselineDominantRsrpValues)
        : summarizeMetric(conditionBuckets.baseline, "rsrp").avg;
    const optimizedRsrp =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.optimizedDominantRsrpValues)
        : summarizeMetric(conditionBuckets.optimized, "rsrp").avg;
    const baselineRsrq =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.baselineDominantRsrqValues)
        : summarizeMetric(conditionBuckets.baseline, "rsrq").avg;
    const optimizedRsrq =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.optimizedDominantRsrqValues)
        : summarizeMetric(conditionBuckets.optimized, "rsrq").avg;

    return [
      {
        metric: "RSRP",
        baseline: baselineRsrp,
        optimized: optimizedRsrp,
        delta:
          Number.isFinite(optimizedRsrp) && Number.isFinite(baselineRsrp)
            ? optimizedRsrp - baselineRsrp
            : null,
      },
      {
        metric: "RSRQ",
        baseline: baselineRsrq,
        optimized: optimizedRsrq,
        delta:
          Number.isFinite(optimizedRsrq) && Number.isFinite(baselineRsrq)
            ? optimizedRsrq - baselineRsrq
            : null,
      },
    ];
  }, [selectedCondition, lteGridEnabled, gridAnalysis, conditionBuckets]);

  const cdfRsrpData = useMemo(() => {
    if (lteGridEnabled && gridAnalysis) {
      return buildCdfData(
        gridAnalysis.baselineDominantRsrpValues,
        gridAnalysis.optimizedDominantRsrpValues,
      );
    }
    return buildCdfData(baselineRsrpValues, optimizedRsrpValues);
  }, [lteGridEnabled, gridAnalysis, baselineRsrpValues, optimizedRsrpValues]);

  const siteSectorStats = useMemo(() => {
    const allConditionBuckets = {
      baseline: [],
      optimized: [],
      unknown: [],
    };

    normalizedRows.forEach((row) => {
      const condition = classifyRowCondition(row);
      if (condition === "baseline" || condition === "optimized" || condition === "unknown") {
        allConditionBuckets[condition].push(row);
      } else {
        allConditionBuckets.unknown.push(row);
      }
    });

    const makeSets = (rows = []) => {
      const sites = new Set();
      const sectors = new Set();

      rows.forEach((row) => {
        const siteId = String(row.siteId || "").trim();
        const sectorId = String(row.sectorId || "").trim();
        if (siteId) sites.add(siteId);
        if (sectorId) sectors.add(`${siteId || "unknown-site"}|${sectorId}`);
      });

      return { sites, sectors };
    };

    const baselineSets = makeSets(allConditionBuckets.baseline);
    const optimizedSets = makeSets(allConditionBuckets.optimized);
    const unknownSets = makeSets(allConditionBuckets.unknown);
    const allSiteSet = new Set([
      ...baselineSets.sites,
      ...optimizedSets.sites,
      ...unknownSets.sites,
    ]);
    const allSectorSet = new Set([
      ...baselineSets.sectors,
      ...optimizedSets.sectors,
      ...unknownSets.sectors,
    ]);

    return {
      totalSites: allSiteSet.size,
      baselineSites: baselineSets.sites.size,
      optimizedSites: optimizedSets.sites.size,
      unknownSites: unknownSets.sites.size,
      totalSectors: allSectorSet.size,
      baselineSectors: baselineSets.sectors.size,
      optimizedSectors: optimizedSets.sectors.size,
      unknownSectors: unknownSets.sectors.size,
    };
  }, [normalizedRows, classifyRowCondition]);

  const lteGridStats = useMemo(() => {
    if (shouldUseStoredGridAnalytics && gridAnalysis) {
      return {
        estimatedCells: gridAnalysis.estimatedCells,
        deltaComparableCells: gridAnalysis.comparableCellCount,
        baselineDominatingCells: gridAnalysis.baselineDominantCount,
        optimizedDominatingCells: gridAnalysis.optimizedDominantCount,
      };
    }

    if (!lteGridEnabled || !gridAnalysis) {
      return {
        estimatedCells: 0,
        deltaComparableCells: 0,
        baselineDominatingCells: 0,
        optimizedDominatingCells: 0,
      };
    }
    return {
      estimatedCells: gridAnalysis.estimatedCells,
      deltaComparableCells: isDeltaSiteGridMode ? gridAnalysis.comparableCellCount : 0,
      baselineDominatingCells: gridAnalysis.baselineDominantCount,
      optimizedDominatingCells: gridAnalysis.optimizedDominantCount,
    };
  }, [lteGridEnabled, gridAnalysis, isDeltaSiteGridMode, shouldUseStoredGridAnalytics]);

  const effectiveGridSizeMeters = useMemo(() => {
    if (shouldUseStoredGridAnalytics) {
      const storedSize = Number(storedGridState.gridSizeMeters);
      if (Number.isFinite(storedSize) && storedSize > 0) return storedSize;
    }
    return Number(lteGridSizeMeters) || 50;
  }, [shouldUseStoredGridAnalytics, storedGridState.gridSizeMeters, lteGridSizeMeters]);

  const gridCellsSubValue = useMemo(() => {
    if (shouldUseStoredGridAnalytics) {
      const requestedSize = Number(storedGridState.requestedGridSize);
      const sizeLabel =
        Number.isFinite(requestedSize) && requestedSize > 0
          ? `${requestedSize}m`
          : `${effectiveGridSizeMeters}m`;
      if (storedGridState.status === "computing") {
        return `Compute API running (${sizeLabel})`;
      }
      if (storedGridState.status === "fetching") {
        return `Fetching stored grid (${sizeLabel})`;
      }
      if (storedGridState.status === "ready") {
        return `Stored grid ${effectiveGridSizeMeters}m`;
      }
    }
    if (!lteGridEnabled) return "Grid disabled";
    return `Size ${effectiveGridSizeMeters}m`;
  }, [
    lteGridEnabled,
    shouldUseStoredGridAnalytics,
    storedGridState.status,
    storedGridState.requestedGridSize,
    effectiveGridSizeMeters,
  ]);

  const deltaGridStatusText = useMemo(() => {
    if (!shouldUseStoredGridAnalytics) return "";
    const requestedSize = Number(storedGridState.requestedGridSize);
    const sizeText =
      Number.isFinite(requestedSize) && requestedSize > 0
        ? `${requestedSize}m`
        : `${effectiveGridSizeMeters}m`;
    const pid = Number(projectId);

    if (storedGridState.status === "computing") {
      return `Compute POST running: projectId=${pid}, gridSize=${sizeText}`;
    }
    if (storedGridState.status === "fetching") {
      return `Fetch GET running: projectId=${pid}, gridSize=${sizeText}`;
    }
    if (storedGridState.status === "ready") {
      const storedCount = Number.isFinite(Number(storedGridState.totalGridsWithData))
        ? Number(storedGridState.totalGridsWithData)
        : Array.isArray(storedGridState.grids)
          ? storedGridState.grids.length
          : 0;
      return `Ready: projectId=${pid}, gridSize=${effectiveGridSizeMeters}m, storedGrids=${storedCount}`;
    }
    if (storedGridState.status === "error") {
      return `Failed: projectId=${pid}, gridSize=${sizeText}`;
    }
    return `Pending: projectId=${pid}, gridSize=${sizeText}`;
  }, [
    shouldUseStoredGridAnalytics,
    storedGridState.status,
    storedGridState.requestedGridSize,
    effectiveGridSizeMeters,
    projectId,
    storedGridState.totalGridsWithData,
    storedGridState.grids,
  ]);

  const deltaThresholdRanges = useMemo(
    () => normalizeThresholdRanges(thresholds?.delta),
    [thresholds],
  );

  const readGridDiffMetric = useMemo(
    () => (grid = {}) => {
      const diff = grid?.difference || {};
      if (selectedMetricLower === "rsrq") {
        return toFiniteNumber(
          diff?.[`diff_${normalizedStoredMetricMode}_rsrq`] ??
            (normalizedStoredMetricMode !== "avg" ? diff?.diff_avg_rsrq : null),
        );
      }
      if (selectedMetricLower === "sinr" || selectedMetricLower === "snr") {
        return toFiniteNumber(
          diff?.[`diff_${normalizedStoredMetricMode}_sinr`] ??
            (normalizedStoredMetricMode !== "avg" ? diff?.diff_avg_sinr : null),
        );
      }
      return toFiniteNumber(
        diff?.[`diff_${normalizedStoredMetricMode}_rsrp`] ??
          (normalizedStoredMetricMode !== "avg" ? diff?.diff_avg_rsrp : null),
      );
    },
    [selectedMetricLower, normalizedStoredMetricMode],
  );

  const storedGridMetricSummary = useMemo(() => {
    const rows = Array.isArray(storedGridState.grids) ? storedGridState.grids : [];
    if (rows.length === 0) {
      return {
        baselineAvg: null,
        optimizedAvg: null,
        baselineValues: [],
        optimizedValues: [],
        deltaValues: [],
        rangeRows: [],
        totalDeltaGrids: 0,
        upgradedGrids: 0,
        poorGrids: 0,
        noChangeGrids: 0,
      };
    }

    const baselineValues = rows
      .map((row) =>
        readMetricFromGridMetrics(
          row?.baseline || {},
          selectedMetricLower,
          normalizedStoredMetricMode,
        ),
      )
      .filter(Number.isFinite);
    const optimizedValues = rows
      .map((row) =>
        readMetricFromGridMetrics(
          row?.optimized || {},
          selectedMetricLower,
          normalizedStoredMetricMode,
        ),
      )
      .filter(Number.isFinite);
    const deltaValues = rows.map((row) => readGridDiffMetric(row)).filter(Number.isFinite);

    const fallbackRanges = [
      { index: 0, min: -1e9, max: 0, color: "#dc2626", label: "Poor" },
      { index: 1, min: 0, max: 1e9, color: "#16a34a", label: "Better" },
    ];
    const activeRanges = deltaThresholdRanges.length > 0 ? deltaThresholdRanges : fallbackRanges;
    const rangeRows = activeRanges.map((range) => ({
      key: `${range.index}-${range.label}`,
      label: range.label,
      color: range.color,
      count: 0,
    }));

    let upgradedGrids = 0;
    let poorGrids = 0;
    let noChangeGrids = 0;

    rows.forEach((row) => {
      const deltaValue = readGridDiffMetric(row);
      if (!Number.isFinite(deltaValue)) return;
      const matchedRange = matchThresholdRange(deltaValue, activeRanges);

      const rangeIndex = matchedRange?.index;
      if (Number.isFinite(rangeIndex) && rangeRows[rangeIndex]) {
        rangeRows[rangeIndex].count += 1;
      }

      if (deltaValue > 0) {
        upgradedGrids += 1;
      } else if (deltaValue < 0) {
        poorGrids += 1;
      } else {
        noChangeGrids += 1;
      }
    });

    const totalDeltaGrids = rangeRows.reduce(
      (sum, row) => sum + Number(row?.count || 0),
      0,
    );
    const rangeRowsWithPercent = rangeRows.map((row) => ({
      ...row,
      percentage:
        totalDeltaGrids > 0 ? (Number(row.count || 0) / totalDeltaGrids) * 100 : 0,
    }));

    const averageValues = (values = []) =>
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;

    return {
      baselineAvg: averageValues(baselineValues),
      optimizedAvg: averageValues(optimizedValues),
      baselineValues,
      optimizedValues,
      deltaValues,
      rangeRows: rangeRowsWithPercent,
      totalDeltaGrids,
      upgradedGrids,
      poorGrids,
      noChangeGrids,
    };
  }, [
    storedGridState.grids,
    selectedMetricLower,
    normalizedStoredMetricMode,
    deltaThresholdRanges,
    readGridDiffMetric,
  ]);

  const rsrpThresholdRanges = useMemo(() => {
    const normalized = normalizeThresholdRanges(thresholds?.rsrp);
    if (normalized.length > 0) return normalized;
    return [
      { index: 0, min: -1e9, max: -110, color: "#ef4444", label: "Very Poor" },
      { index: 1, min: -110, max: -100, color: "#f97316", label: "Poor" },
      { index: 2, min: -100, max: -90, color: "#f59e0b", label: "Fair" },
      { index: 3, min: -90, max: -80, color: "#22c55e", label: "Good" },
      { index: 4, min: -80, max: 1e9, color: "#16a34a", label: "Excellent" },
    ];
  }, [thresholds]);

  const poorGridRsrpHistogram = useMemo(() => {
    const rows = Array.isArray(storedGridState.grids) ? storedGridState.grids : [];
    if (rows.length === 0 || rsrpThresholdRanges.length === 0) {
      return {
        rows: [],
        poorGridCount: 0,
        baselineSampleCount: 0,
        optimizedSampleCount: 0,
      };
    }

    const fallbackDeltaRanges = [
      { index: 0, min: -1e9, max: 0, color: "#dc2626", label: "Poor" },
      { index: 1, min: 0, max: 1e9, color: "#16a34a", label: "Better" },
    ];
    const activeDeltaRanges =
      Array.isArray(deltaThresholdRanges) && deltaThresholdRanges.length > 0
        ? deltaThresholdRanges
        : fallbackDeltaRanges;

    const counterByIndex = new Map(
      rsrpThresholdRanges.map((range) => [
        range.index,
        { baselineCount: 0, optimizedCount: 0 },
      ]),
    );

    let poorGridCount = 0;
    let baselineSampleCount = 0;
    let optimizedSampleCount = 0;

    rows.forEach((grid) => {
      const deltaValue = readGridDiffMetric(grid);
      if (!Number.isFinite(deltaValue)) return;
      const deltaMatchedRange = matchThresholdRange(deltaValue, activeDeltaRanges);
      const quality = classifyDeltaQuality(deltaMatchedRange?.label, deltaValue);
      if (quality !== "poor") return;

      poorGridCount += 1;

      const baselineRsrp = readMetricFromGridMetrics(
        grid?.baseline || {},
        "rsrp",
        normalizedStoredMetricMode,
      );
      const optimizedRsrp = readMetricFromGridMetrics(
        grid?.optimized || {},
        "rsrp",
        normalizedStoredMetricMode,
      );

      const baselineRange = matchThresholdRange(baselineRsrp, rsrpThresholdRanges);
      if (baselineRange && counterByIndex.has(baselineRange.index)) {
        counterByIndex.get(baselineRange.index).baselineCount += 1;
        baselineSampleCount += 1;
      }

      const optimizedRange = matchThresholdRange(optimizedRsrp, rsrpThresholdRanges);
      if (optimizedRange && counterByIndex.has(optimizedRange.index)) {
        counterByIndex.get(optimizedRange.index).optimizedCount += 1;
        optimizedSampleCount += 1;
      }
    });

    return {
      rows: rsrpThresholdRanges.map((range) => {
        const counts = counterByIndex.get(range.index) || {
          baselineCount: 0,
          optimizedCount: 0,
        };
        return {
          key: `${range.index}-${range.label}`,
          label: range.label,
          rangeLabel: formatThresholdRangeLabel(range.min, range.max),
          thresholdColor: range.color,
          baselineCount: counts.baselineCount,
          optimizedCount: counts.optimizedCount,
        };
      }),
      poorGridCount,
      baselineSampleCount,
      optimizedSampleCount,
    };
  }, [
    storedGridState.grids,
    rsrpThresholdRanges,
    deltaThresholdRanges,
    readGridDiffMetric,
    normalizedStoredMetricMode,
  ]);

  const sectorChangeSummary = useMemo(() => {
    if (!Array.isArray(normalizedSectorRows) || normalizedSectorRows.length === 0) {
      return {
        changedCount: 0,
        improvedCount: 0,
        worsenedCount: 0,
        topImproved: [],
        topWorsened: [],
      };
    }

    const sectorMap = new Map();
    normalizedSectorRows.forEach((row) => {
      const siteId = String(row.siteId || "").trim();
      const sectorId = String(row.sectorId || "").trim();
      const condition = normalizeCondition(row.rawCondition);
      if (!siteId || !sectorId) return;
      if (condition !== "baseline" && condition !== "optimized") return;

      const key = `${siteId}|${sectorId}`;
      if (!sectorMap.has(key)) {
        sectorMap.set(key, {
          siteId,
          sectorId,
          baselineValues: [],
          optimizedValues: [],
        });
      }
      const bucket = sectorMap.get(key);
      if (Number.isFinite(row.metricValue)) {
        if (condition === "baseline") bucket.baselineValues.push(row.metricValue);
        if (condition === "optimized") bucket.optimizedValues.push(row.metricValue);
      }
    });

    const averageValues = (values = []) =>
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;

    const changedRows = Array.from(sectorMap.values())
      .map((entry) => {
        const baselineAvg = averageValues(entry.baselineValues);
        const optimizedAvg = averageValues(entry.optimizedValues);
        if (!Number.isFinite(baselineAvg) || !Number.isFinite(optimizedAvg)) return null;
        const delta = optimizedAvg - baselineAvg;
        return {
          ...entry,
          baselineAvg,
          optimizedAvg,
          delta,
        };
      })
      .filter(Boolean)
      .filter((entry) => Math.abs(Number(entry.delta || 0)) > 1e-9);

    const improvedRows = changedRows
      .filter((entry) => entry.delta > 0)
      .sort((a, b) => b.delta - a.delta);
    const worsenedRows = changedRows
      .filter((entry) => entry.delta < 0)
      .sort((a, b) => a.delta - b.delta);

    return {
      changedCount: changedRows.length,
      improvedCount: improvedRows.length,
      worsenedCount: worsenedRows.length,
      topImproved: improvedRows.slice(0, 8),
      topWorsened: worsenedRows.slice(0, 8),
    };
  }, [normalizedSectorRows]);

  const coverageProjectSummary = useMemo(
    () => coverageSummaryState?.data || null,
    [coverageSummaryState?.data],
  );

  const sectorChangeCount = Number.isFinite(
    Number(coverageProjectSummary?.changedRowCount),
  )
    ? Number(coverageProjectSummary?.changedRowCount)
    : sectorChangeSummary.changedCount;

  const sectorChangeSummaryRows = useMemo(() => {
    const rows = Array.isArray(coverageProjectSummary?.changedSectors)
      ? coverageProjectSummary.changedSectors
      : [];
    if (rows.length > 0) return rows.slice(0, 80);

    const fallbackRows = [];
    sectorChangeSummary.topImproved.forEach((row) => {
      fallbackRows.push({
        site: row.siteId,
        sector: row.sectorId,
        cell_id: "",
        changed_fields: [`metric +${toMetricDisplay(row.delta)}`],
      });
    });
    sectorChangeSummary.topWorsened.forEach((row) => {
      fallbackRows.push({
        site: row.siteId,
        sector: row.sectorId,
        cell_id: "",
        changed_fields: [`metric ${toMetricDisplay(row.delta)}`],
      });
    });
    return fallbackRows.slice(0, 80);
  }, [coverageProjectSummary?.changedSectors, sectorChangeSummary]);

  const fallbackBaseline = summarizeMetric(conditionBuckets.baseline, "metricValue").avg;
  const fallbackOptimized = summarizeMetric(conditionBuckets.optimized, "metricValue").avg;
  const coverageBaselineAvg =
    shouldUseStoredGridAnalytics &&
    !(Array.isArray(storedGridState.grids) && storedGridState.grids.length > 0)
      ? null
      : Number.isFinite(storedGridMetricSummary.baselineAvg)
        ? storedGridMetricSummary.baselineAvg
        : fallbackBaseline;
  const coverageOptimizedAvg =
    shouldUseStoredGridAnalytics &&
    !(Array.isArray(storedGridState.grids) && storedGridState.grids.length > 0)
      ? null
      : Number.isFinite(storedGridMetricSummary.optimizedAvg)
        ? storedGridMetricSummary.optimizedAvg
        : fallbackOptimized;

  const gridBaselineOptimizedCdfData = useMemo(() => {
    const storedCdf = buildCdfData(
      storedGridMetricSummary.baselineValues,
      storedGridMetricSummary.optimizedValues,
      70,
    );
    if (storedCdf.length > 0) return storedCdf;
    return cdfRsrpData;
  }, [
    storedGridMetricSummary.baselineValues,
    storedGridMetricSummary.optimizedValues,
    cdfRsrpData,
  ]);

  const hasStoredGrids = Array.isArray(storedGridState.grids) && storedGridState.grids.length > 0;

  if (!normalizedRows.length && !hasStoredGrids) {
    return (
      <EmptyState
        icon={BarChart3}
        message="No data available for coverage optimisation analysis"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          icon={BarChart3}
          label="Avg Baseline"
          value={toMetricDisplay(coverageBaselineAvg)}
          subValue={selectedMetricLabel}
          color="red"
        />
        <StatCard
          icon={BarChart3}
          label="Avg Optimized"
          value={toMetricDisplay(coverageOptimizedAvg)}
          subValue={selectedMetricLabel}
          color="green"
        />
        <button
          type="button"
          onClick={() => setShowSectorSummary((prev) => !prev)}
          className="text-left"
        >
          <StatCard
            icon={BarChart3}
            label="No Of Sector Change"
            value={sectorChangeCount}
            subValue="Compared: site_prediction vs site_prediction_optimized"
            color="yellow"
          />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={Grid3X3}
          label="Upgraded Grids"
          value={storedGridMetricSummary.upgradedGrids}
          subValue="Delta > 0"
          color="green"
        />
        <button
          type="button"
          onClick={() => setShowPoorGridHistogram((prev) => !prev)}
          className="text-left"
        >
          <StatCard
            icon={Grid3X3}
            label="Poor Grids"
            value={storedGridMetricSummary.poorGrids}
            subValue="Delta < 0 (click for RSRP histogram)"
            color="orange"
          />
        </button>
        <StatCard
          icon={Grid3X3}
          label="No Change Grids"
          value={storedGridMetricSummary.noChangeGrids}
          subValue="Delta = 0"
          color="blue"
        />
      </div>

      {showPoorGridHistogram ? (
        <ChartContainer
          title="Poor Grid RSRP Histogram"
          subtitle="Baseline (green) vs Optimized (red) by RSRP threshold ranges"
          icon={BarChart3}
        >
          {poorGridRsrpHistogram.rows.length === 0 ? (
            <EmptyState message="No poor-grid RSRP histogram data available" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={poorGridRsrpHistogram.rows} margin={CHART_CONFIG.margin}>
                  <CartesianGrid {...CHART_CONFIG.grid} />
                  <XAxis
                    dataKey="rangeLabel"
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    angle={-40}
                    textAnchor="end"
                    tickMargin={12}
                    height={72}
                  />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      ...CHART_CONFIG.tooltip,
                      backgroundColor: "#020617",
                      border: "1px solid #334155",
                    }}
                    labelStyle={{ color: "#FFFFFF" }}
                    itemStyle={{ color: "#FFFFFF" }}
                    formatter={(value, name) => [
                      Number(value) || 0,
                      String(name || ""),
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={{ color: "#E2E8F0", fontSize: 12 }}
                  />
                  <Bar
                    dataKey="baselineCount"
                    name="Baseline"
                    fill="#22c55e"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="optimizedCount"
                    name="Optimized"
                    fill="#ef4444"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-[11px] text-slate-300">
                Poor grids: {poorGridRsrpHistogram.poorGridCount} | Baseline samples:{" "}
                {poorGridRsrpHistogram.baselineSampleCount} | Optimized samples:{" "}
                {poorGridRsrpHistogram.optimizedSampleCount}
              </div>
            </>
          )}
        </ChartContainer>
      ) : null}

      {/* {shouldUseStoredGridAnalytics ? (
        <div
          className={`text-xs rounded-md px-3 py-2 border ${
            storedGridState.status === "error"
              ? "text-amber-300/90 bg-amber-900/20 border-amber-700/40"
              : storedGridState.status === "ready"
                ? "text-emerald-300/90 bg-emerald-900/20 border-emerald-700/40"
                : "text-sky-300/90 bg-sky-900/20 border-sky-700/40"
          }`}
        >
          {deltaGridStatusText}
          {storedGridState.error ? ` | ${storedGridState.error}` : ""}
        </div>
      ) : null} */}

      {showSectorSummary ? (
        <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 space-y-3">
          <div className="text-sm font-semibold text-slate-100">
            Sector Change Summary
          </div>
          <div className="text-xs text-slate-400">
            Baseline Rows: {coverageProjectSummary?.baselineTotalRows ?? "N/A"} | Optimized
            Rows: {coverageProjectSummary?.optimizedTotalRows ?? "N/A"} | Matched:{" "}
            {coverageProjectSummary?.matchedOptimizedRows ?? "N/A"} | Changed:{" "}
            {sectorChangeCount}
          </div>
          <div className="text-xs text-slate-400">
            {coverageSummaryState.status === "error"
              ? coverageSummaryState.error
              : coverageSummaryState.message || ""}
          </div>
          <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
            {/* <div className="rounded-md bg-slate-800/60 p-2 border border-slate-700/50">
              <div className="text-xs font-semibold text-sky-300 mb-2">Top Changed Fields</div>
              {(coverageProjectSummary?.fieldChanges || []).length === 0 ? (
                <div className="text-xs text-slate-400">No changed fields found.</div>
              ) : (
                <div className="space-y-1">
                  {(coverageProjectSummary?.fieldChanges || []).slice(0, 12).map((row, idx) => (
                    <div
                      key={`field-change-${idx}`}
                      className="text-xs text-slate-200 flex items-center justify-between gap-2"
                    >
                      <span>{row?.field || "unknown_field"}</span>
                      <span className="text-sky-300">{Number(row?.count) || 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div> */}
            <div className="rounded-md bg-slate-800/60 p-2 border border-slate-700/50">
              <div className="text-xs font-semibold text-amber-300 mb-2">Changed Sector Rows</div>
              {sectorChangeSummaryRows.length === 0 ? (
                <div className="text-xs text-slate-400">No changed sector rows found.</div>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {sectorChangeSummaryRows.map((row, idx) => {
                    const changedFields = Array.isArray(row?.changed_fields)
                      ? row.changed_fields
                      : [];
                    return (
                      <div
                        key={`changed-sector-${idx}`}
                        className="text-xs text-slate-200 rounded bg-slate-900/50 border border-slate-700/40 px-2 py-1"
                      >
                        <div className="font-medium text-slate-100">
                          {(row?.site || "NA")} | {(row?.sector || "NA")} |{" "}
                          {(row?.cell_id || "NA")}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {changedFields.length > 0
                            ? changedFields.join(", ")
                            : "Changed fields not available"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      

      <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
        <ChartContainer
          title="Delta Range Distribution"
          subtitle="Fetched grid/log comparison by delta threshold ranges"
          icon={BarChart3}
        >
          {storedGridMetricSummary.rangeRows.length === 0 ? (
            <EmptyState message="No stored grid threshold distribution available" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={storedGridMetricSummary.rangeRows} margin={CHART_CONFIG.margin}>
                <CartesianGrid {...CHART_CONFIG.grid} />
                <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    ...CHART_CONFIG.tooltip,
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                  }}
                  labelStyle={{ color: "#FFFFFF" }}
                  itemStyle={{ color: "#FFFFFF" }}
                  formatter={(value, _name, item) => {
                    const count = Number(value) || 0;
                    const percentage = Number(item?.payload?.percentage);
                    const percentText = Number.isFinite(percentage)
                      ? `${percentage.toFixed(1)}%`
                      : "0.0%";
                    return [`${count} (${percentText})`, "Grids"];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ color: "#FFFFFF", fontSize: 12 }}
                  formatter={(value) => (
                    <span style={{ color: "#FFFFFF" }}>{value}</span>
                  )}
                />
                <Bar dataKey="count" name="Grids" radius={[8, 8, 0, 0]}>
                  {storedGridMetricSummary.rangeRows.map((entry) => (
                    <Cell key={`grid-${entry.key}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {storedGridMetricSummary.rangeRows.length > 0 ? (
            <div className="mt-2 text-[11px] text-slate-300 space-y-1">
              {storedGridMetricSummary.rangeRows.map((entry) => (
                <div
                  key={`range-share-${entry.key}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate" style={{ color: entry.color }}>
                    {entry.label}
                  </span>
                  <span className="tabular-nums text-slate-200">
                    {entry.count} ({Number(entry.percentage || 0).toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </ChartContainer>

        <ChartContainer
          title="Grid CDF"
          subtitle="Cumulative distribution of baseline vs optimized grid values"
          icon={BarChart3}
        >
          {gridBaselineOptimizedCdfData.length === 0 ? (
            <EmptyState message="No baseline/optimized grid values available for CDF" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={gridBaselineOptimizedCdfData} margin={CHART_CONFIG.margin}>
                <CartesianGrid {...CHART_CONFIG.grid} />
                <XAxis
                  dataKey="value"
                  reversed={true}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  tickFormatter={(v) => toMetricDisplay(toFiniteNumber(v))}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  label={{ value: "CDF %", angle: -90, position: "insideLeft", fill: "#9CA3AF" }}
                />
                <Tooltip
                  contentStyle={{
                    ...CHART_CONFIG.tooltip,
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                  }}
                  labelStyle={{ color: "#FFFFFF" }}
                  itemStyle={{ color: "#FFFFFF" }}
                  formatter={(value, name, item) => {
                    const dataKey = String(item?.dataKey || "").toLowerCase();
                    const normalizedName = String(name || "").toLowerCase();
                    const isOptimized =
                      dataKey === "optimized" || normalizedName.includes("optimized");
                    return [
                      `${toMetricDisplay(value)}%`,
                      isOptimized ? "Optimized CDF" : "Baseline CDF",
                    ];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ color: "#E2E8F0", fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  name="Baseline CDF"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="optimized"
                  name="Optimized CDF"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>
    </div>
  );
};

export default ConditionLogsTab;
