const stringToColor = (str) => {
  if (!str) return "#a8a6a2";
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20);
  const lightness = 45 + (Math.abs(hash) % 15);
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const stringToHexColor = (str) => {
  if (!str) return "#a8a6a2";
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
};

const DYNAMIC_COLOR_PALETTE = [
  "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF",
  "#33FFF5", "#FFD133", "#FF8C33", "#8CFF33", "#338CFF",
  "#FF3333", "#33FF8C", "#5733FF", "#FF33D1", "#33FFD1",
  "#D1FF33", "#FF6633", "#66FF33", "#3366FF", "#FF3366",
  "#C70039", "#900C3F", "#581845", "#1A5276", "#148F77",
  "#D4AC0D", "#AF601A", "#6C3483", "#1E8449", "#2874A6",
  "#CB4335", "#7D3C98", "#2E86C1", "#17A589", "#D68910",
  "#BA4A00", "#8E44AD", "#3498DB", "#16A085", "#F39C12",
];

const dynamicColorCache = {
  provider: {},
  technology: {},
  band: {},
  pci: {},
};

const hashString = (str) => {
  let hash = 0;
  const normalizedStr = String(str || "").toLowerCase().trim();
  for (let i = 0; i < normalizedStr.length; i++) {
    const char = normalizedStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

export const generateColorFromHash = (str) => {
  const hash = hashString(str);
  const index = hash % DYNAMIC_COLOR_PALETTE.length;
  return DYNAMIC_COLOR_PALETTE[index];
};

export const normalizeProviderName = (rawName) => {
  if (!rawName) return null;

  const invalidValues = ["000 000", "000000", " 000 000 ", "404440", "404011"];
  const s = String(rawName).trim();

  if (/^\/+$/.test(s)) return null;
  if (invalidValues.includes(s)) return null;

  const cleaned = s.toUpperCase().replace(/[\s\-_]/g, "");

  if (cleaned.includes("JIO") || cleaned.includes("JIOTRUE")) {
    return "Jio";
  }

  if (cleaned.includes("AIRTEL")) {
    return "Airtel";
  }

  if (
    cleaned === "VI" ||
    cleaned.includes("VIINDIA") ||
    cleaned.includes("VODAFONE") ||
    cleaned.includes("IDEA")
  ) {
    return "VI India";
  }

  if (cleaned.includes("YAS")) {
    return "Yas";
  }

  if (cleaned.includes("BSNL")) {
    return "BSNL";
  }

  if (
    
    cleaned.includes("FAREASTONE") ||
    cleaned.includes("FAREASTONE") ||
    cleaned.includes("EASTONE") ||
    cleaned.includes("遠傳電信")
  ) {
    return "Far Eastone";
  }

  if(
    (cleaned === "466001")
  )return "(466001)IR"
  if (
    
    cleaned.includes("TWMOBILE") ||
    cleaned.includes("TAIWANMOBILE") ||
    cleaned.includes("台灣大哥大")
  ) {
    return "TW Mobile";
  }

  if (
    
    cleaned.includes("CHUNGHWA") ||
    cleaned.includes("中華電信")
  ) {
    return "Chunghwa Telecom";
  }

  if (
   
    cleaned.includes("APTG") ||
    cleaned.includes("ASIAPACIFIC") ||
    cleaned.includes("亞太電信")
  ) {
    return "APTG";
  }

  return s;
};

export const normalizeTechName = (tech, band = null) => {
  if (band) {
    const bandStr = String(band).trim().toLowerCase();
    const nrBandPattern = /^n\d+/i;
    
    if (nrBandPattern.test(bandStr)) {
      return "5G";
    }
    
    const fiveGBands = ['n78', 'n77', 'n41', 'n1', 'n28', 'n3', 'n5', 'n7', 'n8', 'n20', 'n38', 'n40', 'n66', 'n71', 'n257', 'n258', 'n260', 'n261'];
    if (fiveGBands.includes(bandStr)) {
      return "5G";
    }
  }

  if (!tech) return "Unknown";

  const techStr = String(tech).trim();
  
  const InvalidValues = [
    "000", "00", "Unknown/No Service", "Unknown / No Service", 
    "UNKNOWN / NO SERVICE", "Unknown", "undefined", "null", "404440", "404011"
  ];
  
  if (InvalidValues.includes(techStr)) return "Unknown";

  const t = techStr.toUpperCase();

  if (t.includes("5G") || t.includes("NR") || t.includes("NSA") || t.includes("SA")) {
    return "5G";
  }
  
  if (t.includes("LTE") || t.includes("4G") ||t.includes("4G+")) {
    return "4G";
  }
  
  if (t.includes("3G") || t.includes("WCDMA") || t.includes("UMTS") || t.includes("HSPA")) {
    return "3G";
  }
  
  if (t.includes("2G") || t.includes("EDGE") || t.includes("GSM") || t.includes("GPRS")) {
    return "2G";
  }
  
  return tech;
};

export const normalizeBandName = (band) => {
  if (band === null || band === undefined) return "Unknown";

  const raw = String(band).trim();
  if (!raw) return "Unknown";

  const upperRaw = raw.toUpperCase();
  if (
    upperRaw === "UNKNOWN" ||
    upperRaw === "N/A" ||
    upperRaw === "NA" ||
    upperRaw === "NULL" ||
    upperRaw === "UNDEFINED"
  ) {
    return "Unknown";
  }

  const nrMatch = raw.match(/^N\s*[-_\s]*([+-]?\d+)$/i);
  if (nrMatch) {
    const val = Math.abs(parseInt(nrMatch[1], 10));
    return Number.isFinite(val) && val > 0 ? `n${val}` : "Unknown";
  }

  const lteMatch = raw.match(/^(?:B|BAND)\s*[-_\s]*([+-]?\d+)$/i);
  if (lteMatch) {
    const val = Math.abs(parseInt(lteMatch[1], 10));
    return Number.isFinite(val) && val > 0 ? `B${val}` : "Unknown";
  }

  const numeric = parseInt(raw, 10);
  if (Number.isFinite(numeric) && numeric !== 0) {
    return `B${Math.abs(numeric)}`;
  }

  return raw;
};

export const COLOR_SCHEMES = {
  provider: {
    Jio: "#3B82F6",
    Airtel: "#EF4444",
    "VI India": "#22C55E",
    BSNL: "#F59E0B",
    Yas: "#7d1b49",
    "(466001)IR": "#6b705c",
    "Far Eastone": "#00B4D8", 
    "TW Mobile": "#F77F00",   
    "Chunghwa Telecom": "#E63946", 
    "APTG": "#2A9D8F",        
    Unknown: "#a8a6a2",
  },
  technology: {
    "5G": "#EC4899",
    "4G": "#8B5CF6",
    "3G": "#10B981",
    "2G": "#6B7280",
    Unknown: "#a8a6a2",
  },
  band: {
    1: "#EF4444", B1: "#EF4444",
    2: "#F59E0B", B2: "#F59E0B",
    3: "#EF4444", B3: "#EF4444",
    4: "#F59E0B", B4: "#F59E0B",
    5: "#F59E0B", B5: "#F59E0B",
    6: "#EF4444", B6: "#EF4444",
    7: "#10B981", B7: "#10B981",
    8: "#10B981", B8: "#10B981",
    9: "#F59E0B", B9: "#F59E0B",
    12: "#3B82F6", B12: "#3B82F6",
    13: "#3B82F6", B13: "#3B82F6",
    17: "#3B82F6", B17: "#3B82F6",
    18: "#10B981", B18: "#10B981",
    19: "#EF4444", B19: "#EF4444",
    20: "#3B82F6", B20: "#3B82F6",
    25: "#8B5CF6", B25: "#8B5CF6",
    26: "#8B5CF6", B26: "#8B5CF6",
    28: "#EC4899", B28: "#EC4899",
    38: "#6366F1", B38: "#6366F1",
    39: "#6366F1", B39: "#6366F1",
    40: "#3B82F6", B40: "#3B82F6",
    41: "#8B5CF6", B41: "#8B5CF6",
    n5: "#F59E0B",
    n28: "#EC4899",
    n78: "#F472B6",
    Unknown: "#a8a6a2",
  },
  pci: {
    Unknown: "#a8a6a2",
  },
};

export const getLogColor = (colorBy, value, defaultColor = "#a8a6a2") => {
  if (!colorBy || !value) {
    return defaultColor;
  }

  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) {
    return defaultColor;
  }

  let normalizedValue = String(value).trim();

  if (colorBy === "provider") {
    normalizedValue = normalizeProviderName(value);
  } else if (colorBy === "technology") {
    normalizedValue = normalizeTechName(value);
  } else if (colorBy === "band") {
    if (normalizedValue === "-1" || normalizedValue === "") {
      normalizedValue = "Unknown";
    } else {
      normalizedValue = normalizeBandName(value);
    }
  } else if (colorBy === "pci") {
    const pci = Number.parseInt(normalizedValue, 10);
    normalizedValue = Number.isFinite(pci) ? String(pci) : "Unknown";
  }

  if (!normalizedValue || normalizedValue === "Unknown") {
    return scheme["Unknown"] || defaultColor;
  }

  if (scheme[normalizedValue]) {
    return scheme[normalizedValue];
  }

  const matchKey = Object.keys(scheme).find(
    (key) => key.toLowerCase() === normalizedValue.toLowerCase()
  );

  if (matchKey) {
    return scheme[matchKey];
  }

  if (!dynamicColorCache[colorBy][normalizedValue]) {
    dynamicColorCache[colorBy][normalizedValue] = generateColorFromHash(normalizedValue);
  }

  return dynamicColorCache[colorBy][normalizedValue];
};

export const getProviderColor = (provider) => {
  const normalized = normalizeProviderName(provider);
  return getLogColor("provider", normalized, "#a8a6a2");
};

export const getTechnologyColor = (technology) => {
  const normalized = normalizeTechName(technology);
  return getLogColor("technology", normalized, "#a8a6a2");
};

export const getBandColor = (band) => {
  const normalized = normalizeBandName(band);
  return getLogColor("band", normalized, "#a8a6a2");
};

export const getDynamicColorCache = () => dynamicColorCache;

export const clearDynamicColorCache = () => {
  dynamicColorCache.provider = {};
  dynamicColorCache.technology = {};
  dynamicColorCache.band = {};
  dynamicColorCache.pci = {};
};

export const registerColor = (colorBy, value, color) => {
  if (dynamicColorCache[colorBy]) {
    dynamicColorCache[colorBy][value] = color;
  }
};

export const getAllRegisteredColors = (colorBy) => {
  const predefined = COLOR_SCHEMES[colorBy] || {};
  const dynamic = dynamicColorCache[colorBy] || {};
  return { ...predefined, ...dynamic };
};
