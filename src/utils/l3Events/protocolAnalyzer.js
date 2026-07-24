import { analyzeCalls } from "./CallAnalyzer.js";
import { formatTimelineTimestamp } from "./timelineBuilder.js";

const PROCEDURE_GAP_MS = 30000;
const EVENT_CORRELATION_MS = 1500;

const SPEC = {
  lteRrc: "3GPP TS 36.331",
  nrRrc: "3GPP TS 38.331",
  epsNas: "3GPP TS 24.301",
  nrNas: "3GPP TS 24.501",
  ims: "3GPP TS 24.229",
  eps: "3GPP TS 23.401",
};

const COLOR_BY_PROTOCOL = {
  "LTE RRC": "blue",
  "NR RRC": "purple",
  NAS: "green",
  IMS: "orange",
  Event: "gray",
};

const PROCEDURE_LIBRARY = [
  {
    procedureName: "Paging Procedure",
    messageName: "Paging",
    test: /\bpaging\b/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "5.3.2",
  },
  {
    procedureName: "RRC Connection Establishment",
    messageName: "RRCConnectionRequest",
    test: /rrc\W*connection\W*request/i,
    protocol: "LTE RRC",
    from: "UE",
    to: "eNodeB",
    spec: SPEC.lteRrc,
    section: "5.3.3",
    startsNew: true,
  },
  {
    procedureName: "RRC Connection Establishment",
    messageName: "RRCConnectionSetup",
    test: /rrc\W*connection\W*setup(?!\W*complete)/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "5.3.3",
  },
  {
    procedureName: "RRC Connection Establishment",
    messageName: "RRCConnectionSetupComplete",
    test: /rrc\W*connection\W*setup\W*complete/i,
    protocol: "LTE RRC",
    from: "UE",
    to: "eNodeB",
    spec: SPEC.lteRrc,
    section: "5.3.3",
    success: true,
  },
  {
    procedureName: "Initial NAS Message",
    messageName: "InitialUEMessage",
    test: /initial\W*ue\W*message|initial\W*nas\W*message/i,
    protocol: "NAS",
    from: "eNodeB",
    to: "MME",
    spec: SPEC.eps,
    section: "5.3.2",
  },
  {
    procedureName: "Security Mode Control",
    messageName: "SecurityModeCommand",
    test: /security\W*mode\W*command/i,
    protocol: "NAS",
    from: "MME",
    to: "UE",
    spec: SPEC.epsNas,
    section: "5.4.3",
    startsNew: true,
  },
  {
    procedureName: "Security Mode Control",
    messageName: "SecurityModeComplete",
    test: /security\W*mode\W*complete/i,
    protocol: "NAS",
    from: "UE",
    to: "MME",
    spec: SPEC.epsNas,
    section: "5.4.3",
    success: true,
  },
  {
    procedureName: "Authentication",
    messageName: "AuthenticationRequest",
    test: /authentication\W*request/i,
    protocol: "NAS",
    from: "MME",
    to: "UE",
    spec: SPEC.epsNas,
    section: "5.4.2",
    startsNew: true,
  },
  {
    procedureName: "Authentication",
    messageName: "AuthenticationResponse",
    test: /authentication\W*response/i,
    protocol: "NAS",
    from: "UE",
    to: "MME",
    spec: SPEC.epsNas,
    section: "5.4.2",
    success: true,
  },
  {
    procedureName: "Attach",
    messageName: "AttachRequest",
    test: /attach\W*request/i,
    protocol: "NAS",
    from: "UE",
    to: "MME",
    spec: SPEC.epsNas,
    section: "5.5.1",
    startsNew: true,
  },
  {
    procedureName: "Attach",
    messageName: "AttachAccept",
    test: /attach\W*accept/i,
    protocol: "NAS",
    from: "MME",
    to: "UE",
    spec: SPEC.epsNas,
    section: "5.5.1",
  },
  {
    procedureName: "Attach",
    messageName: "AttachComplete",
    test: /attach\W*complete/i,
    protocol: "NAS",
    from: "UE",
    to: "MME",
    spec: SPEC.epsNas,
    section: "5.5.1",
    success: true,
  },
  {
    procedureName: "Registration",
    messageName: "RegistrationRequest",
    test: /registration\W*request/i,
    protocol: "NAS",
    from: "UE",
    to: "AMF",
    spec: SPEC.nrNas,
    section: "5.5.1",
    startsNew: true,
  },
  {
    procedureName: "Registration",
    messageName: "RegistrationAccept",
    test: /registration\W*accept/i,
    protocol: "NAS",
    from: "AMF",
    to: "UE",
    spec: SPEC.nrNas,
    section: "5.5.1",
  },
  {
    procedureName: "Tracking Area Update",
    messageName: "TrackingAreaUpdateRequest",
    test: /tracking\W*area\W*update\W*request|tau\W*request/i,
    protocol: "NAS",
    from: "UE",
    to: "MME",
    spec: SPEC.epsNas,
    section: "5.5.3",
    startsNew: true,
  },
  {
    procedureName: "Service Request",
    messageName: "ServiceRequest",
    test: /service\W*request/i,
    protocol: "NAS",
    from: "UE",
    to: "MME",
    spec: SPEC.epsNas,
    section: "5.6.1",
    startsNew: true,
  },
  {
    procedureName: "UE Capability Transfer",
    messageName: "UECapabilityEnquiry",
    test: /ue\W*capability\W*enquiry/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "5.6.3",
    startsNew: true,
  },
  {
    procedureName: "UE Capability Transfer",
    messageName: "UECapabilityInformation",
    test: /ue\W*capability\W*information/i,
    protocol: "LTE RRC",
    from: "UE",
    to: "eNodeB",
    spec: SPEC.lteRrc,
    section: "5.6.3",
    success: true,
  },
  {
    procedureName: "Measurement Reporting",
    messageName: "MeasurementReport",
    test: /measurement\W*report|meas\W*report/i,
    protocol: "LTE RRC",
    from: "UE",
    to: "eNodeB",
    spec: SPEC.lteRrc,
    section: "5.5.5",
  },
  {
    procedureName: "RRC Reconfiguration",
    messageName: "RRCConnectionReconfiguration",
    test: /rrc\W*connection\W*reconfiguration(?!\W*complete)/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "5.3.5",
    startsNew: true,
  },
  {
    procedureName: "RRC Reconfiguration",
    messageName: "RRCConnectionReconfigurationComplete",
    test: /rrc\W*connection\W*reconfiguration\W*complete/i,
    protocol: "LTE RRC",
    from: "UE",
    to: "eNodeB",
    spec: SPEC.lteRrc,
    section: "5.3.5",
    success: true,
  },
  {
    procedureName: "RRC Resume",
    messageName: "RRCResumeRequest",
    test: /rrc\W*resume\W*request/i,
    protocol: "NR RRC",
    from: "UE",
    to: "gNB",
    spec: SPEC.nrRrc,
    section: "5.3.13",
    startsNew: true,
  },
  {
    procedureName: "RRC Release",
    messageName: "RRCConnectionRelease",
    test: /rrc\W*(connection\W*)?release/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "5.3.8",
    startsNew: true,
    success: true,
  },
  {
    procedureName: "MIB/SIB Broadcast",
    messageName: "MasterInformationBlock",
    test: /master\W*information\W*block|\bmib\b/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "6.2.2",
  },
  {
    procedureName: "MIB/SIB Broadcast",
    messageName: "SystemInformationBlockType1",
    test: /system\W*information\W*block\W*type\W*1|\bsib1\b/i,
    protocol: "LTE RRC",
    from: "eNodeB",
    to: "UE",
    spec: SPEC.lteRrc,
    section: "6.2.2",
  },
  {
    procedureName: "IMS Registration",
    messageName: "SIP REGISTER",
    test: /\bsip\b.*\bregister\b|\bims\b.*\bregistered\b/i,
    protocol: "IMS",
    from: "UE",
    to: "IMS",
    spec: SPEC.ims,
    section: "5.1",
    startsNew: true,
    success: true,
    callSignaling: true,
  },
  {
    procedureName: "VoLTE MO Call",
    messageName: "SIP INVITE",
    test: /\bsip\b.*\binvite\b|call\W*dial|call_dial|ims_call_dial|ims_dial/i,
    protocol: "IMS",
    from: "UE",
    to: "IMS",
    spec: SPEC.ims,
    section: "5.1.2A",
    startsNew: true,
    callSignaling: true,
  },
  {
    procedureName: "VoLTE MT Call",
    messageName: "SIP INVITE",
    test: /\bincoming\b|\bring(?:ing)?\b|mt\W*call|mobile\W*terminated/i,
    protocol: "IMS",
    from: "IMS",
    to: "UE",
    spec: SPEC.ims,
    section: "5.1.2A",
    startsNew: true,
    callSignaling: true,
  },
  {
    procedureName: "Call Release",
    messageName: "SIP BYE",
    test: /\bsip\b.*\bbye\b|call\W*disconnect|call_disconnected|disconnect\W*cause/i,
    protocol: "IMS",
    from: "UE",
    to: "IMS",
    spec: SPEC.ims,
    section: "5.1.3",
    callSignaling: true,
    success: true,
  },
  {
    procedureName: "Connected Mode Mobility",
    messageName: "HandoverEvent",
    test: /handover|cell\W*change|mobility/i,
    protocol: "Event",
    from: "UE",
    to: "eNodeB",
    spec: SPEC.lteRrc,
    section: "5.3.5",
    startsNew: true,
  },
  {
    procedureName: "EN-DC Addition",
    messageName: "ENDCAddition",
    test: /endc|secondary\W*cell|scg|pscell/i,
    protocol: "NR RRC",
    from: "eNodeB",
    to: "gNB",
    spec: SPEC.nrRrc,
    section: "5.3.5",
    startsNew: true,
  },
];

