import React, { useMemo } from "react";
import { Layers } from "lucide-react";
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
import { CHART_CONFIG, getTechnologyColor } from "@/utils/constants"; // ✅ Import helper function
import { filterValidData } from "@/utils/analyticsHelpers";

export const TechnologyBreakdown = React.forwardRef(({ locations }, ref) => {
  const data = useMemo(() => {
    if (!locations?.length) return [];

    const grouped = locations.reduce((acc, loc) => {
      const tech = loc.technology || "Unknown";
      if (!acc[tech]) {
        acc[tech] = { count: 0, avgRsrp: [], avgSinr: [] };
      }
      acc[tech].count++;
      if (loc.rsrp != null) acc[tech].avgRsrp.push(loc.rsrp);
      if (loc.sinr != null) acc[tech].avgSinr.push(loc.sinr);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgRsrp:
          data.avgRsrp.length > 0
            ? (
                data.avgRsrp.reduce((a, b) => a + b, 0) / data.avgRsrp.length
              ).toFixed(1)
            : "N/A",
        avgSinr:
          data.avgSinr.length > 0
            ? (
                data.avgSinr.reduce((a, b) => a + b, 0) / data.avgSinr.length
              ).toFixed(1)
            : "N/A",
      }))
      .sort((a, b) => b.count - a.count);
  }, [locations]);

  const validData = filterValidData(data, "name");

  if (!validData.length) {
    return (
      <ChartContainer ref={ref} title="Technology Distribution" icon={Layers}>
        <EmptyState message="No technology data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer ref={ref} title="Technology Distribution" icon={Layers}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={validData}
          margin={{ ...CHART_CONFIG.margin, bottom: 40 }}
        >
          <CartesianGrid {...CHART_CONFIG.grid} />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={60}
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
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {validData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getTechnologyColor(entry.name)} // ✅ Use fuzzy matching function
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="space-y-1 mt-3">
        {validData.map((item, idx) => (
          <div
            key={idx}
            className="bg-slate-800 p-2 rounded text-xs hover:bg-slate-750 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: getTechnologyColor(item.name) }} // ✅ Use fuzzy matching
                />
                <span className="text-white font-semibold">{item.name}</span>
              </div>
              <span className="text-slate-300">
                {item.count.toLocaleString()} Samples
              </span>
            </div>
            <div className="ml-5 text-slate-400 text-[10px]">
              RSRP: <span className="text-blue-400">{item.avgRsrp} dBm</span> |
              SINR: <span className="text-green-400">{item.avgSinr} dB</span>
            </div>
          </div>
        ))}
      </div>
    </ChartContainer>
  );
});

TechnologyBreakdown.displayName = "TechnologyBreakdown";
