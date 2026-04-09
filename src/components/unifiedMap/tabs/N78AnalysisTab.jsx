import React, { memo, useMemo, useState } from 'react';
import {
  Radio, Activity, Wifi, Layers, Server, ArrowRightLeft
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

import {
  normalizeProviderName,
  normalizeTechName,
  normalizeBandName,
  getBandColor,
  getTechnologyColor,
  getProviderColor,
} from '@/utils/colorUtils';

// --- Configuration & Helpers ---
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

const METRIC_CONFIG = {
  rsrp: {
    label: 'RSRP',
    unit: 'dBm',
    neighborKey: 'neighbourRsrp',
    primaryKey: 'rsrp',
    min: -140,
    max: -40,
    buckets: [
      { label: '<-120', min: -999, max: -120 },
      { label: '-120 to -110', min: -120, max: -110 },
      { label: '-110 to -100', min: -110, max: -100 },
      { label: '-100 to -90', min: -100, max: -90 },
      { label: '-90 to -80', min: -90, max: -80 },
      { label: '>-80', min: -80, max: 999 },
    ]
  },
  rsrq: {
    label: 'RSRQ',
    unit: 'dB',
    neighborKey: 'neighbourRsrq',
    primaryKey: 'rsrq',
    min: -30,
    max: 0,
    buckets: [
      { label: '<-20', min: -999, max: -20 },
      { label: '-20 to -15', min: -20, max: -15 },
      { label: '-15 to -10', min: -15, max: -10 },
      { label: '-10 to -5', min: -10, max: -5 },
      { label: '>-5', min: -5, max: 999 },
    ]
  },
  sinr: {
    label: 'SINR',
    unit: 'dB',
    neighborKey: 'neighbourSinr',
    primaryKey: 'sinr',
    min: -10,
    max: 40,
    buckets: [
      { label: '<0', min: -999, max: 0 },
      { label: '0 to 10', min: 0, max: 10 },
      { label: '10 to 20', min: 10, max: 20 },
      { label: '20 to 30', min: 20, max: 30 },
      { label: '>30', min: 30, max: 999 },
    ]
  }
};

const METRIC_OPTIONS = Object.entries(METRIC_CONFIG);

const getColorFromThresholds = (value, thresholds) => {
  if (value == null || isNaN(value)) return "#9CA3AF";
  if (!thresholds?.length) {
    if (value >= -80) return "#10B981";
    if (value >= -90) return "#34D399";
    if (value >= -100) return "#FBBF24";
    if (value >= -110) return "#F97316";
    return "#EF4444";
  }
  const sorted = [...thresholds].sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (value >= parseFloat(t.min) && value < parseFloat(t.max)) return t.color;
  }
  return "#9CA3AF";
};

const getMedian = (sortedValues) => {
  if (!sortedValues.length) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
};

const incrementBucket = (buckets, value, key) => {
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const isLast = i === buckets.length - 1;
    if (value >= bucket.min && (isLast ? value <= bucket.max : value < bucket.max)) {
      bucket[key] += 1;
      break;
    }
  }
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-xs z-50">
        <p className="font-semibold text-white mb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.fill || entry.color }} />
            <span className="text-white capitalize">{entry.name}:</span>
            <span className="text-white font-mono">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// White/light text style constants for charts
const AXIS_TICK_STYLE = { fill: '#FFFFFF', fontSize: 11 };
const AXIS_TICK_STYLE_SM = { fill: '#FFFFFF', fontSize: 10 };
const TECHNOLOGY_FIELDS = ['technology', 'networkType', 'network', 'Network', 'primary_network'];

const getTechLabel = (records = []) => {
  const techs = new Set();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    let value = null;
    for (const key of TECHNOLOGY_FIELDS) {
      if (record[key] != null && String(record[key]).trim() !== '') {
        value = record[key];
        break;
      }
    }
    if (!value) continue;
    techs.add(String(value).trim());
  }

  const list = [...techs].sort();
  if (!list.length) return 'Unknown';
  if (list.length <= 3) return list.join(', ');
  return `${list.slice(0, 3).join(', ')} +${list.length - 3}`;
};

