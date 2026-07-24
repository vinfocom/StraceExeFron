const MAX_DETAIL_VALUE_LENGTH = 120;

const STATE_VALUE_RE = /-?\d+\(([^)]+)\)?/;

const FIELD_RULES = [
  { label: "Request ID", test: /\[(\d+)\]\s*[<>]/ },
  { label: "Phone ID", test: /\[PHONE(\d+)\]/i, prefix: "PHONE" },
  { label: "Registration State", test: /\bregState\s*=\s*([A-Za-z_]+)/i, transform: humanizeValue },
  { label: "Radio Access", test: /\brat\s*=\s*([A-Za-z0-9_]+)/i },
  { label: "Voice RAT", test: /getRilVoiceRadioTechnology\s*=\s*-?\d+\(([A-Za-z0-9_]+)\)/i },
  { label: "Data RAT", test: /getRilDataRadioTechnology\s*=\s*-?\d+\(([A-Za-z0-9_]+)\)/i },
  { label: "MCC", test: /\bmcc\s*=\s*(\d+)/i },
  { label: "MNC", test: /\bmnc\s*=\s*(\d+)/i },
  { label: "Cell Identity", test: /\b(?:ci|cellIdentity|cell_id|cellId)\s*=\s*([A-Za-z0-9-]+)/i },
  { label: "PCI", test: /\bpci\s*=\s*(\d+)/i },
  { label: "TAC", test: /\btac\s*=\s*(\d+)/i },
  { label: "EARFCN", test: /\bearfcn\s*=\s*(\d+)/i },
  { label: "NR ARFCN", test: /\b(?:nrarfcn|ssbFrequency)\s*=\s*(\d+)/i },
  { label: "Bandwidth", test: /\bbandwidth\s*=\s*([A-Za-z0-9._-]+)/i },
  { label: "Bands", test: /\bbands\s*=\s*\[([^\]]+)\]/i },
  { label: "Registered PLMN", test: /\bregisteredPlmn\s*=\s*([A-Za-z0-9-]+)/i },
  { label: "Operator", test: /\balphaLong\s*=\s*([^,}]+)/i },
  { label: "Reject Cause", test: /\breasonForDenial\s*=\s*([A-Za-z_]+)/i, transform: humanizeValue },
  { label: "Data Activity", test: /\bmDataActivity\b.*?\(new\)\s*([A-Za-z0-9_()-]+)/i, transform: humanizeValue },
  { label: "Data Connection", test: /\bmDataConnectionState\b.*?\(new\)\s*([A-Za-z0-9_()-]+)/i, transform: humanizeValue },
  { label: "NR Frequency Range", test: /\bmNrFrequencyRange\b.*?\(new\)\s*([A-Za-z0-9_()-]+)/i },
  { label: "Interface", test: /\bifname\s*=\s*([\w.-]+)/i },
  { label: "Link Status", test: /\blinkStatus\s*=\s*(\d+)/i },
  { label: "Result Code", test: /\bresultCode\s*=\s*(-?\d+)/i },
  { label: "Cause", test: /\bcause\s*[:=]\s*\(?([A-Za-z0-9_-]+)/i, transform: humanizeValue },
];

const CALL_STATE_RULES = [
  { label: "Call State", test: /\bCallState\b\s*,?\s*([^,]+)/i, transform: humanizeValue },
  { label: "Call State", test: /\bmPreciseCallState\b.*?(?:state|foregroundCallState|backgroundCallState)\s*=\s*([A-Za-z0-9_]+)/i, transform: humanizeValue },
  { label: "Call Quality", test: /\bmCallQuality\b.*?(.{1,100})$/i },
];

function humanizeValue(value = "") {
  const stateMatch = String(value).match(STATE_VALUE_RE);
  const raw = stateMatch ? stateMatch[1] : value;
  return String(raw)
    .replace(/^REG_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function compact(value = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= MAX_DETAIL_VALUE_LENGTH) return text;
  return `${text.slice(0, MAX_DETAIL_VALUE_LENGTH - 1)}...`;
}

export function addUniqueDetail(details, label, value) {
  const normalized = compact(value);
  if (!label || !normalized) return details;
  if (details.some((detail) => detail.label === label)) return details;
  return [...details, { label, value: normalized }];
}

export function mergeDetails(...detailGroups) {
  return detailGroups.flat().reduce((merged, detail) => (
    addUniqueDetail(merged, detail.label, detail.value)
  ), []);
}

function extractRules(text, rules) {
  let details = [];
  for (const rule of rules) {
    const match = text.match(rule.test);
    if (!match) continue;
    const rawValue = match[1];
    const value = rule.transform ? rule.transform(rawValue) : rawValue;
    details = addUniqueDetail(details, rule.label, `${rule.prefix || ""}${value}`);
  }
  return details;
}

function extractServiceState(text) {
  let details = [];
  const voiceMatch = text.match(/\bmVoiceRegState\s*=?\s*(?:\(new\)\s*)?(-?\d+\([^)]+\)|[A-Za-z0-9_]+)/i);
  const dataMatch = text.match(/\bmDataRegState\s*=?\s*(?:\(new\)\s*)?(-?\d+\([^)]+\)|[A-Za-z0-9_]+)/i);
  if (voiceMatch) details = addUniqueDetail(details, "Voice Service", humanizeValue(voiceMatch[1]));
  if (dataMatch) details = addUniqueDetail(details, "Data Service", humanizeValue(dataMatch[1]));
  return details;
}

function extractRilOperation(text) {
  const match = text.match(/\]\s*([<>])\s*([A-Z0-9_]+)/i);
  if (!match) return [];
  const symbol = match[1] === ">" ? "↑" : "↓";
  return [
    { label: "Flow", value: symbol },
    { label: "RIL Operation", value: match[2] },
  ];
}

function extractIdentityPair(text) {
  const mcc = text.match(/\bmcc\s*=\s*(\d+)/i)?.[1];
  const mnc = text.match(/\bmnc\s*=\s*(\d+)/i)?.[1];
  if (!mcc || !mnc) return [];
  return [{ label: "PLMN", value: `${mcc}${mnc}` }];
}

function rawColumnDetails(raw = {}) {
  let details = [];
  ["source", "severity", "category"].forEach((key) => {
    const value = raw[key];
    if (value) details = addUniqueDetail(details, key[0].toUpperCase() + key.slice(1), value);
  });
  return details;
}

export function extractRowInsights(row = {}, extraTexts = []) {
  const rawText = row.raw ? Object.values(row.raw).join(" ") : "";
  const text = [
    row.layer,
    row.message,
    row.decodedText,
    row.category,
    row.eventName,
    row.value,
    rawText,
    ...extraTexts,
  ].filter(Boolean).join(" ");

  if (!text.trim()) return [];

  return mergeDetails(
    extractRilOperation(text),
    extractRules(text, FIELD_RULES),
    extractRules(text, CALL_STATE_RULES),
    extractServiceState(text),
    extractIdentityPair(text),
    rawColumnDetails(row.raw),
  );
}
