export const PCI_COLOR_PALETTE = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
  "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80",
  "#EC7063", "#5DADE2", "#F39C12", "#A569BD", "#48C9B0",
  "#E74C3C", "#3498DB", "#E67E22", "#9B59B6", "#1ABC9C",
];

export const DYNAMIC_PROVIDER_PALETTE = [
  "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF",
  "#33FFF5", "#FFD133", "#FF8C33", "#8CFF33", "#338CFF",
  "#FF3333", "#33FF8C", "#5733FF", "#FF33D1", "#33FFD1",
  "#D1FF33", "#FF6633", "#66FF33", "#3366FF", "#FF3366",
  "#C70039", "#900C3F", "#581845", "#1A5276", "#148F77",
  "#D4AC0D", "#AF601A", "#6C3483", "#1E8449", "#2874A6",
  "#CB4335", "#7D3C98", "#2E86C1", "#17A589", "#D68910",
  "#BA4A00", "#8E44AD", "#3498DB", "#16A085", "#F39C12",
];

const dynamicProviderColors = new Map();

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

const generateColorFromHash = (str) => {
  const hash = hashString(str);
  const index = hash % DYNAMIC_PROVIDER_PALETTE.length;
  return DYNAMIC_PROVIDER_PALETTE[index];
};

export const getProviderColor = (providerName) => {
  if (!providerName) return "#6B7280";

  const normalized = String(providerName).toLowerCase().trim();

  const scheme = COLOR_SCHEMES.provider;
  const directMatch = Object.keys(scheme).find(
    (k) => k.toLowerCase() === normalized
  );

  if (directMatch) {
    return scheme[directMatch];
  }

  if (dynamicProviderColors.has(normalized)) {
    return dynamicProviderColors.get(normalized);
  }

  const newColor = generateColorFromHash(normalized);
  dynamicProviderColors.set(normalized, newColor);

  return newColor;
};

export const COLOR_SCHEMES = {
  provider: {
    JIO: "#3B82F6",
    Jio: "#3B82F6",
    jio: "#3B82F6",
    "Far Eastone": "#00b4d8ff",
    "Far EasTone": "#00b4d8ff",
    "far eastone": "#00b4d8ff",
    "TW Mobile": "#f77f00ff",
    "FAR EASTONE": "#00b4d8ff",
    "(466001)IR": "#6b705c",
    "TW MOBILE": "#f77f00ff",

    Airtel: "#EF4444",
    "IND airtel": "#EF4444",
    "Vi India": "#22C55E",
    "VI India": "#22C55E",
    Yas: "#7d1b49",
    BSNL: "#F59E0B",
    Unknown: "#6B7280",
    "台灣大哥大": "#4400e2ff"
  },
  technology: {
    "5G": "#EC4899",
    "NR (5G NSA)": "#EC4899",
    "NR (5G SA)": "#EC4899",
    "4G": "#8B5CF6",
    "LTE": "#8B5CF6",
    "3G": "#10B981",
    "2G": "#6B7280",
    Unknown: "#F59E0B",
  },
  band: {
    1: "#EF4444",
    B1: "#EF4444",
    2: "#F59E0B",
    B2: "#F59E0B",
    3: "#EF4444",
    B3: "#EF4444",
    4: "#F59E0B",
    B4: "#F59E0B",
    5: "#F59E0B",
    B5: "#F59E0B",
    6: "#EF4444",
    B6: "#EF4444",
    8: "#10B981",
    B8: "#10B981",
    9: "#F59E0B",
    B9: "#F59E0B",
    19: "#EF4444",
    B19: "#EF4444",
    7: "#10B981",
    B7: "#10B981",
    12: "#3B82F6",
    B12: "#3B82F6",
    13: "#3B82F6",
    B13: "#3B82F6",
    17: "#3B82F6",
    B17: "#3B82F6",
    18: "#10B981",
    B18: "#10B981",
    20: "#3B82F6",
    B20: "#3B82F6",
    25: "#8B5CF6",
    B25: "#8B5CF6",
    26: "#8B5CF6",
    B26: "#8B5CF6",
    28: "#EC4899",
    B28: "#EC4899",
    38: "#6366F1",
    B38: "#6366F1",
    39: "#6366F1",
    B39: "#6366F1",
    40: "#3B82F6",
    B40: "#3B82F6",
    41: "#8B5CF6",
    B41: "#8B5CF6",
    n28: "#EC4899",
    n78: "#F472B6",
    Unknown: "#6B7280",
  },
};

