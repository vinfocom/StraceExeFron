import React, { useEffect, useState, useMemo } from "react";
import { X, Download, Clock, BarChart3 } from "lucide-react";
import Spinner from "@/components/common/Spinner";
import { adminApi } from "@/api/apiEndpoints";
import { 
  getLogColor, 
  normalizeProviderName, 
  normalizeTechName,
  normalizeBandName 
} from "@/utils/colorUtils";

const METRIC_CONFIG = {
  rsrp: { field: "rsrp", thresholdKey: "rsrp", label: "RSRP", unit: "dBm" },
  rsrq: { field: "rsrq", thresholdKey: "rsrq", label: "RSRQ", unit: "dB" },
  sinr: { field: "sinr", thresholdKey: "sinr", label: "SINR", unit: "dB" },
  "dl-throughput": { field: "dl_tpt", thresholdKey: "dl_thpt", label: "DL Throughput", unit: "Mbps" },
  "ul-throughput": { field: "ul_tpt", thresholdKey: "ul_thpt", label: "UL Throughput", unit: "Mbps" },
  dl_tpt: { field: "dl_tpt", thresholdKey: "dl_thpt", label: "DL Throughput", unit: "Mbps" },
  ul_tpt: { field: "ul_tpt", thresholdKey: "ul_thpt", label: "UL Throughput", unit: "Mbps" },
  mos: { field: "mos", thresholdKey: "mos", label: "MOS", unit: "" },
  "lte-bler": { field: "bler", thresholdKey: "lte_bler", label: "LTE BLER", unit: "%" },
  bler: { field: "bler", thresholdKey: "lte_bler", label: "LTE BLER", unit: "%" },
};

const FALLBACK_BUCKET_COLORS = ["#dc2626", "#f97316", "#f59e0b", "#84cc16", "#22c55e"];

const resolveMetricConfig = (metric) => {
  const key = String(metric || "").toLowerCase();
  return METRIC_CONFIG[key] || METRIC_CONFIG.rsrp;
};

const toFixed = (value, digits = 2) => {
  if (value === null || value === undefined) return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num.toFixed(digits) : "N/A";
};

const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
};

const formatDuration = (seconds) => {
  if (!seconds || seconds < 1) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
};

const formatDurationFromHours = (hours) => formatDuration(hours * 3600);

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const normalizeOperator = (raw) => {
  const normalized = normalizeProviderName(raw);
  return normalized === "Unknown" ? null : normalized;
};

const normalizeNetwork = (network, band = null) => {
  const normalized = normalizeTechName(network, band);
  return normalized === "Unknown" ? null : normalized;
};

const normalizeBand = (band) => {
  if (!band || band === "Unknown" || band === "-1") return null;
  return String(normalizeBandName(band)).trim() || null;
};

const normalizeAndAggregateDurations = (data) => {
  const aggregated = new Map();
  
  data.forEach((item) => {
    const provider = normalizeProviderName(item.Provider);
    const network = normalizeNetwork(item.Network);
    
    if (!provider || !network || provider === "Unknown") return;
    
    const key = `${provider}|${network}`;
    
    if (aggregated.has(key)) {
      aggregated.get(key).TotalDurationHours += item.TotalDurationHours || 0;
    } else {
      aggregated.set(key, {
        Provider: provider,
        Network: network,
        TotalDurationHours: item.TotalDurationHours || 0,
      });
    }
  });
  
  return Array.from(aggregated.values())
    .sort((a, b) => b.TotalDurationHours - a.TotalDurationHours);
};

const buildDistribution = (values, thresholds) => {
  if (Array.isArray(thresholds) && thresholds.length > 0) {
    const buckets = thresholds.map((r) => ({
      min: Number(r.min),
      max: Number(r.max),
      color: r.color || "#808080",
      label: r.range || `${r.min} - ${r.max}`,
      count: 0,
    }));
    
    values.forEach((v) => {
      const bucket = buckets.find((b) => v >= b.min && v < b.max);
      if (bucket) bucket.count++;
    });
    
    return buckets;
  }

  if (!values.length) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1]
    .map((q) => quantile(sorted, q))
    .filter((e, i, arr) => i === 0 || e > arr[i - 1]);

  const bins = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const min = edges[i];
    const max = edges[i + 1];
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) continue;
    bins.push({
      min,
      max,
      color: FALLBACK_BUCKET_COLORS[Math.min(i, FALLBACK_BUCKET_COLORS.length - 1)],
      label: `${toFixed(min)} - ${toFixed(max)}`,
      count: 0,
    });
  }

  values.forEach((v) => {
    const bin = bins.find((b) => v >= b.min && v <= b.max);
    if (bin) bin.count++;
  });

  return bins;
};

