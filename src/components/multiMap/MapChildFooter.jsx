import React, { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  Activity,
  BarChart3,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

const MapChildFooter = ({
  data = [],
  metric = "rsrp",
  thresholds = [],
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCDF, setShowCDF] = useState(true);

  const { stats, mergedChartData } = useMemo(() => {
    if (!data.length) return { stats: null, mergedChartData: [] };

    const values = data
      .map((d) => parseFloat(d[metric]))
      .filter((v) => !isNaN(v));

    if (!values.length) return { stats: null, mergedChartData: [] };

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // --- Threshold Distribution ---
    const distribution = values.reduce((acc, val) => {
      let color = "#9CA3AF";
      if (thresholds?.length) {
        const sortedThresholds = [...thresholds].sort(
          (a, b) => parseFloat(a.min) - parseFloat(b.min)
        );
        for (let i = 0; i < sortedThresholds.length; i++) {
          const t = sortedThresholds[i];
          const tMin = parseFloat(t.min);
          const tMax = parseFloat(t.max);
          if (
            val >= tMin &&
            (i === sortedThresholds.length - 1 ? val <= tMax : val < tMax)
          ) {
            color = t.color;
            break;
          }
        }
        if (val < parseFloat(sortedThresholds[0].min))
          color = sortedThresholds[0].color;
        if (val > parseFloat(sortedThresholds[sortedThresholds.length - 1].max))
          color = sortedThresholds[sortedThresholds.length - 1].color;
      }
      acc[color] = (acc[color] || 0) + 1;
      return acc;
    }, {});

    const binCount = 25;
    const range = max - min;
    const safeRange = range === 0 ? 1 : range;
    const binSize = safeRange / binCount;

    const bins = Array.from({ length: binCount }, (_, i) => {
      const binMin = min + i * binSize;
      const binMax = min + (i + 1) * binSize;
      return {
        name: `${binMin.toFixed(0)}`,
        min: binMin,
        max: binMax,
        count: 0,
        rangeLabel: `${binMin.toFixed(1)} to ${binMax.toFixed(1)}`,
      };
    });

    values.forEach((v) => {
      let index = Math.floor((v - min) / binSize);
      if (index >= binCount) index = binCount - 1;
      if (index < 0) index = 0;
      bins[index].count += 1;
    });

    let runningTotal = 0;
    const merged = bins.map((bin) => {
      runningTotal += bin.count;
      return {
        ...bin,
        cumulativeCount: runningTotal,
        cumulativePercent: parseFloat(
          ((runningTotal / values.length) * 100).toFixed(2)
        ),
      };
    });

    return {
      stats: { avg, min, max, count: values.length, distribution },
      mergedChartData: merged,
    };
  }, [data, metric, thresholds]);

  if (!stats) return null;

  return (
    <div
      className={`
        absolute bottom-0 left-0 right-0 z-30 
        bg-white/95 backdrop-blur-sm border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]
        transition-all duration-300 ease-in-out
        ${isExpanded ? "h-[420px]" : "h-12"} 
        flex flex-col
      `}
    >
      <div
        className="flex items-center justify-between px-4 h-12 cursor-pointer hover:bg-gray-50 transition-colors shrink-0 border-b border-gray-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4 overflow-hidden">
          <div className="flex items-center gap-2 text-blue-700 font-semibold min-w-fit">
            <Activity size={16} />
            <span className="text-sm">Analytics</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600 border-l pl-3 ml-1 truncate">
            <span className="font-medium text-gray-900">{stats.count}</span> Samples
            <span className="w-px h-3 bg-gray-300 mx-1 hidden sm:block" />
            <span className="hidden sm:inline">Avg {metric.toUpperCase()}: </span>
            <span className={`font-mono font-bold ${getMetricColorClass(stats.avg, metric)}`}>
              {stats.avg.toFixed(1)}
            </span>
          </div>
        </div>
        <button className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      <div className={`flex-grow overflow-y-auto p-4 ${isExpanded ? "opacity-100 visible" : "opacity-0 invisible h-0"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatBox label={`Avg ${metric}`} value={stats.avg.toFixed(2)} icon={<Activity size={14} />} />
          <StatBox label="Min Value" value={stats.min.toFixed(2)} />
          <StatBox label="Max Value" value={stats.max.toFixed(2)} />
          <StatBox label="Total Samples" value={stats.count} />
        </div>

        <div className="space-y-2 mb-5">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span className="flex items-center gap-1"><BarChart3 size={12} /> Signal Threshold Distribution</span>
          </div>
          <div className="h-4 w-full flex rounded-full overflow-hidden bg-gray-100 border border-gray-200">
            {Object.entries(stats.distribution).map(([color, count]) => (
              <div
                key={color}
                style={{ width: `${(count / stats.count) * 100}%`, backgroundColor: color }}
                className="h-full hover:opacity-80 transition-opacity"
              />
            ))}
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col h-[220px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-gray-500 font-semibold flex items-center gap-1.5">
              <BarChart3 size={13} /> Histogram &amp; Cumulative Distribution
            </span>
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowCDF(!showCDF); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                  showCDF ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-100 border-gray-200 text-gray-500"
                }`}
              >
                {showCDF ? <Eye size={10} /> : <EyeOff size={10} />} CDF Line
              </button>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2.5 rounded-sm bg-blue-500 inline-block" /> Count
              </span>
            </div>
          </div>

          <div className="flex-grow w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mergedChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                {showCDF && (
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                )}

                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white p-2.5 border border-gray-100 shadow-lg rounded-md text-xs min-w-[170px]">
                        <p className="font-bold mb-1.5 border-b pb-1 text-gray-700">Range: {d.rangeLabel}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <span className="text-gray-500">Bin Count:</span>
                          <span className="font-mono font-semibold text-blue-600">{d.count}</span>
                          <span className="text-gray-500">Cumulative:</span>
                          <span className="font-mono font-semibold text-gray-800">{d.cumulativeCount}</span>
                          {showCDF && (
                            <>
                              <span className="text-gray-500">CDF:</span>
                              <span className="font-mono font-semibold text-emerald-600">{d.cumulativePercent}%</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />

                <Bar yAxisId="left" dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Count" barSize={20} />

                {showCDF && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulativePercent"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: "#10b981" }}
                    name="CDF %"
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, icon }) => (
  <div className="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col items-center justify-center shadow-sm">
    <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">{icon} {label}</span>
    <span className="text-sm font-bold text-slate-800">{value}</span>
  </div>
);

const getMetricColorClass = (val, metric) => {
  if (metric === "rsrp") {
    if (val > -85) return "text-green-600";
    if (val > -105) return "text-yellow-600";
    return "text-red-600";
  }
  return "text-blue-600";
};

export default MapChildFooter;