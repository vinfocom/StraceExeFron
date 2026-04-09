// components/charts/BoxPlotChartSimple.jsx
import React, { useMemo, useState } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import ChartCard from '../ChartCard';
import { useBoxData } from '@/hooks/useDashboardData';
import Spinner from '@/components/common/Spinner';

const OPERATOR_COLORS = {
  'Airtel': '#E40000',
  'Jio': '#0A2885',
  'Vi': '#FFD700',
  'BSNL': '#00A651',
  'Vodafone': '#E60000',
  'Idea': '#FFD700',
  'default': '#6366f1'
};

const METRIC_CONFIG = {
  rsrp: {
    value: 'rsrp',
    label: 'RSRP',
    unit: 'dBm',
    domain: [-140, -60],
    description: 'Reference Signal Received Power'
  },
  rsrq: {
    value: 'rsrq',
    label: 'RSRQ',
    unit: 'dB',
    domain: [-20, -3],
    description: 'Reference Signal Received Quality'
  },
  sinr: {
    value: 'sinr',
    label: 'SINR',
    unit: 'dB',
    domain: [-10, 30],
    description: 'Signal to Interference & Noise Ratio'
  },
  dl_tpt: {
    value: 'dl_tpt',
    label: 'DL Throughput',
    unit: 'Mbps',
    domain: [0, 100],
    description: 'Download Throughput'
  },
  ul_tpt: {
    value: 'ul_tpt',
    label: 'UL Throughput',
    unit: 'Mbps',
    domain: [0, 50],
    description: 'Upload Throughput'
  }
};

// Default operators to show initially (top operators)
const DEFAULT_OPERATORS = ['Airtel', 'Jio', 'Vi', 'BSNL'];

