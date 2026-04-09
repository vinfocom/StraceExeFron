import React, { useMemo } from "react";
import { Network } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { CHART_CONFIG } from "@/utils/constants";
import { filterValidData } from "@/utils/analyticsHelpers";

export const OperatorComparisonChart = React.forwardRef(({ locations }, ref) => {
  const data = useMemo(() => {
    console.log("📊 OperatorComparisonChart - Received locations:", locations?.length);
    
    if (!locations?.length) {
      console.warn("⚠️ No locations data");
      return [];
    }

    // Debug: Check first location structure
    console.log("📍 Sample location:", locations[0]);

    const operatorStats = locations.reduce((acc, loc) => {
      // ✅ CHANGED: Use 'provider' instead of 'operator'
      const operator = loc.provider || loc.operator || "Unknown";
      
      if (!acc[operator]) {
        acc[operator] = {
          count: 0,
          avgRsrp: [],
          avgRsrq: [],
          avgSinr: [],
          avgMos: [],
          avgDl: [],
          avgUl: [],
          avgLatency: [],
        };
      }

      acc[operator].count++;
      if (loc.rsrp != null) acc[operator].avgRsrp.push(loc.rsrp);
      if (loc.rsrq != null) acc[operator].avgRsrq.push(loc.rsrq);
      if (loc.sinr != null) acc[operator].avgSinr.push(loc.sinr);
      if (loc.mos != null) acc[operator].avgMos.push(loc.mos);
      if (loc.dl_tpt != null) acc[operator].avgDl.push(parseFloat(loc.dl_tpt));
      if (loc.ul_tpt != null) acc[operator].avgUl.push(parseFloat(loc.ul_tpt));
      if (loc.latency != null) acc[operator].avgLatency.push(loc.latency);

      return acc;
    }, {});

    console.log("📈 Operator stats:", operatorStats);

    const result = Object.entries(operatorStats)
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgRsrp:
          data.avgRsrp.length > 0
            ? parseFloat((data.avgRsrp.reduce((a, b) => a + b, 0) / data.avgRsrp.length).toFixed(1))
            : 0,
        avgRsrq:
          data.avgRsrq.length > 0
            ? parseFloat((data.avgRsrq.reduce((a, b) => a + b, 0) / data.avgRsrq.length).toFixed(1))
            : 0,
        avgSinr:
          data.avgSinr.length > 0
            ? parseFloat((data.avgSinr.reduce((a, b) => a + b, 0) / data.avgSinr.length).toFixed(1))
            : 0,
        avgMos:
          data.avgMos.length > 0
            ? parseFloat((data.avgMos.reduce((a, b) => a + b, 0) / data.avgMos.length).toFixed(2))
            : 0,
        avgDl:
          data.avgDl.length > 0
            ? parseFloat((data.avgDl.reduce((a, b) => a + b, 0) / data.avgDl.length).toFixed(1))
            : 0,
        avgUl:
          data.avgUl.length > 0
            ? parseFloat((data.avgUl.reduce((a, b) => a + b, 0) / data.avgUl.length).toFixed(1))
            : 0,
        avgLatency:
          data.avgLatency.length > 0
            ? parseFloat((data.avgLatency.reduce((a, b) => a + b, 0) / data.avgLatency.length).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    console.log("✅ Processed operator data:", result);
    return result;
  }, [locations]);

  const validData = filterValidData(data, 'name');

  console.log("🔍 Valid data for chart:", validData);

  if (!validData.length) {
    return (
      <ChartContainer ref={ref} title="Operator Comparison" icon={Network}>
        <EmptyState message="No operator data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer ref={ref} title="Operator Performance Comparison" icon={Network}>
      {/* Signal Quality Chart */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2 font-medium">Signal Quality Metrics</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={validData} margin={{ ...CHART_CONFIG.margin, bottom: 60 }}>
            <CartesianGrid {...CHART_CONFIG.grid} />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              label={{
                value: "RSRP (dBm)",
                angle: -90,
                position: "insideLeft",
                fill: "#9CA3AF",
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              label={{
                value: "SINR (dB)",
                angle: 90,
                position: "insideRight",
                fill: "#9CA3AF",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={CHART_CONFIG.tooltip}
              formatter={(value, name) => {
                if (typeof value === 'number') {
                  return [value.toFixed(1), name];
                }
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar
              yAxisId="left"
              dataKey="avgRsrp"
              fill="#3b82f6"
              name="Avg RSRP (dBm)"
              radius={[8, 8, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="avgSinr"
              stroke="#10b981"
              strokeWidth={2}
              name="Avg SINR (dB)"
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Throughput & MOS Chart */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2 font-medium">Throughput & Quality of Experience</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={validData} margin={{ ...CHART_CONFIG.margin, bottom: 60 }}>
            <CartesianGrid {...CHART_CONFIG.grid} />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              label={{
                value: "Throughput (Mbps)",
                angle: -90,
                position: "insideLeft",
                fill: "#9CA3AF",
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 5]}
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              label={{
                value: "MOS Score",
                angle: 90,
                position: "insideRight",
                fill: "#9CA3AF",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={CHART_CONFIG.tooltip}
              formatter={(value, name) => {
                if (typeof value === 'number') {
                  return name.includes('MOS') 
                    ? [value.toFixed(2), name]
                    : [value.toFixed(1) + ' Mbps', name];
                }
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar
              yAxisId="left"
              dataKey="avgDl"
              fill="#06b6d4"
              name="Avg Download"
              radius={[8, 8, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="avgUl"
              fill="#f97316"
              name="Avg Upload"
              radius={[8, 8, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="avgMos"
              stroke="#facc15"
              strokeWidth={3}
              name="Avg MOS"
              dot={{ r: 5, fill: "#facc15" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Statistics Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 sticky top-0">
            <tr className="border-b border-slate-700">
              <th className="text-left p-2 text-slate-400 font-medium">Operator</th>
              <th className="text-center p-2 text-slate-400 font-medium">Samples</th>
              <th className="text-center p-2 text-slate-400 font-medium">RSRP</th>
              <th className="text-center p-2 text-slate-400 font-medium">RSRQ</th>
              <th className="text-center p-2 text-slate-400 font-medium">SINR</th>
              <th className="text-center p-2 text-slate-400 font-medium">MOS</th>
              <th className="text-center p-2 text-slate-400 font-medium">DL</th>
              <th className="text-center p-2 text-slate-400 font-medium">UL</th>
              <th className="text-center p-2 text-slate-400 font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {validData.map((item, idx) => (
              <tr
                key={idx}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-2">
                  <span className="font-semibold text-white">{item.name}</span>
                </td>
                <td className="p-2 text-center text-slate-300">{item.count}</td>
                <td
                  className={`p-2 text-center font-semibold ${
                    item.avgRsrp >= -90
                      ? "text-green-400"
                      : item.avgRsrp >= -105
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {item.avgRsrp || "N/A"}
                </td>
                <td className="p-2 text-center text-purple-400 font-semibold">
                  {item.avgRsrq || "N/A"}
                </td>
                <td className="p-2 text-center text-green-400 font-semibold">
                  {item.avgSinr || "N/A"}
                </td>
                <td className="p-2 text-center text-yellow-400 font-semibold">
                  {item.avgMos ? item.avgMos.toFixed(2) : "N/A"}
                </td>
                <td className="p-2 text-center text-cyan-400 font-semibold">
                  {item.avgDl ? `${item.avgDl} Mbps` : "N/A"}
                </td>
                <td className="p-2 text-center text-orange-400 font-semibold">
                  {item.avgUl ? `${item.avgUl} Mbps` : "N/A"}
                </td>
                <td
                  className={`p-2 text-center font-semibold ${
                    item.avgLatency < 50
                      ? "text-green-400"
                      : item.avgLatency < 100
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {item.avgLatency ? `${item.avgLatency} ms` : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-slate-800 rounded-lg p-3 text-center hover:bg-slate-750 transition-colors">
          <div className="text-xs text-slate-400 mb-1">Total Operators</div>
          <div className="text-2xl font-bold text-blue-400">{validData.length}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-3 text-center hover:bg-slate-750 transition-colors">
          <div className="text-xs text-slate-400 mb-1">Total Samples</div>
          <div className="text-2xl font-bold text-green-400">
            {validData.reduce((sum, op) => sum + op.count, 0)}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-3 text-center hover:bg-slate-750 transition-colors">
          <div className="text-xs text-slate-400 mb-1">Avg MOS</div>
          <div className="text-2xl font-bold text-yellow-400">
            {validData.length > 0
              ? (validData.reduce((sum, op) => sum + op.avgMos, 0) / validData.length).toFixed(2)
              : "N/A"}
          </div>
        </div>
      </div>
    </ChartContainer>
  );
});

OperatorComparisonChart.displayName = "OperatorComparisonChart";