export const getColorByValue = (colorBy, value) => {
  if (colorBy === 'provider') {
    return getProviderColor(value);
  }

  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) return "#6B7280";

  if (scheme[value]) return scheme[value];

  const match = Object.keys(scheme).find(
    (k) => k.toLowerCase() === String(value || "").toLowerCase()
  );

  if (match) return scheme[match];

  if (colorBy === 'technology' || colorBy === 'band') {
    const hash = hashString(value);
    const index = hash % DYNAMIC_PROVIDER_PALETTE.length;
    return DYNAMIC_PROVIDER_PALETTE[index];
  }

  return scheme["Unknown"] || "#6B7280";
};

export const getAllDynamicProviderColors = () => {
  return new Map(dynamicProviderColors);
};

export const clearDynamicProviderColors = () => {
  dynamicProviderColors.clear();
};

export const registerProviderColor = (providerName, color) => {
  const normalized = String(providerName).toLowerCase().trim();
  dynamicProviderColors.set(normalized, color);
};

export const getPciColor = (pciValue) => {
  const numValue = parseFloat(pciValue);
  if (!Number.isFinite(numValue)) return "#808080";
  return PCI_COLOR_PALETTE[Math.abs(Math.floor(numValue)) % PCI_COLOR_PALETTE.length];
};

export const METRIC_CONFIG = {
  rsrp: {
    thresholdKey: 'rsrp',
    label: 'RSRP',
    unit: 'dBm',
    fields: ['rsrp', 'RSRP', 'Rsrp', 'lte_rsrp', 'LTE_RSRP', 'nr_rsrp'],
  },
  rsrq: {
    thresholdKey: 'rsrq',
    label: 'RSRQ',
    unit: 'dB',
    fields: ['rsrq', 'RSRQ', 'Rsrq', 'lte_rsrq', 'LTE_RSRQ', 'nr_rsrq'],
  },
  sinr: {
    thresholdKey: 'sinr',
    label: 'SINR',
    unit: 'dB',
    fields: ['sinr', 'SINR', 'Sinr', 'lte_sinr', 'LTE_SINR', 'nr_sinr'],
  },
  dl_thpt: {
    thresholdKey: 'dl_thpt',
    label: 'DL Throughput',
    unit: 'Mbps',
    fields: ['dl_thpt', 'DL_THPT', 'dl_tpt', 'DL_TPT', 'dl_rpt', 'DL_RPT', 'dl_throughput', 'download', 'throughput_dl', 'throughput_DL', 'tpt_dl', 'tpt_DL'],
  },
  ul_thpt: {
    thresholdKey: 'ul_thpt',
    label: 'UL Throughput',
    unit: 'Mbps',
    fields: ['ul_thpt', 'UL_THPT', 'ul_tpt', 'UL_TPT', 'ul_rpt', 'UL_RPT', 'ul_throughput', 'upload', 'throughput_ul', 'throughput_UL', 'tpt_ul', 'tpt_UL'],
  },
  mos: {
    thresholdKey: 'mos',
    label: 'MOS',
    unit: '',
    fields: ['mos', 'MOS', 'Mos', 'mos_score'],
  },
  lte_bler: {
    thresholdKey: 'lte_bler',
    label: 'LTE BLER',
    unit: '%',
    fields: ['lte_bler', 'lte_bler_json', 'LTE_BLER', 'bler', 'BLER'],
  },
  pci: {
    thresholdKey: 'pci',
    label: 'PCI',
    unit: '',
    fields: ['pci', 'PCI', 'Pci', 'physical_cell_id'],
  },
  num_cells: {
    thresholdKey: 'num_cells',
    label: 'Pilot Pollution',
    unit: '',
    fields: ['num_cells', 'num_cell', 'pilot_pollution', 'serving_cells'],
  },
  level: {
    thresholdKey: 'level',
    label: 'SSI',
    unit: 'dBm',
    fields: ['level', 'ssi', 'ss_rsrp'],
  },
  jitter: {
    thresholdKey: 'jitter',
    label: 'Jitter',
    unit: 'ms',
    fields: ['jitter'],
  },
  latency: {
    thresholdKey: 'latency',
    label: 'Latency',
    unit: 'ms',
    fields: ['latency'],
  },
  packet_loss: {
    thresholdKey: 'packet_loss',
    label: 'Packet Loss',
    unit: '%',
    fields: ['packet_loss', 'packetloss', 'packet_loss_rate'],
  },
  tac: {
    thresholdKey: 'tac',
    label: 'TAC',
    unit: '',
    fields: ['tac', 'TAC'],
  },
  dominance: {
    thresholdKey: 'dominance',
    label: 'Dominance',
    unit: '',
    fields: ['dominance'],
  },
  coverage_violation: {
    thresholdKey: 'coverage_violation',
    label: 'Coverage Violation',
    unit: '',
    fields: ['coverage_violation'],
  },
  delta: {
    thresholdKey: 'delta',
    label: 'Delta',
    unit: '',
    fields: ['delta', 'difference', 'value', 'metric_value'],
  },
};

