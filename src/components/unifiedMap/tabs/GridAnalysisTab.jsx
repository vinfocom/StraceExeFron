// src/components/unifiedMap/tabs/GridAnalysisTab.jsx
import React, { useMemo } from "react";
import { Grid3X3, MapPin, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";

// Color schemes matching the map grid colors
const GRID_COLOR_SCHEMES = {
  count: [
    { min: 0, max: 1, color: "#F3F4F6", label: "0" },
    { min: 1, max: 5, color: "#DBEAFE", label: "1-4" },
    { min: 5, max: 10, color: "#93C5FD", label: "5-9" },
    { min: 10, max: 25, color: "#60A5FA", label: "10-24" },
    { min: 25, max: 50, color: "#3B82F6", label: "25-49" },
    { min: 50, max: 100, color: "#2563EB", label: "50-99" },
    { min: 100, max: Infinity, color: "#1E40AF", label: "100+" },
  ],
  rsrp: [
    { min: -140, max: -115, color: "#991B1B", label: "<-115" },
    { min: -115, max: -105, color: "#DC2626", label: "-115 to -105" },
    { min: -105, max: -95, color: "#F97316", label: "-105 to -95" },
    { min: -95, max: -85, color: "#FBBF24", label: "-95 to -85" },
    { min: -85, max: -75, color: "#84CC16", label: "-85 to -75" },
    { min: -75, max: 0, color: "#22C55E", label: ">-75" },
  ],
  rsrq: [
    { min: -30, max: -15, color: "#DC2626", label: "<-15" },
    { min: -15, max: -10, color: "#F97316", label: "-15 to -10" },
    { min: -10, max: -5, color: "#FBBF24", label: "-10 to -5" },
    { min: -5, max: 0, color: "#22C55E", label: ">-5" },
  ],
  sinr: [
    { min: -20, max: 0, color: "#DC2626", label: "<0" },
    { min: 0, max: 10, color: "#F97316", label: "0-10" },
    { min: 10, max: 20, color: "#FBBF24", label: "10-20" },
    { min: 20, max: 30, color: "#84CC16", label: "20-30" },
    { min: 30, max: 100, color: "#22C55E", label: ">30" },
  ],
};

const getGridCellColor = (value, metric) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "#E5E7EB";
  }
  const scheme = GRID_COLOR_SCHEMES[metric] || GRID_COLOR_SCHEMES.count;
  for (const range of scheme) {
    if (value >= range.min && value < range.max) {
      return range.color;
    }
  }
  return scheme[scheme.length - 1]?.color || "#6B7280";
};

const StatCard = ({ title, value, subtitle, icon: Icon, color = "blue" }) => {
  const colorClasses = {
    blue: "bg-blue-900/30 border-blue-700 text-blue-400",
    green: "bg-green-900/30 border-green-700 text-green-400",
    red: "bg-red-900/30 border-red-700 text-red-400",
    purple: "bg-purple-900/30 border-purple-700 text-purple-400",
    yellow: "bg-yellow-900/30 border-yellow-700 text-yellow-400",
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{title}</span>
        {Icon && <Icon className="h-4 w-4" />}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
    </div>
  );
};