const FAILURE_RE = /\b(fail(?:ed|ure)?|reject(?:ed)?|timeout|error|rlf|dropped|abort)\b/i;
const SUCCESS_RE = /\b(complete|accept|success|connected|registered|active)\b/i;

function timeMs(item) {
  return item?.timestamp instanceof Date ? item.timestamp.getTime() : null;
}

function sortTimeline(timeline = []) {
  return timeline
    .map((item, order) => ({ ...item, __analysisOrder: order }))
    .sort((left, right) => {
      const leftMs = timeMs(left);
      const rightMs = timeMs(right);
      if (leftMs === null && rightMs === null) return left.__analysisOrder - right.__analysisOrder;
      if (leftMs === null) return 1;
      if (rightMs === null) return -1;
      if (leftMs !== rightMs) return leftMs - rightMs;
      return left.__analysisOrder - right.__analysisOrder;
    });
}

function rowText(item = {}) {
  return [
    item.title,
    item.summary,
    item.category,
    item.domain,
    item.rawMessage,
    item.eventKey,
    item.type,
    item.sourceFile,
  ].filter(Boolean).join(" ");
}

function inferProtocol(item, definition) {
  if (definition?.protocol) return definition.protocol;
  const text = rowText(item);
  if (/nr|5g|38\.331/i.test(text)) return "NR RRC";
  if (/nas|attach|registration|authentication|security/i.test(text)) return "NAS";
  if (/ims|sip|volte|vonr|call/i.test(text)) return "IMS";
  if (item?.type === "event") return "Event";
  return "LTE RRC";
}

