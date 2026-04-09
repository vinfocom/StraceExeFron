// src/components/prediction/PredictionDetailsPanel.jsx
import React, { useEffect, useMemo, useState, memo } from 'react';
import Spinner from '../common/Spinner';
import { X } from 'lucide-react';

// Lazy loaded chart component
const PerformanceChart = memo(({ data, metric, loading }) => {
  const [ChartComponents, setChartComponents] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mod = await import('recharts');
        if (!cancelled) setChartComponents(mod);
      } catch (e) {
        console.error('Failed to load chart library:', e);
      }
    };
    
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(load);
    } else {
      setTimeout(load, 100);
    }
    
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  
  if (!data?.length) {
    return (
      <div className="text-center text-gray-500 pt-10">
        No chart data available.
      </div>
    );
  }
  
  if (!ChartComponents) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Loading chart…
      </div>
    );
  }

  const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } = ChartComponents;

  return (
    <ResponsiveContainer width="100%" height="90%">
      <BarChart 
        data={data} 
        layout="vertical" 
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <XAxis 
          type="number" 
          domain={[0, 100]} 
          unit="%" 
          tick={{ fontSize: 10 }} 
        />
        <YAxis 
          type="category" 
          dataKey="name" 
          width={80} 
          tick={{ fontSize: 10, width: 70 }} 
          interval={0} 
        />
        <Tooltip 
          formatter={(value) => [`${Number(value)?.toFixed(1)}%`, 'Percentage']} 
        />
        <Bar dataKey="value" background={{ fill: '#eee' }}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || '#8884d8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

PerformanceChart.displayName = 'PerformanceChart';

const PredictionDetailsPanel = ({ predictionData, metric, loading, onClose }) => {
  const {
    avgRsrp,
    avgRsrq,
    avgSinr,
    coveragePerfGraph,
  } = predictionData || {};

  const chartData = useMemo(() => {
    const series = coveragePerfGraph?.series?.[0]?.data || [];
    const cats = coveragePerfGraph?.Category || [];
    return series.map((item, idx) => ({
      name: cats[idx] || `Range ${idx + 1}`,
      value: item?.y,
      color: item?.color,
    }));
  }, [coveragePerfGraph]);

  return (
    <div className="h-full flex flex-col bg-gray-50 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 text-white rounded-t-lg">
        <h2 className="font-semibold text-lg">Analytics Dashboard</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Averages Card */}
        <div className="p-4 bg-white rounded-lg shadow-md border border-gray-200">
          <h3 className="font-semibold mb-3 text-gray-800">Signal Averages</h3>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-gray-600 text-xs mb-1">RSRP</div>
              <div className="font-bold text-xl text-blue-600">
                {avgRsrp != null ? Number(avgRsrp).toFixed(2) : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">dBm</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-gray-600 text-xs mb-1">RSRQ</div>
              <div className="font-bold text-xl text-green-600">
                {avgRsrq != null ? Number(avgRsrq).toFixed(2) : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">dB</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="text-gray-600 text-xs mb-1">SINR</div>
              <div className="font-bold text-xl text-purple-600">
                {avgSinr != null ? Number(avgSinr).toFixed(2) : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">dB</div>
            </div>
          </div>
        </div>

        {/* Chart Card */}
        <div className="p-4 bg-white rounded-lg shadow-md border border-gray-200" style={{ minHeight: '320px' }}>
          <h3 className="font-semibold mb-3 text-gray-800">
            Performance Distribution 
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({metric?.toUpperCase()})
            </span>
          </h3>
          <div style={{ height: '280px' }}>
            <PerformanceChart data={chartData} metric={metric} loading={loading} />
          </div>
        </div>

        {/* Additional Stats (optional) */}
        {predictionData && (
          <div className="p-4 bg-white rounded-lg shadow-md border border-gray-200">
            <h3 className="font-semibold mb-3 text-gray-800">Summary</h3>
            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Total Data Points:</span>
                <span className="font-medium">{predictionData.dataList?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Active Metric:</span>
                <span className="font-medium uppercase">{metric}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(PredictionDetailsPanel);