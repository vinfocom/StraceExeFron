// src/components/analytics/ProviderPerformanceChart.jsx
import React, { useMemo, useState, useCallback } from "react";
import { 
  Globe, 
  Settings, 
  Check, 
  ChevronDown, 
  X, 
  BarChart3, 
  Table,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { CHART_CONFIG } from "@/utils/constants";
import { filterValidData } from "@/utils/analyticsHelpers";

// Define all available fields with their configuration
const AVAILABLE_FIELDS = {
  "Download (Mbps)": {
    key: "Download (Mbps)",
    label: "Download",
    color: "#06b6d4",
    unit: "Mbps",
    category: "throughput",
    defaultEnabled: true,
  },
  "Upload (Mbps)": {
    key: "Upload (Mbps)",
    label: "Upload",
    color: "#fb923c",
    unit: "Mbps",
    category: "throughput",
    defaultEnabled: true,
  },
  MOS: {
    key: "MOS",
    label: "MOS Score",
    color: "#facc15",
    unit: "",
    category: "quality",
    defaultEnabled: false,
  },
  avgRsrp: {
    key: "avgRsrp",
    label: "RSRP",
    color: "#22c55e",
    unit: "dBm",
    category: "signal",
    defaultEnabled: false,
  },
  avgRsrq: {
    key: "avgRsrq",
    label: "RSRQ",
    color: "#8b5cf6",
    unit: "dB",
    category: "signal",
    defaultEnabled: false,
  },
  avgSinr: {
    key: "avgSinr",
    label: "SINR",
    color: "#ec4899",
    unit: "dB",
    category: "signal",
    defaultEnabled: false,
  },
  avgLatency: {
    key: "avgLatency",
    label: "Latency",
    color: "#ef4444",
    unit: "ms",
    category: "latency",
    defaultEnabled: false,
  },
  avgJitter: {
    key: "avgJitter",
    label: "Jitter",
    color: "#f97316",
    unit: "ms",
    category: "latency",
    defaultEnabled: false,
  },
  samples: {
    key: "samples",
    label: "Sample Count",
    color: "#6366f1",
    unit: "",
    category: "other",
    defaultEnabled: false,
  },
};

// Field categories for organized display
const FIELD_CATEGORIES = {
  throughput: { label: "Throughput", icon: "📶" },
  quality: { label: "Quality", icon: "⭐" },
  signal: { label: "Signal", icon: "📡" },
  latency: { label: "Latency", icon: "⏱️" },
  other: { label: "Other", icon: "📊" },
};

// Preset configurations
const PRESETS = {
  throughput: {
    label: "Throughput",
    fields: ["Download (Mbps)", "Upload (Mbps)"],
  },
  basic: {
    label: "Basic + MOS",
    fields: ["MOS", "Download (Mbps)", "Upload (Mbps)"],
  },
  signal: {
    label: "Signal",
    fields: ["avgRsrp", "avgRsrq", "avgSinr"],
  },
  all: {
    label: "All",
    fields: Object.keys(AVAILABLE_FIELDS),
  },
};

// View Toggle Component
const ViewToggle = ({ isTable, setIsTable }) => {
  return (
    <div className="flex items-center bg-slate-800 rounded-lg p-1 gap-1">
      <button
        onClick={() => setIsTable(false)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${!isTable
            ? 'bg-blue-600 text-white shadow-md'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }
        `}
        title="Chart View"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        <span>Chart</span>
      </button>
      <button
        onClick={() => setIsTable(true)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${isTable
            ? 'bg-blue-600 text-white shadow-md'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }
        `}
        title="Table View"
      >
        <Table className="h-3.5 w-3.5" />
        <span>Table</span>
      </button>
    </div>
  );
};

// Settings Dropdown Component
const FieldSettingsDropdown = ({ selectedFields, onFieldsChange, isOpen, setIsOpen }) => {
  const toggleField = useCallback((fieldKey) => {
    onFieldsChange(prev => {
      if (prev.includes(fieldKey)) {
        if (prev.length === 1) return prev;
        return prev.filter(f => f !== fieldKey);
      }
      return [...prev, fieldKey];
    });
  }, [onFieldsChange]);

  const applyPreset = useCallback((presetKey) => {
    onFieldsChange(PRESETS[presetKey].fields);
  }, [onFieldsChange]);

  const selectAll = useCallback(() => {
    onFieldsChange(Object.keys(AVAILABLE_FIELDS));
  }, [onFieldsChange]);

  const clearAll = useCallback(() => {
    onFieldsChange(["Download (Mbps)", "Upload (Mbps)"]);
  }, [onFieldsChange]);

  // Group fields by category
  const groupedFields = useMemo(() => {
    const groups = {};
    Object.entries(AVAILABLE_FIELDS).forEach(([key, config]) => {
      const category = config.category;
      if (!groups[category]) groups[category] = [];
      groups[category].push({ key, ...config });
    });
    return groups;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl min-w-[320px] max-h-[400px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900">
        <span className="text-sm font-semibold text-white">Select Fields</span>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {/* Presets */}
      <div className="p-3 border-b border-slate-700">
        <div className="text-xs text-slate-400 mb-2 font-medium">Quick Presets</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Field Selection */}
      <div className="max-h-[220px] overflow-y-auto p-3">
        {Object.entries(groupedFields).map(([category, fields]) => (
          <div key={category} className="mb-3 last:mb-0">
            <div className="text-xs text-slate-400 mb-1.5 font-medium flex items-center gap-1">
              <span>{FIELD_CATEGORIES[category]?.icon}</span>
              <span>{FIELD_CATEGORIES[category]?.label}</span>
            </div>
            <div className="space-y-1">
              {fields.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                    className="w-4 h-4 rounded border-slate-500 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-slate-700"
                  />
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: field.color }}
                  />
                  <span className="text-sm text-slate-200 flex-1">{field.label}</span>
                  {field.unit && (
                    <span className="text-xs text-slate-500">({field.unit})</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between p-3 border-t border-slate-700 bg-slate-900">
        <div className="text-xs text-slate-400">
          {selectedFields.length} selected
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearAll}
            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          >
            Reset
          </button>
          <button
            onClick={selectAll}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Select All
          </button>
        </div>
      </div>
    </div>
  );
};

// Data Table Component
const DataTable = ({ data, selectedFields }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'samples', direction: 'desc' });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? -Infinity;
      const bVal = b[sortConfig.key] ?? -Infinity;
      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortConfig]);

  const SortIcon = ({ fieldKey }) => {
    if (sortConfig.key !== fieldKey) {
      return <ArrowUpDown className="h-3 w-3 text-slate-500" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-3 w-3 text-blue-400" />
      : <ArrowDown className="h-3 w-3 text-blue-400" />;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-800">
          <tr>
            <th 
              className="px-4 py-3 text-left text-slate-300 font-medium cursor-pointer hover:bg-slate-700 transition-colors"
              onClick={() => handleSort('provider')}
            >
              <div className="flex items-center gap-2">
                Provider
                <SortIcon fieldKey="provider" />
              </div>
            </th>
            <th 
              className="px-4 py-3 text-right text-slate-300 font-medium cursor-pointer hover:bg-slate-700 transition-colors"
              onClick={() => handleSort('samples')}
            >
              <div className="flex items-center justify-end gap-2">
                Samples
                <SortIcon fieldKey="samples" />
              </div>
            </th>
            {selectedFields.map((fieldKey) => {
              const config = AVAILABLE_FIELDS[fieldKey];
              if (!config) return null;
              return (
                <th
                  key={fieldKey}
                  className="px-4 py-3 text-right font-medium cursor-pointer hover:bg-slate-700 transition-colors"
                  style={{ color: config.color }}
                  onClick={() => handleSort(fieldKey)}
                >
                  <div className="flex items-center justify-end gap-2">
                    {config.label}
                    {config.unit && <span className="text-slate-500 text-xs">({config.unit})</span>}
                    <SortIcon fieldKey={fieldKey} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {sortedData.map((row, idx) => (
            <tr 
              key={row.provider} 
              className={`
                ${idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/50'}
                hover:bg-slate-800 transition-colors
              `}
            >
              <td className="px-4 py-3 text-white font-medium">
                {row.provider}
              </td>
              <td className="px-4 py-3 text-right text-slate-300">
                {row.samples?.toLocaleString()}
              </td>
              {selectedFields.map((fieldKey) => {
                const config = AVAILABLE_FIELDS[fieldKey];
                if (!config) return null;
                const value = row[fieldKey];
                return (
                  <td
                    key={fieldKey}
                    className="px-4 py-3 text-right font-mono"
                    style={{ color: config.color }}
                  >
                    {value != null ? value.toFixed(1) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-800 border-t-2 border-slate-600">
          <tr>
            <td className="px-4 py-3 text-slate-300 font-semibold">Average</td>
            <td className="px-4 py-3 text-right text-slate-300 font-semibold">
              {sortedData.reduce((sum, row) => sum + (row.samples || 0), 0).toLocaleString()}
            </td>
            {selectedFields.map((fieldKey) => {
              const config = AVAILABLE_FIELDS[fieldKey];
              if (!config) return null;
              const values = sortedData.map(r => r[fieldKey]).filter(v => v != null);
              const avg = values.length > 0 
                ? values.reduce((a, b) => a + b, 0) / values.length 
                : null;
              return (
                <td
                  key={fieldKey}
                  className="px-4 py-3 text-right font-mono font-semibold"
                  style={{ color: config.color }}
                >
                  {avg != null ? avg.toFixed(1) : '—'}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
      <div className="font-semibold text-white mb-2 border-b border-slate-700 pb-2">
        {label}
      </div>
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const fieldConfig = AVAILABLE_FIELDS[entry.dataKey];
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-slate-300 text-sm">
                  {fieldConfig?.label || entry.dataKey}
                </span>
              </div>
              <span className="font-semibold text-white text-sm">
                {entry.value?.toFixed(1) ?? 'N/A'}
                {fieldConfig?.unit && (
                  <span className="text-slate-400 text-xs ml-1">
                    {fieldConfig.unit}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ProviderPerformanceChart = React.forwardRef(({ 
  locations,
  showFieldSelector = true,
  defaultFields = null,
  defaultViewTable = false,
}, ref) => {
  
  // Initialize selected fields - default to DL and UL
  const [selectedFields, setSelectedFields] = useState(() => {
    if (defaultFields && Array.isArray(defaultFields)) {
      return defaultFields;
    }
    return ["Download (Mbps)", "Upload (Mbps)"];
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isTable, setIsTable] = useState(defaultViewTable);

  // Process data
  const data = useMemo(() => {
    if (!locations?.length) return [];

    const providerStats = locations.reduce((acc, loc) => {
      const provider = loc.provider || "Unknown";
      if (!acc[provider]) {
        acc[provider] = {
          count: 0,
          avgRsrp: [],
          avgRsrq: [],
          avgSinr: [],
          avgMos: [],
          avgDl: [],
          avgUl: [],
          avgLatency: [],
          avgJitter: [],
        };
      }

      acc[provider].count++;
      if (loc.rsrp != null) acc[provider].avgRsrp.push(loc.rsrp);
      if (loc.rsrq != null) acc[provider].avgRsrq.push(loc.rsrq);
      if (loc.sinr != null) acc[provider].avgSinr.push(loc.sinr);
      if (loc.mos != null) acc[provider].avgMos.push(loc.mos);
      if (loc.dl_tpt != null) acc[provider].avgDl.push(parseFloat(loc.dl_tpt));
      if (loc.ul_tpt != null) acc[provider].avgUl.push(parseFloat(loc.ul_tpt));
      if (loc.latency != null) acc[provider].avgLatency.push(loc.latency);
      if (loc.jitter != null) acc[provider].avgJitter.push(loc.jitter);

      return acc;
    }, {});

    return Object.entries(providerStats)
      .map(([provider, data]) => ({
        provider,
        samples: data.count,
        MOS:
          data.avgMos.length > 0
            ? parseFloat((data.avgMos.reduce((a, b) => a + b, 0) / data.avgMos.length).toFixed(2))
            : null,
        "Download (Mbps)":
          data.avgDl.length > 0
            ? parseFloat((data.avgDl.reduce((a, b) => a + b, 0) / data.avgDl.length).toFixed(1))
            : null,
        "Upload (Mbps)":
          data.avgUl.length > 0
            ? parseFloat((data.avgUl.reduce((a, b) => a + b, 0) / data.avgUl.length).toFixed(1))
            : null,
        avgRsrp:
          data.avgRsrp.length > 0
            ? parseFloat((data.avgRsrp.reduce((a, b) => a + b, 0) / data.avgRsrp.length).toFixed(1))
            : null,
        avgRsrq:
          data.avgRsrq.length > 0
            ? parseFloat((data.avgRsrq.reduce((a, b) => a + b, 0) / data.avgRsrq.length).toFixed(1))
            : null,
        avgSinr:
          data.avgSinr.length > 0
            ? parseFloat((data.avgSinr.reduce((a, b) => a + b, 0) / data.avgSinr.length).toFixed(1))
            : null,
        avgLatency:
          data.avgLatency.length > 0
            ? parseFloat((data.avgLatency.reduce((a, b) => a + b, 0) / data.avgLatency.length).toFixed(1))
            : null,
        avgJitter:
          data.avgJitter.length > 0
            ? parseFloat((data.avgJitter.reduce((a, b) => a + b, 0) / data.avgJitter.length).toFixed(1))
            : null,
      }))
      .sort((a, b) => b.samples - a.samples);
  }, [locations]);

  const validData = filterValidData(data, 'provider');

  if (!validData.length) {
    return (
      <ChartContainer ref={ref} title="Provider Performance Comparison" icon={Globe}>
        <EmptyState message="No provider data available" />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer 
      ref={ref} 
      title="Provider Performance Comparison" 
      icon={Globe}
      headerExtra={
        <div className="flex items-center gap-2">
          {/* Chart/Table Toggle */}
          <ViewToggle isTable={isTable} setIsTable={setIsTable} />

          {/* Settings Button */}
          {showFieldSelector && (
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                  transition-all duration-200
                  ${settingsOpen 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Fields</span>
                <span className="bg-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                  {selectedFields.length}
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <FieldSettingsDropdown
                selectedFields={selectedFields}
                onFieldsChange={setSelectedFields}
                isOpen={settingsOpen}
                setIsOpen={setSettingsOpen}
              />
            </div>
          )}
        </div>
      }
    >
      {/* Main Content */}
      <div className="mb-4">
        {isTable ? (
          <DataTable data={validData} selectedFields={selectedFields} />
        ) : (
          <>
            {/* Selected Fields Summary */}
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-slate-400">Metrics:</span>
              <div className="flex flex-wrap gap-1">
                {selectedFields.map(fieldKey => {
                  const config = AVAILABLE_FIELDS[fieldKey];
                  return (
                    <span
                      key={fieldKey}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: `${config.color}20`,
                        color: config.color,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: config.color }}
                      />
                      {config.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Bar Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={validData} margin={{ ...CHART_CONFIG.margin, bottom: 40 }}>
                <CartesianGrid {...CHART_CONFIG.grid} />
                <XAxis
                  dataKey="provider"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: "#9CA3AF", fontSize: 11 }}
                />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: "12px" }}
                  formatter={(value) => AVAILABLE_FIELDS[value]?.label || value}
                />
                {selectedFields.map((fieldKey) => {
                  const config = AVAILABLE_FIELDS[fieldKey];
                  if (!config) return null;
                  return (
                    <Bar
                      key={fieldKey}
                      dataKey={fieldKey}
                      fill={config.color}
                      radius={[4, 4, 0, 0]}
                      name={config.label}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>

            {/* Sample Count Footer */}
            <div className="flex flex-wrap gap-3 text-xs text-slate-400 justify-center bg-slate-800 p-3 rounded-lg mt-4">
              {validData.map((p, idx) => (
                <div key={idx} className="bg-slate-900 px-2 py-1 rounded">
                  <span className="text-white font-semibold">{p.provider}:</span>{" "}
                  <span className="text-slate-300">{p.samples} samples</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* No fields selected warning */}
      {selectedFields.length === 0 && (
        <div className="p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg text-center">
          <span className="text-yellow-400 text-sm">
            ⚠️ No fields selected. Please select at least one field to display.
          </span>
        </div>
      )}
    </ChartContainer>
  );
});

ProviderPerformanceChart.displayName = "ProviderPerformanceChart";