function inferTechnology(item, protocol) {
  const text = rowText(item);
  if (/nr|5g|gnb|38\.331|vonr/i.test(text) || protocol === "NR RRC") return "NR";
  if (/ims|sip|volte/i.test(text)) return "IMS";
  if (/lte|4g|enodeb|36\.331|36\.413/i.test(text) || protocol === "LTE RRC") return "LTE";
  return protocol === "NAS" ? "LTE/NR" : "Unknown";
}

function findDefinition(item) {
  const text = rowText(item);
  return PROCEDURE_LIBRARY.find((definition) => definition.test.test(text)) || null;
}

function detailValue(item, label) {
  const found = item?.details?.find((detail) => detail.label === label);
  return found?.value || "";
}

function extractRegex(text, regex) {
  const match = text.match(regex);
  return match ? match[1] : "";
}

function extractCellContext(items = []) {
  const text = items.map(rowText).join(" ");
  return {
    servingCell: detailValueFromItems(items, "Cell Identity") || extractRegex(text, /\b(?:cell(?:\s*identity)?|ci|cellid|cell_id)\s*[:=]\s*([A-Za-z0-9-]+)/i),
    targetCell: extractRegex(text, /\btarget(?:\s*cell)?\s*[:=]\s*([A-Za-z0-9-]+)/i),
    pci: detailValueFromItems(items, "Serving PCI") || detailValueFromItems(items, "PCI") || extractRegex(text, /\bpci\s*[:=]\s*(\d+)/i),
    earfcn: extractRegex(text, /\b(?:earfcn|arfcn|nrarfcn)\s*[:=]\s*(\d+)/i),
    band: extractRegex(text, /\bband\s*[:=]\s*([A-Za-z0-9-]+)/i),
    tac: extractRegex(text, /\b(?:tac|tracking\s*area\s*code)\s*[:=]\s*([A-Za-z0-9-]+)/i),
    plmn: extractRegex(text, /\bplmn\s*[:=]\s*([A-Za-z0-9-]+)/i),
    bandwidth: extractRegex(text, /\bbandwidth\s*[:=]\s*([A-Za-z0-9. -]+)/i),
  };
}

