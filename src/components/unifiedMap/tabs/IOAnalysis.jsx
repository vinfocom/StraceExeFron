import React, { useMemo, useState, memo, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Building2,
  Trees,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Settings,
  X,
} from "lucide-react";
import {
  normalizeProviderName,
  normalizeTechName,
  COLOR_SCHEMES,
  getProviderColor,
  getTechnologyColor,
} from "@/utils/colorUtils";

const COLORS = {
  indoor: "#3B82F6",
  outdoor: "#10B981",
};

// Available KPIs
const ALL_KPIS = {
  avg_rsrp: { label: "RSRP", key: "avg_rsrp", unit: "dBm" },
  avg_rsrq: { label: "RSRQ", key: "avg_rsrq", unit: "dB" },
  avg_sinr: { label: "SINR", key: "avg_sinr", unit: "dB" },
  avg_mos: { label: "MOS", key: "avg_mos", unit: "" },
  avg_dl_tpt: { label: "DL TPT", key: "avg_dl_tpt", unit: "Mbps" },
  avg_ul_tpt: { label: "UL TPT", key: "avg_ul_tpt", unit: "Mbps" },
};

// Dropdown Settings (positioned relative to button)
const DropdownSettings = memo(({ isOpen, onClose, children, position }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      
      {/* Dropdown */}
      <div 
        className="absolute right-0 top-full mt-1 bg-slate-800 rounded-lg border border-slate-600 shadow-xl z-40 min-w-[200px]"
        style={{ maxHeight: '300px', overflowY: 'auto' }}
      >
        {children}
      </div>
    </>
  );
});

// KPI Multi-Select Dropdown
const KPIDropdown = memo(({ isOpen, onClose, selectedKPIs, onToggleKPI }) => {
  if (!isOpen) return null;

  return (
    <DropdownSettings isOpen={isOpen} onClose={onClose}>
      <div className="p-2">
        <div className="text-xs text-slate-400 px-2 py-1 font-medium">Select KPIs</div>
        
        {Object.entries(ALL_KPIS).map(([key, { label }]) => (
          <label
            key={key}
            className="flex items-center gap-2 p-2 hover:bg-slate-700 rounded cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedKPIs.includes(key)}
              onChange={() => onToggleKPI(key)}
              className="w-3.5 h-3.5 rounded border-slate-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-white">{label}</span>
          </label>
        ))}
        
        <div className="border-t border-slate-700 mt-2 pt-2 flex gap-1 px-1">
          <button
            onClick={() => {
              Object.keys(ALL_KPIS).forEach(key => {
                if (!selectedKPIs.includes(key)) onToggleKPI(key);
              });
            }}
            className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded"
          >
            All
          </button>
          <button
            onClick={() => {
              const toKeep = selectedKPIs[0];
              selectedKPIs.forEach(key => {
                if (key !== toKeep) onToggleKPI(key);
              });
            }}
            className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded"
          >
            Clear
          </button>
        </div>
      </div>
    </DropdownSettings>
  );
});

