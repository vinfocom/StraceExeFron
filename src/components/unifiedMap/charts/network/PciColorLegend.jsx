// src/components/analytics/PciColorLegend.jsx
import React, { useState, useMemo } from "react";
import { 
  Antenna, 
  MapPin, 
  Signal, 
  BarChart3, 
  Globe, 
  Layers,
  Clock,
  Wifi,
  Activity,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SortAsc,
  SortDesc
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import { PCI_COLOR_PALETTE } from "@/components/map/layers/MultiColorCirclesLayer";
import { CHART_CONFIG } from "@/utils/constants";
import { normalizeBandName } from "@/utils/colorUtils";

// Provider color mapping
const PROVIDER_COLORS = {
  "JIO": "#3B82F6",
  "Jio": "#3B82F6",
  "Jio True5G": "#3B82F6",
  "JIO 4G": "#3B82F6",
  "JIO4G": "#3B82F6",
  "IND-JIO": "#3B82F6",
  "IND airtel": "#EF4444",
  "IND Airtel": "#EF4444",
  "Airtel": "#EF4444",
  "airtel": "#EF4444",
  "Airtel 5G": "#EF4444",
  "VI India": "#22C55E",
  "Vi India": "#22C55E",
  "Vodafone IN": "#22C55E",
  "BSNL": "#F59E0B",
  "Unknown": "#6B7280",
};

// Technology color mapping
const TECHNOLOGY_COLORS = {
  "5G": "#EC4899",
  "5G SA": "#D946EF",
  "5G NSA": "#EC4899",
  "NR (5G)": "#EC4899",
  "NR (5G SA)": "#D946EF",
  "4G": "#8B5CF6",
  "LTE": "#8B5CF6",
  "4G+ (LTE-CA)": "#A78BFA",
  "LTE (4G)": "#8B5CF6",
  "LTE-CA": "#A78BFA",
  "3G": "#22C55E",
  "HSPA": "#22C55E",
  "WCDMA": "#22C55E",
  "2G": "#6B7280",
  "GSM": "#6B7280",
  "EDGE": "#6B7280",
  "Unknown": "#9CA3AF",
};

// Band color mapping
const BAND_COLORS = {
  "1": "#EF4444",
  "3": "#F97316",
  "5": "#F59E0B",
  "7": "#84CC16",
  "8": "#22C55E",
  "20": "#14B8A6",
  "28": "#06B6D4",
  "40": "#3B82F6",
  "41": "#6366F1",
  "n28": "#8B5CF6",
  "n78": "#A855F7",
  "n258": "#D946EF",
  "Unknown": "#6B7280",
};

// Sort options configuration with display info
const SORT_OPTIONS = {
  count: { 
    label: "Samples", 
    key: "count", 
    getValue: (item) => item.count || 0,
    unit: "",
    color: "white",
    field: "count"
  },
  pci: { 
    label: "PCI", 
    key: "pci", 
    getValue: (item) => item.pciNum || parseInt(item.pci) || 0,
    unit: "",
    color: "white",
    field: "pci"
  },
  rsrp: { 
    label: "RSRP", 
    key: "rsrp", 
    getValue: (item) => parseFloat(item.avgRsrp?.avg) || -999,
    unit: "dBm",
    getColor: (val) => val >= -90 ? "green" : val >= -105 ? "yellow" : "red",
    field: "avgRsrp"
  },
  rsrq: { 
    label: "RSRQ", 
    key: "rsrq", 
    getValue: (item) => parseFloat(item.avgRsrq?.avg) || -999,
    unit: "dB",
    getColor: (val) => val >= -10 ? "green" : val >= -15 ? "yellow" : "red",
    field: "avgRsrq"
  },
  sinr: { 
    label: "SINR", 
    key: "sinr", 
    getValue: (item) => parseFloat(item.avgSinr?.avg) || -999,
    unit: "dB",
    getColor: (val) => val >= 20 ? "green" : val >= 13 ? "yellow" : "red",
    field: "avgSinr"
  },
  mos: { 
    label: "MOS", 
    key: "mos", 
    getValue: (item) => parseFloat(item.avgMos?.avg) || 0,
    unit: "",
    getColor: (val) => val >= 4 ? "green" : val >= 3 ? "yellow" : "red",
    field: "avgMos"
  },
  dl: { 
    label: "Download", 
    key: "dl", 
    getValue: (item) => parseFloat(item.avgDl?.avg) || 0,
    unit: "Mbps",
    getColor: (val) => val >= 50 ? "green" : val >= 25 ? "yellow" : "red",
    field: "avgDl"
  },
  ul: { 
    label: "Upload", 
    key: "ul", 
    getValue: (item) => parseFloat(item.avgUl?.avg) || 0,
    unit: "Mbps",
    getColor: (val) => val >= 20 ? "green" : val >= 10 ? "yellow" : "red",
    field: "avgUl"
  },
  latency: { 
    label: "Latency", 
    key: "latency", 
    getValue: (item) => parseFloat(item.avgLatency?.avg) || 9999,
    unit: "ms",
    getColor: (val) => val <= 30 ? "green" : val <= 50 ? "yellow" : "red",
    field: "avgLatency"
  },
  jitter: { 
    label: "Jitter", 
    key: "jitter", 
    getValue: (item) => parseFloat(item.avgJitter?.avg) || 9999,
    unit: "ms",
    getColor: (val) => val <= 10 ? "green" : val <= 20 ? "yellow" : "red",
    field: "avgJitter"
  },
  cells: { 
    label: "Cells", 
    key: "cells", 
    getValue: (item) => item.cellCount || 0,
    unit: "",
    color: "cyan",
    field: "cellCount"
  },
  nodebs: { 
    label: "NodeBs", 
    key: "nodebs", 
    getValue: (item) => item.nodebCount || 0,
    unit: "",
    color: "orange",
    field: "nodebCount"
  },
};

// Provider sort options
const PROVIDER_SORT_OPTIONS = {
  count: { label: "Samples", key: "count", getValue: (item) => item.totalCount || 0 },
  pciCount: { label: "PCIs", key: "pciCount", getValue: (item) => item.pciCount || 0 },
  rsrp: { label: "RSRP", key: "rsrp", getValue: (item) => parseFloat(item.avgRsrp?.avg) || -999 },
  sinr: { label: "SINR", key: "sinr", getValue: (item) => parseFloat(item.avgSinr?.avg) || -999 },
  mos: { label: "MOS", key: "mos", getValue: (item) => parseFloat(item.avgMos?.avg) || 0 },
  dl: { label: "Download", key: "dl", getValue: (item) => parseFloat(item.avgDl?.avg) || 0 },
  ul: { label: "Upload", key: "ul", getValue: (item) => parseFloat(item.avgUl?.avg) || 0 },
  latency: { label: "Latency", key: "latency", getValue: (item) => parseFloat(item.avgLatency?.avg) || 9999 },
  cells: { label: "Cells", key: "cells", getValue: (item) => item.cellCount || 0 },
};

// Cell sort options
const CELL_SORT_OPTIONS = {
  count: { label: "Samples", key: "count", getValue: (item) => item.count || 0 },
  pciCount: { label: "PCIs", key: "pciCount", getValue: (item) => item.pciCount || 0 },
  rsrp: { label: "RSRP", key: "rsrp", getValue: (item) => parseFloat(item.avgRsrp?.avg) || -999 },
  sinr: { label: "SINR", key: "sinr", getValue: (item) => parseFloat(item.avgSinr?.avg) || -999 },
  mos: { label: "MOS", key: "mos", getValue: (item) => parseFloat(item.avgMos?.avg) || 0 },
  dl: { label: "Download", key: "dl", getValue: (item) => parseFloat(item.avgDl?.avg) || 0 },
  ul: { label: "Upload", key: "ul", getValue: (item) => parseFloat(item.avgUl?.avg) || 0 },
  latency: { label: "Latency", key: "latency", getValue: (item) => parseFloat(item.avgLatency?.avg) || 9999 },
  nodebId: { label: "NodeB ID", key: "nodebId", getValue: (item) => item.nodebId || "" },
};

const getProviderColor = (provider) => {
  if (!provider) return "#6B7280";
  if (PROVIDER_COLORS[provider]) return PROVIDER_COLORS[provider];
  
  const lower = provider.toLowerCase();
  if (lower.includes("jio")) return "#3B82F6";
  if (lower.includes("airtel")) return "#EF4444";
  if (lower.includes("vi") || lower.includes("vodafone")) return "#22C55E";
  if (lower.includes("bsnl")) return "#F59E0B";
  
  return "#6B7280";
};

const getTechnologyColor = (tech) => {
  if (!tech) return "#6B7280";
  if (TECHNOLOGY_COLORS[tech]) return TECHNOLOGY_COLORS[tech];
  
  const upper = tech.toUpperCase();
  if (upper.includes("5G") || upper.includes("NR")) return "#EC4899";
  if (upper.includes("LTE") || upper.includes("4G")||upper.includes("4G+ (LTE-CA)")) return "#8B5CF6";
  if (upper.includes("3G") || upper.includes("HSPA") || upper.includes("WCDMA")) return "#22C55E";
  if (upper.includes("2G") || upper.includes("GSM") || upper.includes("EDGE")) return "#6B7280";
  
  return "#9CA3AF";
};

const getBandColor = (band) => {
  if (!band) return "#6B7280";
  const bandStr = String(band);
  return BAND_COLORS[bandStr] || BAND_COLORS[`n${bandStr}`] || "#6B7280";
};

// Helper to calculate statistics
const calculateStats = (values) => {
  if (!values || values.length === 0) return null;
  const validValues = values.filter(v => v != null && !isNaN(v));
  if (validValues.length === 0) return null;
  
  const sorted = [...validValues].sort((a, b) => a - b);
  const sum = validValues.reduce((a, b) => a + b, 0);
  const avg = sum / validValues.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  
  return {
    avg: avg.toFixed(2),
    median: median.toFixed(2),
    min: Math.min(...validValues).toFixed(2),
    max: Math.max(...validValues).toFixed(2),
    count: validValues.length,
  };
};

// Helper to get color class based on metric and value
const getMetricColorClass = (metricKey, value) => {
  const option = SORT_OPTIONS[metricKey];
  if (!option || !option.getColor) {
    // Default colors
    if (option?.color) {
      const colorMap = {
        green: "text-green-400 bg-green-500/10",
        yellow: "text-yellow-400 bg-yellow-500/10",
        red: "text-red-400 bg-red-500/10",
        cyan: "text-cyan-400 bg-cyan-500/10",
        orange: "text-orange-400 bg-orange-500/10",
        white: "text-white bg-slate-700",
      };
      return colorMap[option.color] || "text-white bg-slate-700";
    }
    return "text-white bg-slate-700";
  }
  
  const color = option.getColor(parseFloat(value));
  const colorMap = {
    green: "text-green-400 bg-green-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10",
    red: "text-red-400 bg-red-500/10",
    cyan: "text-cyan-400 bg-cyan-500/10",
    orange: "text-orange-400 bg-orange-500/10",
  };
  
  return colorMap[color] || "text-white bg-slate-700";
};

// Sort Control Component
const SortControl = ({ sortConfig, onSortChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSortClick = (key) => {
    if (sortConfig.key === key) {
      onSortChange({
        key,
        direction: sortConfig.direction === 'desc' ? 'asc' : 'desc'
      });
    } else {
      onSortChange({ key, direction: 'desc' });
    }
    setIsOpen(false);
  };

  const toggleDirection = () => {
    onSortChange({
      ...sortConfig,
      direction: sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium bg-slate-800 text-white hover:bg-slate-700 rounded transition-colors"
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Sort: {options[sortConfig.key]?.label || 'Samples'}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl min-w-[140px] py-1 max-h-[300px] overflow-y-auto">
              {Object.entries(options).map(([key, option]) => (
                <button
                  key={key}
                  onClick={() => handleSortClick(key)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[12px] hover:bg-slate-700 transition-colors ${
                    sortConfig.key === key ? 'text-blue-400 bg-slate-700/50' : 'text-white'
                  }`}
                >
                  <span>{option.label}</span>
                  {sortConfig.key === key && (
                    sortConfig.direction === 'desc' 
                      ? <ArrowDown className="h-3.5 w-3.5" />
                      : <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        onClick={toggleDirection}
        className={`flex items-center gap-1 px-2 py-1 text-[12px] font-medium rounded transition-colors ${
          sortConfig.direction === 'desc' 
            ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
        }`}
        title={sortConfig.direction === 'desc' ? 'Descending (High to Low)' : 'Ascending (Low to High)'}
      >
        {sortConfig.direction === 'desc' ? (
          <>
            <SortDesc className="h-3.5 w-3.5" />
            <span>High→Low</span>
          </>
        ) : (
          <>
            <SortAsc className="h-3.5 w-3.5" />
            <span>Low→High</span>
          </>
        )}
      </button>
    </div>
  );
};

// Quick Sort Chips
const QuickSortChips = ({ sortConfig, onSortChange, options, showAll = false }) => {
  const displayOptions = showAll 
    ? Object.entries(options) 
    : Object.entries(options).slice(0, 6);

  return (
    <div className="flex flex-wrap gap-1">
      {displayOptions.map(([key, option]) => {
        const isActive = sortConfig.key === key;
        return (
          <button
            key={key}
            onClick={() => {
              if (isActive) {
                onSortChange({
                  key,
                  direction: sortConfig.direction === 'desc' ? 'asc' : 'desc'
                });
              } else {
                onSortChange({ key, direction: 'desc' });
              }
            }}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-all ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            <span>{option.label}</span>
            {isActive && (
              sortConfig.direction === 'desc' 
                ? <ArrowDown className="h-3 w-3" />
                : <ArrowUp className="h-3 w-3" />
            )}
          </button>
        );
      })}
    </div>
  );
};

// Sort helper function
const sortData = (data, sortConfig, options) => {
  if (!data || !sortConfig || !options[sortConfig.key]) return data;
  
  const option = options[sortConfig.key];
  const sorted = [...data].sort((a, b) => {
    const aVal = option.getValue(a);
    const bVal = option.getValue(b);
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.direction === 'desc' 
        ? bVal.localeCompare(aVal)
        : aVal.localeCompare(bVal);
    }
    
    return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
  });
  
  return sorted;
};

const resolvePciValue = (loc) => {
  const rawPci =
    loc?.best_pci ??
    loc?.bestPci ??
    loc?.pci ??
    loc?.PCI ??
    loc?.physical_cell_id;
  if (rawPci == null || rawPci === "") return "Unknown";
  return String(rawPci);
};

export const PciColorLegend = React.forwardRef(({ locations }, ref) => {
  const [viewMode, setViewMode] = useState("color-map");
  const [selectedPci, setSelectedPci] = useState(null);
  
  const [pciSortConfig, setPciSortConfig] = useState({ key: 'count', direction: 'desc' });
  const [providerSortConfig, setProviderSortConfig] = useState({ key: 'count', direction: 'desc' });
  const [cellSortConfig, setCellSortConfig] = useState({ key: 'count', direction: 'desc' });
  const isGridDataset = useMemo(
    () => (locations || []).some((loc) => Boolean(loc?.is_grid_cell)),
    [locations],
  );

  // ============================================
  // ENHANCED PCI DATA PROCESSING
  // ============================================
  const pciColorMap = useMemo(() => {
    if (!locations?.length) return [];

    const pciStats = locations.reduce((acc, loc) => {
      const pci = resolvePciValue(loc);
      
      if (!acc[pci]) {
        acc[pci] = {
          count: 0,
          samples: [],
          providers: {},
          technologies: {},
          bands: {},
          sessions: new Set(),
          nodebIds: new Set(),
          cellIds: new Set(),
          rsrp: [],
          rsrq: [],
          sinr: [],
          mos: [],
          dl_tpt: [],
          ul_tpt: [],
          latency: [],
          jitter: [],
          speed: [],
          lte_bler: [],
        };
      }

      acc[pci].count++;
      acc[pci].samples.push(loc);

      const provider = loc.provider || "Unknown";
      const technology = loc.technology || "Unknown";
      const band = normalizeBandName(loc.band || loc.primaryBand);

      acc[pci].providers[provider] = (acc[pci].providers[provider] || 0) + 1;
      acc[pci].technologies[technology] = (acc[pci].technologies[technology] || 0) + 1;
      acc[pci].bands[band] = (acc[pci].bands[band] || 0) + 1;

      if (loc.session_id != null) acc[pci].sessions.add(String(loc.session_id));
      if (loc.nodeb_id != null && loc.nodeb_id !== "Unknown") acc[pci].nodebIds.add(String(loc.nodeb_id));
      if (loc.cell_id != null && loc.cell_id !== "Unknown") acc[pci].cellIds.add(String(loc.cell_id));

      if (loc.rsrp != null && !isNaN(loc.rsrp)) acc[pci].rsrp.push(parseFloat(loc.rsrp));
      if (loc.rsrq != null && !isNaN(loc.rsrq)) acc[pci].rsrq.push(parseFloat(loc.rsrq));
      if (loc.sinr != null && !isNaN(loc.sinr)) acc[pci].sinr.push(parseFloat(loc.sinr));
      if (loc.mos != null && !isNaN(loc.mos)) acc[pci].mos.push(parseFloat(loc.mos));
      if (loc.dl_tpt != null && !isNaN(loc.dl_tpt)) acc[pci].dl_tpt.push(parseFloat(loc.dl_tpt));
      if (loc.ul_tpt != null && !isNaN(loc.ul_tpt)) acc[pci].ul_tpt.push(parseFloat(loc.ul_tpt));
      if (loc.latency != null && !isNaN(loc.latency)) acc[pci].latency.push(parseFloat(loc.latency));
      if (loc.jitter != null && !isNaN(loc.jitter)) acc[pci].jitter.push(parseFloat(loc.jitter));
      if (loc.speed != null && !isNaN(loc.speed)) acc[pci].speed.push(parseFloat(loc.speed));
      if (loc.lte_bler != null && !isNaN(loc.lte_bler)) acc[pci].lte_bler.push(parseFloat(loc.lte_bler));

      return acc;
    }, {});

    return Object.entries(pciStats)
      .map(([pci, data]) => {
        const pciNum = parseInt(pci);
        const colorIndex = isNaN(pciNum) ? 0 : pciNum % PCI_COLOR_PALETTE.length;

        const dominantProvider = Object.entries(data.providers).sort((a, b) => b[1] - a[1])[0];
        const dominantTechnology = Object.entries(data.technologies).sort((a, b) => b[1] - a[1])[0];
        const dominantBand = Object.entries(data.bands).sort((a, b) => b[1] - a[1])[0];

        return {
          pci,
          pciNum: isNaN(pciNum) ? -1 : pciNum,
          color: PCI_COLOR_PALETTE[colorIndex],
          colorIndex,
          count: data.count,
          providers: data.providers,
          technologies: data.technologies,
          bands: data.bands,
          dominantProvider: dominantProvider?.[0] || "Unknown",
          dominantProviderCount: dominantProvider?.[1] || 0,
          dominantTechnology: dominantTechnology?.[0] || "Unknown",
          dominantBand: dominantBand?.[0] || "Unknown",
          sessions: Array.from(data.sessions).sort(),
          sessionCount: data.sessions.size,
          nodebIds: Array.from(data.nodebIds).sort(),
          nodebCount: data.nodebIds.size,
          cellIds: Array.from(data.cellIds).sort(),
          cellCount: data.cellIds.size,
          avgRsrp: calculateStats(data.rsrp),
          avgRsrq: calculateStats(data.rsrq),
          avgSinr: calculateStats(data.sinr),
          avgMos: calculateStats(data.mos),
          avgDl: calculateStats(data.dl_tpt),
          avgUl: calculateStats(data.ul_tpt),
          avgLatency: calculateStats(data.latency),
          avgJitter: calculateStats(data.jitter),
          avgSpeed: calculateStats(data.speed),
          avgBler: calculateStats(data.lte_bler),
          rawData: {
            rsrp: data.rsrp,
            rsrq: data.rsrq,
            sinr: data.sinr,
            mos: data.mos,
            dl_tpt: data.dl_tpt,
            ul_tpt: data.ul_tpt,
            latency: data.latency,
            jitter: data.jitter,
          },
        };
      });
  }, [locations]);

  const sortedPciColorMap = useMemo(() => {
    return sortData(pciColorMap, pciSortConfig, SORT_OPTIONS);
  }, [pciColorMap, pciSortConfig]);

  // Provider data processing (keeping existing code)
  const providerPciData = useMemo(() => {
    if (!locations?.length) return { providers: [], summary: {} };

    const providerStats = {};

    locations.forEach((loc) => {
      const provider = loc.provider || "Unknown";
      const pci = resolvePciValue(loc);
      const technology = loc.technology || "Unknown";
      const band = normalizeBandName(loc.band || loc.primaryBand);

      if (!providerStats[provider]) {
        providerStats[provider] = {
          name: provider,
          totalCount: 0,
          pcis: {},
          technologies: {},
          bands: {},
          sessions: new Set(),
          nodebIds: new Set(),
          cellIds: new Set(),
          rsrp: [],
          rsrq: [],
          sinr: [],
          mos: [],
          dl_tpt: [],
          ul_tpt: [],
          latency: [],
          jitter: [],
        };
      }

      providerStats[provider].totalCount++;
      providerStats[provider].technologies[technology] = (providerStats[provider].technologies[technology] || 0) + 1;
      providerStats[provider].bands[band] = (providerStats[provider].bands[band] || 0) + 1;

      if (loc.session_id) providerStats[provider].sessions.add(String(loc.session_id));
      if (loc.nodeb_id) providerStats[provider].nodebIds.add(String(loc.nodeb_id));
      if (loc.cell_id) providerStats[provider].cellIds.add(String(loc.cell_id));

      if (!providerStats[provider].pcis[pci]) {
        providerStats[provider].pcis[pci] = {
          pci,
          count: 0,
          technologies: {},
          bands: {},
          cellIds: new Set(),
          nodebIds: new Set(),
          rsrp: [],
          rsrq: [],
          sinr: [],
          mos: [],
          dl_tpt: [],
          ul_tpt: [],
          latency: [],
          jitter: [],
        };
      }

      providerStats[provider].pcis[pci].count++;
      providerStats[provider].pcis[pci].technologies[technology] = 
        (providerStats[provider].pcis[pci].technologies[technology] || 0) + 1;
      providerStats[provider].pcis[pci].bands[band] = 
        (providerStats[provider].pcis[pci].bands[band] || 0) + 1;
      
      if (loc.cell_id) providerStats[provider].pcis[pci].cellIds.add(String(loc.cell_id));
      if (loc.nodeb_id) providerStats[provider].pcis[pci].nodebIds.add(String(loc.nodeb_id));

      if (loc.rsrp != null) {
        providerStats[provider].rsrp.push(parseFloat(loc.rsrp));
        providerStats[provider].pcis[pci].rsrp.push(parseFloat(loc.rsrp));
      }
      if (loc.rsrq != null) {
        providerStats[provider].rsrq.push(parseFloat(loc.rsrq));
        providerStats[provider].pcis[pci].rsrq.push(parseFloat(loc.rsrq));
      }
      if (loc.sinr != null) {
        providerStats[provider].sinr.push(parseFloat(loc.sinr));
        providerStats[provider].pcis[pci].sinr.push(parseFloat(loc.sinr));
      }
      if (loc.mos != null) {
        providerStats[provider].mos.push(parseFloat(loc.mos));
        providerStats[provider].pcis[pci].mos.push(parseFloat(loc.mos));
      }
      if (loc.dl_tpt != null) {
        providerStats[provider].dl_tpt.push(parseFloat(loc.dl_tpt));
        providerStats[provider].pcis[pci].dl_tpt.push(parseFloat(loc.dl_tpt));
      }
      if (loc.ul_tpt != null) {
        providerStats[provider].ul_tpt.push(parseFloat(loc.ul_tpt));
        providerStats[provider].pcis[pci].ul_tpt.push(parseFloat(loc.ul_tpt));
      }
      if (loc.latency != null) {
        providerStats[provider].latency.push(parseFloat(loc.latency));
        providerStats[provider].pcis[pci].latency.push(parseFloat(loc.latency));
      }
      if (loc.jitter != null) {
        providerStats[provider].jitter.push(parseFloat(loc.jitter));
        providerStats[provider].pcis[pci].jitter.push(parseFloat(loc.jitter));
      }
    });

    const providers = Object.values(providerStats)
      .map((p) => ({
        name: p.name,
        color: getProviderColor(p.name),
        totalCount: p.totalCount,
        pciCount: Object.keys(p.pcis).length,
        sessionCount: p.sessions.size,
        nodebCount: p.nodebIds.size,
        cellCount: p.cellIds.size,
        technologies: p.technologies,
        bands: p.bands,
        dominantTechnology: Object.entries(p.technologies).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
        dominantBand: Object.entries(p.bands).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
        pcis: Object.values(p.pcis)
          .map((pci) => ({
            pci: pci.pci,
            count: pci.count,
            cellCount: pci.cellIds.size,
            nodebCount: pci.nodebIds.size,
            cellIds: Array.from(pci.cellIds),
            nodebIds: Array.from(pci.nodebIds),
            dominantTech: Object.entries(pci.technologies).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
            dominantBand: Object.entries(pci.bands).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
            avgRsrp: calculateStats(pci.rsrp),
            avgRsrq: calculateStats(pci.rsrq),
            avgSinr: calculateStats(pci.sinr),
            avgMos: calculateStats(pci.mos),
            avgDl: calculateStats(pci.dl_tpt),
            avgUl: calculateStats(pci.ul_tpt),
            avgLatency: calculateStats(pci.latency),
            avgJitter: calculateStats(pci.jitter),
          }))
          .sort((a, b) => b.count - a.count),
        avgRsrp: calculateStats(p.rsrp),
        avgRsrq: calculateStats(p.rsrq),
        avgSinr: calculateStats(p.sinr),
        avgMos: calculateStats(p.mos),
        avgDl: calculateStats(p.dl_tpt),
        avgUl: calculateStats(p.ul_tpt),
        avgLatency: calculateStats(p.latency),
        avgJitter: calculateStats(p.jitter),
      }));

    const summary = {
      totalProviders: providers.length,
      totalPcis: pciColorMap.length,
      totalSamples: locations.length,
      totalSessions: [...new Set(locations.map(l => l.session_id).filter(Boolean))].length,
      totalNodebs: [...new Set(locations.map(l => l.nodeb_id).filter(Boolean))].length,
      totalCells: [...new Set(locations.map(l => l.cell_id).filter(Boolean))].length,
    };

    return { providers, summary };
  }, [locations, pciColorMap]);

  const sortedProviderData = useMemo(() => {
    return sortData(providerPciData.providers, providerSortConfig, PROVIDER_SORT_OPTIONS);
  }, [providerPciData.providers, providerSortConfig]);

  // Cell data processing (keeping existing code)
  const cellData = useMemo(() => {
    if (!locations?.length) return [];

    const cellStats = {};

    locations.forEach((loc) => {
      const nodebId = loc.nodeb_id != null ? String(loc.nodeb_id) : null;
      const cellId = loc.cell_id != null ? String(loc.cell_id) : null;
      
      if (!nodebId) return;
      
      const key = cellId ? `${nodebId}-${cellId}` : nodebId;
      
      if (!cellStats[key]) {
        cellStats[key] = {
          nodebId,
          cellId,
          key,
          count: 0,
          pcis: new Set(),
          providers: {},
          technologies: {},
          bands: {},
          rsrp: [],
          rsrq: [],
          sinr: [],
          mos: [],
          dl_tpt: [],
          ul_tpt: [],
          latency: [],
          jitter: [],
        };
      }

      cellStats[key].count++;
      const resolvedPci = resolvePciValue(loc);
      if (resolvedPci !== "Unknown") cellStats[key].pcis.add(resolvedPci);
      
      const provider = loc.provider || "Unknown";
      const tech = loc.technology || "Unknown";
      const band = normalizeBandName(loc.band || loc.primaryBand);
      
      cellStats[key].providers[provider] = (cellStats[key].providers[provider] || 0) + 1;
      cellStats[key].technologies[tech] = (cellStats[key].technologies[tech] || 0) + 1;
      cellStats[key].bands[band] = (cellStats[key].bands[band] || 0) + 1;

      if (loc.rsrp != null) cellStats[key].rsrp.push(parseFloat(loc.rsrp));
      if (loc.rsrq != null) cellStats[key].rsrq.push(parseFloat(loc.rsrq));
      if (loc.sinr != null) cellStats[key].sinr.push(parseFloat(loc.sinr));
      if (loc.mos != null) cellStats[key].mos.push(parseFloat(loc.mos));
      if (loc.dl_tpt != null) cellStats[key].dl_tpt.push(parseFloat(loc.dl_tpt));
      if (loc.ul_tpt != null) cellStats[key].ul_tpt.push(parseFloat(loc.ul_tpt));
      if (loc.latency != null) cellStats[key].latency.push(parseFloat(loc.latency));
      if (loc.jitter != null) cellStats[key].jitter.push(parseFloat(loc.jitter));
    });

    return Object.values(cellStats)
      .map((c) => ({
        ...c,
        pciCount: c.pcis.size,
        pcis: Array.from(c.pcis),
        dominantProvider: Object.entries(c.providers).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
        dominantTech: Object.entries(c.technologies).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
        dominantBand: Object.entries(c.bands).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown",
        avgRsrp: calculateStats(c.rsrp),
        avgRsrq: calculateStats(c.rsrq),
        avgSinr: calculateStats(c.sinr),
        avgMos: calculateStats(c.mos),
        avgDl: calculateStats(c.dl_tpt),
        avgUl: calculateStats(c.ul_tpt),
        avgLatency: calculateStats(c.latency),
        avgJitter: calculateStats(c.jitter),
      }));
  }, [locations]);

  const sortedCellData = useMemo(() => {
    return sortData(cellData, cellSortConfig, CELL_SORT_OPTIONS);
  }, [cellData, cellSortConfig]);

  if (!pciColorMap.length) {
    return (
      <ChartContainer ref={ref} title={isGridDataset ? "Best PCI Analysis" : "PCI Analysis"} icon={Antenna}>
        <EmptyState message={isGridDataset ? "No best PCI data available" : "No PCI data available"} />
      </ChartContainer>
    );
  }

  const ViewModeButton = ({ mode, icon: Icon, label }) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`flex items-center gap-1 px-2 py-1 text-[12px] font-medium transition-all rounded ${
        viewMode === mode
          ? "bg-blue-600 text-white"
          : "bg-slate-800 text-white hover:bg-slate-700"
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );

  return (
    <ChartContainer 
      ref={ref} 
      title={`${isGridDataset ? "Best PCI Analysis" : "PCI Analysis"} (${pciColorMap.length} ${isGridDataset ? "Best PCIs" : "PCIs"})`} 
      icon={Antenna}
      subtitle={`${providerPciData.summary.totalSamples} samples • ${providerPciData.summary.totalNodebs} cells`}
      collapsible
      expandable
    >
      <div className="flex flex-wrap gap-1 mb-3">
        <ViewModeButton mode="color-map" icon={MapPin} label="Map" />
        <ViewModeButton mode="by-provider" icon={Globe} label="Provider" />
        <ViewModeButton mode="by-cell" icon={Antenna} label="Cells" />
      </div>

      {viewMode === "color-map" && (
        <PCIColorMapView 
          pciColorMap={sortedPciColorMap} 
          selectedPci={selectedPci}
          onSelectPci={setSelectedPci}
          sortConfig={pciSortConfig}
          onSortChange={setPciSortConfig}
          isGridDataset={isGridDataset}
        />
      )}

      {viewMode === "by-provider" && (
        <PCIByProviderView 
          providerData={sortedProviderData}
          sortConfig={providerSortConfig}
          onSortChange={setProviderSortConfig}
        />
      )}

      {viewMode === "by-cell" && (
        <PCIByCellView 
          cellData={sortedCellData}
          sortConfig={cellSortConfig}
          onSortChange={setCellSortConfig}
        />
      )}
    </ChartContainer>
  );
});

// ==================== SUB-COMPONENTS ====================

// Enhanced Color Map View - SHOWING SORTED METRIC VALUE
const PCIColorMapView = ({
  pciColorMap,
  selectedPci,
  onSelectPci,
  sortConfig,
  onSortChange,
  isGridDataset = false,
}) => {
  const [expandedPci, setExpandedPci] = useState(null);

  // Get the display info for current sort option
  const sortOption = SORT_OPTIONS[sortConfig.key] || SORT_OPTIONS.count;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SortControl 
          sortConfig={sortConfig} 
          onSortChange={onSortChange} 
          options={SORT_OPTIONS}
        />
        <div className="text-[13px] text-white font-medium">
          {pciColorMap.length} {isGridDataset ? "Best PCIs" : "PCIs"}
        </div>
      </div>

      <QuickSortChips 
        sortConfig={sortConfig} 
        onSortChange={onSortChange} 
        options={SORT_OPTIONS}
      />

      <div className="space-y-1 max-h-[350px] overflow-y-auto scrollbar-hide">
        {pciColorMap.map((item, idx) => {
          // Get the value for the currently sorted metric
          const sortValue = sortOption.getValue(item);
          const displayValue = sortValue !== -999 && sortValue !== 9999 && sortValue !== 0 
            ? sortValue 
            : null;

          return (
            <div key={idx} className="bg-slate-800/50 rounded overflow-hidden">
              <div 
                className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-800 transition-colors ${
                  expandedPci === item.pci ? 'bg-slate-800' : ''
                }`}
                onClick={() => setExpandedPci(expandedPci === item.pci ? null : item.pci)}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-white/20"
                  style={{ backgroundColor: item.color }}
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-[14px]">{isGridDataset ? "Best PCI" : "PCI"} {item.pci}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700 text-white">
                      {item.count}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-0.5">
                    <span 
                      className="text-[11px] px-1 py-0.5 rounded"
                      style={{ 
                        backgroundColor: `${getProviderColor(item.dominantProvider)}20`,
                        color: getProviderColor(item.dominantProvider)
                      }}
                    >
                      {item.dominantProvider}
                    </span>
                    <span 
                      className="text-[11px] px-1 py-0.5 rounded"
                      style={{ 
                        backgroundColor: `${getTechnologyColor(item.dominantTechnology)}20`,
                        color: getTechnologyColor(item.dominantTechnology)
                      }}
                    >
                      {item.dominantTechnology}
                    </span>
                    <span className="text-[11px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
                      {item.dominantBand}
                    </span>
                  </div>
                </div>

                {/* Show SORTED METRIC VALUE */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {displayValue != null && (
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] text-white uppercase tracking-wide">
                        {sortOption.label}
                      </span>
                      <span className={`text-[15px] font-bold px-2 py-0.5 rounded ${
                        getMetricColorClass(sortConfig.key, displayValue)
                      }`}>
                        {displayValue}
                        {sortOption.unit && <span className="text-[11px] ml-0.5">{sortOption.unit}</span>}
                      </span>
                    </div>
                  )}
                  <span className="text-white text-[13px]">
                    {expandedPci === item.pci ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {expandedPci === item.pci && (
                <div className="border-t border-slate-700 bg-slate-900/50 p-2 space-y-2">
                  <div className="grid grid-cols-4 gap-1">
                    <MetricMiniCard 
                      label="RSRP" 
                      value={item.avgRsrp?.avg} 
                      unit="dBm"
                      color={parseFloat(item.avgRsrp?.avg) >= -90 ? "green" : 
                             parseFloat(item.avgRsrp?.avg) >= -105 ? "yellow" : "red"}
                    />
                    <MetricMiniCard label="RSRQ" value={item.avgRsrq?.avg} unit="dB" color="blue" />
                    <MetricMiniCard label="SINR" value={item.avgSinr?.avg} unit="dB" color="green" />
                    <MetricMiniCard label="MOS" value={item.avgMos?.avg} unit="" color="yellow" />
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    <MetricMiniCard label="DL" value={item.avgDl?.avg} unit="Mbps" color="cyan" />
                    <MetricMiniCard label="UL" value={item.avgUl?.avg} unit="Mbps" color="orange" />
                    <MetricMiniCard 
                      label="Latency" 
                      value={item.avgLatency?.avg} 
                      unit="ms"
                      color={parseFloat(item.avgLatency?.avg) <= 50 ? "green" : 
                             parseFloat(item.avgLatency?.avg) <= 100 ? "yellow" : "red"}
                    />
                    <MetricMiniCard label="Jitter" value={item.avgJitter?.avg} unit="ms" color="purple" />
                  </div>

                  {item.cellIds.length > 0 && (
                    <div className="text-[11px]">
                      <span className="text-white">Cell IDs: </span>
                      <span className="text-cyan-400">{item.cellIds.slice(0, 5).join(', ')}</span>
                      {item.cellIds.length > 5 && (
                        <span className="text-white"> +{item.cellIds.length - 5} more</span>
                      )}
                    </div>
                  )}

                  {item.nodebIds.length > 0 && (
                    <div className="text-[11px]">
                      <span className="text-white">NodeB IDs: </span>
                      <span className="text-orange-400">{item.nodebIds.slice(0, 5).join(', ')}</span>
                      {item.nodebIds.length > 5 && (
                        <span className="text-white"> +{item.nodebIds.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Metric Mini Card Component
const MetricMiniCard = ({ label, value, unit, color }) => {
  const colors = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
    cyan: "text-cyan-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
  };

  return (
    <div className="bg-slate-800 rounded p-1.5 text-center">
      <div className="text-[9px] text-white">{label}</div>
      <div className={`text-[12px] font-bold ${colors[color] || 'text-white'}`}>
        {value != null ? `${value}${unit ? ` ${unit}` : ''}` : 'N/A'}
      </div>
    </div>
  );
};

// Provider View Component (keeping existing implementation)
const PCIByProviderView = ({ providerData, sortConfig, onSortChange }) => {
  const [expandedProvider, setExpandedProvider] = useState(null);

  if (!providerData?.length) {
    return (
      <div className="text-center py-4 text-white text-[14px]">
        No provider data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SortControl 
          sortConfig={sortConfig} 
          onSortChange={onSortChange} 
          options={PROVIDER_SORT_OPTIONS}
        />
        <div className="text-[13px] text-white">
          {providerData.length} providers
        </div>
      </div>

      <QuickSortChips 
        sortConfig={sortConfig} 
        onSortChange={onSortChange} 
        options={PROVIDER_SORT_OPTIONS}
      />

      <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
        {providerData.map((provider, idx) => (
          <div
            key={idx}
            className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden"
          >
            <div
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => setExpandedProvider(expandedProvider === provider.name ? null : provider.name)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: provider.color }}
                />
                <span className="font-semibold text-white text-[13px]">{provider.name}</span>
                <span className="text-[11px] text-white">
                  ({provider.pciCount} PCIs)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                  {provider.totalCount}
                </span>
                <span className="text-[11px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                  {provider.cellCount} cells
                </span>
                <span 
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${getTechnologyColor(provider.dominantTechnology)}20`,
                    color: getTechnologyColor(provider.dominantTechnology)
                  }}
                >
                  {provider.dominantTechnology}
                </span>
                <span className="text-white text-[13px]">
                  {expandedProvider === provider.name ? "▲" : "▼"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-1 px-2 pb-2">
              <MetricMiniCard 
                label="RSRP" 
                value={provider.avgRsrp?.avg} 
                unit=""
                color={parseFloat(provider.avgRsrp?.avg) >= -90 ? "green" : 
                       parseFloat(provider.avgRsrp?.avg) >= -105 ? "yellow" : "red"}
              />
              <MetricMiniCard label="SINR" value={provider.avgSinr?.avg} unit="" color="green" />
              <MetricMiniCard label="MOS" value={provider.avgMos?.avg} unit="" color="yellow" />
              <MetricMiniCard label="DL" value={provider.avgDl?.avg} unit="" color="cyan" />
              <MetricMiniCard label="UL" value={provider.avgUl?.avg} unit="" color="orange" />
              <MetricMiniCard 
                label="Latency" 
                value={provider.avgLatency?.avg} 
                unit=""
                color={parseFloat(provider.avgLatency?.avg) <= 50 ? "green" : "yellow"}
              />
            </div>

            {expandedProvider === provider.name && (
              <div className="border-t border-slate-700 bg-slate-900/50 p-2">
                <div className="text-[11px] text-white mb-1.5 font-medium">
                  PCIs for {provider.name}
                </div>
                <div className="max-h-[180px] overflow-y-auto scrollbar-hide">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-1 text-white font-medium">PCI</th>
                        <th className="text-center p-1 text-white font-medium">Samples</th>
                        <th className="text-center p-1 text-white font-medium">Cells</th>
                        <th className="text-center p-1 text-white font-medium">Tech</th>
                        <th className="text-center p-1 text-white font-medium">Band</th>
                        <th className="text-center p-1 text-white font-medium">RSRP</th>
                        <th className="text-center p-1 text-white font-medium">DL</th>
                        <th className="text-center p-1 text-white font-medium">MOS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provider.pcis.slice(0, 20).map((pci, pidx) => (
                        <tr key={pidx} className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="p-1 font-medium text-white">{pci.pci}</td>
                          <td className="p-1 text-center text-white">{pci.count}</td>
                          <td className="p-1 text-center text-cyan-400">{pci.cellCount}</td>
                          <td className="p-1 text-center">
                            <span 
                              className="text-[9px] px-1 py-0.5 rounded"
                              style={{
                                backgroundColor: `${getTechnologyColor(pci.dominantTech)}20`,
                                color: getTechnologyColor(pci.dominantTech)
                              }}
                            >
                              {pci.dominantTech}
                            </span>
                          </td>
                          <td className="p-1 text-center text-blue-400">{pci.dominantBand}</td>
                          <td className={`p-1 text-center font-medium ${
                            parseFloat(pci.avgRsrp?.avg) >= -90 ? "text-green-400" : 
                            parseFloat(pci.avgRsrp?.avg) >= -105 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {pci.avgRsrp?.avg || "-"}
                          </td>
                          <td className="p-1 text-center text-cyan-400">{pci.avgDl?.avg || "-"}</td>
                          <td className="p-1 text-center text-yellow-400">{pci.avgMos?.avg || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {provider.pcis.length > 20 && (
                    <div className="text-center text-[11px] text-white mt-1">
                      +{provider.pcis.length - 20} more PCIs
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Cell View Component (keeping existing implementation)
const PCIByCellView = ({ cellData, sortConfig, onSortChange }) => {
  if (!cellData?.length) {
    return (
      <div className="text-center py-4 text-white text-[14px]">
        No cell data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SortControl 
          sortConfig={sortConfig} 
          onSortChange={onSortChange} 
          options={CELL_SORT_OPTIONS}
        />
        <div className="text-[13px] text-white">
          {cellData.length} cells
        </div>
      </div>

      <QuickSortChips 
        sortConfig={sortConfig} 
        onSortChange={onSortChange} 
        options={CELL_SORT_OPTIONS}
      />

      <div className="grid grid-cols-4 gap-1">
        <StatCard label="NodeBs" value={[...new Set(cellData.map(c => c.nodebId))].length} color="orange" />
        <StatCard label="Cells" value={cellData.length} color="cyan" />
        <StatCard label="Total PCIs" value={[...new Set(cellData.flatMap(c => c.pcis))].length} color="blue" />
        <StatCard label="Samples" value={cellData.reduce((sum, c) => sum + c.count, 0)} color="green" />
      </div>

      <div className="bg-slate-800/50 rounded-lg overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto scrollbar-hide">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="border-b border-slate-700">
                <th className="text-left p-2 text-white font-medium">NodeB</th>
                <th className="text-center p-2 text-white font-medium">Cell</th>
                <th className="text-center p-2 text-white font-medium">PCIs</th>
                <th className="text-center p-2 text-white font-medium">Samples</th>
                <th className="text-center p-2 text-white font-medium">Tech</th>
                <th className="text-center p-2 text-white font-medium">Band</th>
                <th className="text-center p-2 text-white font-medium">RSRP</th>
                <th className="text-center p-2 text-white font-medium">DL</th>
                <th className="text-center p-2 text-white font-medium">MOS</th>
              </tr>
            </thead>
            <tbody>
              {cellData.slice(0, 50).map((cell, idx) => (
                <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="p-2 font-medium text-orange-400">{cell.nodebId}</td>
                  <td className="p-2 text-center text-cyan-400">{cell.cellId || '-'}</td>
                  <td className="p-2 text-center">
                    <span className="text-blue-400">{cell.pciCount}</span>
                    {cell.pciCount > 0 && (
                      <span className="text-[9px] text-white ml-1">
                        ({cell.pcis.slice(0, 3).join(',')}{cell.pcis.length > 3 ? '...' : ''})
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center text-white">{cell.count}</td>
                  <td className="p-2 text-center">
                    <span 
                      className="text-[9px] px-1 py-0.5 rounded"
                      style={{
                        backgroundColor: `${getTechnologyColor(cell.dominantTech)}20`,
                        color: getTechnologyColor(cell.dominantTech)
                      }}
                    >
                      {cell.dominantTech}
                    </span>
                  </td>
                  <td className="p-2 text-center text-blue-400">{cell.dominantBand}</td>
                  <td className={`p-2 text-center font-medium ${
                    parseFloat(cell.avgRsrp?.avg) >= -90 ? "text-green-400" : 
                    parseFloat(cell.avgRsrp?.avg) >= -105 ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {cell.avgRsrp?.avg || "-"}
                  </td>
                  <td className="p-2 text-center text-cyan-400">{cell.avgDl?.avg || "-"}</td>
                  <td className="p-2 text-center text-yellow-400">{cell.avgMos?.avg || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cellData.length > 50 && (
            <div className="text-center text-[11px] text-white p-2 bg-slate-900">
              Showing 50 of {cellData.length} cells
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ label, value, color }) => {
  const colors = {
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
    cyan: "text-cyan-400",
    pink: "text-pink-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  return (
    <div className="bg-slate-800/50 rounded p-1.5 text-center">
      <div className="text-[11px] text-white mb-0.5">{label}</div>
      <div className={`text-[17px] font-bold ${colors[color] || 'text-white'}`}>
        {value ?? 0}
      </div>
    </div>
  );
};

PciColorLegend.displayName = "PciColorLegend";
