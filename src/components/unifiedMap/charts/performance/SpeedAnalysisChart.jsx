import React, { useMemo, useState } from "react"; // [Change 1] Import useState
import { Gauge } from "lucide-react";
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

// [Change 2] Add onBarClick to props
export const SpeedAnalysisChart = React.forwardRef(({ locations, onBarClick }, ref) => {
  const [activeIndex, setActiveIndex] = useState(null); 

  const data = useMemo(() => {
    if (!locations?.length) return [];

    return locations
      .filter((loc) => 
        loc.speed != null && 
        !isNaN(loc.speed) && 
        isFinite(loc.speed) &&
        parseFloat(loc.speed) > 0 
      )
      .map((loc, idx) => ({
        index: idx + 1,
        // Speed from API/DB is already in km/h. Keep raw value to avoid inflation.
        speed: parseFloat(loc.speed),
        timestamp: loc.timestamp,
        provider: loc.provider || "Unknown",
        band: loc.band || "Unknown",
        originalLog: loc // Keep ref to original log
      }))
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return new Date(a.timestamp) - new Date(b.timestamp);
        }
        return 0;
      });
  }, [locations]);

  // [Change 4] Add Click Handler
  const handleBarClick = (data, index) => {
    // If clicking the same bar, deselect. Otherwise select.
    const newIndex = activeIndex === index ? null : index;
    setActiveIndex(newIndex);

    if (onBarClick) {
      if (newIndex === null) {
        onBarClick(null); // Clear map filter
      } else {
        // Filter original locations based on the bucket's min/max
        const { min, max } = data;
        const filteredLogs = locations.filter(loc => {
           if (loc.speed == null || isNaN(loc.speed)) return false;
           const speedKmh = parseFloat(loc.speed);
           return speedKmh >= min && speedKmh < max;
        });
        onBarClick(filteredLogs); // Pass filtered logs to parent
      }
    }
  };

  const stats = useMemo(() => {
    if (!data.length) return null;

    const speeds = data.map((d) => d.speed);
    return {
      avgSpeed: (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1),
      maxSpeed: Math.max(...speeds).toFixed(1),
      minSpeed: Math.min(...speeds).toFixed(1),
    };
  }, [data]);

  const speedDistribution = useMemo(() => {
    if (!data.length) return [];

    const buckets = [
      { range: "0-20", min: 0, max: 20, count: 0, color: "#ef4444", label: "Static/walking" },
      { range: "20-40", min: 20, max: 40, count: 0, color: "#f59e0b", label: "Cycling/city" },
      { range: "40-60", min: 40, max: 60, count: 0, color: "#eab308", label: "Moderate" },
      { range: "60-80", min: 60, max: 80, count: 0, color: "#22c55e", label: "Fast" },
      { range: "80-100", min: 80, max: 100, count: 0, color: "#3b82f6", label: "Very Fast" },
      { range: "100+", min: 100, max: Infinity, count: 0, color: "#8b5cf6", label: "Highway" },
    ];

    data.forEach((d) => {
      const bucket = buckets.find((b) => d.speed >= b.min && d.speed < b.max);
      if (bucket) bucket.count++;
    });

    return buckets.filter((b) => b.count > 0);
  }, [data]);

  if (!data.length) {
    return (
      <ChartContainer ref={ref} title="Speed Analysis" icon={Gauge}>
        <EmptyState message="No speed data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer 
      ref={ref} 
      title={`Speed Analysis (${data.length} samples)`} 
      icon={Gauge}
      collapsible
      expandable
    >
      {/* Speed Statistics */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-800 rounded-lg p-3 text-center border border-slate-700 hover:bg-slate-750 transition-colors">
            <div className="text-xs text-white mb-1">Average Speed</div>
            <div className="text-xl font-bold text-blue-400">
              {stats.avgSpeed}
            </div>
            <div className="text-xs text-white mt-0.5">km/h</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 text-center border border-slate-700 hover:bg-slate-750 transition-colors">
            <div className="text-xs text-white mb-1">Max Speed</div>
            <div className="text-xl font-bold text-green-400">
              {stats.maxSpeed}
            </div>
            <div className="text-xs text-white mt-0.5">km/h</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 text-center border border-slate-700 hover:bg-slate-750 transition-colors">
            <div className="text-xs text-white mb-1">Min Speed</div>
            <div className="text-xl font-bold text-orange-400">
              {stats.minSpeed}
            </div>
            <div className="text-xs text-white mt-0.5">km/h</div>
          </div>
        </div>
      )}

      {/* Speed Distribution Bar Chart */}
      <div className="bg-slate-800/50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-medium text-slate-300">Speed Distribution</div>
            {/* [Change 5] Optional clear button */}
            {activeIndex !== null && (
                <button 
                onClick={() => handleBarClick(null, activeIndex)}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                Clear Selection
                </button>
            )}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={speedDistribution} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid {...CHART_CONFIG.grid} />
            <XAxis
              dataKey="range"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              label={{ 
                value: "Speed Range (km/h)", 
                position: "insideBottom", 
                offset: -10, 
                fill: "#9CA3AF",
                fontSize: 11
              }}
            />
            <YAxis
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              label={{ 
                value: "Count", 
                angle: -90, 
                position: "insideLeft", 
                fill: "#9CA3AF",
                fontSize: 11
              }}
            />
            <Tooltip
              contentStyle={{
                ...CHART_CONFIG.tooltip,
                minWidth: '200px'
              }}
              formatter={(value, name, props) => {
                const percentage = ((value / data.length) * 100).toFixed(1);
                return [
                  `${value} samples (${percentage}%)`,
                  props.payload.label || props.payload.range,
                ];
              }}
              labelFormatter={(label) => `${label} km/h`}
            />
            {/* [Change 6] Attach onClick to Bar */}
            <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]} 
                onClick={handleBarClick} 
                className="cursor-pointer"
            >
              {speedDistribution.map((entry, index) => (
                <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color} 
                    // [Change 7] Visual feedback for selection
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.3}
                    stroke={activeIndex === index ? "#fff" : "none"}
                    strokeWidth={activeIndex === index ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Distribution Legend */}
        <div className="mt-4 space-y-1.5">
          {speedDistribution.map((item, idx) => (
            <div
              key={idx}
              // [Change 8] Allow clicking legend to filter as well
              onClick={() => handleBarClick(item, idx)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeIndex === idx ? "bg-slate-700 ring-1 ring-white/20" : "hover:bg-slate-700/30"
              }`}
              style={{ 
                backgroundColor: activeIndex === idx ? undefined : `${item.color}15`,
                borderLeft: `3px solid ${item.color}`,
                opacity: activeIndex === null || activeIndex === idx ? 1 : 0.5
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium" style={{ color: item.color }}>
                  {item.range} km/h
                </span>
                <span className="text-xs text-white">({item.label})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-white">
                  {item.count} samples
                </span>
                <span className="text-xs text-white min-w-[45px] text-right">
                  {((item.count / data.length) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartContainer>
  );
});

SpeedAnalysisChart.displayName = "SpeedAnalysisChart";
