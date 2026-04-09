import React, { useState, useMemo, useCallback, memo } from 'react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Scatter, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceArea, 
  Cell 
} from 'recharts';
import { Smartphone, TrendingUp, TrendingDown } from 'lucide-react';
import ChartCard from '../ChartCard';
import { TOOLTIP_STYLE } from '@/components/constants/dashboardConstants';
import { useHandsetPerformance } from '@/hooks/useDashboardData.js';
import { getRSRPPointColor } from '@/utils/chartUtils';

const CHART_Y_MIN = -120;
const CHART_Y_MAX = -60;

const SIGNAL_QUALITY_RANGES = [
  { y1: -60, y2: -85, fill: '#10B981', fillOpacity: 0.08, label: 'Excellent' },
  { y1: -85, y2: -95, fill: '#3B82F6', fillOpacity: 0.08, label: 'Good' },
  { y1: -95, y2: -105, fill: '#F59E0B', fillOpacity: 0.08, label: 'Fair' },
  { y1: -105, y2: -120, fill: '#EF4444', fillOpacity: 0.08, label: 'Poor' },
];

const getSignalQuality = (value) => {
  if (!value || isNaN(value)) return 'Unknown';
  if (value >= -85) return 'Excellent';
  if (value >= -95) return 'Good';
  if (value >= -105) return 'Fair';
  return 'Poor';
};

const LollipopDot = memo((props) => {
  const { cx, cy, payload } = props;
  
  if (!payload || typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }

  const avgValue = payload.Avg;
  if (avgValue === undefined || avgValue === null || isNaN(avgValue)) {
    return null;
  }

  const color = getRSRPPointColor(avgValue);
  
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity={0.2} />
      <circle 
        cx={cx} 
        cy={cy} 
        r={7} 
        fill={color} 
        stroke="#fff" 
        strokeWidth={2} 
        style={{ cursor: 'pointer' }}
      />
      <circle cx={cx} cy={cy} r={3} fill="#fff" fillOpacity={0.4} />
    </g>
  );
});
LollipopDot.displayName = 'LollipopDot';

const LollipopStick = memo((props) => {
  const { x, y, width, height, payload } = props;
  
  if (!payload || 
      typeof x !== 'number' || 
      typeof y !== 'number' || 
      typeof width !== 'number' || 
      typeof height !== 'number') {
    return null;
  }

  const avgValue = payload.Avg;
  if (avgValue === undefined || avgValue === null || isNaN(avgValue)) {
    return null;
  }

  const color = getRSRPPointColor(avgValue);
  const stickX = x + width / 2;
  
  return (
    <line
      x1={stickX}
      y1={y}
      x2={stickX}
      y2={y + height}
      stroke={color}
      strokeWidth={3}
      strokeOpacity={0.6}
      strokeLinecap="round"
    />
  );
});
LollipopStick.displayName = 'LollipopStick';

