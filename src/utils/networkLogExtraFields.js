const aliases = new Map([
  ['PS App DL (Mbps)', 'ps_app_dl_mbps'],
  ['PS App UL (Mbps)', 'ps_app_ul_mbps'],
  ['LTE MAC Thpt DL (Mbps)', 'lte_mac_dl_mbps'],
  ['LTE MAC Thpt UL (Mbps)', 'lte_mac_ul_mbps'],
  ['NR MAC Thpt DL (Mbps)', 'nr_mac_dl_mbps'],
  ['NR MAC Thpt UL (Mbps)', 'nr_mac_ul_mbps'],
  ['DL THPT', 'dl_tpt'],
  ['UL THPT', 'ul_tpt'],
  ['PUSCH Tx (dBm)', 'pusch_tx'],
].flatMap(([header, key]) => [[header.toLowerCase(), key], [key, key]]));

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const missing = value => value === null || value === undefined || (typeof value === 'string' && !value.trim());

export const canonicalNetworkLogField = field => {
  const name = String(field ?? '').trim();
  return aliases.get(name.toLowerCase()) || name;
};

export const canonicalNetworkLogFields = fields => [...new Set(
  (fields || []).filter(field => typeof field === 'string' && field.trim()).map(canonicalNetworkLogField),
)];

// Used for both API rows and saved browser snapshots. Keep raw extra_json intact.
export const parseNetworkLogExtraFields = raw => {
  try {
    for (let depth = 0; typeof raw === 'string' && depth < 3; depth++) raw = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  const captured = Object.entries(raw).find(([key, value]) => key.toLowerCase() === 'network_log_fields' && isObject(value));
  const fields = new Map(Object.entries(raw));
  if (captured) {
    fields.delete(captured[0]);
    for (const [key, value] of Object.entries(captured[1])) {
      if (missing(fields.get(key))) fields.set(key, value);
    }
  }
  const result = new Map();
  // Explicit canonical values win over header aliases, including zero and false.
  for (const [key, value] of fields) {
    if (key.trim().toLowerCase() === canonicalNetworkLogField(key).toLowerCase()) {
      const name = canonicalNetworkLogField(key);
      if (missing(result.get(name))) result.set(name, value);
    }
  }
  for (const [key, value] of fields) {
    const name = canonicalNetworkLogField(key);
    if (missing(result.get(name))) result.set(name, value);
  }
  return Object.fromEntries(result);
};

export const normalizeNetworkLogSampleExtras = sample => {
  if (!sample || (!('extra_json' in sample) && !('extra_fields' in sample))) return sample;
  return {
    ...sample,
    extra_fields: parseNetworkLogExtraFields(sample.extra_json)
      ?? parseNetworkLogExtraFields(sample.extra_fields)
      ?? {},
  };
};
