import { extractRowInsights, mergeDetails } from "./rowInsights";

// Converts raw Event/L3 rows into human-readable timeline entries: a
// category (used for filter chips), a title + icon, a one-line summary,
// and a best-effort list of decoded label/value details.
//
// Real Event exports carry the coarse bucket and the specific sub-event in
// two separate columns, e.g. category=CALL, event=CALL_DIAL_INITIATED - both
// are used, category for grouping/filtering and event for the card title.

const EVENT_TYPE_MAP = {
  CELL_MEAS: { title: "Cell Measurement", icon: "📶", category: "Measurement" },
  NSA_SA: { title: "NSA / SA Switch", icon: "🔄", category: "NSA/SA" },
  CONFIG: { title: "Configuration", icon: "⚙️", category: "Configuration" },
  IMS: { title: "IMS Event", icon: "☁️", category: "IMS" },
  CALL: { title: "Call Event", icon: "📞", category: "Call" },
  HANDOVER: { title: "Handover Event", icon: "🔀", category: "Handover" },
};

// Curated titles/icons for the specific sub-events seen in real exports.
// Matched against the "event" column (e.g. "CALL_DIAL_INITIATED",
// "mPreciseCallState"). Anything not listed here falls back to a prettified
// version of the raw identifier instead of a generic "Other Event".
const SUB_EVENT_RULES = [
  // Call lifecycle (mostly IMS/VoLTE - PS domain voice)
  { test: /^CALL_DIAL_INITIATED$/i, title: "Call Dial Initiated", icon: "📞" },
  { test: /^IMS_DIAL_INTERNAL$/i, title: "IMS Dial (Internal)", icon: "📞" },
  { test: /^IMS_CALL_DIAL$/i, title: "IMS Call Dial", icon: "📞" },
  { test: /^CALL_DIALING$/i, title: "Call Dialing", icon: "📞" },
  { test: /^CALL_ALERTING$/i, title: "Call Alerting", icon: "📞" },
  { test: /^CALL_ACTIVE$/i, title: "Call Active", icon: "📞" },
  { test: /^CALL_CAPS_LOCAL$/i, title: "Call Capabilities (Local)", icon: "📞" },
  { test: /^CALL_CAPS_REMOTE$/i, title: "Call Capabilities (Remote)", icon: "📞" },
  { test: /^CALL_LIST_CHANGED$/i, title: "Call List Changed", icon: "📞" },
  { test: /^CALL_DISCONNECT_NONZERO_CAUSE$/i, title: "Call Disconnect Cause", icon: "📴" },
  { test: /^CALL_DISCONNECTED$/i, title: "Call Disconnected", icon: "📴" },
  { test: /^mPreciseCallState$/i, title: "Precise Call State", icon: "📞" },
  { test: /^CallState$/i, title: "Call State", icon: "📞" },
  { test: /^mCallNetworkType$/i, title: "Call Network Type", icon: "📞" },
  { test: /^mCallQuality$/i, title: "Call Quality", icon: "📞" },

  // Data / PS bearer lifecycle
  { test: /^SETUP_DATA_CALL$/i, title: "Data Call Setup Request", icon: "🌐" },
  { test: /^DATA_CALL_SETUP_OK$/i, title: "Data Call Setup OK", icon: "🌐" },
  { test: /^DATA_HANDOVER_START$/i, title: "Data Handover Start", icon: "🔀" },
  { test: /^mDataConnectionState$/i, title: "Data Connection State", icon: "🌐" },
  { test: /^mDataActivity$/i, title: "Data Activity", icon: "🌐" },

  // IMS / VoLTE registration (PS domain)
  { test: /^IMS_REGISTERED$/i, title: "IMS Registered", icon: "☁️" },
  { test: /^IMS_MMTEL_CAPS$/i, title: "IMS MMTel Capabilities", icon: "☁️" },
  { test: /^IMS_FEATURE_CAP_CHANGE$/i, title: "IMS Feature Capability Change", icon: "☁️" },
  { test: /^IMS_VOLTE_CELLULAR$/i, title: "VoLTE Over Cellular", icon: "☁️" },

  // NR NSA/SA + EN-DC
  { test: /^ENDC_AVAILABILITY$/i, title: "ENDC Availability", icon: "🔄" },
  { test: /^ENDC_DEPRIO_CHECK$/i, title: "ENDC Deprioritization Check", icon: "🔄" },
  { test: /^ENDC_FORCE_DISABLED$/i, title: "ENDC Force Disabled", icon: "🔄" },
  { test: /^NR_NSA_MARKER$/i, title: "NR NSA Marker", icon: "🔄" },
  { test: /^OEM_NR_MODE_UPDATE$/i, title: "NR Mode Update", icon: "🔄" },

  // L3 message-style rules (used by decodeL3Item below)
  { test: /paging/i, title: "Paging", icon: "📡", l3Category: "Paging" },
  { test: /measreport|meas\W*report/i, title: "Measurement Report", icon: "📶", l3Category: "Measurement" },
  { test: /rrc\W*connection\W*setup/i, title: "RRC Connection Setup", icon: "🔗" },
  { test: /rrc\W*(connection\W*)?release/i, title: "RRC Release", icon: "❌" },
  { test: /registration\W*request/i, title: "Registration Request", icon: "🔐", l3Category: "Registration" },
  { test: /registration\W*accept/i, title: "Registration Accepted", icon: "🔐", l3Category: "Registration" },
  { test: /\battach\b/i, title: "Attach", icon: "🔐", l3Category: "Registration" },
  { test: /\bdetach\b/i, title: "Detach", icon: "❌", l3Category: "Registration" },
];

