
const TECHNOLOGY_COLORS = {
  "5g": "#8B5CF6",     
  "nr": "#8B5CF6",     
  "4g(lteanchornsa)": "#6366F1",
  "4glteanchornsa": "#6366F1",
  "4g": "#3B82F6",    
  "lte": "#10B981",    
  "3g": "#F59E0B",     
  "2g": "#6B7280",     
  "wifi": "#06B6D4",   
  "unknown": "#6B7280", 
};

// Add this function after your TECHNOLOGY_COLORS constant

/**
 * Get technology color with fuzzy matching
 * @param {string} technology - Technology name (e.g., "5G NR", "LTE", "4G")
 * @returns {string} Hex color code
 */
export const getTechnologyColor = (technology) => {
  if (!technology || typeof technology !== 'string') {
    return TECHNOLOGY_COLORS.unknown;
  }
  
  // Clean the technology name
  const cleanTech = technology
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, '')      // Remove hyphens/underscores
    .replace(/\s+/g, '');      // Remove spaces
  
  // Direct match first
  if (TECHNOLOGY_COLORS[cleanTech]) {
    return TECHNOLOGY_COLORS[cleanTech];
  }

  if (cleanTech.includes('lteanchor') && cleanTech.includes('nsa')) {
    return TECHNOLOGY_COLORS['4g(lteanchornsa)'];
  }
  
  if (cleanTech.includes('5g') || cleanTech.includes('nr')) {
    return TECHNOLOGY_COLORS['5g'];
  }
  if (cleanTech.includes('4g') || cleanTech.includes('lte')) {
    return TECHNOLOGY_COLORS['4g'];
  }
  if (cleanTech.includes('3g') || cleanTech.includes('umts') || cleanTech.includes('wcdma')) {
    return TECHNOLOGY_COLORS['3g'];
  }
  if (cleanTech.includes('2g') || cleanTech.includes('gsm') || cleanTech.includes('edge')) {
    return TECHNOLOGY_COLORS['2g'];
  }
  if (cleanTech.includes('wifi') || cleanTech.includes('wlan')) {
    return TECHNOLOGY_COLORS.wifi;
  }
  
  return TECHNOLOGY_COLORS.unknown;
};

/**
 * Get technology color map for multiple technologies
 * @param {string[]} technologies - Array of technology names
 * @returns {Object} Map of technology name to color
 */
export const getTechnologyColorMap = (technologies) => {
  const colorMap = {};
  technologies.forEach(tech => {
    colorMap[tech] = getTechnologyColor(tech);
  });
  return colorMap;
};

// Provider/Operator colors
// Provider/Operator colors
const PROVIDER_COLORS = COLOR_SCHEMES.provider;

/**
 * Get provider color with fuzzy matching
 * @param {string} provider - Provider name (e.g., "JIO 4G", "IND-Airtel", "Verizon Wireless")
 * @returns {string} Hex color code
 */
export const getProviderColor = (provider) => {
  return getProviderColorFromUtils(provider);
};

/**
 * Get provider color map for multiple providers
 * @param {string[]} providers - Array of provider names
 * @returns {Object} Map of provider name to color
 */
export const getProviderColorMap = (providers) => {
  const colorMap = {};
  providers.forEach(provider => {
    colorMap[provider] = getProviderColor(provider);
  });
  return colorMap;
};

// ... rest of your constants (TECHNOLOGY_COLORS, COLORS, TABS, CHART_CONFIG, etc.)

export const COLORS = {
  CHART_PALETTE: [
    "#3b82f6", "#8b5cf6", "#10b981", 
    "#f59e0b", "#ef4444", "#06b6d4"
  ],
  
  // Legacy - direct match only (keep for backward compatibility)
  TECH_COLORS: {
    "LTE": "#10b981",
    "5G": "#8b5cf6",
    "4G": "#3b82f6",
    "3G": "#f59e0b",
    "2G": "#1317eb",
    "Wi-Fi": "#06b6d4",
  },
  
  // Provider colors for direct access
  PROVIDER_COLORS,
  
  STAT_CARD: {
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    orange: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    cyan: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  }
};

export const TABS = [
  { id: "overview", label: "Overview", icon: "BarChart3" },
  { id: "signal", label: "Signal", icon: "Signal" },
  { id: "conditionLogs", label: "Coverage Optimisation", icon: "ListFilter" },
  { id: "operatorComparison", label: "Benchmark", icon: "Globe" },
  { id: "network", label: "Comparison", icon: "Wifi" },
  { id: "performance", label: "Performance", icon: "Zap" },
  { id: "Application", label: "Apps", icon: "PieChartIcon" },
  { id: "io", label: "I/O Analysis", icon: "Database" },
  { id: "handover", label: "Handover", icon: "Hand" },
  { id: "l3Events", label: "L3 Events", icon: "Radio" },
];

export const CHART_CONFIG = {
  margin: { top: 10, right: 30, left: 0, bottom: 20 },
  tooltip: {
    backgroundColor: "#1e293b",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#fff",
  },
  grid: {
    strokeDasharray: "3 3",
    stroke: "#374151",
  },
};
import {
  getProviderColor as getProviderColorFromUtils,
  COLOR_SCHEMES,
} from "@/utils/colorUtils";
