
const TECHNOLOGY_COLORS = {
  "5g": "#8B5CF6",     
  "nr": "#8B5CF6",     
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
  
  // Fuzzy matching for variations
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
const PROVIDER_COLORS = {
  // Indian Carriers
  "jio": "#3B82F6",          // Blue
  "airtel": "#EF4444",       // Red
  "vi": "#22C55E",           // Green
  "vodafone": "#22C55E",     // Green
  "bsnl": "#F59E0B",         // Amber
  "mtnl": "#8B5CF6",         // Purple
  
  // US Carriers
  "verizon": "#CD040B",      // Red
  "at&t": "#00A8E0",         // Blue
  "att": "#00A8E0",          // Blue
  "t-mobile": "#E20074",     // Magenta
  "tmobile": "#E20074",      // Magenta
  "sprint": "#FFCE00",       // Yellow
  "us cellular": "#0073CF",  // Blue
  
  // UK Carriers
  "ee": "#00B8A9",           // Teal
  "o2": "#0019A5",           // Dark Blue
  "three": "#FF7F00",        // Orange
  
  // European Carriers
  "orange": "#FF7900",       // Orange
  "deutsche telekom": "#E20074", // Magenta
  "telefonica": "#0066FF",   // Blue
  "movistar": "#019DF4",     // Light Blue
  
  // Asian Carriers
  "china mobile": "#0066B3", // Blue
  "china unicom": "#D6001C", // Red
  "china telecom": "#2196F3", // Blue
  "ntt docomo": "#C8002D",   // Red
  "Yas": "#C0C0C0",     // Silver
  "sk telecom": "#E4002B",   // Red
  
  // Australian Carriers
  "telstra": "#0064D2",      // Blue
  "optus": "#007B3B",        // Green
  
  // Canadian Carriers
  "rogers": "#DA291C",       // Red
  "bell": "#0052A5",         // Blue
  "telus": "#66CC00",        // Green
  
  // Default
  "unknown": "#6B7280",      // Gray
};

/**
 * Get provider color with fuzzy matching
 * @param {string} provider - Provider name (e.g., "JIO 4G", "IND-Airtel", "Verizon Wireless")
 * @returns {string} Hex color code
 */
export const getProviderColor = (provider) => {
  if (!provider || typeof provider !== 'string') return PROVIDER_COLORS.unknown;
  
  // Clean the provider name
  const cleanProvider = provider
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, ' ')      // Replace hyphens/underscores with spaces
    .replace(/\s+/g, ' ')        // Normalize spaces
    .replace(/^ind\s+/i, '')     // Remove "IND " prefix
    .replace(/\s*(4g|5g|lte|true5g|volte)\s*/gi, ''); // Remove technology suffixes
  
  // Check for exact match first
  if (PROVIDER_COLORS[cleanProvider]) {
    return PROVIDER_COLORS[cleanProvider];
  }
  
  // Fuzzy matching for common variations
  // Indian carriers
  if (cleanProvider.includes('jio')) return PROVIDER_COLORS.jio;
  if (cleanProvider.includes('airtel')) return PROVIDER_COLORS.airtel;
  if (cleanProvider.includes('vi') || cleanProvider.includes('vodafone') || cleanProvider.includes('idea')) {
    return PROVIDER_COLORS.vi;
  }
  if (cleanProvider.includes('bsnl')) return PROVIDER_COLORS.bsnl;
  if (cleanProvider.includes('Yas')) return PROVIDER_COLORS.Yas;
  
  // US carriers
  if (cleanProvider.includes('verizon')) return PROVIDER_COLORS.verizon;
  if (cleanProvider.includes('at&t') || cleanProvider.includes('att')) return PROVIDER_COLORS['at&t'];
  if (cleanProvider.includes('t-mobile') || cleanProvider.includes('tmobile')) return PROVIDER_COLORS['t-mobile'];
  if (cleanProvider.includes('sprint')) return PROVIDER_COLORS.sprint;
  
  // UK carriers
  if (cleanProvider.includes('ee')) return PROVIDER_COLORS.ee;
  if (cleanProvider.includes('o2')) return PROVIDER_COLORS.o2;
  if (cleanProvider.includes('three') || cleanProvider === '3') return PROVIDER_COLORS.three;
  
  // European carriers
  if (cleanProvider.includes('orange')) return PROVIDER_COLORS.orange;
  if (cleanProvider.includes('telekom')) return PROVIDER_COLORS['deutsche telekom'];
  if (cleanProvider.includes('movistar')) return PROVIDER_COLORS.movistar;
  
  // Generate consistent color for unknown providers based on name hash
  const hash = provider.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
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
    "2G": "#6b7280",
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
