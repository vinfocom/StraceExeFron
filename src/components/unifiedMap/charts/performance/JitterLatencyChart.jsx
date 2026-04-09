import React, { useMemo } from "react";
import { Activity } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { CHART_CONFIG } from "@/utils/constants";
import {
  normalizeProviderName,
  normalizeTechName,
  getLogColor,
  COLOR_SCHEMES,
} from "@/utils/colorUtils";

const getOperatorColor = (operator) => {
  const normalized = normalizeProviderName(operator);
  return getLogColor("provider", normalized, "#6B7280");
};

const LATENCY_RANGES = [
  { min: 0, max: 20, label: "0-20", color: "#22c55e", quality: "Excellent" },
  { min: 20, max: 50, label: "20-50", color: "#84cc16", quality: "Good" },
  { min: 50, max: 100, label: "50-100", color: "#facc15", quality: "Fair" },
  { min: 100, max: 150, label: "100-150", color: "#fb923c", quality: "Poor" },
  { min: 150, max: Infinity, label: "150+", color: "#ef4444", quality: "Bad" },
];

const JITTER_RANGES = [
  { min: 0, max: 5, label: "0-5", color: "#22c55e", quality: "Excellent" },
  { min: 5, max: 10, label: "5-10", color: "#84cc16", quality: "Good" },
  { min: 10, max: 20, label: "10-20", color: "#facc15", quality: "Fair" },
  { min: 20, max: 30, label: "20-30", color: "#fb923c", quality: "Poor" },
  { min: 30, max: Infinity, label: "30+", color: "#ef4444", quality: "Bad" },
];

const PACKET_LOSS_RANGES = [
  { min: 0, max: 1, label: "0-1", color: "#22c55e", quality: "Excellent" },
  { min: 1, max: 3, label: "1-3", color: "#84cc16", quality: "Good" },
  { min: 3, max: 5, label: "3-5", color: "#facc15", quality: "Fair" },
  { min: 5, max: 10, label: "5-10", color: "#fb923c", quality: "Poor" },
  { min: 10, max: Infinity, label: "10+", color: "#ef4444", quality: "Bad" },
];

const MultiOperatorTooltip = ({ active, payload, label, unit = "ms" }) => {
  if (!active || !payload?.length) return null;

  const totalSamples = payload.reduce((sum, p) => sum + (p.value || 0), 0);
  const rangeInfo = payload[0]?.payload;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl min-w-[200px]">
      <div className="font-semibold text-white mb-2 border-b border-slate-700 pb-2 flex justify-between">
        <span>
          {label} {unit}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{
            backgroundColor: rangeInfo?.rangeColor + "30",
            color: rangeInfo?.rangeColor,
          }}
        >
          {rangeInfo?.quality}
        </span>
      </div>
      <div className="space-y-1.5">
        {payload
          .filter((entry) => entry.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-white text-sm">{entry.name}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-white text-sm">
                  {entry.value}
                </span>
                <span className="text-white text-xs ml-1">
                  (
                  {totalSamples > 0
                    ? ((entry.value / totalSamples) * 100).toFixed(1)
                    : 0}
                  %)
                </span>
              </div>
            </div>
          ))}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between text-sm">
        <span className="text-slate-400">Total</span>
        <span className="font-bold text-white">{totalSamples} samples</span>
      </div>
    </div>
  );
};

