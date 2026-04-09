// src/components/dashboard/charts/IndoorOutdoorProviderChart.jsx
import React, { useMemo, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, AlertTriangle, Building2, TreePine } from 'lucide-react';
import ChartCard from '../ChartCard';
import { useIndOut } from '@/hooks/useDashboardData';
import { COLOR_SCHEMES, normalizeTechName, normalizeProviderName } from '@/utils/colorUtils';

const METRIC_CONFIG = {
  rsrp: { 
    key: 'avgRsrp', 
    label: 'RSRP', 
    unit: 'dBm', 
    domain: [-120, -60],
    indoorColor: '#3B82F6',
    outdoorColor: '#10B981',
  },
  rsrq: { 
    key: 'avgRsrq', 
    label: 'RSRQ', 
    unit: 'dB', 
    domain: [-20, -3],
    indoorColor: '#3B82F6',
    outdoorColor: '#10B981',
  },
  sinr: { 
    key: 'avgSinr', 
    label: 'SINR', 
    unit: 'dB', 
    domain: [-5, 30],
    indoorColor: '#3B82F6',
    outdoorColor: '#10B981',
  },
};

const MetricToggle = React.memo(({ selected, onChange }) => (
  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
    {Object.entries(METRIC_CONFIG).map(([key, config]) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          selected === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {config.label}
      </button>
    ))}
  </div>
));

MetricToggle.displayName = 'MetricToggle';

