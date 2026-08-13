import { evaluateL3HandoverTimeline } from "../handoverTransitions.js";

const FAILURE_RE = /\b(fail(?:ed|ure)?|reject(?:ed)?|timeout|error|rlf|radio link failure|bearer loss|dropped|forbidden|unavailable)\b|\b[45]\d{2}\b/i;
const SUCCESS_RE = /\b(complete|completed|accept|accepted|success|connected|established|registered|200 ok|active)\b/i;
const WARNING_RE = /\b(warn(?:ing)?|retry|degraded|weak|congestion)\b/i;
const REQUEST_RE = /\b(request|command|setup|invite|paging|dial(?:ing)?|alerting|attempt|start)\b/i;

const MILESTONE_RULES = [
  { label: "HANDOVER FAILURE", test: /\b(hand(?: |-)?over|ho)\b.*\b(fail|failure|reject|timeout)\b/i, severity: "failure" },
  { label: "RADIO LINK FAILURE", test: /\b(radio link failure|rlf)\b/i, severity: "failure" },
  { label: "HANDOVER COMPLETE", test: /\b(?:handover|hand\s*over)\b.*\b(complete|success)\b/i, severity: "success" },
  { label: "HANDOVER START", test: /\b(hand(?: |-)?over|ho)\b.*\b(command|start|attempt|request)\b/i, severity: "request" },
  { label: "CALL START", test: /\bCALL_DIAL_INITIATED\b/i, severity: "request" },
  { label: "DIALING", test: /\bCALL_DIALING\b|\bdialing\b/i, severity: "request" },
  { label: "ALERTING", test: /\bCALL_ALERTING\b|\balerting\b/i, severity: "request" },
  { label: "CONNECTED", test: /\bCALL_ACTIVE\b|\bconnected\b|\banswered\b|\bin[- ]call\b/i, severity: "success" },
  { label: "CALL DISCONNECT", test: /\bCALL_DISCONNECTED\b/i, severity: "neutral" },
  { label: "NORMAL RELEASE", test: /\bSIP\b.*\bBYE\b|\bnormal (?:call )?release\b/i, severity: "success" },
];

function textOf(item = {}) {
  return [item.eventKey, item.title, item.summary, item.rawMessage, item.officialName]
    .filter(Boolean)
    .join(" ");
}

function detailValue(item, label) {
  return item?.details?.find((detail) => detail.label === label)?.value || "";
}

function inferSim(item) {
  const text = `${textOf(item)} ${JSON.stringify(item.metadata || {})}`;
  const match = text.match(/\b(?:sim|slot|phone)\s*[_:#-]?\s*(\d+)\b|\[PHONE(\d+)\]/i);
  return match ? `SIM ${Number(match[1] || match[2]) + (/\[PHONE/i.test(match[0]) ? 1 : 0)}` : "Unknown";
}

function normalizeTechnology(value = "") {
  if (/gsm|2g/i.test(value)) return "2G";
  if (/umts|utran|3g/i.test(value)) return "3G";
  if (/nr|5g|gnb/i.test(value)) return "5G";
  if (/lte|4g|enodeb|eps/i.test(value)) return "LTE";
  return value && value !== "Unknown" ? value : "Unknown";
}

function inferSeverity(item, procedureResult) {
  const explicit = String(item.severity || "").toUpperCase();
  const text = textOf(item);
  if (["ERROR", "FATAL", "FAILURE"].includes(explicit) || FAILURE_RE.test(text)) return "failure";
  if (procedureResult === "Success" || SUCCESS_RE.test(text)) return "success";
  if (["WARN", "WARNING"].includes(explicit) || WARNING_RE.test(text)) return "warning";
  if (REQUEST_RE.test(text)) return "request";
  return "neutral";
}

function callMembership(calls = []) {
  const byItem = new Map();
  calls.forEach((call) => call.events?.forEach((item) => byItem.set(item.id, call.id)));
  return byItem;
}

function enrichedItems(analysis) {
  const byId = new Map();
  analysis?.procedures?.forEach((procedure) => {
    procedure.items.forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, { item, procedure });
    });
  });
  return byId;
}

export function buildUnifiedSignalingRows(timeline = [], calls = [], analysis = null) {
  const membership = callMembership(calls);
  const enrichment = enrichedItems(analysis);
  const handoverEvaluation = evaluateL3HandoverTimeline(timeline);

  return timeline.map((base, index) => {
    const match = enrichment.get(base.id);
    const item = match?.item || base;
    const procedure = match?.procedure;
    const text = textOf(item);
    const capabilityOnly = /applyLocalCallCapabilities|applyRemoteCallCapabilities|CALL_CAPS_LOCAL|CALL_CAPS_REMOTE/i.test(text);
    const handoverOutcome = handoverEvaluation.byId.get(base.id)
      || handoverEvaluation.byIndex.get(index)
      || null;
    let milestone = handoverOutcome
      ? { label: handoverOutcome.label, severity: handoverOutcome.severity }
      : MILESTONE_RULES.find((rule) => rule.test.test(text)) || null;
    if (milestone?.label === "CONNECTED" && capabilityOnly) milestone = null;
    const call = calls.find((entry) => entry.id === (item.callId || membership.get(base.id))) || null;
    if (/\bCALL_DISCONNECTED\b/i.test(text) && call?.status === "Dropped") {
      milestone = { label: "DROPPED", severity: "failure" };
    } else if (/\bCALL_DISCONNECTED\b/i.test(text) && call?.status === "Not Connected") {
      milestone = { label: "NOT CONNECTED", severity: "warning" };
    }
    const directionKnown = Boolean(item.directionKnown && item.from && item.to && item.from !== "Event" && item.to !== "Timeline");
    const protocol = item.protocol || base.sourceCategory || base.category || "Unknown";
    const technology = normalizeTechnology(procedure?.technology || item.technology || protocol || text);
    const severity = milestone?.severity || inferSeverity(item, procedure?.result);

    return {
      ...base,
      id: base.id,
      rowNumber: index + 1,
      sourceType: base.type,
      sim: inferSim(base),
      technology,
      interface: detailValue(base, "Interface") || base.sourceCategory || protocol,
      sourceNode: directionKnown ? item.from : null,
      destinationNode: directionKnown ? item.to : null,
      direction: directionKnown ? `${item.from} → ${item.to}` : "—",
      directionKnown,
      message: milestone?.label || item.officialName || base.title || base.eventKey || "Log row",
      procedure: item.procedureName || procedure?.name || base.category || "Observed row",
      protocol,
      result: severity === "failure" ? "Failure" : severity === "success" ? "Success" : procedure?.result || "Observed",
      severity,
      callId: item.callId || membership.get(base.id) || null,
      milestone: milestone?.label || null,
      handoverClassification: handoverOutcome?.classification || null,
      handoverType: handoverOutcome?.handoverType || null,
      handoverEvaluationReason: handoverOutcome?.reason || null,
      rawMessage: base.rawMessage,
      metadata: base.metadata || {},
    };
  });
}