const MultiOperatorDistributionChart = ({
  data,
  ranges,
  title,
  operators,
  unit = "ms",
  valueKey = "latency",
}) => {
  const distributionData = useMemo(() => {
    return ranges.map((range) => {
      const rangeData = {
        range: range.label,
        quality: range.quality,
        rangeColor: range.color,
      };

      operators.forEach((operator) => {
        const count = data.filter(
          (d) =>
            d.operator === operator &&
            d[valueKey] >= range.min &&
            d[valueKey] < range.max
        ).length;
        rangeData[operator] = count;
      });

      rangeData.total = operators.reduce(
        (sum, op) => sum + (rangeData[op] || 0),
        0
      );

      return rangeData;
    });
  }, [data, ranges, operators, valueKey]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-sm font-medium text-white mb-3 text-center">
        {title}
      </div>
      <div className="w-full" style={{ height: "280px", maxHeight: "280px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={distributionData}
            margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
          >
            <CartesianGrid {...CHART_CONFIG.grid} />
            <XAxis
              dataKey="range"
              tick={{ fill: "#ffffff", fontSize: 11 }}
              label={{
                value: unit,
                position: "bottom",
                fill: "#ffffff",
                fontSize: 11,
                offset: 0,
              }}
            />
            <YAxis
              tick={{ fill: "#ffffff", fontSize: 11 }}
              label={{
                value: "Samples",
                angle: -90,
                position: "insideLeft",
                fill: "#ffffff",
                fontSize: 11,
              }}
            />
            <Tooltip
              content={(props) => <MultiOperatorTooltip {...props} unit={unit} />}
            />
            <Legend
              wrapperStyle={{ paddingTop: "10px" }}
              formatter={(value) => (
                <span className="text-white text-xs">{value}</span>
              )}
            />
            {operators.map((operator) => (
              <Bar
                key={operator}
                dataKey={operator}
                name={operator}
                stackId="a"
                fill={getOperatorColor(operator)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-2 text-slate-400">Range</th>
              {operators.map((op) => (
                <th
                  key={op}
                  className="text-center py-2 px-2"
                  style={{ color: getOperatorColor(op) }}
                >
                  {op}
                </th>
              ))}
              <th className="text-right py-2 px-2 text-white">Total</th>
            </tr>
          </thead>
          <tbody>
            {distributionData.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-slate-800 hover:bg-slate-800/50"
                style={{ backgroundColor: `${row.rangeColor}10` }}
              >
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.rangeColor }}
                    />
                    <span className="text-white">
                      {row.range} {unit}
                    </span>
                    <span className="text-slate-500">({row.quality})</span>
                  </div>
                </td>
                {operators.map((op) => (
                  <td key={op} className="text-center py-2 px-2 text-white">
                    {row[op] > 0 ? row[op] : "-"}
                  </td>
                ))}
                <td className="text-right py-2 px-2 font-semibold text-white">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OperatorQualityComparison = ({ data, operators, title, unit = "ms" }) => {
  const operatorStats = useMemo(() => {
    return operators
      .map((operator) => {
        const operatorData = data.filter((d) => d.operator === operator);
        if (operatorData.length === 0) return null;

        const values = operatorData.map((d) => d.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        return {
          operator,
          count: operatorData.length,
          avg: avg.toFixed(2),
          min: min.toFixed(2),
          max: max.toFixed(2),
          color: getOperatorColor(operator),
        };
      })
      .filter(Boolean)
      .sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));
  }, [data, operators]);

  if (operatorStats.length === 0) return null;

  const maxAvg = Math.max(...operatorStats.map((s) => parseFloat(s.avg)));

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 flex-1 min-w-[280px] max-w-md">
      <div className="text-sm font-medium text-white mb-3">{title}</div>
      <div className="space-y-2">
        {operatorStats.map((stat, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div
              className="w-16 text-xs font-medium truncate flex-shrink-0"
              style={{ color: "#fcfcfc" }}
            >
              {stat.operator}
            </div>
            <div className="flex-1 h-5 bg-slate-700 rounded-full overflow-hidden relative min-w-0">
              <div
                className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max(
                    (parseFloat(stat.avg) / maxAvg) * 100,
                    15
                  )}%`,
                  backgroundColor: stat.color,
                }}
              >
                <span className="text-[10px] font-bold text-white whitespace-nowrap">
                  {stat.avg} {unit}
                </span>
              </div>
            </div>
            <div className="w-14 text-[10px] text-slate-400 text-right flex-shrink-0">
              {stat.count} samples
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const OperatorLegend = ({ operators }) => {
  return (
    <div className="flex flex-wrap gap-3 justify-center mb-4 p-3 bg-slate-800/50 rounded-lg">
      {operators.map((operator) => (
        <div key={operator} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: getOperatorColor(operator) }}
          />
          <span className="text-xs text-white">{operator}</span>
        </div>
      ))}
    </div>
  );
};

const QualitySummaryByOperator = ({
  data,
  ranges,
  operators,
  title,
  valueKey,
}) => {
  const summaryData = useMemo(() => {
    return operators
      .map((operator) => {
        const operatorData = data.filter((d) => d.operator === operator);
        const operatorTotal = operatorData.length;

        const qualityBreakdown = ranges.map((range) => {
          const count = operatorData.filter(
            (d) => d[valueKey] >= range.min && d[valueKey] < range.max
          ).length;
          const percentage =
            operatorTotal > 0 ? (count / operatorTotal) * 100 : 0;
          return {
            quality: range.quality,
            count,
            percentage: percentage.toFixed(1),
            color: range.color,
          };
        });

        const dominantQuality = qualityBreakdown.reduce(
          (max, curr) => (curr.count > max.count ? curr : max),
          qualityBreakdown[0]
        );

        return {
          operator,
          total: operatorTotal,
          color: getOperatorColor(operator),
          qualityBreakdown,
          dominantQuality,
        };
      })
      .filter((s) => s.total > 0);
  }, [data, ranges, operators, valueKey]);

  return (
    <div className="flex-1 min-w-[250px]">
      <div className="text-xs text-white mb-2">{title}</div>
      <div className="space-y-3">
        {summaryData.map((opSummary, idx) => (
          <div key={idx} className="bg-slate-800/30 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: opSummary.color }}
                />
                <span className="text-sm font-medium text-white">
                  {opSummary.operator}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: opSummary.dominantQuality.color + "30",
                    color: opSummary.dominantQuality.color,
                  }}
                >
                  {opSummary.dominantQuality.quality}
                </span>
                <span className="text-xs text-slate-400">
                  {opSummary.total} samples
                </span>
              </div>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
              {opSummary.qualityBreakdown.map(
                (qb, i) =>
                  qb.count > 0 && (
                    <div
                      key={i}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${qb.percentage}%`,
                        backgroundColor: qb.color,
                      }}
                      title={`${qb.quality}: ${qb.percentage}%`}
                    />
                  )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, subValue, color }) => (
  <div className="bg-slate-800 rounded-lg p-3 text-center hover:bg-slate-750 transition-colors flex-1 min-w-[120px] max-w-[180px]">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="text-lg font-bold" style={{ color }}>
      {value}
    </div>
    {subValue && (
      <div className="text-[10px] text-slate-500 mt-1">{subValue}</div>
    )}
  </div>
);

export const JitterLatencyChart = React.forwardRef(({ locations }, ref) => {
  const { data, operators } = useMemo(() => {
    if (!locations?.length) return { data: [], operators: [] };

    const processedData = locations
      .filter(
        (loc) =>
          loc.jitter != null || loc.latency != null || loc.packet_loss != null
      )
      .map((loc) => {
        const rawProvider = loc.provider || loc.operator || loc.operatorName || "";
        const normalizedProvider = normalizeProviderName(rawProvider);

        return {
          operator: normalizedProvider,
          jitter: parseFloat(loc.jitter) || 0,
          latency: parseFloat(loc.latency) || 0,
          packetLoss: parseFloat(loc.packet_loss) || 0,
          dlTpt: parseFloat(loc.dl_tpt) || 0,
          ulTpt: parseFloat(loc.ul_tpt) || 0,
          speed: parseFloat(loc.speed) || 0,
        };
      })
      .filter((d) => d.operator !== "Unknown");

    const operatorCounts = processedData.reduce((acc, d) => {
      acc[d.operator] = (acc[d.operator] || 0) + 1;
      return acc;
    }, {});

    const uniqueOperators = Object.entries(operatorCounts)
      .filter(([op]) => op !== "Unknown")
      .sort((a, b) => b[1] - a[1])
      .map(([op]) => op);

    return { data: processedData, operators: uniqueOperators };
  }, [locations]);

  const stats = useMemo(() => {
    if (!data.length) return null;

    const calculateStats = (values) => ({
      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      min: Math.min(...values).toFixed(2),
      max: Math.max(...values).toFixed(2),
      values,
    });

    const latencyStats = calculateStats(data.map((d) => d.latency));
    const jitterStats = calculateStats(data.map((d) => d.jitter));
    const packetLossStats = calculateStats(data.map((d) => d.packetLoss));

    const operatorStats = operators.reduce((acc, op) => {
      const opData = data.filter((d) => d.operator === op);
      if (opData.length > 0) {
        acc[op] = {
          count: opData.length,
          avgLatency: (
            opData.reduce((s, d) => s + d.latency, 0) / opData.length
          ).toFixed(2),
          avgJitter: (
            opData.reduce((s, d) => s + d.jitter, 0) / opData.length
          ).toFixed(2),
          avgPacketLoss: (
            opData.reduce((s, d) => s + d.packetLoss, 0) / opData.length
          ).toFixed(2),
        };
      }
      return acc;
    }, {});

    return {
      latency: latencyStats,
      jitter: jitterStats,
      packetLoss: packetLossStats,
      operatorStats,
      totalSamples: data.length,
    };
  }, [data, operators]);

  const qualityScore = useMemo(() => {
    if (!stats) return null;

    const avgLatency = parseFloat(stats.latency.avg);
    const avgJitter = parseFloat(stats.jitter.avg);
    const avgPacketLoss = parseFloat(stats.packetLoss.avg);

    if (avgLatency < 50 && avgJitter < 10 && avgPacketLoss < 1) {
      return { label: "Excellent", color: "#22c55e" };
    } else if (avgLatency < 100 && avgJitter < 20 && avgPacketLoss < 3) {
      return { label: "Good", color: "#84cc16" };
    } else if (avgLatency < 150 && avgJitter < 30 && avgPacketLoss < 5) {
      return { label: "Fair", color: "#facc15" };
    } else {
      return { label: "Poor", color: "#ef4444" };
    }
  }, [stats]);

  if (!data.length) {
    return (
      <ChartContainer ref={ref} title="Network Quality Metrics" icon={Activity}>
        <EmptyState message="No network quality data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      ref={ref}
      title="Network Quality Metrics by Operator"
      icon={Activity}
    >
      <div className="space-y-4">
        <OperatorLegend operators={operators} />

        {stats && (
          <div className="flex flex-wrap justify-center gap-2">
            <StatCard
              label="Operators"
              value={operators.length}
              subValue={`${stats.totalSamples.toLocaleString()} samples`}
              color="#60a5fa"
            />
            <StatCard
              label="Avg Latency"
              value={`${stats.latency.avg} ms`}
              subValue={`${stats.latency.min} - ${stats.latency.max} ms`}
              color="#f472b6"
            />
            <StatCard
              label="Avg Jitter"
              value={`${stats.jitter.avg} ms`}
              subValue={`${stats.jitter.min} - ${stats.jitter.max} ms`}
              color="#818cf8"
            />
            <StatCard
              label="Avg Packet Loss"
              value={`${stats.packetLoss.avg}%`}
              subValue={`${stats.packetLoss.min} - ${stats.packetLoss.max}%`}
              color="#fb923c"
            />
            <StatCard
              label="Quality Score"
              value={qualityScore?.label}
              color={qualityScore?.color}
            />
          </div>
        )}

        {stats?.operatorStats && Object.keys(stats.operatorStats).length > 1 && (
          <div className="overflow-x-auto">
            <div className="text-sm font-medium text-white mb-2">
              Operator Comparison
            </div>
            <div className="inline-block min-w-full">
              <table className="w-full text-xs bg-slate-800/50 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-slate-700">
                    <th className="text-left py-2 px-3 text-slate-300">
                      Operator
                    </th>
                    <th className="text-center py-2 px-3 text-slate-300">
                      Samples
                    </th>
                    <th className="text-center py-2 px-3 text-pink-400">
                      Latency (ms)
                    </th>
                    <th className="text-center py-2 px-3 text-indigo-400">
                      Jitter (ms)
                    </th>
                    <th className="text-center py-2 px-3 text-orange-400">
                      Packet Loss (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.operatorStats).map(([op, opStats]) => (
                    <tr
                      key={op}
                      className="border-t border-slate-700 hover:bg-slate-700/50"
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getOperatorColor(op) }}
                          />
                          <span
                            className="font-medium"
                            style={{ color: getOperatorColor(op) }}
                          >
                            {op}
                          </span>
                        </div>
                      </td>
                      <td className="text-center py-2 px-3 text-white">
                        {opStats.count}
                      </td>
                      <td className="text-center py-2 px-3 text-white">
                        {opStats.avgLatency}
                      </td>
                      <td className="text-center py-2 px-3 text-white">
                        {opStats.avgJitter}
                      </td>
                      <td className="text-center py-2 px-3 text-white">
                        {opStats.avgPacketLoss}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <MultiOperatorDistributionChart
              data={data}
              ranges={LATENCY_RANGES}
              title="Latency Distribution by Operator"
              operators={operators}
              unit="ms"
              valueKey="latency"
            />
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4">
            <MultiOperatorDistributionChart
              data={data}
              ranges={JITTER_RANGES}
              title="Jitter Distribution by Operator"
              operators={operators}
              unit="ms"
              valueKey="jitter"
            />
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4">
            <MultiOperatorDistributionChart
              data={data}
              ranges={PACKET_LOSS_RANGES}
              title="Packet Loss Distribution by Operator"
              operators={operators}
              unit="%"
              valueKey="packetLoss"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <OperatorQualityComparison
            data={data.map((d) => ({ operator: d.operator, value: d.latency }))}
            operators={operators}
            title="Average Latency by Operator"
            unit="ms"
          />
          <OperatorQualityComparison
            data={data.map((d) => ({ operator: d.operator, value: d.jitter }))}
            operators={operators}
            title="Average Jitter by Operator"
            unit="ms"
          />
          <OperatorQualityComparison
            data={data.map((d) => ({
              operator: d.operator,
              value: d.packetLoss,
            }))}
            operators={operators}
            title="Average Packet Loss by Operator"
            unit="%"
          />
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-sm font-medium text-white mb-3">
            Quality Distribution by Operator
          </div>
          <div className="flex flex-wrap gap-4">
            <QualitySummaryByOperator
              data={data}
              ranges={LATENCY_RANGES}
              operators={operators}
              title="Latency Quality"
              valueKey="latency"
            />
            <QualitySummaryByOperator
              data={data}
              ranges={JITTER_RANGES}
              operators={operators}
              title="Jitter Quality"
              valueKey="jitter"
            />
            <QualitySummaryByOperator
              data={data}
              ranges={PACKET_LOSS_RANGES}
              operators={operators}
              title="Packet Loss Quality"
              valueKey="packetLoss"
            />
          </div>
        </div>
      </div>
    </ChartContainer>
  );
});

JitterLatencyChart.displayName = "JitterLatencyChart";