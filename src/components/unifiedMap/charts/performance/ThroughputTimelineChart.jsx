import React, { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  Line,
  Brush,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { CHART_CONFIG } from "@/utils/constants";

export const ThroughputTimelineChart = React.forwardRef(({ locations }, ref) => {
  const data = useMemo(() => {
    if (!locations?.length) return [];

    return locations
      .filter((loc) => loc.timestamp && (loc.dl_tpt != null || loc.ul_tpt != null))
      .map((loc, idx) => ({
        index: idx + 1,
        timestamp: loc.timestamp,
        dl: parseFloat(loc.dl_tpt) || 0,
        ul: parseFloat(loc.ul_tpt) || 0,
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [locations]);

  if (!data.length) {
    return (
      <ChartContainer ref={ref} title="Throughput Timeline" icon={TrendingUp}>
        <EmptyState message="No throughput data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer ref={ref} title="Throughput Timeline" icon={TrendingUp}>
      <ResponsiveContainer width="100%" height={320}>
  <LineChart data={data} margin={CHART_CONFIG.margin}>
    <CartesianGrid {...CHART_CONFIG.grid} />

    <XAxis
      dataKey="index"
      tick={{ fill: "#9CA3AF", fontSize: 11 }}
      label={{
        value: "Sample Number",
        position: "insideBottom",
        offset: -5,
        fill: "#9CA3AF",
      }}
    />

    <YAxis
      tick={{ fill: "#9CA3AF", fontSize: 11 }}
      label={{
        value: "Throughput (Mbps)",
        angle: -90,
        position: "insideLeft",
        fill: "#9CA3AF",
      }}
    />

    <Tooltip
      contentStyle={CHART_CONFIG.tooltip}
      formatter={(value) => {
        const num = Number(value);
        return isNaN(num) ? value : `${num.toFixed(2)} Mbps`;
      }}
    />

    <Legend wrapperStyle={{ fontSize: "12px" }} />

    {/* --- DL LINE --- */}
    <Line
      type="monotone"
      dataKey="dl"
      stroke="#06b6d4"
      strokeWidth={1.4}
      dot={false}
      name="Download"
    />

    {/* --- UL LINE --- */}
    <Line
      type="monotone"
      dataKey="ul"
      stroke="#f97316"
      strokeWidth={1.4}
      dot={false}
      name="Upload"
    />

    {/* --- Brush for zooming large datasets --- */}
    <Brush
      dataKey="index"
      height={20}
      stroke="#6b7280"
      travellerWidth={8}
    />
  </LineChart>
</ResponsiveContainer>

    </ChartContainer>
  );
});

ThroughputTimelineChart.displayName = "ThroughputTimelineChart";