const buildTopCounts = (logs, getter, topN = 6) => {
  const counts = new Map();
  
  logs.forEach((log) => {
    const key = getter(log);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });

  const entries = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const total = entries.reduce((acc, [, c]) => acc + c, 0) || 1;

  return entries.map(([name, count]) => ({
    name,
    count,
    percent: Math.round((count / total) * 100),
  }));
};

const buildOperatorNetworkCombo = (logs, topN = 10) => {
  const counts = new Map();

  logs.forEach((log) => {
    const provider = normalizeOperator(log.provider ?? log.m_alpha_long);
    const network = normalizeNetwork(log.network ?? log.technology, log.band);
    
    if (!provider || !network) return;
    
    const key = `${provider}|${network}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const entries = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const total = entries.reduce((acc, [, c]) => acc + c, 0) || 1;

  return entries.map(([combo, count]) => {
    const [provider, network] = combo.split("|");
    return {
      provider,
      network,
      count,
      percent: Math.round((count / total) * 100),
    };
  });
};

const exportCsv = ({ logs, field, filename = "logs_metric.csv" }) => {
  if (!Array.isArray(logs) || !logs.length) return;

  const header = ["session_id", "lat", "lon", field, "provider", "network", "band", "timestamp"];
  const lines = [header.join(",")];

  logs.forEach((log) => {
    lines.push([
      log.session_id ?? log.id ?? "",
      log.lat ?? "",
      log.lon ?? log.lng ?? "",
      log[field] ?? "",
      normalizeOperator(log.provider ?? log.m_alpha_long) ?? "",
      log.network ?? log.technology ?? "",
      log.band ?? "",
      log.timestamp ?? log.time ?? log.created_at ?? "",
    ].map((v) => String(v ?? "").replace(/,/g, " ")).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const StatCard = ({ label, value, unit = "", colorClass = "" }) => (
  <div>
    <div className="text-slate-400">{label}</div>
    <div className={`font-semibold ${colorClass}`}>{value}{unit}</div>
  </div>
);

const DistributionBar = ({ label, count, percent, total, color }) => (
  <div className="mb-1">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
        <span className="text-xs text-slate-300">{label}</span>
      </div>
      <span className="text-xs text-slate-200">{count} ({percent}%)</span>
    </div>
    <div className="h-2 bg-slate-700 rounded mt-1">
      <div className="h-2 rounded" style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
  </div>
);

const ProgressBar = ({ name, count, percent, colorType, colorValue }) => (
  <div className="text-sm">
    <div className="flex items-center justify-between">
      <span className="text-slate-200">{name}</span>
      <span className="text-slate-300">{count} ({percent}%)</span>
    </div>
    <div className="h-1.5 bg-slate-700 rounded mt-1">
      <div
        className="h-1.5 rounded"
        style={{
          width: `${percent}%`,
          backgroundColor: getLogColor(colorType, colorValue),
        }}
      />
    </div>
  </div>
);

const AllLogsDetailPanel = ({
  logs = [],
  thresholds = {},
  selectedMetric = "rsrp",
  isLoading,
  startDate,
  endDate,
  appSummary,
  onClose,
}) => {
  const [networkDurations, setNetworkDurations] = useState([]);
  const [isDurationsLoading, setIsDurationsLoading] = useState(false);

  const safeLogsList = useMemo(() => (Array.isArray(logs) ? logs : []), [logs]);
  const cfg = useMemo(() => resolveMetricConfig(selectedMetric), [selectedMetric]);
  const unit = cfg.unit ? ` ${cfg.unit}` : "";
  const ranges = thresholds?.[cfg.thresholdKey] || [];

  const numericValues = useMemo(() => {
    return safeLogsList
      .map((log) => parseFloat(log?.[cfg.field]))
      .filter(Number.isFinite);
  }, [safeLogsList, cfg.field]);

  const isMetricStats = useMemo(() => {
    return appSummary?.count !== undefined && appSummary?.mean !== undefined;
  }, [appSummary]);

  const processedAppUsage = useMemo(() => {
    if (!appSummary || typeof appSummary !== "object" || isMetricStats) return [];

    return Object.entries(appSummary)
      .filter(([, value]) => value?.appName || value?.avgRsrp !== undefined)
      .map(([key, value]) => ({ appName: key, ...value }))
      .sort((a, b) => (b.SampleCount || 0) - (a.SampleCount || 0));
  }, [appSummary, isMetricStats]);

  const dateRange = useMemo(() => {
    if (!startDate || !endDate) return null;
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }, [startDate, endDate]);

  useEffect(() => {
    if (!startDate || !endDate) return;

    const fetchDurations = async () => {
      setIsDurationsLoading(true);
      try {
        const res = await adminApi.getNetworkDurations(startDate, endDate);
        const rawData = res?.Data || (Array.isArray(res) ? res : []);
        setNetworkDurations(normalizeAndAggregateDurations(rawData));
      } catch {
        setNetworkDurations([]);
      } finally {
        setIsDurationsLoading(false);
      }
    };

    fetchDurations();
  }, [startDate, endDate]);

  const stats = useMemo(() => {
    if (isMetricStats && appSummary) {
      return {
        total: appSummary.count || 0,
        avg: toFixed(appSummary.mean),
        min: toFixed(appSummary.min),
        median: toFixed(appSummary.median),
        max: toFixed(appSummary.max),
        std: "N/A",
      };
    }

    const n = numericValues.length;
    if (!n) return { total: 0, avg: "N/A", min: "N/A", median: "N/A", max: "N/A", std: "N/A" };

    const sum = numericValues.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const sorted = [...numericValues].sort((a, b) => a - b);
    const variance = numericValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;

    return {
      total: n,
      avg: toFixed(mean),
      min: toFixed(sorted[0]),
      median: toFixed(quantile(sorted, 0.5)),
      max: toFixed(sorted[sorted.length - 1]),
      std: toFixed(Math.sqrt(variance)),
    };
  }, [numericValues, appSummary, isMetricStats]);

  const buckets = useMemo(
    () => buildDistribution(numericValues, ranges),
    [numericValues, ranges]
  );

  const providerTop = useMemo(
    () => buildTopCounts(safeLogsList, (l) => normalizeOperator(l.provider ?? l.m_alpha_long)),
    [safeLogsList]
  );

  const networkTop = useMemo(
    () => buildTopCounts(safeLogsList, (l) => normalizeNetwork(l.network ?? l.technology, l.band)),
    [safeLogsList]
  );

  const bandTop = useMemo(
    () => buildTopCounts(safeLogsList, (l) => normalizeBand(l.band)),
    [safeLogsList]
  );

  const providerNetworkTop = useMemo(
    () => buildOperatorNetworkCombo(safeLogsList),
    [safeLogsList]
  );

  const safeNum = (val, suffix = "") => {
    if (val === null || val === undefined) return "N/A";
    const num = typeof val === "string" ? parseFloat(val) : val;
    return Number.isFinite(num) ? `${num.toFixed(2)}${suffix}` : "N/A";
  };

  const handleExport = () => {
    exportCsv({
      logs: safeLogsList,
      field: cfg.field,
      filename: `logs_${cfg.field}.csv`,
    });
  };

  return (
    <div className="fixed top-16 right-0 h-[calc(100vh-4rem)] w-[24rem] max-w-[100vw] text-white bg-slate-900 shadow-2xl z-50 flex flex-col">
      <div className="flex-shrink-0 p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
        <div>
          <h3 className="text-lg font-bold">All Logs Metric Summary</h3>
          <div className="text-xs text-slate-400">Metric: {cfg.label}{unit}</div>
          {dateRange && <div className="text-xs text-slate-500 mt-1">Date Range: {dateRange}</div>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="p-2 rounded hover:bg-slate-800"
            title="Download CSV"
          >
            <Download className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-800" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-sm">{cfg.label} Statistics</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <StatCard label="Total Logs" value={stats.total} colorClass="text-lg text-blue-400" />
                <StatCard label="Average" value={stats.avg} unit={unit} />
                <StatCard label="Min" value={stats.min} unit={unit} colorClass="text-red-400" />
                <StatCard label="Max" value={stats.max} unit={unit} colorClass="text-green-400" />
                <StatCard label="Median" value={stats.median} unit={unit} />
                <StatCard label="Std Dev" value={stats.std} unit={unit} />
              </div>
            </div>

            {buckets.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <h4 className="font-semibold mb-2">Distribution</h4>
                <div className="space-y-2">
                  {buckets.map((b, idx) => (
                    <DistributionBar
                      key={`${b.label}-${idx}`}
                      label={b.label}
                      count={b.count}
                      percent={stats.total ? Math.round((b.count / stats.total) * 100) : 0}
                      total={stats.total}
                      color={b.color}
                    />
                  ))}
                </div>
              </div>
            )}

            {providerTop.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="font-semibold mb-2">Providers</div>
                <div className="space-y-2">
                  {providerTop.map((item) => (
                    <ProgressBar
                      key={item.name}
                      name={item.name}
                      count={item.count}
                      percent={item.percent}
                      colorType="provider"
                      colorValue={item.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {networkTop.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="font-semibold mb-2">Network</div>
                <div className="space-y-2">
                  {networkTop.map((item) => (
                    <ProgressBar
                      key={item.name}
                      name={item.name}
                      count={item.count}
                      percent={item.percent}
                      colorType="technology"
                      colorValue={item.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {isDurationsLoading ? (
              <div className="flex justify-center p-4">
                <Spinner />
              </div>
            ) : networkDurations.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="font-semibold mb-2">Network Durations</div>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {networkDurations.map((item) => (
                      <tr key={`${item.Provider}-${item.Network}`} className="hover:bg-slate-700/20">
                        <td className="py-1">{item.Provider}</td>
                        <td className="py-1">{item.Network}</td>
                        <td className="py-1 text-right">{formatDurationFromHours(item.TotalDurationHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {processedAppUsage.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  App Usage ({processedAppUsage.length})
                </div>
                <div className="space-y-3">
                  {processedAppUsage.map((app, index) => (
                    <div
                      key={app.appName || index}
                      className="border-b border-slate-700 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-100">{app.appName}</span>
                        <span className="text-xs text-emerald-400 font-mono">
                          {app.durationHHMMSS || formatDuration(app.durationSeconds)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">RSRP:</span>
                          <span className="text-slate-200">{safeNum(app.avgRsrp, " dBm")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">RSRQ:</span>
                          <span className="text-slate-200">{safeNum(app.avgRsrq, " dB")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">SINR:</span>
                          <span className="text-slate-200">{safeNum(app.avgSinr, " dB")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">MOS:</span>
                          <span className="text-slate-200">{safeNum(app.avgMos)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">DL:</span>
                          <span className="text-slate-200">{safeNum(app.avgDlTptMbps, " Mbps")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">UL:</span>
                          <span className="text-slate-200">{safeNum(app.avgUlTptMbps, " Mbps")}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {providerNetworkTop.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="font-semibold mb-2">Operator vs Network</div>
                <div className="space-y-2">
                  {providerNetworkTop
                    .filter((item) => item.provider )
                    .map((item) => (
                      <ProgressBar
                        key={`${item.provider}-${item.network}`}
                        name={`${item.provider} / ${item.network}`}
                        count={item.count}
                        percent={item.percent}
                        colorType="provider"
                        colorValue={item.provider}
                      />
                    ))}
                </div>
              </div>
            )}

            {bandTop.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="font-semibold mb-2">Bands</div>
                <div className="space-y-2">
                  {bandTop.map((item) => (
                    <ProgressBar
                      key={item.name}
                      name={item.name}
                      count={item.count}
                      percent={item.percent}
                      colorType="band"
                      colorValue={item.name}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AllLogsDetailPanel;