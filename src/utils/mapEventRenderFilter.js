const FIELD_KEYS = [
  "event_name",
  "eventName",
  "event",
  "event_type",
  "eventType",
  "message",
  "detail",
  "category",
  "subcategory",
  "condition",
  "state",
  "call_state",
  "callState",
  "data_activity",
  "dataActivity",
  "apps",
  "handover_type",
  "handoverType",
  "type",
  "network",
  "technology",
];

const mapRenderEventTypeCache = new WeakMap();

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

// Number(null) and Number("") are 0 (finite), so guard with hasValue first.
const hasFiniteNumber = (value) => hasValue(value) && Number.isFinite(Number(value));

function collectText(log = {}) {
  const raw = log.raw_event || log.raw || null;
  const values = FIELD_KEYS.flatMap((key) => [log?.[key], raw?.[key]]);
  return values
    .filter(hasValue)
    .join(" ")
    .toLowerCase();
}

function computeMapRenderEventType(log = {}) {
  const text = collectText(log);

  if (/\b(hand\s*over|handover|ho[_ -]?(attempt|success|failure|complete)|technology transition|band transition|pci transition)\b/i.test(text)) {
    return "handover";
  }

  if (/\b(call[_ -]?dial[_ -]?initiated|call[_ -]?dialing|call request|dial initiated|mo call|mt call|mobile originated|mobile terminated)\b/i.test(text)) {
    return "call_request";
  }

  if (/\b(call[_ -]?active|call connected|connected call|answered|in[- ]?call)\b/i.test(text)) {
    return "call_connected";
  }

  if (/\b(call[_ -]?disconnected|call ended|call end|disconnect(?:ed|ing)?|idle)\b/i.test(text)) {
    return "call_ended";
  }

  if (/\b(data activity|mdataactivity|data_activity|activity[_ -]?(in|out|inout|dormant)|dl[_ -]?(thpt|tpt|throughput)|ul[_ -]?(thpt|tpt|throughput))\b/i.test(text)) {
    return "data_activity";
  }

  const hasCellSignal = ["rsrp", "rssi", "rsrq", "sinr"].some((key) => hasFiniteNumber(log[key]));
  const hasCellIdentity = ["pci", "cell_id", "earfcn"].some((key) => hasValue(log[key]));

  if (/\b(cell measurement|cell[_ -]?meas|serving cell|neighbor cell|neighbour cell|nr_rrc_serv_cell|lte_rrc_mib|sib type 1)\b/i.test(text) || (hasCellSignal && hasCellIdentity)) {
    return "cell_measurement";
  }

  return null;
}

export function getMapRenderEventType(log = {}) {
  if (!log || typeof log !== "object") return computeMapRenderEventType(log);
  if (mapRenderEventTypeCache.has(log)) return mapRenderEventTypeCache.get(log);
  const eventType = computeMapRenderEventType(log);
  mapRenderEventTypeCache.set(log, eventType);
  return eventType;
}

export function shouldRenderLogOnMap(log = {}) {
  if (log?.is_generated_log) return true;
  if (log?.is_wifi === true) return true;
  return Boolean(getMapRenderEventType(log));
}