const CustomTooltip = memo(({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0]?.payload;
  if (!item) return null;

  const avgValue = item.Avg;
  const samples = item.Samples;
  const avgRsrq = item.AvgRsrq;
  const avgSinr = item.AvgSinr;
  const color = getRSRPPointColor(avgValue);
  const quality = getSignalQuality(avgValue);

  return (
    <div style={TOOLTIP_STYLE}>
      <p className="font-semibold text-gray-900 mb-2 border-b pb-1 flex items-center gap-2">
        <Smartphone className="h-4 w-4" />
        {label}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-600">Avg RSRP:</span>
          <span className="text-sm font-bold" style={{ color }}>
            {avgValue ? Number(avgValue).toFixed(1) : 'N/A'} dBm
          </span>
        </div>
        
        {avgRsrq !== undefined && avgRsrq !== 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600">Avg RSRQ:</span>
            <span className="text-xs font-medium text-gray-700">
              {Number(avgRsrq).toFixed(1)} dB
            </span>
          </div>
        )}
        
        {avgSinr !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600">Avg SINR:</span>
            <span className="text-xs font-medium text-gray-700">
              {Number(avgSinr).toFixed(1)} dB
            </span>
          </div>
        )}
        
        {samples !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600">Samples:</span>
            <span className="text-xs font-medium text-gray-700">
              {samples.toLocaleString()}
            </span>
          </div>
        )}
      </div>
      
      {avgValue && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-medium text-gray-600">
              {quality} Signal
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
CustomTooltip.displayName = 'CustomTooltip';

const HandsetPerformanceChart = () => {
  const { 
    data: rawData, 
    isLoading, 
    error,
    mutate 
  } = useHandsetPerformance();

  const [topN, setTopN] = useState(10);
  const [minSamples, setMinSamples] = useState(0);
  const [sortBy, setSortBy] = useState('avg');

  const data = useMemo(() => {
    if (!rawData || !Array.isArray(rawData)) {
      return [];
    }
    return rawData;
  }, [rawData]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
    
    let filtered = data.filter(item => {
      const hasMinSamples = (item.Samples || 0) >= minSamples;
      const hasValidAvg = item.Avg !== undefined && item.Avg !== null && !isNaN(item.Avg);
      return hasMinSamples && hasValidAvg;
    });
    
    if (sortBy === 'avg') {
      filtered.sort((a, b) => (b.Avg || 0) - (a.Avg || 0));
    } else {
      filtered.sort((a, b) => (b.Samples || 0) - (a.Samples || 0));
    }
    
    const result = filtered.slice(0, topN).map((item, index) => ({
      ...item,
      BaselineValue: CHART_Y_MIN,
      index,
    }));
    
    return result;
  }, [data, topN, minSamples, sortBy]);

  const xAxisInterval = useMemo(() => {
    if (chartData.length <= 8) return 0;
    if (chartData.length <= 14) return 1;
    if (chartData.length <= 20) return 2;
    return 3;
  }, [chartData.length]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    
    const avgValues = chartData.map(d => d.Avg).filter(v => v !== undefined);
    const totalSamples = chartData.reduce((sum, d) => sum + (d.Samples || 0), 0);
    
    const best = Math.max(...avgValues);
    const worst = Math.min(...avgValues);
    const average = avgValues.reduce((a, b) => a + b, 0) / avgValues.length;
    
    return {
      best,
      worst,
      average,
      totalSamples,
    };
  }, [chartData]);

  const handleReset = useCallback(() => {
    setTopN(10);
    setMinSamples(0);
    setSortBy('avg');
  }, []);

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleTopNChange = useCallback((e) => {
    setTopN(Number(e.target.value));
  }, []);

  const handleMinSamplesChange = useCallback((e) => {
    setMinSamples(Number(e.target.value));
  }, []);

  const handleSortByChange = useCallback((e) => {
    setSortBy(e.target.value);
  }, []);

  const settingsRender = useCallback(() => (
    <div className="space-y-4">
      {stats && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Best:</span>
            <span className="font-bold text-green-600">{stats.best.toFixed(1)} dBm</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Worst:</span>
            <span className="font-bold text-red-600">{stats.worst.toFixed(1)} dBm</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Average:</span>
            <span className="font-bold text-blue-600">{stats.average.toFixed(1)} dBm</span>
          </div>
          <div className="flex items-center justify-between text-xs border-t border-blue-300 pt-2">
            <span className="text-gray-600">Total Samples:</span>
            <span className="font-bold text-gray-900">{stats.totalSamples.toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Show Top Handsets
        </label>
        <select
          value={topN}
          onChange={handleTopNChange}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
          <option value={15}>Top 15</option>
          <option value={20}>Top 20</option>
          <option value={25}>Top 25</option>
          <option value={50}>Top 50</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Minimum Samples
        </label>
        <input
          type="number"
          value={minSamples}
          onChange={handleMinSamplesChange}
          min="0"
          step="100"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="0"
        />
        <p className="text-xs text-gray-500">Only show handsets with at least this many samples</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Sort By
        </label>
        <select
          value={sortBy}
          onChange={handleSortByChange}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="avg">Best Signal Quality</option>
          <option value="samples">Most Samples</option>
        </select>
      </div>

      <div className="pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Total Handsets:</span>
            <span className="font-semibold text-gray-900">{data.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Showing:</span>
            <span className="font-semibold text-gray-900">{chartData.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Filtered Out:</span>
            <span className="font-semibold text-orange-600">{data.length - chartData.length}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleReset}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className={`flex-1 px-4 py-2 text-sm font-medium text-white border rounded-md transition-colors ${
            isLoading 
              ? 'bg-gray-400 border-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 border-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>
  ), [stats, topN, minSamples, sortBy, data.length, chartData.length, isLoading, handleTopNChange, handleMinSamplesChange, handleSortByChange, handleReset, handleRefresh]);

  return (
    <ChartCard
      title="Handset Performance Analysis"
      subtitle={`Average RSRP by Device Make (${chartData.length} of ${data.length} handsets)`}
      icon={Smartphone}
      dataset={chartData}
      exportFileName="handset_avg_rsrp"
      isLoading={isLoading}
      error={error}
      showChartFilters={false}
      settings={{
        title: 'Handset Performance Settings',
        render: settingsRender,
      }}
    >
      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-12">
          <Smartphone className="h-16 w-16 text-gray-300 mb-4" />
          <p className="text-gray-500 text-center">
            No handset data available
            {minSamples > 0 && (
              <span className="block text-sm mt-1">
                Try reducing the minimum samples filter
              </span>
            )}
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 55, bottom: 105 }}
          >
            {SIGNAL_QUALITY_RANGES.map((range, idx) => (
              <ReferenceArea
                key={`ref-area-${idx}`}
                y1={range.y1}
                y2={range.y2}
                fill={range.fill}
                fillOpacity={range.fillOpacity}
                label={{
                  value: range.label,
                  position: 'insideRight',
                  fill: '#6b7280',
                  fontSize: 10,
                  opacity: 0.5,
                }}
              />
            ))}

            <XAxis
              dataKey="Make"
              type="category"
              angle={-35}
              textAnchor="end"
              height={115}
              tickMargin={14}
              dy={8}
              minTickGap={10}
              tick={{ fill: '#111827', fontSize: 11, fontWeight: 600 }}
              interval={xAxisInterval}
              tickFormatter={(value) =>
                String(value || "").length > 14
                  ? `${String(value).slice(0, 14)}...`
                  : String(value || "")
              }
            />

            <YAxis
              type="number"
              domain={[CHART_Y_MIN, CHART_Y_MAX]}
              reversed={true}
              tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }}
              tickFormatter={(v) => `${v}`}
              label={{ 
                value: 'RSRP (dBm)', 
                angle: -90, 
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 12, fontWeight: 600 }
              }}
            />
            
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
            />

            <Bar
              dataKey="Avg"
              fill="transparent"
              shape={<LollipopStick />}
              isAnimationActive={true}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} />
              ))}
            </Bar>

            <Scatter
              dataKey="Avg"
              fill="#8884d8"
              shape={<LollipopDot />}
              isAnimationActive={true}
              animationDuration={800}
              animationBegin={400}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};

export default memo(HandsetPerformanceChart);
