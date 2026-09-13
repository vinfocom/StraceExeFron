const GENERIC_METRIC_LABELS = Object.freeze({
  rsrp: "RSRP",
  rsrq: "RSRQ",
  sinr: "SINR",
});

const TECHNOLOGY_METRIC_LABELS = {
  "2G": { rsrp: "RxLev", rsrq: "", sinr: "RxQual" },
  "3G": { rsrp: "RSCP", rsrq: "Ec/No", sinr: "EcNo-derived" },
  "4G": { rsrp: "RSRP", rsrq: "RSRQ", sinr: "SINR" },
  "5G": { rsrp: "nrRSRP", rsrq: "nrRSRQ", sinr: "nrSINR" },
};

export const normalizeMetricTechnology = (value) => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "Unknown";
  if (raw.includes("5G") || raw.includes("NR")) return "5G";
  if (raw.includes("4G") || raw.includes("LTE")) return "4G";
  if (raw.includes("3G") || raw.includes("UMTS") || raw.includes("WCDMA")) return "3G";
  if (raw.includes("2G") || raw.includes("GSM") || raw.includes("GERAN")) return "2G";
  return "Unknown";
};

export const getTechnologyMetricLabels = (technology) => ({
  ...GENERIC_METRIC_LABELS,
  ...(TECHNOLOGY_METRIC_LABELS[normalizeMetricTechnology(technology)] || {}),
});

export const getMetricLabelsForLocations = (locations = []) => {
  const technologies = new Set(
    (Array.isArray(locations) ? locations : [])
      .map((location) => normalizeMetricTechnology(
        location?.technology ?? location?.networkType ?? location?.network,
      ))
      .filter((technology) => technology !== "Unknown"),
  );

  return technologies.size === 1
    ? getTechnologyMetricLabels(Array.from(technologies)[0])
    : { ...GENERIC_METRIC_LABELS };
};