// Metrics polled directly from Android telephony APIs (event column holds the
// metric name, detail column holds "(new) X" or "OLD -> NEW").
const CELL_MEAS_UNITS = {
  rsrp: " dBm",
  ssrsrp: " dBm",
  csirsrp: " dBm",
  rsrq: " dB",
  ssrsrq: " dB",
  csirsrq: " dB",
  rssnr: " dB",
  sssinr: " dB",
  cqi: "",
};

const ACRONYMS = [
  "RRC",
  "NAS",
  "ENDC",
  "NSA",
  "SA",
  "NR",
  "LTE",
  "IMS",
  "PCI",
  "TAC",
  "CI",
  "RAT",
  "OK",
  "ID",
  "OEM",
  "MIMO",
  "VOLTE",
  "VONR",
  "RSRP",
  "RSRQ",
  "RSSNR",
  "SINR",
  "CQI",
];

// Turns an identifier like "mPreciseCallState" or "CALL_DIAL_INITIATED" into
// a readable title ("Precise Call State" / "Call Dial Initiated") when no
// curated rule matches it - keeps unknown/obscure fields from all collapsing
// into a generic "Other Event".
export function prettifyIdentifier(raw = "") {
  if (!raw) return "";
  let text = raw.replace(/^m(?=[A-Z])/, "");
  text = text.replace(/[_.]+/g, " ");
  text = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  text = text.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  text = text.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());

  return text
    .split(" ")
    .map((word) => (ACRONYMS.includes(word.toUpperCase()) ? word.toUpperCase() : word))
    .join(" ")
    .trim();
}

const NAS_HINT_RE = /\bnas\b|registration|attach|detach|authentication|identity|security mode/i;
const NR_HINT_RE = /nr-rrc|\bnr\b|\b5g\b/i;
const LTE_HINT_RE = /lte-rrc|\blte\b|\b4g\b/i;

// Loose PS/CS keyword detection for exports where the domain word itself
// appears in text (e.g. "CS Call", "CSFB", "PS Handover"). Word-boundary
// matching avoids firing on unrelated tokens like "PSCell", "EPS" or "GPS".
const CS_DOMAIN_RE = /\bcsfb\b|\bcs\b|circuit[- ]?switch(ed)?/i;
const PS_DOMAIN_RE = /\bps\b|packet[- ]?switch(ed)?/i;

export function detectDomain(...texts) {
  const combined = texts.filter(Boolean).join(" ");
  if (!combined) return null;

  const hasCs = CS_DOMAIN_RE.test(combined);
  const hasPs = PS_DOMAIN_RE.test(combined);

  if (hasCs && hasPs) return "CS+PS";
  if (hasCs) return "CS";
  if (hasPs) return "PS";
  return null;
}