// Utility functions moved to the top
const getOperatorColor = (name) => {
  if (!name) return OPERATOR_COLORS.default;
  const cleanName = name.toLowerCase();
  
  if (cleanName.includes('airtel') || cleanName.includes('bharti')) return OPERATOR_COLORS['Airtel'];
  if (cleanName.includes('jio') || cleanName.includes('reliance')) return OPERATOR_COLORS['Jio'];
  if (cleanName.includes('vi') || cleanName.includes('vodafone') || cleanName.includes('idea')) return OPERATOR_COLORS['Vi'];
  if (cleanName.includes('bsnl')) return OPERATOR_COLORS['BSNL'];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const normalizeOperatorName = (name) => {
  if (!name) return 'Unknown';
  const cleanName = name.toLowerCase();
  
  if (cleanName.includes('airtel') || cleanName.includes('bharti')) return 'Airtel';
  if (cleanName.includes('jio') || cleanName.includes('reliance')) return 'Jio';
  if (cleanName.includes('vi')) return 'Vi';
  if (cleanName.includes('vodafone')) return 'Vodafone';
  if (cleanName.includes('idea')) return 'Idea';
  if (cleanName.includes('bsnl')) return 'BSNL';
  
  return name;
};

const formatValue = (value, metric) => {
  if (!Number.isFinite(value)) return 'N/A';
  
  switch (metric) {
    case 'dl_tpt':
    case 'ul_tpt':
      return value.toFixed(2);
    case 'rsrp':
    case 'rsrq':
    case 'sinr':
    default:
      return value.toFixed(1);
  }
};

const calcPercent = (value, min, max) => {
  const range = max - min;
  if (range <= 0 || !Number.isFinite(value)) return 0;
  const percent = ((value - min) / range) * 100;
  return Math.max(0, Math.min(100, percent));
};

const BoxPlotChartSimple = ({
  chartFilters,
  onChartFiltersChange,
  defaultMetric = 'rsrp'
}) => {
  const [selectedMetric, setSelectedMetric] = useState(defaultMetric);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const { data: boxData, isLoading, error } = useBoxData({
    metric: selectedMetric,
    dateFrom: chartFilters?.dateFrom,
    dateTo: chartFilters?.dateTo,
  });

  const metricConfig = useMemo(() => {
    return METRIC_CONFIG[selectedMetric] || METRIC_CONFIG.rsrp;
  }, [selectedMetric]);

  // Extract all available operators from data
  const availableOperators = useMemo(() => {
    if (!boxData || !Array.isArray(boxData)) return [];
    
    const operators = boxData
      .filter(d => d && d.provider)
      .map(d => normalizeOperatorName(d.provider))
      .filter((name, index, self) => self.indexOf(name) === index)
      .sort();
    
    return operators;
  }, [boxData]);

  // Process and validate data
  const validData = useMemo(() => {
    if (!boxData || !Array.isArray(boxData)) return [];
    
    const filtered = boxData.filter(d => 
      d &&
      d.provider &&
      Number.isFinite(d.min) &&
      Number.isFinite(d.max) &&
      Number.isFinite(d.Q1) &&
      Number.isFinite(d.Q3) &&
      Number.isFinite(d.Median) &&
      d.max > d.min
    ).map(d => ({
      ...d,
      normalizedProvider: normalizeOperatorName(d.provider)
    }));

    // Apply operator filters if they exist
    if (chartFilters?.operators && chartFilters.operators.length > 0) {
      return filtered.filter(d => 
        chartFilters.operators.includes(d.normalizedProvider)
      );
    }

    // If no filters, show default operators
    return filtered.filter(d => 
      DEFAULT_OPERATORS.includes(d.normalizedProvider)
    );
  }, [boxData, chartFilters]);

  const yDomain = useMemo(() => {
    if (validData.length === 0) {
      return metricConfig.domain;
    }
    
    const allMin = Math.min(...validData.map(d => d.min));
    const allMax = Math.max(...validData.map(d => d.max));
    
    if (!Number.isFinite(allMin) || !Number.isFinite(allMax) || allMin >= allMax) {
      return metricConfig.domain;
    }
    
    const padding = Math.abs(allMax - allMin) * 0.2;
    return [Math.floor(allMin - padding), Math.ceil(allMax + padding)];
  }, [validData, metricConfig]);

  // Prepare export dataset
  const exportDataset = useMemo(() => {
    if (validData.length === 0) return [];
    
    return validData.map(item => ({
      Provider: item.normalizedProvider,
      [`Min_${metricConfig.unit}`]: formatValue(item.min, selectedMetric),
      [`Q1_${metricConfig.unit}`]: formatValue(item.Q1, selectedMetric),
      [`Median_${metricConfig.unit}`]: formatValue(item.Median, selectedMetric),
      [`Q3_${metricConfig.unit}`]: formatValue(item.Q3, selectedMetric),
      [`Max_${metricConfig.unit}`]: formatValue(item.max, selectedMetric),
      [`IQR_${metricConfig.unit}`]: formatValue(item.Q3 - item.Q1, selectedMetric),
      Samples: item.samples || 'N/A'
    }));
  }, [validData, selectedMetric, metricConfig]);

  const handleMouseMove = (item, event) => {
    setMousePosition({
      x: event.clientX,
      y: event.clientY
    });
    setHoveredItem(item);
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  const CustomTooltip = ({ item }) => {
    if (!item) return null;
    
    const color = getOperatorColor(item.provider);
    
    return (
      <div 
        className="fixed z-[9999] bg-white rounded-lg shadow-xl border-2 p-3 pointer-events-none"
        style={{ 
          left: mousePosition.x + 15,
          top: mousePosition.y - 10,
          borderColor: color,
          minWidth: '200px'
        }}
      >
        <div 
          className="text-base font-bold mb-2 pb-2 border-b"
          style={{ color: color, borderColor: `${color}30` }}
        >
          {item.normalizedProvider}
        </div>
        
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Max:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.max, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Q3:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.Q3, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between" style={{ color: color }}>
            <span className="font-medium">Median:</span>
            <span className="font-bold">
              {formatValue(item.Median, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Q1:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.Q1, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Min:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.min, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-200">
            <span className="text-gray-600">IQR:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.Q3 - item.Q1, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          {item.samples && (
            <div className="flex justify-between">
              <span className="text-gray-600">Samples:</span>
              <span className="font-semibold text-gray-900">
                {item.samples.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Legend = () => {
    if (validData.length === 0) return null;

    return (
      <div className="flex flex-wrap justify-center gap-3 mt-4 pt-3 border-t border-gray-200">
        {validData.map((item, index) => {
          const color = getOperatorColor(item.provider);
          return (
            <div 
              key={`legend-${item.normalizedProvider}-${index}`}
              className="flex items-center gap-2"
            >
              <div 
                className="w-3 h-3 rounded flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-medium text-gray-700">
                {item.normalizedProvider}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Metric settings component
  const MetricSettings = () => (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-700 mb-2 block">
        Select Metric
      </label>
      {Object.values(METRIC_CONFIG).map((m) => (
        <label
          key={m.value}
          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50"
        >
          <input
            type="radio"
            name="metric"
            value={m.value}
            checked={selectedMetric === m.value}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700 flex-1">
            {m.label} ({m.unit})
          </span>
        </label>
      ))}
      <p className="mt-2 text-xs text-gray-500">
        {metricConfig.description}
      </p>
    </div>
  );

  const chartContent = (
    <div className="h-full flex flex-col overflow-hidden">
      

      {/* Tooltip */}
      {hoveredItem && <CustomTooltip item={hoveredItem} />}

      {/* Chart */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl">
            <div className="text-center">
              <Spinner />
              <p className="text-sm text-gray-500 mt-3">Loading box plot data...</p>
            </div>
          </div>
        ) : validData.length > 0 ? (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Visual Box Plot */}
            <div className="flex-1 relative bg-gray-50 rounded-lg p-4 overflow-hidden">
              {/* Y-Axis with unit */}
              <div className="absolute left-0 top-4 bottom-12 w-14 flex flex-col justify-between text-xs text-gray-500 text-right pr-2">
                <span className="block">{yDomain[1]} <span className="text-gray-400">{metricConfig.unit}</span></span>
                <span className="block">{Math.round((yDomain[0] + yDomain[1]) / 2)}</span>
                <span className="block">{yDomain[0]}</span>
              </div>

              {/* Chart Area */}
              <div className="ml-14 h-full flex flex-col pb-12">
                <div className="flex-1 flex items-end justify-around gap-2 px-2">
                  {validData.map((item, index) => {
                    const color = getOperatorColor(item.provider);
                    
                    const minPercent = calcPercent(item.min, yDomain[0], yDomain[1]);
                    const q1Percent = calcPercent(item.Q1, yDomain[0], yDomain[1]);
                    const medianPercent = calcPercent(item.Median, yDomain[0], yDomain[1]);
                    const q3Percent = calcPercent(item.Q3, yDomain[0], yDomain[1]);
                    const maxPercent = calcPercent(item.max, yDomain[0], yDomain[1]);
                    const boxHeight = Math.max(2, q3Percent - q1Percent);

                    return (
                      <div
                        key={`box-${item.normalizedProvider}-${index}`}
                        className="flex-1 relative cursor-pointer"
                        style={{ 
                          height: '100%',
                          maxWidth: validData.length <= 4 ? '100px' : validData.length <= 6 ? '80px' : '60px',
                          minWidth: '40px'
                        }}
                        onMouseMove={(e) => handleMouseMove(item, e)}
                        onMouseLeave={handleMouseLeave}
                      >
                        {/* Whisker Line */}
                        <div
                          className="absolute left-1/2 w-0.5 -translate-x-1/2 transition-all"
                          style={{
                            backgroundColor: color,
                            opacity: 0.7,
                            bottom: `${minPercent}%`,
                            height: `${Math.max(1, maxPercent - minPercent)}%`
                          }}
                        />

                        {/* Min Cap */}
                        <div
                          className="absolute left-1/2 h-0.5 w-4 -translate-x-1/2 transition-all"
                          style={{ backgroundColor: color, bottom: `${minPercent}%` }}
                        />

                        {/* Max Cap */}
                        <div
                          className="absolute left-1/2 h-0.5 w-4 -translate-x-1/2 transition-all"
                          style={{ backgroundColor: color, bottom: `${maxPercent}%` }}
                        />

                        {/* Box (Q1 to Q3) */}
                        <div
                          className="absolute left-1/2 -translate-x-1/2 rounded border-2 transition-all hover:shadow-lg"
                          style={{
                            borderColor: color,
                            backgroundColor: `${color}30`,
                            bottom: `${q1Percent}%`,
                            height: `${boxHeight}%`,
                            minHeight: '6px',
                            width: validData.length <= 4 ? '40px' : validData.length <= 6 ? '32px' : '24px'
                          }}
                        />

                        {/* Median Line */}
                        <div
                          className="absolute left-1/2 h-1 -translate-x-1/2 rounded transition-all"
                          style={{
                            backgroundColor: color,
                            bottom: `${medianPercent}%`,
                            boxShadow: `0 0 4px ${color}`,
                            width: validData.length <= 4 ? '40px' : validData.length <= 6 ? '32px' : '24px'
                          }}
                        />

                        {/* Median Value Label - Only show if enough space */}
                        {validData.length <= 6 && (
                          <div
                            className="absolute text-xs font-bold whitespace-nowrap px-1.5 py-0.5 rounded shadow-sm border hidden xl:block"
                            style={{ 
                              color: color, 
                              backgroundColor: 'white',
                              borderColor: `${color}50`,
                              left: 'calc(50% + 25px)',
                              bottom: `${medianPercent}%`,
                              transform: 'translateY(50%)',
                              zIndex: 10
                            }}
                          >
                            {formatValue(item.Median, selectedMetric)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* X-Axis Labels */}
                <div className="flex items-start justify-around gap-2 px-2 mt-2 pt-2 border-t border-gray-300">
                  {validData.map((item, index) => (
                    <div 
                      key={`label-${index}`}
                      className="flex-1 text-center"
                      style={{ 
                        maxWidth: validData.length <= 4 ? '100px' : validData.length <= 6 ? '80px' : '60px',
                        minWidth: '40px'
                      }}
                    >
                      <div className="text-xs font-bold text-gray-700 truncate">
                        {item.normalizedProvider}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 mt-3">
              <Legend />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <ChartCard
      title={`${metricConfig.label} Distribution (Box Plot)`}
      dataset={exportDataset}
      exportFileName={`boxplot-${selectedMetric}`}
      isLoading={isLoading}
      error={error}
      chartFilters={chartFilters}
      onChartFiltersChange={onChartFiltersChange}
      operators={availableOperators}
      networks={[]} // Box plot doesn't use network filters
      showChartFilters={true}
      settings={{
        title: "Metric Settings",
        render: <MetricSettings />,
        onApply: () => {
          // Metric is applied in real-time
        },
      }}
      headerActions={
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">
            Showing: {validData.length} of {availableOperators.length} operators
          </span>
        </div>
      }
    >
      {chartContent}
    </ChartCard>
  );
};

export default BoxPlotChartSimple;
