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

function collectText(log = {}) {
  const raw = log.raw_event || log.raw || null;
  const values = FIELD_KEYS.flatMap((key) => [log?.[key], raw?.[key]]);
  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();
}

export function getMapRenderEventType(log = {}) {
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

  const hasCellSignal =
    Number.isFinite(Number(log.rsrp)) ||
    Number.isFinite(Number(log.rssi)) ||
    Number.isFinite(Number(log.rsrq)) ||
    Number.isFinite(Number(log.sinr));
  const hasCellIdentity =
    log.pci !== null && log.pci !== undefined && String(log.pci).trim() !== "" ||
    log.cell_id !== null && log.cell_id !== undefined && String(log.cell_id).trim() !== "" ||
    log.earfcn !== null && log.earfcn !== undefined && String(log.earfcn).trim() !== "";

  if (/\b(cell measurement|cell[_ -]?meas|serving cell|neighbor cell|neighbour cell|nr_rrc_serv_cell|lte_rrc_mib|sib type 1)\b/i.test(text) || (hasCellSignal && hasCellIdentity)) {
    return "cell_measurement";
  }

  return null;
}

export function shouldRenderLogOnMap(log = {}) {
  if (log?.is_generated_log) return true;
  return Boolean(getMapRenderEventType(log));
}