const CustomTooltip = React.memo(({ active, payload, label, metricConfig }) => {
  if (!active || !payload?.length) return null;

  const normalizedLabel = normalizeProviderName(label);

  return (
    <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: COLOR_SCHEMES.provider[normalizedLabel] || '#6B7280' }}
        />
        <span className="text-sm font-bold text-gray-900">{normalizedLabel}</span>
      </div>

      <div className="space-y-1.5 text-xs">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              {entry.dataKey === 'indoor' ? (
                <Building2 size={12} className="text-blue-500" />
              ) : (
                <TreePine size={12} className="text-green-500" />
              )}
              <span className="text-gray-600 capitalize">{entry.dataKey}:</span>
            </div>
            <span className="font-semibold" style={{ color: entry.fill }}>
              {entry.value?.toFixed(1)} {metricConfig.unit}
            </span>
          </div>
        ))}

        {payload[0]?.payload && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex justify-between">
              <span className="text-gray-500">Indoor Samples:</span>
              <span className="font-medium text-gray-700">
                {payload[0].payload.indoorSamples?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Outdoor Samples:</span>
              <span className="font-medium text-gray-700">
                {payload[0].payload.outdoorSamples?.toLocaleString() || 0}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

CustomTooltip.displayName = 'CustomTooltip';

const CustomLegend = React.memo(() => (
  <div className="flex justify-center items-center gap-6 mt-2">
    <div className="flex items-center gap-2">
      <Building2 size={14} className="text-blue-500" />
      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3B82F6' }} />
      <span className="text-xs font-medium text-gray-700">Indoor</span>
    </div>
    <div className="flex items-center gap-2">
      <TreePine size={14} className="text-green-500" />
      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10B981' }} />
      <span className="text-xs font-medium text-gray-700">Outdoor</span>
    </div>
  </div>
));

CustomLegend.displayName = 'CustomLegend';

const IndoorOutdoorProviderChart = () => {
  const { data, isLoading, error } = useIndOut();
  const [selectedMetric, setSelectedMetric] = useState('rsrp');

  const metricConfig = METRIC_CONFIG[selectedMetric];

  const { chartData, stats } = useMemo(() => {
    if (!data?.length) {
      return { chartData: [], stats: null };
    }

    const providerMap = new Map();

    data.forEach((item) => {
      if (!item.provider || item.provider === 'Unknown') return;

      const normalizedProvider = normalizeProviderName(item.provider);
      const metricValue = item[metricConfig.key];

      if (metricValue === null || metricValue === undefined || metricValue === 0) return;

      if (!providerMap.has(normalizedProvider)) {
        providerMap.set(normalizedProvider, {
          provider: normalizedProvider,
          indoor: null,
          outdoor: null,
          indoorSamples: 0,
          outdoorSamples: 0,
        });
      }

      const entry = providerMap.get(normalizedProvider);
      const locationType = (item.location || '').toLowerCase();

      if (locationType === 'indoor' || locationType === 'in') {
        entry.indoor = metricValue;
        entry.indoorSamples = item.sampleCount;
      } else if (locationType === 'outdoor' || locationType === 'out') {
        entry.outdoor = metricValue;
        entry.outdoorSamples = item.sampleCount;
      }
    });

    const processed = Array.from(providerMap.values())
      .filter((item) => item.indoor !== null || item.outdoor !== null)
      .sort((a, b) => {
        const avgA = ((a.indoor || 0) + (a.outdoor || 0)) / (a.indoor && a.outdoor ? 2 : 1);
        const avgB = ((b.indoor || 0) + (b.outdoor || 0)) / (b.indoor && b.outdoor ? 2 : 1);
        return avgB - avgA;
      });

    let totalIndoor = 0, totalOutdoor = 0;
    let indoorCount = 0, outdoorCount = 0;
    let totalSamples = 0;

    processed.forEach((item) => {
      if (item.indoor !== null) {
        totalIndoor += item.indoor;
        indoorCount++;
      }
      if (item.outdoor !== null) {
        totalOutdoor += item.outdoor;
        outdoorCount++;
      }
      totalSamples += item.indoorSamples + item.outdoorSamples;
    });

    const statistics = {
      avgIndoor: indoorCount > 0 ? (totalIndoor / indoorCount).toFixed(1) : 'N/A',
      avgOutdoor: outdoorCount > 0 ? (totalOutdoor / outdoorCount).toFixed(1) : 'N/A',
      totalSamples,
      providerCount: processed.length,
    };

    return {
      chartData: processed,
      stats: statistics,
    };
  }, [data, metricConfig.key, selectedMetric]);

  const exportData = useMemo(() => {
    return chartData.flatMap((item) => [
      {
        Provider: item.provider,
        Location: 'Indoor',
        [`${metricConfig.label}_${metricConfig.unit}`]: item.indoor,
        Sample_Count: item.indoorSamples,
      },
      {
        Provider: item.provider,
        Location: 'Outdoor',
        [`${metricConfig.label}_${metricConfig.unit}`]: item.outdoor,
        Sample_Count: item.outdoorSamples,
      },
    ]);
  }, [chartData, metricConfig]);

  const handleMetricChange = useCallback((metric) => {
    setSelectedMetric(metric);
  }, []);

  return (
    <ChartCard
      title="Indoor vs Outdoor Performance"
      isLoading={isLoading}
      dataset={exportData}
      exportFileName={`indoor_outdoor_comparison_${selectedMetric}`}
      showChartFilters={false}
      headerActions={
        <div className="flex items-center gap-3 mr-2">
          <MetricToggle selected={selectedMetric} onChange={handleMetricChange} />
        </div>
      }
    >
      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-red-400">
          <AlertTriangle className="h-12 w-12 mb-3" />
          <p className="font-medium">Failed to load indoor/outdoor data</p>
          <p className="text-xs mt-1 text-red-300">{error.message}</p>
        </div>
      ) : chartData.length > 0 ? (
        <div className="h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 25, bottom: 45, left: 15 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="provider"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#d1d5db' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  label={{
                    value: 'Provider',
                    position: 'bottom',
                    offset: 25,
                    fontSize: 11,
                    fill: '#4b5563',
                    fontWeight: 500,
                  }}
                />
                <YAxis
                  domain={metricConfig.domain}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={{ stroke: '#d1d5db' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  reversed
                  label={{
                    value: `${metricConfig.label} (${metricConfig.unit})`,
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 11,
                    fill: '#4b5563',
                    fontWeight: 500,
                    offset: 5,
                  }}
                />
                <Tooltip
                  content={<CustomTooltip metricConfig={metricConfig} />}
                  cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                />
                <Bar
                  dataKey="indoor"
                  name="Indoor"
                  fill={metricConfig.indoorColor}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="outdoor"
                  name="Outdoor"
                  fill={metricConfig.outdoorColor}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <CustomLegend />

          <div className="flex flex-wrap justify-center gap-4 mt-2 pt-3 border-t border-gray-100">
            {chartData.map((item) => (
              <div key={item.provider} className="flex items-center gap-1.5 text-xs">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor:
                      COLOR_SCHEMES.provider[item.provider] || '#6B7280',
                  }}
                />
                <span className="font-medium text-gray-700">{item.provider}</span>
                <span className="text-gray-400">
                  ({(item.indoorSamples + item.outdoorSamples).toLocaleString()})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <Building2 className="h-14 w-14 mb-3 opacity-20" />
          <p className="font-medium text-gray-500">No Indoor/Outdoor Data</p>
          <p className="text-xs mt-1.5 text-gray-400">
            No data available for comparison
          </p>
        </div>
      )}
    </ChartCard>
  );
};

export default React.memo(IndoorOutdoorProviderChart);
