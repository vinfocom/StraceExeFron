import React, { useState, useMemo, useEffect } from "react";
import {
  Bar,
  Legend,
  XAxis,
  Line,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import ChartCard from "../ChartCard";
import { useAppData } from "@/hooks/useDashboardData.js";

const METRIC_CONFIG = [
  { key: "avgDlTptMbps", label: "Download (Mbps)", color: "#3B82F6", yAxisId: "left" },
  { key: "avgUlTptMbps", label: "Upload (Mbps)", color: "#10B981", yAxisId: "left" },
  { key: "avgMos", label: "MOS", color: "#F59E0B", yAxisId: "left" },
  { key: "avgRsrp", label: "RSRP (dBm)", color: "#8B5CF6", yAxisId: "left" },
  { key: "avgRsrq", label: "RSRQ (dB)", color: "#6366F1", yAxisId: "left" },
  { key: "avgSinr", label: "SINR (dB)", color: "#14B8A6", yAxisId: "left" },
  { key: "avgJitter", label: "Jitter (ms)", color: "#EC4899", yAxisId: "left" },
  { key: "avgLatency", label: "Latency (ms)", color: "#F97316", yAxisId: "left" },
  { key: "avgPacketLoss", label: "Packet Loss (%)", color: "#84CC16", yAxisId: "left" },
  { key: "avgDuration", label: "Duration (hrs)", color: "#A78BFA", yAxisId: "left" },
  { key: "sampleCount", label: "Sample Count", color: "#EF4444", isLine: true, yAxisId: "right" },
];

// ============================================
// LOADING PROGRESS COMPONENT
// ============================================
const LoadingProgress = ({ elapsed, isLoading }) => {
  const [progress, setProgress] = useState(0);
  const maxTime = 30; // 30 seconds expected max time

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = (elapsed / maxTime) * 100;
        return Math.min(newProgress, 95); // Cap at 95% until actually loaded
      });
    }, 100);

    return () => clearInterval(interval);
  }, [elapsed, isLoading]);

  if (!isLoading) return null;

  const displayElapsed = Math.floor(elapsed);
  const estimatedRemaining = Math.max(0, maxTime - displayElapsed);

  return (
    <div className="w-full max-w-md space-y-3">
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progress}%` }}
        >
          <div className="h-full w-full bg-white/20 animate-pulse" />
        </div>
      </div>

      {/* Time Info */}
      <div className="flex justify-between text-sm text-gray-600">
        <span>Elapsed: {displayElapsed}s</span>
        <span>{progress.toFixed(0)}%</span>
        <span>~{estimatedRemaining}s remaining</span>
      </div>

      {/* Loading Tips */}
      <div className="text-xs text-gray-500 text-center mt-2">
        {displayElapsed < 10 && "Fetching app performance data..."}
        {displayElapsed >= 10 && displayElapsed < 20 && "Processing large dataset..."}
        {displayElapsed >= 20 && displayElapsed < 30 && "Almost there..."}
        {displayElapsed >= 30 && "This is taking longer than usual. Please wait..."}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
function AppChart() {
  const { 
    data: chartData, 
    isLoading, 
    error,
    mutate,
    isValidating
  } = useAppData();

  // Track loading time
  const [loadingStartTime, setLoadingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (isLoading) {
      setLoadingStartTime(Date.now());
      const interval = setInterval(() => {
        setElapsedTime((Date.now() - (loadingStartTime || Date.now())) / 1000);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setLoadingStartTime(null);
      setElapsedTime(0);
    }
  }, [isLoading]);

  // ============================================
  // LOCAL FILTER STATES
  // ============================================
  const [selectedMetrics, setSelectedMetrics] = useState([
    "avgDlTptMbps",
    "avgUlTptMbps",
    "avgMos",
  ]);
  const [topN, setTopN] = useState(15);
  const [sortBy, setSortBy] = useState('sampleCount');

  // ============================================
  // DATA VALIDATION
  // ============================================
  const data = useMemo(() => {
    if (!chartData) {
      console.warn('⚠️ [AppChart] chartData is null/undefined');
      return [];
    }
    if (!Array.isArray(chartData)) {
      console.warn('⚠️ [AppChart] chartData is not an array:', typeof chartData);
      return [];
    }
    return chartData;
  }, [chartData]);

  // ============================================
  // FILTERED & SORTED DATA
  // ============================================
  const displayData = useMemo(() => {
    if (!data || data.length === 0) {
      console.warn('⚠️ [AppChart] No data to display');
      return [];
    }
    
    const sorted = [...data].sort((a, b) => {
      if (sortBy === 'sampleCount') return (b.sampleCount || 0) - (a.sampleCount || 0);
      if (sortBy === 'avgDlTptMbps') return (b.avgDlTptMbps || 0) - (a.avgDlTptMbps || 0);
      if (sortBy === 'avgMos') return (b.avgMos || 0) - (a.avgMos || 0);
      if (sortBy === 'appName') return (a.appName || '').localeCompare(b.appName || '');
      return 0;
    });
    
    const result = sorted.slice(0, topN);
    
    return result;
  }, [data, topN, sortBy]);

  // ============================================
  // GET ACTIVE METRICS CONFIG
  // ============================================
  const activeMetrics = useMemo(() => {
    return METRIC_CONFIG.filter(m => selectedMetrics.includes(m.key));
  }, [selectedMetrics]);

  // ============================================
  // CUSTOM TOOLTIP
  // ============================================
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white rounded-lg shadow-xl border-2 border-blue-500 p-3">
        <div className="text-lg font-bold mb-2 pb-2 border-b border-gray-200 text-gray-900">
          {label}
        </div>
        <div className="space-y-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm font-semibold text-gray-700">
                  {entry.name}
                </span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================
  // SETTINGS RENDER
  // ============================================
  const settingsRender = () => (
    <div className="space-y-4">
      {/* Metric Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Select Metrics to Display
        </label>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {METRIC_CONFIG.map(({ key, label, color }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
              <input
                type="checkbox"
                checked={selectedMetrics.includes(key)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMetrics((prev) => [...prev, key]);
                  } else {
                    setSelectedMetrics((prev) => prev.filter((m) => m !== key));
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: color }}
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Top N */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Show Top Apps
        </label>
        <select
          value={topN}
          onChange={(e) => setTopN(Number(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
          <option value={15}>Top 15</option>
          <option value={20}>Top 20</option>
          <option value={25}>Top 25</option>
          <option value={50}>Top 50</option>
        </select>
      </div>

      {/* Sort By */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Sort By
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          <option value="sampleCount">Most Samples</option>
          <option value="avgDlTptMbps">Highest Download Speed</option>
          <option value="avgMos">Highest MOS</option>
          <option value="appName">App Name (A-Z)</option>
        </select>
      </div>

      {/* Info */}
      <div className="pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Total Apps:</span>
            <span className="font-semibold text-gray-900">{data.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Showing:</span>
            <span className="font-semibold text-gray-900">{displayData.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Metrics Selected:</span>
            <span className="font-semibold text-gray-900">{selectedMetrics.length}</span>
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setSelectedMetrics(["avgDlTptMbps", "avgUlTptMbps", "avgMos"]);
            setTopN(15);
            setSortBy('sampleCount');
          }}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={() => mutate()}
          disabled={isValidating || isLoading}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isValidating || isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>
  );

  // ============================================
  // RENDER
  // ============================================
  return (
    <ChartCard
      title="App Performance Analysis"
      dataset={data}
      exportFileName="app_performance"
      isLoading={isLoading}
      error={error}
      showChartFilters={false}
      settings={{
        title: "App Chart Settings",
        render: settingsRender,
      }}
    >
      {isLoading ? (
        // ✅ Enhanced Loading State with Progress
        <div className="flex flex-col items-center justify-center h-full text-gray-500 py-12">
          <div className="relative mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
            <div className="absolute top-0 left-0 h-16 w-16 rounded-full border-t-4 border-blue-300 animate-pulse"></div>
          </div>
          
          <p className="text-lg font-semibold text-gray-700 mb-2">Loading App Data...</p>
          <p className="text-sm text-gray-500 mb-6">This may take up to 30 seconds</p>
          
          <LoadingProgress elapsed={elapsedTime} isLoading={isLoading} />

          {/* Loading Dots Animation */}
          <div className="flex gap-2 mt-6">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>

          {/* Cancel/Retry hint */}
          {elapsedTime > 30 && (
            <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <p className="font-semibold">Taking longer than expected?</p>
              <p className="text-xs mt-1">The server may be processing a large dataset. Please wait or try refreshing.</p>
            </div>
          )}
        </div>
      ) : error ? (
        // ✅ Error State
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-semibold text-red-600">Failed to Load Data</p>
          <p className="text-sm text-gray-500 mt-1 mb-4">{error?.message || 'An error occurred'}</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : displayData.length > 0 ? (
        <div style={{ width: "100%", height: "100%" }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
            <ComposedChart
              data={displayData}
              margin={{ top: 20, right: 60, left: 20, bottom: 95 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

              <XAxis
                dataKey="appName"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={110}
                tickMargin={14}
                dy={8}
                padding={{ left: 12, right: 12 }}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) =>
                  String(value || "").length > 12
                    ? `${String(value).slice(0, 12)}...`
                    : String(value || "")
                }
              />

              <YAxis
                yAxisId="left"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                label={{
                  value: "Metrics",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#6b7280", fontSize: 12, fontWeight: 600 },
                }}
              />

              {selectedMetrics.includes("sampleCount") && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "#EF4444", fontSize: 11 }}
                  label={{
                    value: "Sample Count",
                    angle: 90,
                    position: "insideRight",
                    style: { fill: "#EF4444", fontSize: 12, fontWeight: 600 },
                  }}
                />
              )}

              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="circle"
              />

              {/* Render Bars */}
              {activeMetrics
                .filter((m) => !m.isLine)
                .map((metric) => (
                  <Bar
                    key={metric.key}
                    yAxisId={metric.yAxisId}
                    dataKey={metric.key}
                    name={metric.label}
                    fill={metric.color}
                    barSize={activeMetrics.filter(m => !m.isLine).length > 3 ? 15 : 25}
                    radius={[4, 4, 0, 0]}
                  />
                ))}

              {/* Render Line for Sample Count */}
              {selectedMetrics.includes("sampleCount") && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sampleCount"
                  name="Sample Count"
                  stroke="#EF4444"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#EF4444", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 7 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg font-semibold text-gray-700">No App Data Available</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Try refreshing or adjusting your filters</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh Data
          </button>
        </div>
      )}
    </ChartCard>
  );
}

export default AppChart;