// L3-RRC/NAS category is derived from the "layer" column when present,
// falling back to keyword hints in the message/decoded text.
function classifyL3Category(layer = "", message = "") {
  const layerLower = layer.toLowerCase();
  if (layerLower.includes("nas") || NAS_HINT_RE.test(message)) return "NAS";
  if (layerLower.includes("nr") || NR_HINT_RE.test(layer) || NR_HINT_RE.test(message)) return "NR-RRC";
  if (layerLower.includes("lte") || LTE_HINT_RE.test(layer) || LTE_HINT_RE.test(message)) return "LTE-RRC";
  return layer ? layer.toUpperCase() : "Other";
}

// Best-effort extraction of "Label Value" pairs out of raw decoded/detail
// text, e.g. "S-TMSI DDC1EABF" -> { label: "Temporary UE ID", value: "DDC1EABF" },
// or Android telephony dumps like "getRilVoiceRadioTechnology=14(LTE)".
const LABEL_RULES = [
  { label: "Temporary UE ID", test: /s-?tmsi[:\s]+([0-9a-fx]+)/i },
  { label: "Serving RSRP", test: /(?:pcell|serving)?[^0-9-]{0,12}rsrp[:\s]+(-?\d+)/i, unit: " dBm" },
  { label: "Serving RSRQ", test: /(?:pcell|serving)?[^0-9-]{0,12}rsrq[:\s]+(-?\d+)/i, unit: " dB" },
  { label: "SINR", test: /sinr[:\s]+(-?\d+)/i, unit: " dB" },
  { label: "Neighbour PCI", test: /neighbou?r[^0-9]{0,12}pci[:\s]+(\d+)/i },
  { label: "Serving PCI", test: /(?:pcell|serving)[^0-9]{0,12}pci[:\s]+(\d+)/i },
  { label: "PCI", test: /\bpci[:\s]+(\d+)/i },
  { label: "Voice RAT", test: /getRilVoiceRadioTechnology\s*=\s*-?\d+\(([A-Za-z0-9_]+)\)/i },
  { label: "Data RAT", test: /getRilDataRadioTechnology\s*=\s*-?\d+\(([A-Za-z0-9_]+)\)/i },
  { label: "Cell Registered", test: /\bmRegistered\s*=\s*([A-Za-z]+)/i },
  { label: "Link Status", test: /\blinkStatus\s*=\s*(\d+)/i },
  { label: "Interface", test: /\bifname\s*=\s*([\w.]+)/i },
  { label: "Result Code", test: /\bresultCode\s*=\s*(-?\d+)/i },
  { label: "Cause", test: /\bcause\s*[:=]\s*\(?([\w-]+)/i },
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

// Handles the plain "(new) X" / "OLD -> NEW" shape used for simple polled
// values (mDataActivity, mCi, CellInfo.count, ...) that aren't part of the
// richer LABEL_RULES vocabulary above.
function decodeSimpleValueChange(rawText = "") {
  const newValueMatch = rawText.match(/^\(new\)\s*(.+)$/i);
  if (newValueMatch) return [{ label: "Value", value: newValueMatch[1].trim() }];

  const changeMatch = rawText.match(/^(.+?)\s*->\s*(.+)$/);
  if (changeMatch) return [{ label: "Changed", value: `${changeMatch[1].trim()} → ${changeMatch[2].trim()}` }];

  return [];
}

// CELL_MEAS rows poll one metric per row (event = "rsrp"/"rssnr"/...), so a
// dedicated metric name + unit reads better than a generic "Value: -97".
function decodeCellMeasDetail(eventName = "", rawValue = "") {
  const key = eventName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const unit = CELL_MEAS_UNITS[key];
  if (unit === undefined) return null;

  const changeMatch = rawValue.match(/^(.+?)\s*->\s*(.+)$/);
  const newValueMatch = rawValue.match(/^\(new\)\s*(.+)$/i);
  const value = changeMatch ? changeMatch[2].trim() : newValueMatch ? newValueMatch[1].trim() : rawValue.trim();

  return { label: eventName.toUpperCase(), value: `${value}${unit}` };
}

// PS/CS may show up in a dedicated column (e.g. "Domain", "(PS)", "PS/CS")
// rather than inside the message text itself. Since column names vary and
// aren't known ahead of time, scan every value in the raw row too - this
// also naturally covers a "Detail"/"Decode" column mentioning CS/PS inline.
const rawRowText = (row) => (row ? Object.values(row).join(" ") : "");

const titleCase = (value = "") => value.trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
const humanizeStatusValue = (value = "") => titleCase(value.replace(/_/g, " ").toLowerCase());

// Android telephony dumps carry the actual CS (voice) / PS (data)
// registration state explicitly, e.g. "mVoiceRegState=0(IN_SERVICE),
// mDataRegState=0(IN_SERVICE)" - this is the authoritative source when present.
const CS_FIELD_RE = /mVoiceRegState\s*=\s*-?\d+\(([A-Za-z_]+)\)/i;
const PS_FIELD_RE = /mDataRegState\s*=\s*-?\d+\(([A-Za-z_]+)\)/i;

// Known status vocabulary to look for near a bare "CS"/"PS" token - keeps the
// fallback extraction from grabbing an unrelated adjacent word as a status.
const STATUS_WORDS = [
  "not registered",
  "registered",
  "limited service",
  "no service",
  "in service",
  "out of service",
  "connected",
  "disconnected",
  "attached",
  "detached",
  "idle",
  "active",
  "inactive",
  "available",
  "unavailable",
  "camped",
  "established",
  "released",
  "dropped",
  "failed",
  "success",
  "ongoing",
];
const STATUS_ALTERNATION = STATUS_WORDS.map((word) => word.replace(/ /g, "\\s+")).join("|");

// Finds a known status word within a short window before/after a "cs"/"ps"
// token, e.g. "CS: Registered", "Registered (CS)", "PS - Connected", or with
// a word in between such as "CS Call Registered" / "PS Data Connected".
function findStatusNear(text, token) {
  if (!text) return null;
  const forward = new RegExp(`\\b${token}\\b[\\s\\S]{0,20}?(${STATUS_ALTERNATION})`, "i");
  const backward = new RegExp(`(${STATUS_ALTERNATION})[\\s\\S]{0,20}?\\(?\\b${token}\\b`, "i");
  const forwardMatch = text.match(forward);
  if (forwardMatch) return forwardMatch[1];
  const backwardMatch = text.match(backward);
  return backwardMatch ? backwardMatch[1] : null;
}

// A raw row may carry a column literally named "CS"/"PS"/"CS Status" etc.
// whose value already IS the status (no need to search for the cs/ps word).
const CS_KEY_RE = /(^|[^a-z])cs([^a-z]|$)/i;
const PS_KEY_RE = /(^|[^a-z])ps([^a-z]|$)/i;

function extractDomainStatusFromRow(row = {}) {
  const details = [];
  let hasCs = false;
  let hasPs = false;

  for (const [key, value] of Object.entries(row)) {
    const trimmedValue = String(value ?? "").trim();
    if (!trimmedValue) continue;
    if (!hasCs && CS_KEY_RE.test(key)) {
      details.push({ label: "CS Status", value: trimmedValue });
      hasCs = true;
    }
    if (!hasPs && PS_KEY_RE.test(key)) {
      details.push({ label: "PS Status", value: trimmedValue });
      hasPs = true;
    }
  }

  return details;
}

// Combines, in order of confidence: (1) an explicit mVoiceRegState/
// mDataRegState field (Android telephony dumps), (2) a dedicated CS/PS
// column, (3) a "CS: Idle"-style mention in free text.
function extractDomainStatus(item, combinedText) {
  const details = [];
  const hasLabel = (label) => details.some((detail) => detail.label === label);

  const csFieldMatch = combinedText.match(CS_FIELD_RE);
  if (csFieldMatch) details.push({ label: "CS Status", value: humanizeStatusValue(csFieldMatch[1]) });
  const psFieldMatch = combinedText.match(PS_FIELD_RE);
  if (psFieldMatch) details.push({ label: "PS Status", value: humanizeStatusValue(psFieldMatch[1]) });

  extractDomainStatusFromRow(item.raw || {}).forEach((detail) => {
    if (!hasLabel(detail.label)) details.push(detail);
  });

  if (!hasLabel("CS Status")) {
    const csStatus = findStatusNear(combinedText, "cs");
    if (csStatus) details.push({ label: "CS Status", value: titleCase(csStatus) });
  }
  if (!hasLabel("PS Status")) {
    const psStatus = findStatusNear(combinedText, "ps");
    if (psStatus) details.push({ label: "PS Status", value: titleCase(psStatus) });
  }

  return details;
}

function mergeDomainTag(existing, tag) {
  if (!tag) return existing;
  if (!existing) return tag;
  const tags = new Set(existing.split("+"));
  tags.add(tag);
  return Array.from(tags).sort().join("+");
}

function applyDomainStatus(baseDomain, domainStatusDetails) {
  let domain = baseDomain;
  domainStatusDetails.forEach((detail) => {
    domain = mergeDomainTag(domain, detail.label === "CS Status" ? "CS" : "PS");
  });
  return domain;
}

export function decodeL3Item(item) {
  const message = item.message || item.decodedText || "";
  const rule = SUB_EVENT_RULES.find((entry) => entry.test.test(message));
  const category = rule?.l3Category || classifyL3Category(item.layer, message);
  const title = rule?.title || (item.message ? prettifyIdentifier(item.message) : "Other Event");
  const icon = rule?.icon || "❓";

  const combinedText = [item.layer, message, item.decodedText, rawRowText(item.raw)]
    .filter(Boolean)
    .join(" ");
  const domainStatusDetails = extractDomainStatus(item, combinedText);
  const domain = applyDomainStatus(detectDomain(combinedText), domainStatusDetails);

  const details = mergeDetails(
    extractDecodedDetails(item.decodedText || ""),
    extractRowInsights(item),
    domainStatusDetails,
  );
  const summary = details.length
    ? details.map((detail) => `${detail.label}: ${detail.value}`).join(" · ")
    : (item.decodedText || message || "").slice(0, 140);

  return { category, title, icon, summary, details, domain };
}

export function decodeEventItem(item) {
  const rawCategory = (item.category || "").toUpperCase().trim();
  const known = EVENT_TYPE_MAP[rawCategory];
  const category = known?.category || (item.category ? item.category : "Other");
  const categoryIcon = known?.icon || "❓";

  const eventKey = (item.eventName || "").trim();
  const subRule = SUB_EVENT_RULES.find((entry) => entry.test.test(eventKey));
  const icon = subRule?.icon || categoryIcon;

  let title;
  if (subRule) {
    title = subRule.title;
  } else if (rawCategory === "CELL_MEAS" && eventKey) {
    title = `Cell Measurement — ${prettifyIdentifier(eventKey)}`;
  } else if (eventKey) {
    title = prettifyIdentifier(eventKey);
  } else {
    title = known?.title || "Other Event";
  }

  const combinedText = [item.category, item.eventName, item.value, rawRowText(item.raw)]
    .filter(Boolean)
    .join(" ");
  const domainStatusDetails = extractDomainStatus(item, combinedText);
  const domain = applyDomainStatus(detectDomain(combinedText), domainStatusDetails);

  const cellMeasDetail = rawCategory === "CELL_MEAS" ? decodeCellMeasDetail(eventKey, item.value || "") : null;
  const changeDetails = cellMeasDetail ? [] : decodeSimpleValueChange(item.value || "");

  const details = mergeDetails(
    cellMeasDetail ? [cellMeasDetail] : [],
    changeDetails,
    extractDecodedDetails(item.value || ""),
    extractRowInsights(item),
    domainStatusDetails,
  );

  const summary = details.length
    ? details.map((detail) => `${detail.label}: ${detail.value}`).join(" · ")
    : (item.value || item.eventName || "").slice(0, 140);

  return { category, title, icon, summary, details, domain, eventKey };
}