const N78AnalysisTab = ({
  n78NeighborData,
  n78NeighborLoading,
  primaryData = [],
  thresholds,
  expanded,
}) => {
  const [selectedMetric, setSelectedMetric] = useState('rsrp');
  const rsrpThresholds = thresholds?.rsrp || [];

  // --- Statistics Calculation ---
  const stats = useMemo(() => {
    if (!n78NeighborData?.length) return null;

    const config = METRIC_CONFIG[selectedMetric];

    const providers = {};
    const bands = {};
    const techs = {};
    const values = [];
    const primaryValues = [];
    const distData = config.buckets.map(b => ({
      name: b.label,
      Primary: 0,
      Secondary: 0,
      min: b.min,
      max: b.max
    }));
    const sessionIds = new Set();

    let neighborSum = 0;
    for (const neighbor of n78NeighborData) {
      sessionIds.add(neighbor.sessionId);
      const rawValue = neighbor[config.neighborKey] ?? neighbor.neighborRsrp;
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value === 0) continue;

      values.push(value);
      neighborSum += value;

      const provider = normalizeProviderName(neighbor.provider || 'Unknown');
      const band = normalizeBandName(neighbor.neighbourBand || neighbor.primaryBand || '');
      const tech = normalizeTechName(neighbor.networkType || '');

      providers[provider] = (providers[provider] || 0) + 1;
      bands[band] = (bands[band] || 0) + 1;
      techs[tech] = (techs[tech] || 0) + 1;
      incrementBucket(distData, value, "Secondary");
    }

    let primarySum = 0;
    for (const primary of primaryData) {
      const value = Number(primary[config.primaryKey]);
      if (!Number.isFinite(value) || value === 0) continue;
      primaryValues.push(value);
      primarySum += value;
      incrementBucket(distData, value, "Primary");
    }

    values.sort((a, b) => a - b);
    primaryValues.sort((a, b) => a - b);

    const avg = values.length ? neighborSum / values.length : 0;
    const median = getMedian(values);
    const primaryAvg = primaryValues.length ? primarySum / primaryValues.length : 0;
    const primaryMedian = getMedian(primaryValues);

    const comparisonSummary = [
      { name: 'Average', Primary: Number(primaryAvg.toFixed(1)), Secondary: Number(avg.toFixed(1)) },
      { name: 'Median', Primary: Number(primaryMedian.toFixed(1)), Secondary: Number(median.toFixed(1)) },
      { name: 'Min', Primary: Number((primaryValues[0] ?? 0).toFixed(1)), Secondary: Number((values[0] ?? 0).toFixed(1)) },
      { name: 'Max', Primary: Number((primaryValues[primaryValues.length - 1] ?? 0).toFixed(1)), Secondary: Number((values[values.length - 1] ?? 0).toFixed(1)) },
    ];

    const UNKNOWN_LABELS = new Set(['unknown', '', 'n/a', 'nan', 'null', 'undefined']);
    const formatChartData = (obj) => Object.entries(obj)
      .filter(([name]) => !UNKNOWN_LABELS.has(String(name).trim().toLowerCase()))
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      total: n78NeighborData.length,
      sessionCount: sessionIds.size,
      stats: { min: values[0], max: values[values.length - 1], avg, median },
      chartData: {
        providers: formatChartData(providers),
        bands: formatChartData(bands),
        techs: formatChartData(techs),
        distribution: distData,
        summary: comparisonSummary
      }
    };
  }, [n78NeighborData, primaryData, selectedMetric]);

  if (n78NeighborLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-2" />
        <span className="text-white">Loading Secondary Data...</span>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white">
        <Radio className="h-16 w-16 mb-4 opacity-60 text-white" />
        <p className="text-lg font-medium text-white">No Unlatched Data Found</p>
      </div>
    );
  }

  const config = METRIC_CONFIG[selectedMetric];
  const primaryTechLabel = getTechLabel(primaryData);
  const secondaryTechLabel = getTechLabel(n78NeighborData);
  const primaryLegendName = `Primary (${primaryTechLabel})`;
  const secondaryLegendName = `Secondary (${secondaryTechLabel})`;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* 1. Header with Metric Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Radio className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Unlatched</h3>
            <p className="text-xs text-slate-300">{stats.total} samples | {stats.sessionCount} sessions</p>
          </div>
        </div>

        {/* Metric Selector Buttons */}
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
          {METRIC_OPTIONS.map(([key, conf]) => (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-md transition-all
                ${selectedMetric === key
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'}
              `}
            >
              {conf.label}
            </button>
          ))}
        </div>

        <div className="text-right hidden sm:block">
          <div className="text-xs text-slate-300">{config.label} Avg</div>
          <div className="text-lg font-bold" style={{ color: selectedMetric === 'rsrp' ? getColorFromThresholds(stats.stats.avg, rsrpThresholds) : '#fff' }}>
            {stats.stats.avg?.toFixed(1) ?? '--'} <span className="text-xs text-slate-300">{config.unit}</span>
          </div>
        </div>
      </div>

      {/* 2. Comparative Analysis Section */}
      <div className="grid grid-cols-2 md:grid-cols-1 gap-6">

        {/* Metric Comparison (Bar Chart) */}
        <div className="bg-slate-800/50 p-10 rounded-lg border border-slate-700 h-[300px]">
          <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-cyan-400" /> Primary vs Secondary ({config.label})
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chartData.summary} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
              <XAxis type="number" tick={AXIS_TICK_STYLE_SM} />
              <YAxis dataKey="name" type="category" tick={AXIS_TICK_STYLE} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value) => <span style={{ color: '#FFFFFF' }}>{value}</span>} />
              <Bar dataKey="Primary" fill="#3B82F6" name={primaryLegendName} radius={[0, 4, 4, 0]} barSize={20} />
              <Bar dataKey="Secondary" fill="#8B5CF6" name={secondaryLegendName} radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 p-10 rounded-lg border border-slate-700 h-[300px]">
          <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-pink-400" /> {config.label} Distribution
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chartData.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE_SM} interval={0} />
              <YAxis tick={AXIS_TICK_STYLE_SM} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value) => <span style={{ color: '#FFFFFF' }}>{value}</span>} />
              <Bar dataKey="Primary" fill="#3B82F6" name={primaryLegendName} radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="Secondary" fill="#8B5CF6" name={secondaryLegendName} radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Detailed Breakdown Charts (Context) */}
      <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1 md:grid-cols-1"} gap-4`}>

        {/* Provider Distribution */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-[250px]">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-400" /> Providers
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.chartData.providers}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.chartData.providers.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getProviderColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                layout="vertical"
                verticalAlign="middle"
                align="right"
                wrapperStyle={{ fontSize: '10px' }}
                formatter={(value) => <span style={{ color: '#FFFFFF' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Band Distribution */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-[250px]">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" /> Bands
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chartData.bands} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={60} tick={AXIS_TICK_STYLE_SM} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={15}>
                {stats.chartData.bands.map((entry, index) => (
                  <Cell key={`cell-band-${index}`} fill={getBandColor(entry.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tech Distribution */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-[250px]">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Server className="h-4 w-4 text-orange-400" /> Technology
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.chartData.techs}
                cx="50%"
                cy="50%"
                outerRadius={60}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#FFFFFF' }}
                style={{ fontSize: '11px', fill: '#858585' }}
              >
                {stats.chartData.techs.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getTechnologyColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
};

export default memo(N78AnalysisTab);
