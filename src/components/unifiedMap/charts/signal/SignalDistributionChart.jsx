import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { CHART_CONFIG } from "@/utils/constants";

export const SignalDistributionChart = React.forwardRef(
  ({ locations, metric, thresholds }, ref) => {
    const data = useMemo(() => {
      if (!locations?.length || !metric || !thresholds?.[metric]) return [];

      const currentThresholds = thresholds[metric];

      return currentThresholds
        .map((threshold) => {
          const count = locations.filter((loc) => {
            const val = loc[metric];
            return val != null && val >= threshold.min && val <= threshold.max;
          }).length;

          return {
            range: `${threshold.min} to ${threshold.max}`,
            count,
            color: threshold.color,
            percentage: ((count / locations.length) * 100).toFixed(1),
          };
        })
        .filter((item) => item.count > 0);
    }, [locations, metric, thresholds]);

    if (!data.length) {
      return (
        <ChartContainer ref={ref} title={`${metric?.toUpperCase()} Distribution`} icon={BarChart3}>
          <EmptyState message="No data available for this metric" />
        </ChartContainer>
      );
    }

    return (
      <ChartContainer ref={ref} title={`${metric?.toUpperCase()} Distribution`} icon={BarChart3}>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={CHART_CONFIG.margin}>
            <CartesianGrid {...CHART_CONFIG.grid} />
            <XAxis
              dataKey="range"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
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
              formatter={(value) => [value, "Samples"]}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          {data.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-slate-800 p-2 rounded hover:bg-slate-750 transition-colors"
            >
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-300 flex-1">{item.range}</span>
              <span className="font-semibold text-white">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </ChartContainer>
    );
  }
);

SignalDistributionChart.displayName = "SignalDistributionChart";