function detailValueFromItems(items, label) {
  for (const item of items) {
    const value = detailValue(item, label);
    if (value) return value;
  }
  return "";
}

function formatDuration(durationMs) {
  if (durationMs === null || durationMs === undefined) return "0 ms";
  if (durationMs < 1000) return `${Math.max(0, durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

function formatRelativeMs(itemMs, startMs) {
  if (itemMs === null || startMs === null) return "";
  return `+${Math.max(0, itemMs - startMs)} ms`;
}

function createProcedure(definition, item, idNumber, callId) {
  const protocol = inferProtocol(item, definition);
  return {
    id: `P-${String(idNumber).padStart(3, "0")}`,
    callId: callId || null,
    name: definition.procedureName,
    protocol,
    technology: inferTechnology(item, protocol),
    spec: definition.spec,
    section: definition.section,
    result: "Ongoing",
    items: [],
    startTime: item.timestamp || null,
    endTime: item.timestamp || null,
    durationMs: 0,
    servingCell: "",
    targetCell: "",
    pci: "",
    earfcn: "",
    band: "",
    tac: "",
    plmn: "",
    bandwidth: "",
    color: COLOR_BY_PROTOCOL[protocol] || "blue",
  };
}

function enrichItem(item, definition, procedure, startMs, callId) {
  const itemMs = timeMs(item);
  const protocol = inferProtocol(item, definition);
  const direction = definition?.from && definition?.to ? `${definition.from} -> ${definition.to}` : "Correlated event";
  const messageName = definition?.messageName || item.title || "CorrelatedEvent";

  return {
    ...item,
    procedureId: procedure.id,
    procedureName: procedure.name,
    callId: callId || procedure.callId || null,
    officialName: messageName,
    absoluteTimestamp: item.timestamp ? formatTimelineTimestamp(item.timestamp) : item.timestampLabel,
    relativeTime: formatRelativeMs(itemMs, startMs),
    relativeMs: itemMs !== null && startMs !== null ? Math.max(0, itemMs - startMs) : null,
    protocol,
    direction,
    from: definition?.from || "Event",
    to: definition?.to || "Timeline",
    spec: definition?.spec || procedure.spec,
    section: definition?.section || procedure.section,
    color: COLOR_BY_PROTOCOL[protocol] || "gray",
  };
}

function updateProcedureResult(procedure, definition, item) {
  const text = rowText(item);
  if (definition?.success || SUCCESS_RE.test(text)) {
    procedure.result = "Success";
  }
  if (FAILURE_RE.test(text)) {
    procedure.result = "Failure";
  }
}

function finalizeProcedure(procedure) {
  if (!procedure) return procedure;
  const times = procedure.items.map(timeMs).filter((value) => value !== null);
  const startMs = times.length ? Math.min(...times) : timeMs(procedure);
  const endMs = times.length ? Math.max(...times) : startMs;
  procedure.startTime = times.length ? new Date(startMs) : procedure.startTime;
  procedure.endTime = times.length ? new Date(endMs) : procedure.endTime;
  procedure.durationMs = startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : 0;

  const cell = extractCellContext(procedure.items);
  Object.assign(procedure, cell);

  procedure.items = procedure.items.map((item) => ({
    ...item,
    relativeTime: formatRelativeMs(timeMs(item), startMs),
    relativeMs: timeMs(item) !== null && startMs !== null ? Math.max(0, timeMs(item) - startMs) : item.relativeMs,
  }));

  if (procedure.result === "Ongoing" && procedure.items.some((item) => item.type === "event")) {
    procedure.result = "Observed";
  }

  return procedure;
}

function activeProcedureKey(definition, callId) {
  return `${definition.procedureName}::${callId || "no-call"}`;
}

function shouldContinue(procedure, item, definition) {
  if (!procedure) return false;
  if (definition.startsNew && procedure.items.length > 0 && procedure.result !== "Ongoing") return false;
  const previousMs = timeMs(procedure.items[procedure.items.length - 1]);
  const currentMs = timeMs(item);
  if (previousMs === null || currentMs === null) return true;
  return currentMs - previousMs <= PROCEDURE_GAP_MS;
}

function buildCallMembership(timeline) {
  const calls = analyzeCalls(timeline);
  const byEventId = new Map();
  const byWindow = [];

  calls.forEach((call, index) => {
    const callId = `Call-${String(index + 1).padStart(3, "0")}`;
    call.events?.forEach((event) => byEventId.set(event.id, callId));
    byWindow.push({
      callId,
      startMs: call.startTime instanceof Date ? call.startTime.getTime() : null,
      endMs: call.endTime instanceof Date ? call.endTime.getTime() : call.startTime instanceof Date ? call.startTime.getTime() : null,
    });
  });

  return { calls, byEventId, byWindow };
}

function findCallId(item, definition, membership) {
  if (!definition?.callSignaling) return null;
  if (membership.byEventId.has(item.id)) return membership.byEventId.get(item.id);

  const itemMs = timeMs(item);
  if (itemMs === null) return null;

  const match = membership.byWindow.find((call) => (
    call.startMs !== null &&
    call.endMs !== null &&
    itemMs >= call.startMs &&
    itemMs <= call.endMs
  ));
  return match?.callId || null;
}

function correlateOrphanEvents(procedures, eventItems, assignedIds) {
  for (const eventItem of eventItems) {
    const eventMs = timeMs(eventItem);
    if (eventMs === null || assignedIds.has(eventItem.id)) continue;

    let best = null;
    let bestDistance = Infinity;
    for (const procedure of procedures) {
      const startMs = procedure.startTime instanceof Date ? procedure.startTime.getTime() : null;
      const endMs = procedure.endTime instanceof Date ? procedure.endTime.getTime() : startMs;
      if (startMs === null || endMs === null) continue;
      const distance = eventMs < startMs ? startMs - eventMs : eventMs > endMs ? eventMs - endMs : 0;
      if (distance <= EVENT_CORRELATION_MS && distance < bestDistance) {
        best = procedure;
        bestDistance = distance;
      }
    }

    if (!best) continue;
    const startMs = best.startTime instanceof Date ? best.startTime.getTime() : null;
    best.items.push(enrichItem(eventItem, {
      messageName: eventItem.title || "CorrelatedEvent",
      procedureName: best.name,
      protocol: "Event",
      from: "Event",
      to: "Timeline",
      spec: best.spec,
      section: best.section,
    }, best, startMs, best.callId));
  }
}

function buildStates(procedures) {
  let rrc = "RRC_IDLE";
  let nas = "NAS Deregistered";
  let ims = "IMS Unregistered";
  let call = "Call Idle";
  const states = [];

  const items = procedures.flatMap((procedure) => procedure.items).sort((left, right) => (timeMs(left) ?? 0) - (timeMs(right) ?? 0));

  for (const item of items) {
    const text = rowText(item);
    if (/RRCConnectionSetupComplete|RRCConnectionReconfigurationComplete/i.test(item.officialName || text)) rrc = "RRC_CONNECTED";
    if (/RRCConnectionRelease|RRCRelease/i.test(item.officialName || text)) rrc = "RRC_IDLE";
    if (/RRCResume/i.test(item.officialName || text)) rrc = "RRC_INACTIVE";
    if (/AttachAccept|RegistrationAccept|registered/i.test(item.officialName || text)) nas = "NAS Registered";
    if (/detach|deregister/i.test(text)) nas = "NAS Deregistered";
    if (/SIP REGISTER|IMS Registered/i.test(item.officialName || text)) ims = "IMS Registered";
    if (/IMS.*unregister|deregister/i.test(text)) ims = "IMS Unregistered";
    if (/SIP INVITE|CALL_ACTIVE|Call Active/i.test(item.officialName || text)) call = "Call Active";
    if (/SIP BYE|CALL_DISCONNECTED|Call Release/i.test(item.officialName || text)) call = "Call Released";

    states.push({
      at: item.absoluteTimestamp,
      procedureId: item.procedureId,
      rrc,
      nas,
      ims,
      call,
    });
  }

  return states.at(-1) || { at: "", procedureId: "", rrc, nas, ims, call };
}

function collectColumns(procedures) {
  const columns = ["UE"];
  const seen = new Set(columns);
  procedures.forEach((procedure) => {
    procedure.items.forEach((item) => {
      [item.from, item.to].forEach((node) => {
        if (!node || node === "Timeline" || node === "Event" || seen.has(node)) return;
        seen.add(node);
        columns.push(node);
      });
    });
  });

  ["eNodeB", "MME", "IMS", "gNB", "AMF"].forEach((node) => {
    if (seen.has(node) && !columns.includes(node)) columns.push(node);
  });
  return columns;
}

export function buildProtocolAnalysis(timeline = []) {
  const ordered = sortTimeline(timeline);
  const membership = buildCallMembership(ordered);
  const procedures = [];
  const activeByKey = new Map();
  const assignedIds = new Set();
  let procedureCounter = 0;

  for (const item of ordered) {
    const definition = findDefinition(item);
    if (!definition) continue;

    const callId = findCallId(item, definition, membership);
    const key = activeProcedureKey(definition, callId);
    let procedure = activeByKey.get(key);

    if (!shouldContinue(procedure, item, definition)) {
      procedureCounter += 1;
      procedure = createProcedure(definition, item, procedureCounter, callId);
      activeByKey.set(key, procedure);
      procedures.push(procedure);
    }

    if (callId && !procedure.callId) procedure.callId = callId;
    const startMs = procedure.startTime instanceof Date ? procedure.startTime.getTime() : timeMs(item);
    procedure.items.push(enrichItem(item, definition, procedure, startMs, callId));
    assignedIds.add(item.id);
    procedure.endTime = item.timestamp || procedure.endTime;
    procedure.technology = inferTechnology(item, procedure.protocol);
    updateProcedureResult(procedure, definition, item);
  }

  procedures.forEach(finalizeProcedure);
  correlateOrphanEvents(procedures, ordered.filter((item) => item.type === "event"), assignedIds);
  procedures.forEach(finalizeProcedure);

  return {
    procedures,
    calls: membership.calls,
    columns: collectColumns(procedures),
    states: buildStates(procedures),
    stats: {
      totalProcedures: procedures.length,
      callProcedures: procedures.filter((procedure) => procedure.callId).length,
      failures: procedures.filter((procedure) => procedure.result === "Failure").length,
      technologies: Array.from(new Set(procedures.map((procedure) => procedure.technology))).filter(Boolean),
    },
    formatDuration,
  };
}

export { COLOR_BY_PROTOCOL };
