import React, { useMemo, useState, useCallback, useEffect } from "react";
import { Globe, Settings, BarChart3, TrendingUp, Hash } from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { buildCdfRows } from "@/utils/analyticsHelpers";
import {
  normalizeProviderName,
  normalizeTechName,
  normalizeBandName,
  getProviderColor as getProviderColorFromUtils,
} from "@/utils/colorUtils";

const safeNumber = (value) => {
  if (value == null || value === "") return null;
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
};

const safeStringValue = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (
    lower === "unknown" ||
    lower === "null" ||
    lower === "undefined" ||
    lower === "na" ||
    lower === "n/a" ||
    normalized === "-1"
  ) {
    return null;
  }
  return normalized;
};

const extractNodeId = (loc) =>
  safeStringValue(
    loc.nodeb_id ??
      loc.nodebId ??
      loc.nodeb ??
      loc.NodeB ??
      loc.NodeBId ??
      loc.NodeB_ID ??
      loc.eNodeB ??
      loc.enodeb ??
      loc.enodeb_id ??
      loc.gNodeB ??
      loc.gnodeb ??
      loc.gnodeb_id
  );

const extractPci = (loc) => {
  const pciValue = safeStringValue(
    loc.pci ??
      loc.PCI ??
      loc.physical_cell_id ??
      loc.physicalCellId ??
      loc.pci_or_psi ??
      loc.primaryPci ??
      loc.neighbourPci ??
      loc.neighbour_pci
  );
  if (!pciValue) return null;

  const numericPci = Number(pciValue);
  if (Number.isFinite(numericPci)) {
    if (numericPci < 0 || numericPci > 503) return null;
    return String(Math.floor(numericPci));
  }
  return pciValue;
};

const extractCellId = (loc) =>
  safeStringValue(
    loc.cell_id ??
      loc.cellId ??
      loc.cellid ??
      loc.ci ??
      loc.CI ??
      loc.CellId ??
      loc.cell
  );

const buildCountStats = (count) => ({
  avg: count,
  median: count,
  mode: count,
  min: count,
  max: count,
  count,
});

const incrementFrequency = (target, key) => {
  if (!key) return;
  target[key] = (target[key] || 0) + 1;
};

const getMostFrequentValue = (frequencyMap = {}) => {
  const entries = Object.entries(frequencyMap);
  if (!entries.length) return { value: "N/A", count: 0 };

  return entries
    .sort((a, b) => {
      if (b[1] === a[1]) return String(a[0]).localeCompare(String(b[0]));
      return b[1] - a[1];
    })
    .map(([value, count]) => ({ value, count }))[0];
};

const resolveOperatorName = (loc) => {
  const rawProvider = String(loc.provider || loc.operator || "").trim();
  if (!rawProvider) return "Unknown";

  const provider = normalizeProviderName(rawProvider) || rawProvider;
  if (!provider || provider === "Unknown") return "Unknown";

  const rawTech = loc.technology || loc.network || loc.networkType || loc.tech || "";
  const normalizedTech = normalizeTechName(rawTech);

  const providerToken = rawProvider.toUpperCase();
  const providerTaggedTech = providerToken.includes("5G")
    ? "5G"
    : providerToken.includes("4G") || providerToken.includes("LTE")
      ? "4G"
      : null;

  const techSuffix =
    providerTaggedTech || (normalizedTech !== "Unknown" ? normalizedTech : null);

  return techSuffix ? `${provider} ${techSuffix}` : provider;
};

const calculateMode = (values) => {
  if (!values.length) return null;

  const frequencyMap = {};
  values.forEach((v) => {
    const rounded = Math.round(v * 10) / 10;
    frequencyMap[rounded] = (frequencyMap[rounded] || 0) + 1;
  });

  let maxFreq = 0;
  let mode = null;

  Object.entries(frequencyMap).forEach(([value, freq]) => {
    if (freq > maxFreq) {
      maxFreq = freq;
      mode = parseFloat(value);
    }
  });

  if (maxFreq === 1) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? parseFloat(sorted[mid].toFixed(2))
      : parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }

  return mode;
};

