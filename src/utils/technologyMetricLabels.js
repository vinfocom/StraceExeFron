import { isWifiNetworkLog } from "./networkLogType.js";

const GENERIC_METRIC_LABELS = Object.freeze({
  rsrp: "RSRP",
  rsrq: "RSRQ",
  sinr: "SINR",
  pci: "PCI",
  earfcn: "EARFCN",
});

const TECHNOLOGY_METRIC_LABELS = {
  "2G": { rsrp: "RxLev", rsrq: "", sinr: "RxQual", pci: "BCCH", earfcn: "BCCH" },
  "3G": { rsrp: "RSCP", rsrq: "Ec/No", sinr: "EcNo-derived" },
  "4G": { rsrp: "RSRP", rsrq: "RSRQ", sinr: "SINR" },
  "5G": { rsrp: "nrRSRP", rsrq: "nrRSRQ", sinr: "nrSINR" },
};

export const UNIFIED_MAP_METRIC_OPTIONS = Object.freeze([
  { value: "rsrp", label: "RSRP/RSSI/RXLevel" },
  { value: "rsrq", label: "RSRQ" },
  { value: "sinr", label: "SINR/RXQual/Ec/no" },
  { value: "ci_db", label: "C/I" },
  { value: "dl_thpt", label: "DL Throughput" },
  { value: "ul_thpt", label: "UL Throughput" },
  { value: "mos", label: "MOS" },
  { value: "pci", label: "PCI/BSIC" },
  { value: "num_cells", label: "Pilot pollution" },
  { value: "level", label: "Ping pong" },
  { value: "jitter", label: "Jitter" },
  { value: "latency", label: "Latency" },
  { value: "packet_loss", label: "Packet Loss" },
  { value: "cell_id", label: "Cell ID" },
  { value: "nodebid", label: "NodeB ID" },
  { value: "earfcn", label: "Earfcn/BCCH" },
  { value: "tac", label: "TAC/LAC" },
  { value: "dominance", label: "Dominance Analysis" },
  { value: "coverage_violation", label: "Coverage Violation" },
]);

export const WIFI_UNIFIED_MAP_METRIC_OPTIONS = Object.freeze([
  { value: "rsrp", label: "RSSI" },
  { value: "dl_thpt", label: "DL Throughput" },
  { value: "ul_thpt", label: "UL Throughput" },
  { value: "wifi_frequency", label: "Frequency (GHz)" },
  { value: "wifi_channel", label: "Channel" },
]);

export const GRID_VIEW_ALLOWED_METRICS = Object.freeze([
  "rsrp", "rsrq", "sinr", "ci_db", "dl_thpt", "ul_thpt", "mos", "latency", "jitter",
]);

export const normalizeMetricTechnology = (value) => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "Unknown";
  if (raw.includes("5G") || raw.includes("NR")) return "5G";
  if (raw.includes("4G") || raw.includes("LTE")) return "4G";
  if (raw.includes("3G") || raw.includes("UMTS") || raw.includes("WCDMA")) return "3G";
  if (raw.includes("2G") || raw.includes("GSM") || raw.includes("GERAN") || raw === "EDGE" || raw === "GPRS") return "2G";
  return "Unknown";
};

export const getTechnologyMetricLabels = (technology) => ({
  ...GENERIC_METRIC_LABELS,
  ...(TECHNOLOGY_METRIC_LABELS[normalizeMetricTechnology(technology)] || {}),
});

export const getLogTechnology = (log) =>
  log?.technology || log?.Technology || log?.networkType || log?.network_type || log?.network || log?.Network || log?.best_technology || log?.bestTechnology || log?.rat || log?.RAT || log?.radio_access_technology;

export const is2GTechnology = (technology) => normalizeMetricTechnology(technology) === "2G";

// Keep backend metric keys intact; only adapt their presentation and value aliases.
export const getTechnologyMetricValue = (log, metric) => {
  const aliases = is2GTechnology(getLogTechnology(log))
    ? {
        rsrp: ["rxlev", "RxLev", "RXLEV", "rsrp", "RSRP", "Rsrp", "rssi", "RSSI"],
        rsrq: [],
        sinr: ["rxqual", "RxQual", "RXQUAL", "sinr", "SINR", "Sinr"],
        pci: ["bcch", "BCCH", "Bcch", "bcch_id", "bcchId", "bcch_number", "best_bcch", "best_earfcn", "best_pci", "bestPci", "arfcn", "ARFCN", "earfcn", "EARFCN", "Earfcn", "pci", "PCI", "Pci"],
        earfcn: ["bcch", "BCCH", "Bcch", "bcch_id", "bcchId", "bcch_number", "best_bcch", "best_earfcn", "best_pci", "bestPci", "arfcn", "ARFCN", "earfcn", "EARFCN", "Earfcn", "pci", "PCI", "Pci"],
      }[metric]
    : null;
  for (const key of aliases ?? [metric, metric.toUpperCase()]) {
    const value = log?.[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
};

export const getTechnologySignalRows = (log) => {
  const technology = getLogTechnology(log);
  const labels = getTechnologyMetricLabels(technology);
  return ["rsrp", "rsrq", "sinr"]
    .filter((key) => labels[key])
    .map((key) => ({
      key,
      label: labels[key],
      value: getTechnologyMetricValue(log, key),
      unit: key === "rsrp" ? "dBm" : key === "sinr" && is2GTechnology(technology) ? "" : "dB",
    }));
};

export const getTechnologyMetricOptions = (options, technology) => {
  if (!is2GTechnology(technology)) return options;
  const labels = getTechnologyMetricLabels(technology);
  const seen = new Set();
  return options.flatMap((option) => {
    const label = labels[option.value] ?? option.label;
    if (!label || seen.has(label)) return [];
    seen.add(label);
    return [{ ...option, label }];
  });
};

export const getMetricLabelsForLocations = (locations = []) => {
  const rows = Array.isArray(locations) ? locations : [];
  if (rows.length > 0 && rows.every(isWifiNetworkLog)) {
    return { ...GENERIC_METRIC_LABELS, rsrp: "RSSI" };
  }
  const technologies = new Set(
    rows
      .map((location) => normalizeMetricTechnology(
        getLogTechnology(location),
      ))
      .filter((technology) => technology !== "Unknown"),
  );

  return technologies.size === 1
    ? getTechnologyMetricLabels(Array.from(technologies)[0])
    : { ...GENERIC_METRIC_LABELS };
};

// Adapt detail-log records once so every analytics tab sees the same 2G fields.
export const getTechnologyDisplayLog = (log) => {
  if (!is2GTechnology(getLogTechnology(log))) return log;
  const bcch = getTechnologyMetricValue(log, "pci");
  return {
    ...log,
    rsrp: getTechnologyMetricValue(log, "rsrp"),
    rsrq: null,
    sinr: getTechnologyMetricValue(log, "sinr"),
    pci: bcch,
    earfcn: bcch,
    ...(log.is_grid_cell ? { best_pci: bcch } : {}),
  };
};

export const getTechnologyChannelIdentity = (log, value = getTechnologyMetricValue(log, "pci")) => {
  const label = is2GTechnology(getLogTechnology(log)) ? "BCCH" : "PCI";
  const text = value == null ? "" : String(value).trim();
  return { key: `${label}:${text}`, label, value: text || null };
};