// Metric Single-Select Dropdown
const MetricDropdown = memo(({ isOpen, onClose, selectedMetric, onSelectMetric }) => {
  if (!isOpen) return null;

  return (
    <DropdownSettings isOpen={isOpen} onClose={onClose}>
      <div className="p-2">
        <div className="text-xs text-slate-400 px-2 py-1 font-medium">Select Metric</div>
        
        {Object.entries(ALL_KPIS).map(([key, { label, unit }]) => (
          <button
            key={key}
            onClick={() => {
              onSelectMetric(key);
              onClose();
            }}
            className={`w-full text-left p-2 rounded transition-colors flex items-center justify-between ${
              selectedMetric === key
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            <span className="text-sm">{label}</span>
            {unit && <span className="text-xs opacity-70">{unit}</span>}
          </button>
        ))}
      </div>
    </DropdownSettings>
  );
});

// Section with Settings
const Section = memo(({ 
  title, 
  children, 
  defaultExpanded = true, 
  settingsContent,
  showSettings = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 mb-3">
      <div className="flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1"
        >
          <span className="font-semibold text-white text-sm">{title}</span>
        </button>
        
        <div className="flex items-center gap-1 relative">
          {showSettings && (
            <button
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Settings"
            >
              <Settings className="h-4 w-4 text-blue-400" />
            </button>
          )}
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          
          {/* Settings Dropdown - positioned here */}
          {showSettings && showSettingsDropdown && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowSettingsDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 bg-slate-800 rounded-lg border border-slate-600 shadow-xl z-40 min-w-[180px]">
                {settingsContent?.(() => setShowSettingsDropdown(false))}
              </div>
            </>
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 pt-0 border-t border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
});

// Simple Bar Chart with optional custom colors
const SimpleBarChart = memo(({ data, title, colorType }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded p-4 text-center">
        <AlertCircle className="h-5 w-5 mx-auto mb-2 text-slate-500" />
        <p className="text-slate-400 text-sm">No data for {title}</p>
      </div>
    );
  }

  // Get colors based on type (provider, technology, or default indoor/outdoor)
  const getBarColor = (name, type) => {
    if (type === "provider") {
      return COLOR_SCHEMES.provider[name] || COLOR_SCHEMES.provider.Unknown;
    }
    if (type === "technology") {
      return COLOR_SCHEMES.technology[name] || COLOR_SCHEMES.technology.Unknown;
    }
    return null;
  };

  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <h4 className="text-xs text-slate-400 mb-2">{title} ({data.length} items)</h4>
      <div style={{ width: "100%", height: "220px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -5, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={40} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "#1e293b", 
                border: "1px solid #475569",
                borderRadius: "6px",
                fontSize: "12px"
              }}
              formatter={(value) => typeof value === 'number' ? value.toFixed(2) : value}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Indoor" fill={COLORS.indoor} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Outdoor" fill={COLORS.outdoor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// Data Table with color indicators
const DataTable = memo(({ data, title, colorType }) => {
  if (!data || data.length === 0) return null;

  const getColor = (name) => {
    if (colorType === "provider") {
      return COLOR_SCHEMES.provider[name] || COLOR_SCHEMES.provider.Unknown;
    }
    if (colorType === "technology") {
      return COLOR_SCHEMES.technology[name] || COLOR_SCHEMES.technology.Unknown;
    }
    return null;
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <h4 className="text-xs text-slate-400 mb-2">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left p-2 text-slate-400">Name</th>
              <th className="text-right p-2 text-blue-400">Indoor</th>
              <th className="text-right p-2 text-green-400">Outdoor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const color = getColor(row.name);
              return (
                <tr key={idx} className="border-b border-slate-800/50">
                  <td className="p-2 text-white">
                    <div className="flex items-center gap-2">
                      {color && (
                        <div 
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: color }}
                        />
                      )}
                      <span>{row.name}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right text-blue-400">
                    {typeof row.Indoor === "number" ? row.Indoor.toFixed(2) : "-"}
                  </td>
                  <td className="p-2 text-right text-green-400">
                    {typeof row.Outdoor === "number" ? row.Outdoor.toFixed(2) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// Main Component
export const IOAnalysis = ({ indoor = [], outdoor = [], expanded = true }) => {
  // State for KPI selection
  const [selectedKPIs, setSelectedKPIs] = useState(Object.keys(ALL_KPIS));
  
  // State for metric selection
  const [operatorMetric, setOperatorMetric] = useState("avg_rsrp");
  const [techMetric, setTechMetric] = useState("avg_rsrp");

  // Toggle KPI selection
  const handleToggleKPI = (kpiKey) => {
    setSelectedKPIs(prev => {
      if (prev.includes(kpiKey)) {
        if (prev.length === 1) return prev;
        return prev.filter(k => k !== kpiKey);
      } else {
        return [...prev, kpiKey];
      }
    });
  };

  // 1. KPI Comparison Data
  const kpiData = useMemo(() => {
    const calcAvg = (items, key) => {
      if (!items?.length) return null;
      const values = items
        .map((i) => i.KPIs?.[key])
        .filter((v) => v != null && !isNaN(v));
      if (values.length === 0) return null;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    return selectedKPIs.map((key) => ({
      name: ALL_KPIS[key].label,
      Indoor: calcAvg(indoor, key),
      Outdoor: calcAvg(outdoor, key),
    })).filter(d => d.Indoor !== null || d.Outdoor !== null);
  }, [indoor, outdoor, selectedKPIs]);

  // 2. Operator Comparison Data (filter out Unknown)
  const operatorData = useMemo(() => {
    const map = new Map();

    indoor?.forEach((item) => {
      const op = normalizeProviderName(item.Operator);
      if (!op || op === "Unknown" || op === "UNKNOWN") return; // Skip Unknown
      
      if (!map.has(op)) {
        map.set(op, { name: op, indoorVals: [], outdoorVals: [] });
      }
      const value = item.KPIs?.[operatorMetric];
      if (value != null && !isNaN(value)) {
        map.get(op).indoorVals.push(value);
      }
    });

    outdoor?.forEach((item) => {
      const op = normalizeProviderName(item.Operator);
      if (!op || op === "Unknown") return; // Skip Unknown
      
      if (!map.has(op)) {
        map.set(op, { name: op, indoorVals: [], outdoorVals: [] });
      }
      const value = item.KPIs?.[operatorMetric];
      if (value != null && !isNaN(value)) {
        map.get(op).outdoorVals.push(value);
      }
    });

    return Array.from(map.values())
      .filter(item => item.name !== "Unknown" && item.name !== "UNKNOWN") // Extra filter
      .map((item) => ({
        name: item.name,
        Indoor: item.indoorVals.length > 0
          ? item.indoorVals.reduce((a, b) => a + b, 0) / item.indoorVals.length
          : null,
        Outdoor: item.outdoorVals.length > 0
          ? item.outdoorVals.reduce((a, b) => a + b, 0) / item.outdoorVals.length
          : null,
      }));
  }, [indoor, outdoor, operatorMetric]);

  // 3. Technology Comparison Data (filter out Unknown)
 
const techData = useMemo(() => {
  const map = new Map();

  indoor?.forEach((item) => {
    const tech = normalizeTechName(item.Technology);
    if (tech === "Unknown") return; // Skip Unknown
    
    if (!map.has(tech)) {
      map.set(tech, { name: tech, indoorVals: [], outdoorVals: [] });
    }
    const value = item.KPIs?.[techMetric];
    if (value != null && !isNaN(value)) {
      map.get(tech).indoorVals.push(value);
    }
  });

  outdoor?.forEach((item) => {
    const tech = normalizeTechName(item.Technology);
    if (tech === "Unknown") return; // Skip Unknown
    
    if (!map.has(tech)) {
      map.set(tech, { name: tech, indoorVals: [], outdoorVals: [] });
    }
    const value = item.KPIs?.[techMetric];
    if (value != null && !isNaN(value)) {
      map.get(tech).outdoorVals.push(value); // ✅ FIXED: Changed from indoorVals to outdoorVals
    }
  });

  return Array.from(map.values())
    .filter(item => item.name !== "Unknown")
    .map((item) => ({
      name: item.name,
      Indoor: item.indoorVals.length > 0
        ? item.indoorVals.reduce((a, b) => a + b, 0) / item.indoorVals.length
        : null,
      Outdoor: item.outdoorVals.length > 0
        ? item.outdoorVals.reduce((a, b) => a + b, 0) / item.outdoorVals.length
        : null,
    }));
}, [indoor, outdoor, techMetric]);

  // 4. App Usage Data
  const appData = useMemo(() => {
    const map = new Map();

    indoor?.forEach((item) => {
      item.AppUsage?.forEach((app) => {
        if (!app.appName) return;
        if (!map.has(app.appName)) {
          map.set(app.appName, { name: app.appName, indoor: 0, outdoor: 0 });
        }
        map.get(app.appName).indoor += app.seconds;
      });
    });

    outdoor?.forEach((item) => {
      item.AppUsage?.forEach((app) => {
        if (!app.appName) return;
        if (!map.has(app.appName)) {
          map.set(app.appName, { name: app.appName, indoor: 0, outdoor: 0 });
        }
        map.get(app.appName).outdoor += app.seconds;
      });
    });

    return Array.from(map.values())
      .map((app) => ({
        name: app.name,
        Indoor: parseFloat((app.indoor / 60).toFixed(2)),
        Outdoor: parseFloat((app.outdoor / 60).toFixed(2)),
      }))
      .sort((a, b) => (b.Indoor + b.Outdoor) - (a.Indoor + a.Outdoor))
      .slice(0, 6);
  }, [indoor, outdoor]);

  if (!indoor?.length && !outdoor?.length) {
    return (
      <div className="bg-slate-900 rounded-lg p-6 text-center border border-slate-700">
        <Activity className="h-10 w-10 mx-auto mb-3 text-slate-500" />
        <h3 className="text-base font-semibold text-white mb-1">No Data</h3>
        <p className="text-slate-400 text-sm">Indoor: 0, Outdoor: 0</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-blue-900/50 to-green-900/50 rounded-lg border border-blue-500/50">
        <Building2 className="h-5 w-5 text-blue-400" />
        <span className="text-slate-400">/</span>
        <Trees className="h-5 w-5 text-green-400" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-white">Indoor vs Outdoor Analysis</h2>
          <p className="text-xs text-slate-300">
            <span className="text-blue-400 font-bold">{indoor?.length || 0}</span> indoor · 
            <span className="text-green-400 font-bold ml-1">{outdoor?.length || 0}</span> outdoor
          </p>
        </div>
      </div>

      {/* Chart 1: KPI Comparison */}
      <Section 
        title={`KPI Comparison (${selectedKPIs.length}/${Object.keys(ALL_KPIS).length})`}
        defaultExpanded={true}
        showSettings={true}
        settingsContent={(closeDropdown) => (
          <div className="p-2">
            <div className="text-xs text-slate-400 px-2 py-1 font-medium">Select KPIs</div>
            {Object.entries(ALL_KPIS).map(([key, { label }]) => (
              <label
                key={key}
                className="flex items-center gap-2 p-2 hover:bg-slate-700 rounded cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedKPIs.includes(key)}
                  onChange={() => handleToggleKPI(key)}
                  className="w-3.5 h-3.5 rounded border-slate-600 text-blue-500"
                />
                <span className="text-sm text-white">{label}</span>
              </label>
            ))}
            <div className="border-t border-slate-700 mt-2 pt-2 flex gap-1 px-1">
              <button
                onClick={() => {
                  Object.keys(ALL_KPIS).forEach(key => {
                    if (!selectedKPIs.includes(key)) handleToggleKPI(key);
                  });
                }}
                className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded"
              >
                All
              </button>
              <button
                onClick={closeDropdown}
                className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
              >
                Done
              </button>
            </div>
          </div>
        )}
      >
        <SimpleBarChart data={kpiData} title="Selected KPIs" />
        <div className="mt-2">
          <DataTable data={kpiData} title="KPI Values" />
        </div>
      </Section>

      {/* Chart 2: Operator Comparison */}
      <Section 
        title={`Operator Comparison - ${ALL_KPIS[operatorMetric]?.label || "RSRP"}`}
        defaultExpanded={true}
        showSettings={true}
        settingsContent={(closeDropdown) => (
          <div className="p-2">
            <div className="text-xs text-slate-400 px-2 py-1 font-medium">Select Metric</div>
            {Object.entries(ALL_KPIS).map(([key, { label, unit }]) => (
              <button
                key={key}
                onClick={() => {
                  setOperatorMetric(key);
                  closeDropdown();
                }}
                className={`w-full text-left p-2 rounded transition-colors flex items-center justify-between ${
                  operatorMetric === key
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span className="text-sm">{label}</span>
                {unit && <span className="text-xs opacity-70">{unit}</span>}
              </button>
            ))}
          </div>
        )}
      >
        {operatorData.length > 0 ? (
          <>
            <SimpleBarChart 
              data={operatorData} 
              title={`By Operator (${ALL_KPIS[operatorMetric]?.label})`} 
              colorType="provider"
            />
            <div className="mt-2">
              <DataTable 
                data={operatorData} 
                title={`Operator ${ALL_KPIS[operatorMetric]?.label}`} 
                colorType="provider"
              />
            </div>
          </>
        ) : (
          <div className="bg-slate-800/50 rounded p-4 text-center">
            <p className="text-slate-400 text-sm">No valid operator data (Unknown excluded)</p>
          </div>
        )}
      </Section>

      {/* Chart 3: Technology Comparison */}
      <Section 
        title={`Technology Comparison - ${ALL_KPIS[techMetric]?.label || "RSRP"}`}
        defaultExpanded={true}
        showSettings={true}
        settingsContent={(closeDropdown) => (
          <div className="p-2">
            <div className="text-xs text-slate-400 px-2 py-1 font-medium">Select Metric</div>
            {Object.entries(ALL_KPIS).map(([key, { label, unit }]) => (
              <button
                key={key}
                onClick={() => {
                  setTechMetric(key);
                  closeDropdown();
                }}
                className={`w-full text-left p-2 rounded transition-colors flex items-center justify-between ${
                  techMetric === key
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span className="text-sm">{label}</span>
                {unit && <span className="text-xs opacity-70">{unit}</span>}
              </button>
            ))}
          </div>
        )}
      >
        {techData.length > 0 ? (
          <>
            <SimpleBarChart 
              data={techData} 
              title={`By Technology (${ALL_KPIS[techMetric]?.label})`} 
              colorType="technology"
            />
            <div className="mt-2">
              <DataTable 
                data={techData} 
                title={`Technology ${ALL_KPIS[techMetric]?.label}`} 
                colorType="technology"
              />
            </div>
          </>
        ) : (
          <div className="bg-slate-800/50 rounded p-4 text-center">
            <p className="text-slate-400 text-sm">No valid technology data (Unknown excluded)</p>
          </div>
        )}
      </Section>

      {/* Chart 4: App Usage */}
      {appData.length > 0 && (
        <Section title="App Usage (Minutes)" defaultExpanded={false}>
          <SimpleBarChart data={appData} title="App Usage" />
          <div className="mt-2">
            <DataTable data={appData} title="App Minutes" />
          </div>
        </Section>
      )}
    </div>
  );
};

export default memo(IOAnalysis);