const CellList = ({ cells, metric, title, icon: Icon, emptyMessage }) => {
  if (!cells?.length) {
    return (
      <div className="text-xs text-slate-500 text-center py-2">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
        {Icon && <Icon className="h-3 w-3" />}
        {title}
      </div>
      <div className="space-y-1">
        {cells.map((cell, idx) => {
          const value = metric === 'count' ? cell.count : cell.avgValue;
          const color = getGridCellColor(value, metric);
          
          return (
            <div 
              key={cell.id || idx}
              className="flex items-center gap-2 p-2 bg-slate-800/50 rounded text-xs"
            >
              <div 
                className="w-3 h-3 rounded flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-slate-300">
                  Cell #{cell.id}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {cell.center?.lat?.toFixed(5)}, {cell.center?.lng?.toFixed(5)}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-medium" style={{ color }}>
                  {value?.toFixed(metric === 'count' ? 0 : 1)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {cell.count} logs
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const GridAnalysisTab = ({
  gridCells = [],
  gridStats,
  gridSettings,
  gridAnalysisStats,
  thresholds,
  expanded,
  chartRefs,
}) => {
  const metric = gridSettings?.metric || 'count';
  const colorScheme = GRID_COLOR_SCHEMES[metric] || GRID_COLOR_SCHEMES.count;

  // Calculate distribution for chart
  const distributionData = useMemo(() => {
    if (!gridAnalysisStats?.distribution) return [];
    
    return Object.entries(gridAnalysisStats.distribution)
      .map(([label, count]) => ({
        label,
        count,
        color: colorScheme.find(s => s.label === label)?.color || '#6B7280',
      }))
      .sort((a, b) => {
        // Sort by the order in colorScheme
        const aIdx = colorScheme.findIndex(s => s.label === a.label);
        const bIdx = colorScheme.findIndex(s => s.label === b.label);
        return aIdx - bIdx;
      });
  }, [gridAnalysisStats, colorScheme]);

  if (!gridStats) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Grid3X3 className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No grid data available</p>
        <p className="text-xs mt-1">Enable grid mode to see analysis</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grid Overview Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="Total Cells"
          value={gridStats.totalCells}
          subtitle={`${gridSettings?.sizeMeters || 50}m × ${gridSettings?.sizeMeters || 50}m each`}
          icon={Grid3X3}
          color="blue"
        />
        <StatCard
          title="Cells with Data"
          value={gridStats.cellsWithData}
          subtitle={`${gridAnalysisStats?.coveragePercent || 0}% coverage`}
          icon={MapPin}
          color="green"
        />
        <StatCard
          title="Total Logs"
          value={gridStats.totalLogs}
          subtitle={`Avg ${gridStats.avgLogsPerCell} per cell`}
          icon={BarChart2}
          color="purple"
        />
        <StatCard
          title="Empty Cells"
          value={gridStats.totalCells - gridStats.cellsWithData}
          subtitle="No data collected"
          color="yellow"
        />
      </div>

      {/* Metric Stats */}
      {gridStats.metricStats && metric !== 'count' && (
        <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="text-xs font-medium text-slate-300 mb-2">
            {metric.toUpperCase()} Statistics ({gridSettings?.aggregation?.toUpperCase()})
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-red-900/20 rounded">
              <div className="text-[10px] text-slate-400">Minimum</div>
              <div className="text-sm font-bold text-red-400">
                {gridStats.metricStats.min?.toFixed(1)}
              </div>
            </div>
            <div className="text-center p-2 bg-blue-900/20 rounded">
              <div className="text-[10px] text-slate-400">Average</div>
              <div className="text-sm font-bold text-blue-400">
                {gridStats.metricStats.avg?.toFixed(1)}
              </div>
            </div>
            <div className="text-center p-2 bg-green-900/20 rounded">
              <div className="text-[10px] text-slate-400">Maximum</div>
              <div className="text-sm font-bold text-green-400">
                {gridStats.metricStats.max?.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Color Legend */}
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-xs font-medium text-slate-300 mb-2">
          {metric === 'count' ? 'Log Count' : metric.toUpperCase()} Color Scale
        </div>
        <div className="flex gap-1">
          {colorScheme.map((range, idx) => (
            <div key={idx} className="flex-1 text-center">
              <div
                className="h-4 rounded-sm mb-1"
                style={{ backgroundColor: range.color }}
              />
              <div className="text-[8px] text-slate-400 leading-tight">
                {range.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution Chart */}
      {distributionData.length > 0 && (
        <div 
          ref={chartRefs.gridDistribution}
          className="p-3 bg-slate-800/50 rounded-lg border border-slate-700"
        >
          <div className="text-xs font-medium text-slate-300 mb-3">
            Cell Distribution
          </div>
          <div className="space-y-2">
            {distributionData.map((item, idx) => {
              const maxCount = Math.max(...distributionData.map(d => d.count));
              const percentage = (item.count / maxCount) * 100;
              
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-20 text-[10px] text-slate-400 text-right">
                    {item.label}
                  </div>
                  <div className="flex-1 h-4 bg-slate-700 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <div className="w-8 text-xs text-slate-300 font-medium">
                    {item.count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hotspots */}
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <CellList
          cells={gridAnalysisStats?.hotspots}
          metric="count"
          title="High Density Cells (Most Logs)"
          icon={TrendingUp}
          emptyMessage="No hotspots identified"
        />
      </div>

      {/* Cold Spots (for signal metrics) */}
      {['rsrp', 'rsrq', 'sinr'].includes(metric) && (
        <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <CellList
            cells={gridAnalysisStats?.coldSpots}
            metric={metric}
            title={`Weak ${metric.toUpperCase()} Areas`}
            icon={TrendingDown}
            emptyMessage="No weak signal areas identified"
          />
        </div>
      )}

      {/* Grid Settings Summary */}
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-xs font-medium text-slate-300 mb-2">
          Current Settings
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Cell Size:</span>
            <span className="text-slate-300">{gridSettings?.sizeMeters || 50}m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Metric:</span>
            <span className="text-slate-300">{metric.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Aggregation:</span>
            <span className="text-slate-300">{gridSettings?.aggregation?.toUpperCase() || 'AVG'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Opacity:</span>
            <span className="text-slate-300">{Math.round((gridSettings?.opacity || 0.6) * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridAnalysisTab;