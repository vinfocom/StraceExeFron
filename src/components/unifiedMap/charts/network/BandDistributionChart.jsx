import React, { useMemo } from "react";
import { Radio } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { COLORS, CHART_CONFIG } from "@/utils/constants";

export const BandDistributionChart = React.forwardRef(({ locations }, ref) => {
  const data = useMemo(() => {
    if (!locations?.length) return [];

    const bandStats = locations.reduce((acc, loc) => {
      const band = loc.band || "Unknown";
      if (!acc[band]) {
        acc[band] = {
          count: 0,
          avgRsrp: [],
          avgDl: [],
          pciList: new Set(),
          nodebList: new Set(),
        };
      }

      acc[band].count++;
      if (loc.rsrp != null) acc[band].avgRsrp.push(loc.rsrp);
      if (loc.dl_tpt != null) acc[band].avgDl.push(parseFloat(loc.dl_tpt));
      if (loc.pci != null) acc[band].pciList.add(`PCI ${loc.pci}`);
      if (loc.nodeb_id != null) acc[band].nodebList.add(`NodeB ${loc.nodeb_id}`);

      return acc;
    }, {});

    return Object.entries(bandStats)
      .map(([name, info]) => ({
        name: `Band ${name}`,
        count: info.count,
        avgRsrp:
          info.avgRsrp.length > 0
            ? (info.avgRsrp.reduce((a, b) => a + b, 0) / info.avgRsrp.length).toFixed(1)
            : "N/A",
        avgDl:
          info.avgDl.length > 0
            ? (info.avgDl.reduce((a, b) => a + b, 0) / info.avgDl.length).toFixed(1)
            : "N/A",
        pciList: Array.from(info.pciList),
        nodebList: Array.from(info.nodebList),
      }))
      .sort((a, b) => b.count - a.count);
  }, [locations]);

  if (!data.length) {
    return (
      <ChartContainer ref={ref} title="Frequency Band Distribution" icon={Radio}>
        <EmptyState message="No band data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer ref={ref} title="Frequency Band Distribution" icon={Radio}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={5}
            dataKey="count"
            label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
            labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS.CHART_PALETTE[index % COLORS.CHART_PALETTE.length]}
                stroke="#0f172a"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={CHART_CONFIG.tooltip}
            formatter={(value, name, props) => [
              `${value} samples (${((value / data.reduce((sum, d) => sum + d.count, 0)) * 100).toFixed(1)}%)`,
              props.payload.name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="space-y-2 overflow-y-auto scrollbar-hide max-h-[250px] mt-3">
        {data.map((item, idx) => (
          <div key={idx} className="bg-slate-800 p-2 rounded text-xs hover:bg-slate-750 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: COLORS.CHART_PALETTE[idx % COLORS.CHART_PALETTE.length] }}
                />
                <span className="text-white font-semibold">{item.name}</span>
              </div>
              <span className="text-slate-300">{item.count} pts</span>
            </div>
            <div className="grid grid-cols-2 gap-1 ml-5 text-[10px]">
              <div className="text-slate-400">
                RSRP: <span className="text-blue-400">{item.avgRsrp}</span>
              </div>
              <div className="text-slate-400">
                DL: <span className="text-cyan-400">{item.avgDl}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ChartContainer>
  );
});

BandDistributionChart.displayName = "BandDistributionChart";