const calculateStats = (values) => {
  const valid = values.filter((v) => v !== null);
  if (valid.length === 0) {
    return {
      avg: null,
      median: null,
      mode: null,
      min: null,
      max: null,
      count: 0,
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avg = sum / valid.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mode = calculateMode(valid);

  return {
    avg: parseFloat(avg.toFixed(2)),
    median: parseFloat(median.toFixed(2)),
    mode,
    min: parseFloat(Math.min(...valid).toFixed(2)),
    max: parseFloat(Math.max(...valid).toFixed(2)),
    count: valid.length,
  };
};

const AVAILABLE_METRICS = {
  rsrp: {
    key: "rsrp",
    label: "RSRP",
    unit: "dBm",
    color: "#3B82F6",
    reversed: true,
    higherBetter: true,
  },
  rsrq: {
    key: "rsrq",
    label: "RSRQ",
    unit: "dB",
    color: "#8B5CF6",
    reversed: true,
    higherBetter: true,
  },
  sinr: {
    key: "sinr",
    label: "SINR",
    unit: "dB",
    color: "#22C55E",
    higherBetter: true,
  },
  mos: {
    key: "mos",
    label: "MOS",
    unit: "",
    color: "#F59E0B",
    higherBetter: true,
  },
  dl_tpt: {
    key: "dl_tpt",
    label: "Download",
    unit: "Mbps",
    color: "#06B6D4",
    higherBetter: true,
  },
  ul_tpt: {
    key: "ul_tpt",
    label: "Upload",
    unit: "Mbps",
    color: "#F97316",
    higherBetter: true,
  },
  latency: {
    key: "latency",
    label: "Latency",
    unit: "ms",
    color: "#EF4444",
    higherBetter: false,
  },
  jitter: {
    key: "jitter",
    label: "Jitter",
    unit: "ms",
    color: "#EC4899",
    higherBetter: false,
  },
  node: {
    key: "node",
    label: "Node ID",
    unit: "Count",
    color: "#14B8A6",
    higherBetter: true,
    aggregation: "count",
  },
  pci: {
    key: "pci",
    label: "PCI ID",
    unit: "Count",
    color: "#6366F1",
    higherBetter: true,
    aggregation: "count",
  },
  cell: {
    key: "cell",
    label: "Cell ID / CI",
    unit: "Count",
    color: "#A855F7",
    higherBetter: true,
    aggregation: "count",
  },
};

const STAT_MODES = {
  avg: {
    key: "avg",
    label: "Mean",
    shortLabel: "Avg",
    description: "Average of all samples",
    icon: BarChart3,
    color: "#3B82F6",
  },
  median: {
    key: "median",
    label: "Median",
    shortLabel: "Med",
    description: "Middle value of all samples",
    icon: TrendingUp,
    color: "#8B5CF6",
  },
  mode: {
    key: "mode",
    label: "Mode",
    shortLabel: "Mode",
    description: "Most frequent value",
    icon: Hash,
    color: "#22C55E",
  },
};

const DEFAULT_METRICS = ["rsrp"];

const getProviderColor = (provider) => getProviderColorFromUtils(provider);

const TECHNOLOGY_SORT_ORDER = {
  "5G": 1,
  "4G": 2,
  "3G": 3,
  "2G": 4,
};

const getTechnologyRank = (tech) => TECHNOLOGY_SORT_ORDER[tech] || 99;

const normalizeBandForChart = (band) => {
  const rawBand = String(band ?? "").trim();
  if (!rawBand || rawBand === "-1" || rawBand.toLowerCase() === "unknown") {
    return "Unknown";
  }
  return normalizeBandName(rawBand);
};

const isCountOnlyMetric = (metricKey) =>
  AVAILABLE_METRICS[metricKey]?.aggregation === "count";

const getMetricValue = (operator, metricKey, statMode) => {
  const stats = operator?.[metricKey];
  if (!stats) return null;
  if (isCountOnlyMetric(metricKey)) return stats.count;
  return stats[statMode];
};

const formatMetricValue = (value, metricKey) => {
  if (typeof value !== "number") return "N/A";
  if (isCountOnlyMetric(metricKey)) return String(Math.round(value));
  return value.toFixed(1);
};

export const OperatorComparisonChart = React.forwardRef(
  (
    {
      locations,
      defaultMetrics = DEFAULT_METRICS,
      showRadar = true,
      showTable = true,
      defaultStatMode = "avg",
      separateMetricCharts = false,
      showAllMetrics = false,
      individualStatMode = false,
      wrapMetricCharts = false,
      highContrastText = false,
      showCdf = true,
    },
    ref
  ) => {
    const [selectedMetrics, setSelectedMetrics] = useState(defaultMetrics);
    const [showSettings, setShowSettings] = useState(false);
    const [viewMode, setViewMode] = useState("bar");
    const [statMode, setStatMode] = useState(defaultStatMode);
    const [selectedTechnology, setSelectedTechnology] = useState("All");
    const [metricStatModes, setMetricStatModes] = useState(() =>
      Object.keys(AVAILABLE_METRICS).reduce((acc, metricKey) => {
        if (!isCountOnlyMetric(metricKey)) acc[metricKey] = defaultStatMode;
        return acc;
      }, {}),
    );

    useEffect(() => {
      if (!showAllMetrics) return;
      setSelectedMetrics(Object.keys(AVAILABLE_METRICS));
      setShowSettings(false);
    }, [showAllMetrics]);

    const resolveStatMode = useCallback(
      (metricKey) => {
        if (isCountOnlyMetric(metricKey)) return "count";
        if (individualStatMode) {
          return metricStatModes[metricKey] || defaultStatMode;
        }
        return statMode;
      },
      [defaultStatMode, individualStatMode, metricStatModes, statMode],
    );

    const viewModes = useMemo(() => {
      const modes = ["bar"];
     
      if (showTable) modes.push("table");
      return modes;
    }, [showRadar, showTable]);

    const axisTickColor = highContrastText ? "#FFFFFF" : "#9CA3AF";
    const primaryTextClass = highContrastText ? "text-white" : "text-slate-300";
    const secondaryTextClass = highContrastText
      ? "text-white/80"
      : "text-slate-400";
    const tertiaryTextClass = highContrastText ? "text-white/70" : "text-slate-500";
    const mutedButtonTextClass = highContrastText ? "text-white" : "text-slate-300";
    const tableHeaderTextClass = highContrastText ? "text-white" : "text-slate-400";

    const availableTechnologies = useMemo(() => {
      const techSet = new Set();
      (locations || []).forEach((loc) => {
        const tech = normalizeTechName(
          loc.technology || loc.network || loc.networkType || loc.tech || "",
          loc.band ?? loc.Band
        );
        if (tech && tech !== "Unknown") techSet.add(tech);
      });

      const ordered = [...techSet];
      ordered.sort((a, b) => {
        const pa = getTechnologyRank(a);
        const pb = getTechnologyRank(b);
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
      });
      return ordered;
    }, [locations]);

    useEffect(() => {
      if (selectedTechnology === "All") return;
      if (!availableTechnologies.includes(selectedTechnology)) {
        setSelectedTechnology("All");
      }
    }, [availableTechnologies, selectedTechnology]);

    const technologyFilteredLocations = useMemo(() => {
      if (selectedTechnology === "All") return locations || [];
      return (locations || []).filter((loc) => {
        const tech = normalizeTechName(
          loc.technology || loc.network || loc.networkType || loc.tech || "",
          loc.band ?? loc.Band
        );
        return tech === selectedTechnology;
      });
    }, [locations, selectedTechnology]);

    const isGridCellDataset = useMemo(
      () => (technologyFilteredLocations || []).some((loc) => Boolean(loc?.is_grid_cell)),
      [technologyFilteredLocations],
    );
    const isGridPciMetric = useCallback(
      (metricKey) => metricKey === "pci" && isGridCellDataset,
      [isGridCellDataset],
    );
    const getDisplayMetricValue = useCallback(
      (operator, metricKey, currentMode) => {
        if (isGridPciMetric(metricKey)) {
          const rawTopValue = operator?.[metricKey]?.topValue;
          const numericTopValue = Number(rawTopValue);
          return Number.isFinite(numericTopValue) ? numericTopValue : null;
        }
        return getMetricValue(operator, metricKey, currentMode);
      },
      [isGridPciMetric],
    );
    const formatDisplayMetricValue = useCallback(
      (value, metricKey) => {
        if (isGridPciMetric(metricKey)) {
          return value == null ? "N/A" : String(Math.round(value));
        }
        return formatMetricValue(value, metricKey);
      },
      [isGridPciMetric],
    );

    const operatorData = useMemo(() => {
      if (!technologyFilteredLocations?.length) return [];

      const operatorStats = {};

      technologyFilteredLocations.forEach((loc) => {
        const provider = resolveOperatorName(loc);

        if (provider === "Unknown") return;

        if (!operatorStats[provider]) {
          operatorStats[provider] = {
            name: provider,
            color: getProviderColor(provider),
            samples: 0,
            rsrp: [],
            rsrq: [],
            sinr: [],
            mos: [],
            dl_tpt: [],
            ul_tpt: [],
            latency: [],
            jitter: [],
            technologies: {},
            bands: {},
            nodeIds: new Set(),
            pcis: new Set(),
            cellIds: new Set(),
            nodeFrequency: {},
            pciFrequency: {},
            cellFrequency: {},
          };
        }

        operatorStats[provider].samples++;

        const rsrp = safeNumber(loc.rsrp);
        const rsrq = safeNumber(loc.rsrq);
        const sinr = safeNumber(loc.sinr);
        const mos = safeNumber(loc.mos);
        const dl_tpt = safeNumber(loc.dl_tpt);
        const ul_tpt = safeNumber(loc.ul_tpt);
        const latency = safeNumber(loc.latency);
        const jitter = safeNumber(loc.jitter);

        if (rsrp !== null) operatorStats[provider].rsrp.push(rsrp);
        if (rsrq !== null) operatorStats[provider].rsrq.push(rsrq);
        if (sinr !== null) operatorStats[provider].sinr.push(sinr);
        if (mos !== null) operatorStats[provider].mos.push(mos);
        if (dl_tpt !== null) operatorStats[provider].dl_tpt.push(dl_tpt);
        if (ul_tpt !== null) operatorStats[provider].ul_tpt.push(ul_tpt);
        if (latency !== null) operatorStats[provider].latency.push(latency);
        if (jitter !== null) operatorStats[provider].jitter.push(jitter);

        const rawTech = loc.technology || loc.network || "";
        const tech = normalizeTechName(rawTech);
        if (tech !== "Unknown") {
          operatorStats[provider].technologies[tech] =
            (operatorStats[provider].technologies[tech] || 0) + 1;
        }

        const normalizedBand = normalizeBandForChart(
          loc.band ?? loc.Band ?? loc.neighbourBand ?? loc.neighborBand,
        );
        if (normalizedBand !== "Unknown") {
          operatorStats[provider].bands[normalizedBand] =
            (operatorStats[provider].bands[normalizedBand] || 0) + 1;
        }

        const nodeId = extractNodeId(loc);
        if (nodeId) {
          operatorStats[provider].nodeIds.add(nodeId);
          incrementFrequency(operatorStats[provider].nodeFrequency, nodeId);
        }

        const pci = extractPci(loc);
        if (pci) {
          operatorStats[provider].pcis.add(pci);
          incrementFrequency(operatorStats[provider].pciFrequency, pci);
        }

        const cellId = extractCellId(loc);
        if (cellId) {
          operatorStats[provider].cellIds.add(cellId);
          incrementFrequency(operatorStats[provider].cellFrequency, cellId);
        }
      });

      return Object.values(operatorStats)
        .filter((op) => op.samples > 0)
        .map((op) => {
          const dominantNode = getMostFrequentValue(op.nodeFrequency);
          const dominantPci = getMostFrequentValue(op.pciFrequency);
          const dominantCell = getMostFrequentValue(op.cellFrequency);

          return {
            name: op.name,
            color: op.color,
            samples: op.samples,
            rsrp: calculateStats(op.rsrp),
            rsrq: calculateStats(op.rsrq),
            sinr: calculateStats(op.sinr),
            mos: calculateStats(op.mos),
            dl_tpt: calculateStats(op.dl_tpt),
            ul_tpt: calculateStats(op.ul_tpt),
            latency: calculateStats(op.latency),
            jitter: calculateStats(op.jitter),
            node: {
              ...buildCountStats(dominantNode.count),
              topValue: dominantNode.value,
              uniqueCount: op.nodeIds.size,
            },
            pci: {
              ...buildCountStats(dominantPci.count),
              topValue: dominantPci.value,
              uniqueCount: op.pcis.size,
            },
            cell: {
              ...buildCountStats(dominantCell.count),
              topValue: dominantCell.value,
              uniqueCount: op.cellIds.size,
            },
            dominantTech:
              Object.entries(op.technologies).sort((a, b) => b[1] - a[1])[0]?.[0] ||
              "N/A",
            dominantBand:
              Object.entries(op.bands).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A",
          };
        })
        .sort((a, b) => b.samples - a.samples);
    }, [technologyFilteredLocations]);

    const chartOrderedOperators = useMemo(() => {
      const resolveOperatorTech = (op) => {
        const normalizedDominant = normalizeTechName(op?.dominantTech || "");
        if (normalizedDominant && normalizedDominant !== "Unknown") {
          return normalizedDominant;
        }
        const fromName = normalizeTechName(op?.name || "");
        return fromName && fromName !== "Unknown" ? fromName : "Unknown";
      };

      return [...operatorData].sort((a, b) => {
        const techRankDiff =
          getTechnologyRank(resolveOperatorTech(a)) -
          getTechnologyRank(resolveOperatorTech(b));
        if (techRankDiff !== 0) return techRankDiff;

        const nameDiff = String(a.name).localeCompare(String(b.name));
        if (nameDiff !== 0) return nameDiff;

        return b.samples - a.samples;
      });
    }, [operatorData]);

    const barChartData = useMemo(() => {
      return chartOrderedOperators.map((op) => {
        const data = { name: op.name, samples: op.samples, color: op.color };
        selectedMetrics.forEach((metricKey) => {
          data[metricKey] = getDisplayMetricValue(op, metricKey, resolveStatMode(metricKey));
        });
        return data;
      });
    }, [chartOrderedOperators, selectedMetrics, resolveStatMode, getDisplayMetricValue]);

    const cdfChartsByTechnology = useMemo(() => {
      if (!technologyFilteredLocations?.length) return [];

      const techBuckets = {};
      technologyFilteredLocations.forEach((loc) => {
        const rsrp = safeNumber(loc.rsrp);
        if (rsrp === null) return;

        const technology = normalizeTechName(
          loc.technology || loc.network || loc.networkType || loc.tech || "",
          loc.band ?? loc.Band
        );
        if (!technology || technology === "Unknown") return;

        const operator =
          normalizeProviderName(loc.provider || loc.operator || loc.m_alpha_long || "") ||
          "Unknown";
        if (operator === "Unknown") return;

        if (!techBuckets[technology]) {
          techBuckets[technology] = {};
        }
        if (!techBuckets[technology][operator]) {
          techBuckets[technology][operator] = [];
        }
        techBuckets[technology][operator].push(rsrp);
      });

      return Object.entries(techBuckets)
        .map(([technology, providers]) => {
          const { rows, series, min, max } = buildCdfRows(providers, 80, {
            direction: "asc",
          });
          return {
            technology,
            rows,
            series: series.map((item) => ({
              ...item,
              color: getProviderColor(item.operator),
            })),
            min,
            max,
            totalSamples: Object.values(providers).reduce(
              (sum, values) => sum + values.length,
              0
            ),
          };
        })
        .filter((tech) => tech.rows.length > 0 && tech.series.length > 0)
        .sort((a, b) => {
          const orderA = getTechnologyRank(a.technology);
          const orderB = getTechnologyRank(b.technology);
          if (orderA !== orderB) return orderA - orderB;
          return a.technology.localeCompare(b.technology);
        });
    }, [technologyFilteredLocations]);

    const radarChartData = useMemo(() => {
      if (!operatorData.length) return [];

      const normalizers = {
        rsrp: (v) =>
          v !== null ? Math.max(0, Math.min(100, ((v + 140) / 60) * 100)) : 0,
        rsrq: (v) =>
          v !== null ? Math.max(0, Math.min(100, ((v + 20) / 17) * 100)) : 0,
        sinr: (v) =>
          v !== null ? Math.max(0, Math.min(100, ((v + 10) / 40) * 100)) : 0,
        mos: (v) => (v !== null ? Math.max(0, Math.min(100, (v / 5) * 100)) : 0),
        dl_tpt: (v) =>
          v !== null ? Math.max(0, Math.min(100, (v / 200) * 100)) : 0,
        ul_tpt: (v) =>
          v !== null ? Math.max(0, Math.min(100, (v / 100) * 100)) : 0,
        latency: (v) =>
          v !== null ? Math.max(0, 100 - Math.min(100, (v / 200) * 100)) : 0,
        jitter: (v) =>
          v !== null ? Math.max(0, 100 - Math.min(100, (v / 100) * 100)) : 0,
      };

      return selectedMetrics.map((metricKey) => {
        const config = AVAILABLE_METRICS[metricKey];
        const dataPoint = { metric: config.label };

        operatorData.forEach((op) => {
          const rawValue = getDisplayMetricValue(op, metricKey, resolveStatMode(metricKey));
          dataPoint[op.name] = normalizers[metricKey]?.(rawValue) || 0;
          dataPoint[`${op.name}_raw`] = rawValue;
        });

        return dataPoint;
      });
    }, [operatorData, selectedMetrics, resolveStatMode, getDisplayMetricValue]);

    const toggleMetric = useCallback((metricKey) => {
      if (showAllMetrics) return;
      setSelectedMetrics((prev) => {
        if (prev.includes(metricKey)) {
          if (prev.length === 1) return prev;
          return prev.filter((m) => m !== metricKey);
        }
        return [...prev, metricKey];
      });
    }, [showAllMetrics]);

    const getOtherStats = (stats, metricKey, currentMode) => {
      if (isCountOnlyMetric(metricKey)) return [];
      const others = Object.keys(STAT_MODES).filter((key) => key !== currentMode);
      return others
        .map((key) => ({
          key,
          label: STAT_MODES[key].shortLabel,
          value: stats?.[key],
        }))
        .filter((s) => s.value !== null && s.value !== undefined);
    };

    

    const CustomBarTooltip = ({ active, payload, label, forcedMetricKey, forcedStatMode }) => {
      if (!active || !payload?.length) return null;

      const operator = operatorData.find((op) => op.name === label);
      if (!operator) return null;

      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl min-w-[220px]">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
            <span className="font-semibold text-white">{label}</span>
            <span className={`text-[10px] ml-auto ${secondaryTextClass}`}>
              {operator.samples} samples
            </span>
          </div>

          <div
            className="text-[9px] mb-2 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
            style={{
              backgroundColor: `${STAT_MODES[statMode].color}20`,
              color: STAT_MODES[statMode].color,
            }}
          >
            {(() => {
              const Icon = STAT_MODES[statMode].icon;
              return <Icon className="w-2.5 h-2.5" />;
            })()}
            {STAT_MODES[statMode].label}
          </div>

          <div className="space-y-2">
            {payload.map((entry, idx) => {
              const metricKey = forcedMetricKey || entry.dataKey;
              const config = AVAILABLE_METRICS[metricKey];
              if (!config) return null;

              const currentMode =
                forcedStatMode || resolveStatMode(metricKey);
              const stats = operator[metricKey];
              const otherStats = getOtherStats(stats, metricKey, currentMode);
              const value = getDisplayMetricValue(operator, metricKey, currentMode);

              return (
                <div key={idx} className="text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: config.color }}
                      />
                      <span className="text-white">{config.label}</span>
                    </div>
                    <span className="text-white font-semibold">
                      {formatDisplayMetricValue(value, metricKey)}{" "}
                      {isGridPciMetric(metricKey) ? "" : config.unit}
                    </span>
                  </div>

                  {otherStats.length > 0 && (
                    <div className={`flex justify-between text-[9px] mt-0.5 ${tertiaryTextClass}`}>
                      {otherStats.map((s) => (
                        <span key={s.key}>
                          {s.label}:{" "}
                          {formatDisplayMetricValue(s.value, metricKey)}
                        </span>
                      ))}
                      <span>
                        Range:{" "}
                        {formatDisplayMetricValue(stats?.min, metricKey)} -{" "}
                        {formatDisplayMetricValue(stats?.max, metricKey)}
                      </span>
                    </div>
                  )}

                  {isCountOnlyMetric(metricKey) && (
                    <>
                      <div className="text-[12px] text-cyan-300 mt-0.5">
                        {metricKey === "pci" && isGridCellDataset
                          ? `Best PCI: ${stats?.topValue || "N/A"}`
                          : `Most Occurring: ${stats?.topValue || "N/A"}`}
                      </div>
                      {!(metricKey === "pci" && isGridCellDataset) && (
                        <div className="text-[10px] text-cyan-200 mt-0.5">
                          Unique Count: {stats?.uniqueCount ?? 0}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className={`mt-2 pt-2 border-t border-slate-700 text-[12px] ${secondaryTextClass}`}>
            <div>Tech: {operator.dominantTech}</div>
            <div>Band: {operator.dominantBand}</div>
          </div>
        </div>
      );
    };

    const CustomRadarTooltip = ({ active, payload }) => {
      if (!active || !payload?.length) return null;
      const data = payload[0]?.payload;
      if (!data) return null;

      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
          <div className="font-semibold text-white mb-1">{data.metric}</div>

          <div
            className="text-[9px] mb-2 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
            style={{
              backgroundColor: `${STAT_MODES[statMode].color}20`,
              color: STAT_MODES[statMode].color,
            }}
          >
            {(() => {
              const Icon = STAT_MODES[statMode].icon;
              return <Icon className="w-2.5 h-2.5" />;
            })()}
            {STAT_MODES[statMode].label}
          </div>

          <div className="space-y-1">
            {operatorData.map((op) => (
              <div
                key={op.name}
                className="flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: op.color }}
                  />
                  <span className={primaryTextClass}>{op.name}</span>
                </div>
                <span className="text-white font-semibold">
                  {typeof data[`${op.name}_raw`] === "number"
                    ? data[`${op.name}_raw`].toFixed(1)
                    : "N/A"}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    };

    const renderSingleMetricBarChart = (metricKey) => {
      const config = AVAILABLE_METRICS[metricKey];
      if (!config) return null;
      const currentMode = resolveStatMode(metricKey);
      const chartData = chartOrderedOperators.map((op) => ({
        name: op.name,
        value: getDisplayMetricValue(op, metricKey, currentMode),
        color: op.color,
      }));

      return (
        <div
          key={metricKey}
          className={`rounded-lg border border-slate-700 bg-slate-900/40 overflow-hidden ${
            wrapMetricCharts
              ? "basis-full xl:basis-[calc(50%-0.5rem)] 2xl:basis-[calc(33.333%-0.75rem)] min-w-0"
              : ""
          }`}
        >
          <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={`text-xs font-medium ${primaryTextClass}`}>
              {config.label} ({isGridPciMetric(metricKey) ? "Best PCI" : isCountOnlyMetric(metricKey) ? "Count" : STAT_MODES[currentMode]?.label}
              {config.unit ? ` • ${config.unit}` : ""})
              </div>
              {!isCountOnlyMetric(metricKey) && !isGridPciMetric(metricKey) && individualStatMode && (
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                  {Object.entries(STAT_MODES).map(([modeKey, mode]) => (
                    <button
                      key={`${metricKey}-${modeKey}`}
                      onClick={() =>
                        setMetricStatModes((prev) => ({
                          ...prev,
                          [metricKey]: modeKey,
                        }))
                      }
                      className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                        currentMode === modeKey
                          ? "text-white"
                          : `bg-slate-800 ${mutedButtonTextClass} hover:bg-slate-700`
                      }`}
                      style={{
                        backgroundColor: currentMode === modeKey ? mode.color : undefined,
                      }}
                    >
                      {mode.shortLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isCountOnlyMetric(metricKey) && (
              <div className={`text-[10px] mt-1 ${secondaryTextClass}`}>
                {metricKey === "pci" && isGridCellDataset
                  ? "Shows dominant grid PCI per operator."
                  : `Shows count of most occurring ${
                      metricKey === "pci"
                        ? "PCI ID"
                        : metricKey === "cell"
                          ? "Cell ID / CI"
                          : "Node ID"
                    } per operator and unique count.`}
              </div>
            )}
          </div>
          <div className="p-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  
                  textAnchor="end"
                  height={60}
                  style={{
                    padding:2 ,
                  }}
                />
                <YAxis
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  reversed={Boolean(config.reversed)}
                />
                <Tooltip
                  content={
                    <CustomBarTooltip
                      forcedMetricKey={metricKey}
                      forcedStatMode={currentMode}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  name={config.label}
                  radius={[4, 4, 0, 0]}
                  fill={config.color}
                >
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={`${metricKey}-${entry.name}-${idx}`}
                      fill={entry.color || config.color}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    };

    if (!operatorData.length) {
      return (
        <ChartContainer ref={ref} title="Operator Comparison" icon={Globe}>
          <EmptyState message="No operator data available" />
        </ChartContainer>
      );
    }

    return (
      <ChartContainer
        ref={ref}
        title="Operator Comparison"
        icon={Globe}
        subtitle={`${operatorData.length} operators | ${technologyFilteredLocations?.length || 0} samples`}
        headerExtra={
          <div className="flex items-center gap-2">
            {!individualStatMode && (
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {Object.entries(STAT_MODES).map(([key, mode]) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setStatMode(key)}
                      title={mode.description}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                        statMode === key
                          ? "text-white"
                          : `bg-slate-800 ${mutedButtonTextClass} hover:bg-slate-700`
                      }`}
                      style={{
                        backgroundColor: statMode === key ? mode.color : undefined,
                      }}
                    >
                      <Icon className="h-3 w-3" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors capitalize ${
                    viewMode === mode
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-white hover:bg-slate-700"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 px-2 py-1 rounded border border-slate-600 bg-slate-800">
              <span className={`text-[10px] ${secondaryTextClass}`}>Tech</span>
              <select
                value={selectedTechnology}
                onChange={(e) => setSelectedTechnology(e.target.value)}
                className="bg-slate-700 text-white text-[10px] rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="All">All</option>
                {availableTechnologies.map((tech) => (
                  <option key={tech} value={tech}>
                    {tech}
                  </option>
                ))}
              </select>
            </div>

            {!showAllMetrics && (
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    showSettings
                      ? "bg-blue-600 text-white"
                      : `bg-slate-700 ${mutedButtonTextClass} hover:bg-slate-600`
                  }`}
                >
                  <Settings className="h-3 w-3" />
                  Metrics
                  <span className="bg-slate-600 px-1 rounded text-[9px]">
                    {selectedMetrics.length}
                  </span>
                </button>

                {showSettings && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowSettings(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 min-w-[180px]">
                      <div className="text-[10px] text-white mb-2 font-medium">
                        Select Metrics
                      </div>
                      <div className="space-y-1">
                        {Object.entries(AVAILABLE_METRICS).map(([key, config]) => (
                          <label
                            key={key}
                            className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedMetrics.includes(key)}
                              onChange={() => toggleMetric(key)}
                              className="w-3 h-3 rounded"
                            />
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                            <span className={`text-xs ${primaryTextClass}`}>
                              {config.label}
                            </span>
                            <span className={`text-[9px] ml-auto ${tertiaryTextClass}`}>
                              {config.unit}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        }
        expandable
        collapsible
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{
              backgroundColor: `${STAT_MODES[statMode].color}20`,
              color: STAT_MODES[statMode].color,
            }}
          >
            {(() => {
              const Icon = STAT_MODES[statMode].icon;
              return <Icon className="w-3 h-3" />;
            })()}
            {individualStatMode ? "Per-metric mode" : STAT_MODES[statMode].label}
          </span>
        </div>

        

        {viewMode === "bar" && (
          separateMetricCharts ? (
            <div className={wrapMetricCharts ? "flex flex-wrap items-start gap-4" : "space-y-4"}>
              {selectedMetrics.map((metricKey) =>
                renderSingleMetricBarChart(metricKey),
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={barChartData}
                margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fill: axisTickColor, fontSize: 11 }} />
                <Tooltip content={<CustomBarTooltip />} />
                {selectedMetrics.map((metricKey) => {
                  const config = AVAILABLE_METRICS[metricKey];
                  return (
                    <Bar
                      key={metricKey}
                      dataKey={metricKey}
                      name={config.label}
                      radius={[4, 4, 0, 0]}
                      fill={config.color}
                    >
                      {barChartData.map((entry, idx) => (
                        <Cell
                          key={`${metricKey}-${entry.name}-${idx}`}
                          fill={entry.color || config.color}
                        />
                      ))}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          )
        )}

       

        {viewMode === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr>
                  <th className={`text-left p-2 font-medium sticky left-0 bg-slate-800 ${tableHeaderTextClass}`}>
                    Operator
                  </th>
                  <th className={`text-center p-2 font-medium ${tableHeaderTextClass}`}>
                    Samples
                  </th>
                  {selectedMetrics.map((metricKey) => {
                    const config = AVAILABLE_METRICS[metricKey];
                    return (
                      <th
                        key={metricKey}
                        className="text-center p-2 font-medium"
                        style={{ color: config.color }}
                      >
                        <div>{config.label}</div>
                        <div className="text-[9px] text-white/70 mt-0.5">
                          {isGridPciMetric(metricKey)
                            ? "Best PCI"
                            : isCountOnlyMetric(metricKey)
                              ? "Count"
                              : STAT_MODES[resolveStatMode(metricKey)]?.label || "Mean"}
                          {isGridPciMetric(metricKey) ? "" : config.unit ? ` (${config.unit})` : ""}
                        </div>
                      </th>
                    );
                  })}
                  <th className={`text-center p-2 font-medium ${tableHeaderTextClass}`}>
                    Tech
                  </th>
                  <th className={`text-center p-2 font-medium ${tableHeaderTextClass}`}>
                    Band
                  </th>
                </tr>
              </thead>
              <tbody>
                {operatorData.map((op, idx) => (
                  <tr
                    key={op.name}
                    className={`border-t border-slate-700 hover:bg-slate-800/50 ${
                      idx === 0 ? "bg-green-900/10" : ""
                    }`}
                  >
                    <td className="p-2 sticky left-0 bg-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{op.name}</span>
                        {idx === 0 && (
                          <span className="text-[9px] bg-green-500/20 text-green-400 px-1 rounded">
                            #1
                          </span>
                        )}
                      </div>
                    </td>

                    <td className={`p-2 text-center ${primaryTextClass}`}>{op.samples}</td>

                    {selectedMetrics.map((metricKey) => {
                      const config = AVAILABLE_METRICS[metricKey];
                      const stats = op[metricKey];
                      const metricMode = resolveStatMode(metricKey);
                      const value = getDisplayMetricValue(op, metricKey, metricMode);

                      const allValues = operatorData
                        .map((o) => getDisplayMetricValue(o, metricKey, metricMode))
                        .filter((v) => v !== null && v !== undefined);

                      const isBest =
                        allValues.length > 0 &&
                        value !== null &&
                        value !== undefined &&
                        (config.higherBetter
                          ? value === Math.max(...allValues)
                          : value === Math.min(...allValues));

                      const otherStats = getOtherStats(stats, metricKey, metricMode);

                      return (
                        <td
                          key={metricKey}
                          className={`p-2 text-center ${
                            isBest ? "text-green-400" : primaryTextClass
                          }`}
                        >
                          <div className="font-medium">
                            {typeof value === "number"
                              ? formatDisplayMetricValue(value, metricKey)
                              : "-"}
                            {isBest && (
                              <span className="ml-1 text-yellow-400 text-[10px]">
                                ★
                              </span>
                            )}
                          </div>
                          {otherStats.length > 0 && (
                            <div className={`text-[9px] space-x-1 ${tertiaryTextClass}`}>
                              {otherStats.map((s) => (
                                <span key={s.key}>
                                  {s.label}:{" "}
                                  {typeof s.value === "number"
                                    ? formatDisplayMetricValue(s.value, metricKey)
                                    : "-"}
                                </span>
                              ))}
                            </div>
                          )}
                          {isCountOnlyMetric(metricKey) && (
                            <>
                              <div className="text-[13px] text-cyan-300">
                                {metricKey === "pci" && isGridCellDataset
                                  ? `Best PCI: ${stats?.topValue || "N/A"}`
                                  : `Most: ${stats?.topValue || "N/A"}`}
                              </div>
                              {!(metricKey === "pci" && isGridCellDataset) && (
                                <div className="text-[13px] text-cyan-200">
                                  Unique: {stats?.uniqueCount ?? 0}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}

                    <td className={`p-2 text-center ${highContrastText ? "text-white" : "text-purple-400"}`}>
                      {op.dominantTech}
                    </td>
                    <td className={`p-2 text-center ${highContrastText ? "text-white" : "text-blue-400"}`}>
                      {op.dominantBand}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showCdf && cdfChartsByTechnology.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700/50 space-y-3">
            <div className={`text-xs font-semibold ${primaryTextClass}`}>
              RSRP CDF By Technology
            </div>
            <div
              className={
                wrapMetricCharts
                  ? "flex flex-wrap items-start gap-4"
                  : "space-y-4"
              }
            >
              {cdfChartsByTechnology.map((techChart) => (
                <div
                  key={`cdf-${techChart.technology}`}
                  className={`rounded-lg border border-slate-700 bg-slate-900/40 p-3 ${
                    wrapMetricCharts
                      ? "basis-full xl:basis-[calc(50%-0.5rem)] 2xl:basis-[calc(33.333%-0.75rem)] min-w-0"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className={`text-xs font-medium ${primaryTextClass}`}>
                      {techChart.technology} RSRP CDF
                    </div>
                    <div className={`text-[10px] ${secondaryTextClass}`}>
                      {techChart.series.length} operators • {techChart.totalSamples} samples
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={techChart.rows}
                      margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        type="number"
                        dataKey="rsrp"
                        domain={[techChart.min, techChart.max]}
                        
                        tick={{ fill: axisTickColor, fontSize: 11 }}
                        label={{
                          value: "RSRP (dBm)",
                          position: "insideBottom",
                          offset: -5,
                          fill: axisTickColor,
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fill: axisTickColor, fontSize: 11 }}
                        label={{
                          value: "CDF (%)",
                          angle: -90,
                          position: "insideLeft",
                          fill: axisTickColor,
                          fontSize: 10,
                        }}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          `${Number(value).toFixed(1)}%`,
                          String(name),
                        ]}
                        labelFormatter={(label) => `RSRP: ${Number(label).toFixed(1)} dBm`}
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          color: "#FFFFFF",
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          color: "#FFFFFF",
                          fontSize: 11,
                        }}
                      />
                      {techChart.series.map((seriesItem) => (
                        <Line
                          key={`${techChart.technology}-${seriesItem.operator}`}
                          type="monotone"
                          dataKey={seriesItem.operator}
                          name={seriesItem.operator}
                          stroke={seriesItem.color}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {!individualStatMode && (
          <div className="mt-3 pt-2 border-t border-slate-700/50">
            <div className={`flex flex-wrap gap-3 text-[9px] ${tertiaryTextClass}`}>
              {Object.entries(STAT_MODES).map(([key, mode]) => {
                const Icon = mode.icon;
                return (
                  <div key={key} className="flex items-center gap-1">
                    <Icon
                      className="w-3 h-3"
                      style={{ color: statMode === key ? mode.color : undefined }}
                    />
                    <span
                      className={statMode === key ? "font-medium" : ""}
                      style={{ color: statMode === key ? mode.color : undefined }}
                    >
                      {mode.label}:
                    </span>
                    <span>{mode.description}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ChartContainer>
    );
  }
);

OperatorComparisonChart.displayName = "OperatorComparisonChart";