const METRIC_ALIASES = {
  'dl_tpt': 'dl_thpt',
  'dl_rpt': 'dl_thpt',
  'ul_tpt': 'ul_thpt',
  'ul_rpt': 'ul_thpt',
  'dl_throughput': 'dl_thpt',
  'ul_throughput': 'ul_thpt',
  'throughput_dl': 'dl_thpt',
  'throughput_ul': 'ul_thpt',
  'tpt_dl': 'dl_thpt',
  'tpt_ul': 'ul_thpt',
  'bler': 'lte_bler',
  'lte-bler': 'lte_bler',
  'mos_score': 'mos',
};

export const getMetricConfig = (metric) => {
  if (!metric) {
    return { ...METRIC_CONFIG.rsrp, key: 'rsrp' };
  }

  const normalized = String(metric).toLowerCase().trim().replace(/[-\s]/g, '_');

  if (METRIC_CONFIG[normalized]) {
    return { ...METRIC_CONFIG[normalized], key: normalized };
  }

  const aliasKey = METRIC_ALIASES[normalized];
  if (aliasKey && METRIC_CONFIG[aliasKey]) {
    return { ...METRIC_CONFIG[aliasKey], key: aliasKey };
  }

  const configKeys = Object.keys(METRIC_CONFIG);
  const matchedKey = configKeys.find(k => k.includes(normalized) || normalized.includes(k));
  if (matchedKey) {
    return { ...METRIC_CONFIG[matchedKey], key: matchedKey };
  }

  return { ...METRIC_CONFIG.rsrp, key: 'rsrp' };
};

export const resolveMetricConfig = (key) => {
  const config = getMetricConfig(key);
  return {
    field: config.fields[0],
    thresholdKey: config.thresholdKey,
    label: config.label,
    unit: config.unit,
  };
};

export const getMetricValueFromLog = (log, metric) => {
  if (!log) return NaN;

  const config = getMetricConfig(metric);
  if (!config?.fields) return NaN;

  for (const field of config.fields) {
    const val = log[field];
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseFloat(val);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  const metricKey = String(config.key || "").toLowerCase();
  if (metricKey !== "pci" && metricKey !== "tac") {
    const genericCandidates = [
      log.value,
      log.Value,
      log.metric_value,
      log.avg_value,
      log.measured,
      log.measured_value,
    ];
    for (const candidate of genericCandidates) {
      const parsed = parseFloat(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return NaN;
};

export const getColorForMetric = (metric, value, thresholds) => {
  if (String(metric).toLowerCase() === 'pci') {
    return getPciColor(value);
  }

  const config = getMetricConfig(metric);
  const metricThresholds = thresholds?.[config.thresholdKey] || [];
  const numValue = parseFloat(value);

  if (!Number.isFinite(numValue) || metricThresholds.length === 0) {
    return "#808080";
  }

  const sortedThresholds = [...metricThresholds].sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
  const match = sortedThresholds.find((t, i) => {
    const min = parseFloat(t.min);
    const max = parseFloat(t.max);
    const isLast = i === sortedThresholds.length - 1;
    return Number.isFinite(min) && Number.isFinite(max) && numValue >= min && (isLast ? numValue <= max : numValue < max);
  });

  return match?.color || "#808080";
};
