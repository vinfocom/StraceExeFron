// Converts raw Event/L3 rows into human-readable timeline entries: a
// category (used for filter chips), a title + icon, a one-line summary,
// and a best-effort list of decoded label/value details.

const EVENT_TYPE_MAP = {
  CELL_MEAS: { title: "Cell Measurement", icon: "📶", category: "Measurement" },
  NSA_SA: { title: "NSA / SA Switch", icon: "🔄", category: "NSA/SA" },
  CONFIG: { title: "Configuration", icon: "⚙️", category: "Configuration" },
  IMS: { title: "IMS Event", icon: "☁️", category: "IMS" },
  CALL: { title: "Call Event", icon: "📞", category: "Call" },
};

// Ordered by specificity - first match wins.
const L3_MESSAGE_RULES = [
  { test: /paging/i, title: "Paging", icon: "📡", category: "Paging" },
  { test: /measreport|meas\W*report/i, title: "Measurement Report", icon: "📶", category: "Measurement" },
  { test: /rrc\W*connection\W*setup/i, title: "RRC Connection Setup", icon: "🔗" },
  { test: /rrc\W*(connection\W*)?release/i, title: "RRC Release", icon: "❌" },
  { test: /registration\W*request/i, title: "Registration Request", icon: "🔐", category: "Registration" },
  { test: /registration\W*accept/i, title: "Registration Accepted", icon: "🔐", category: "Registration" },
  { test: /\battach\b/i, title: "Attach", icon: "🔐", category: "Registration" },
  { test: /\bdetach\b/i, title: "Detach", icon: "❌", category: "Registration" },
];

const NAS_HINT_RE = /\bnas\b|registration|attach|detach|authentication|identity|security mode/i;
const NR_HINT_RE = /nr-rrc|\bnr\b|\b5g\b/i;
const LTE_HINT_RE = /lte-rrc|\blte\b|\b4g\b/i;

// L3-RRC/NAS category is derived from the "layer" column when present,
// falling back to keyword hints in the message/decoded text.
function classifyL3Category(layer = "", message = "") {
  const layerLower = layer.toLowerCase();
  if (layerLower.includes("nas") || NAS_HINT_RE.test(message)) return "NAS";
  if (layerLower.includes("nr") || NR_HINT_RE.test(layer) || NR_HINT_RE.test(message)) return "NR-RRC";
  if (layerLower.includes("lte") || LTE_HINT_RE.test(layer) || LTE_HINT_RE.test(message)) return "LTE-RRC";
  return layer ? layer.toUpperCase() : "Other";
}

// Best-effort extraction of "Label Value" pairs out of raw decoded text, e.g.
// "S-TMSI DDC1EABF" -> { label: "Temporary UE ID", value: "DDC1EABF" }.
const LABEL_RULES = [
  { label: "Temporary UE ID", test: /s-?tmsi[:\s]+([0-9a-fx]+)/i },
  { label: "Serving RSRP", test: /(?:pcell|serving)?[^0-9-]{0,12}rsrp[:\s]+(-?\d+)/i, unit: " dBm" },
  { label: "Serving RSRQ", test: /(?:pcell|serving)?[^0-9-]{0,12}rsrq[:\s]+(-?\d+)/i, unit: " dB" },
  { label: "SINR", test: /sinr[:\s]+(-?\d+)/i, unit: " dB" },
  { label: "Neighbour PCI", test: /neighbou?r[^0-9]{0,12}pci[:\s]+(\d+)/i },
  { label: "Serving PCI", test: /(?:pcell|serving)[^0-9]{0,12}pci[:\s]+(\d+)/i },
  { label: "PCI", test: /\bpci[:\s]+(\d+)/i },
  { label: "Cause", test: /cause[:\s]+([\w-]+)/i },
];

export function extractDecodedDetails(rawText = "") {
  if (!rawText) return [];
  const details = [];
  const seenLabels = new Set();

  for (const rule of LABEL_RULES) {
    if (seenLabels.has(rule.label)) continue;
    const match = rawText.match(rule.test);
    if (match) {
      details.push({ label: rule.label, value: `${match[1]}${rule.unit || ""}` });
      seenLabels.add(rule.label);
    }
  }

  return details;
}

export function decodeL3Item(item) {
  const message = item.message || item.decodedText || "";
  const rule = L3_MESSAGE_RULES.find((entry) => entry.test.test(message));
  const category = rule?.category || classifyL3Category(item.layer, message);
  const title = rule?.title || (item.message ? item.message : "Other Event");
  const icon = rule?.icon || "❓";
  const details = extractDecodedDetails(item.decodedText || "");
  const summary = details.length
    ? details.map((detail) => `${detail.label}: ${detail.value}`).join(" · ")
    : (item.decodedText || message || "").slice(0, 140);

  return { category, title, icon, summary, details };
}

export function decodeEventItem(item) {
  const key = (item.eventName || "").toUpperCase().trim();
  const known = EVENT_TYPE_MAP[key];
  const details = extractDecodedDetails(item.value || "");
  const title = known?.title || (item.eventName ? item.eventName : "Other Event");
  const icon = known?.icon || "❓";
  const category = known?.category || "Other";
  const summary = details.length
    ? details.map((detail) => `${detail.label}: ${detail.value}`).join(" · ")
    : (item.value || item.eventName || "").slice(0, 140);

  return { category, title, icon, summary, details };
}
