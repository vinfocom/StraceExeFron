import { getDisconnectCauseInfo } from "./disconnectCauseMapper.js";

const IMS_FAILURE_RE = /\b(ims|sip)\b.{0,160}\b(fail|failure|error|timeout|unreachable|blocked|deregister|forbidden|cancel|403|404|408|480|486|500|503)\b|\bims registration (?:lost|failed)\b/i;
const RADIO_FAILURE_RE = /\b(radio link failure|rlf|reestablishment reject|re[- ]?establishment failure|lost signal|out of service|power off|emergency only|access blocked|unexpected rrc release|scgfail|scg failure)\b/i;
const HANDOVER_FAILURE_RE = /\b(hand(?: |-)?over|ho)\b.*\b(fail|failure|reject|drop|timeout)\b/i;
const BEARER_FAILURE_RE = /\b(voice bearer|bearer|media|rtp|qos flow)\b.*\b(loss|lost|fail|failure|released unexpectedly)\b/i;
const REJECTED_RE = /\b(reject|decline|answered elsewhere)\b/i;
const BUSY_RE = /\bbusy\b/i;
const SIP_CANCEL_RE = /\bSIP\b.*\bCANCEL\b|\b487\b.*\bRequest Terminated\b/i;
const SIP_NOT_CONNECTED_RE = /\b(408|480|486)\b|\bRequest Timeout\b|\bTemporarily Unavailable\b|\bBusy Here\b/i;
const DEVICE_PROFILE_CAUSE_CODES = new Set([2, 3, 4]);

function findSignalHints(events = [], notBefore = null, notAfter = null) {
  let hasImsFailure = false;
  let hasRadioFailure = false;
  let hasHandoverFailure = false;
  let hasBearerFailure = false;

  for (const item of events) {
    if (notBefore instanceof Date && item?.timestamp instanceof Date && item.timestamp < notBefore) continue;
    if (notAfter instanceof Date && item?.timestamp instanceof Date && item.timestamp > notAfter) continue;
    const text = `${item?.category || ""} ${item?.title || ""} ${item?.summary || ""} ${item?.rawMessage || ""}`;
    if (!hasImsFailure && IMS_FAILURE_RE.test(text)) hasImsFailure = true;
    if (!hasRadioFailure && RADIO_FAILURE_RE.test(text)) hasRadioFailure = true;
    if (!hasHandoverFailure && HANDOVER_FAILURE_RE.test(text)) hasHandoverFailure = true;
    if (!hasBearerFailure && BEARER_FAILURE_RE.test(text)) hasBearerFailure = true;
  }

  return { hasImsFailure, hasRadioFailure, hasHandoverFailure, hasBearerFailure };
}

function pickPrimaryCause(causeCodes = []) {
  if (!causeCodes.length) {
    return getDisconnectCauseInfo(null);
  }

  const lastCode = causeCodes[causeCodes.length - 1];
  return getDisconnectCauseInfo(lastCode);
}

function mostSpecificReleaseReason(session, primaryCause, signalHints) {
  if (signalHints.hasHandoverFailure) return "Handover Failure";
  if (signalHints.hasRadioFailure) return "Radio Failure";
  if (signalHints.hasImsFailure) return "IMS Failure";
  if (signalHints.hasBearerFailure) return "Bearer Failure";
  const l3ReleaseReason = session.l3Analysis?.releaseReason;
  if (!session.connectedTime && l3ReleaseReason) return l3ReleaseReason;
  return primaryCause.description;
}

function inferNotConnectedDetail(session, primaryCause, signalHints) {
  const reasonsText = session.rawDisconnectReasons.join(" ");
  const l3Text = session.l3Analysis?.supportingMessages?.map((entry) => entry.message).join(" ") || "";
  const combined = `${reasonsText} ${l3Text}`;

  if (signalHints.hasHandoverFailure) return "Handover Failure";
  if (BUSY_RE.test(combined) || primaryCause.status === "Busy") return "Busy";
  if (REJECTED_RE.test(combined) || primaryCause.status === "Rejected") return "Rejected";
  if (SIP_CANCEL_RE.test(combined) || primaryCause.status === "User Cancelled") return "User Cancelled";
  if (DEVICE_PROFILE_CAUSE_CODES.has(primaryCause.code)) return "Call Setup Failure";
  if (signalHints.hasImsFailure || primaryCause.status === "IMS Failure") return "IMS Failure";
  if (signalHints.hasRadioFailure || primaryCause.status === "Radio Failure") return "Radio Failure";
  if (SIP_NOT_CONNECTED_RE.test(combined)) return "Call Setup Failure";
  return "Call Setup Failure";
}

function inferDroppedDetail(session, primaryCause, signalHints) {
  if (signalHints.hasHandoverFailure) return "Handover Failure";
  if (signalHints.hasRadioFailure || primaryCause.status === "Radio Failure") return "Radio Failure";
  if (signalHints.hasImsFailure || primaryCause.status === "IMS Failure") return "IMS Failure";
  if (signalHints.hasBearerFailure) return "Bearer Failure";
  return "Dropped";
}

function evidenceMessages(items = []) {
  return items.map((entry) => entry.label || entry.message || entry.title || entry.rawMessage).filter(Boolean);
}

function buildEvidence(session, signalHints, status) {
  const callStarted = [];
  if (session.dialTime) callStarted.push("Dial attempt detected");
  if (session.alertingTime) callStarted.push("Alerting/ringing detected");
  if (session.direction && session.direction !== "Unknown") callStarted.push(`${session.direction} call direction`);

  const setup = [];
  if (session.l3Analysis?.inviteTime) setup.push("SIP INVITE");
  if (session.l3Analysis?.tryingTime) setup.push("SIP 100 Trying");
  if (session.l3Analysis?.progressTime) setup.push("SIP 183 Session Progress");
  if (session.l3Analysis?.ringingTime) setup.push("SIP 180 Ringing/alerting");

  const mobility = [
    ...(session.handoverAttempts || []).map(() => "Handover attempt"),
    ...(session.successfulHandovers || []).map(() => "Handover success"),
    ...(session.failedHandovers || []).map(() => "Handover failure"),
    ...(session.rrcRecoveryEvents || []).map((event) => event.type),
  ];

  return {
    callStarted,
    setup,
    connection: evidenceMessages(session.connectedEvidence),
    supportingConnection: evidenceMessages(session.connectionSupportingEvidence),
    mobility,
    termination: evidenceMessages(session.releaseEvidence),
    disconnect: session.rawDisconnectReasons || [],
    classification: [
      status === "Dropped" && "Connected call ended with unrecovered abnormal termination evidence",
      status === "Connected" && "Confirmed connected call without unrecovered abnormal termination evidence",
      status === "Not Connected" && "Call terminated before confirmed connection evidence",
      signalHints.hasRadioFailure && "Radio issue detected",
      session.radioRecovered && "Radio recovery detected",
    ].filter(Boolean),
  };
}

function confidenceFor(session, status, signalHints) {
  let score = 0.55;
  if (session.dialTime || session.alertingTime) score += 0.12;
  if (session.l3Analysis?.connectedConfirmed) score += 0.24;
  else if ((session.connectedEvidence || []).length) score += 0.18;
  if (session.hasDisconnectEvent || session.disconnectTime || session.idleTime) score += 0.12;
  if ((session.releaseEvidence || []).length) score += 0.08;
  if (session.rawDisconnectReasons?.length) score += 0.04;
  if (status === "Dropped" && (signalHints.hasRadioFailure || signalHints.hasHandoverFailure || signalHints.hasImsFailure || signalHints.hasBearerFailure)) score += 0.08;
  if (session.missingTimestamps) score -= Math.min(0.16, session.missingTimestamps * 0.03);
  if (session.wasClosedAtEof) score -= 0.08;
  return Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
}

export function classifyCall(session) {
  const signalHints = findSignalHints(session.events, null, session.endTime);
  const primaryCause = pickPrimaryCause(session.disconnectCauseHistory);
  const connected = session.connectedTime instanceof Date;
  const terminationHints = connected ? findSignalHints(session.events, session.connectedTime, session.endTime) : signalHints;
  const disconnected = session.hasDisconnectEvent || session.disconnectTime instanceof Date || session.idleTime instanceof Date;
  const abnormalRelease = terminationHints.hasHandoverFailure
    || terminationHints.hasImsFailure
    || (terminationHints.hasRadioFailure && !session.radioRecovered)
    || terminationHints.hasBearerFailure;

  let status = "Not Connected";
  let detailedStatus = "Unknown";

  if (!disconnected) {
    status = connected ? "Connected" : "Not Connected";
    detailedStatus = connected ? "Ongoing" : "Unknown";
  } else if (!connected) {
    status = "Not Connected";
    detailedStatus = inferNotConnectedDetail(session, primaryCause, signalHints);
  } else if (abnormalRelease) {
    status = "Dropped";
    detailedStatus = inferDroppedDetail(session, primaryCause, terminationHints);
  } else {
    status = "Connected";
    detailedStatus = "Completed";
  }

  const confidence = confidenceFor(session, status, connected ? terminationHints : signalHints);
  const evidence = buildEvidence(session, connected ? terminationHints : signalHints, status);

  return {
    ...signalHints,
    status,
    detailedStatus,
    callResult: status === "Connected" ? "CONNECTED" : status === "Dropped" ? "DROPPED" : "NOT_CONNECTED",
    classification:
      status === "Connected" ? "COMPLETED" : status === "Dropped" ? "DROPPED" : "NOT_CONNECTED",
    confidence,
    evidence,
    causeCode: primaryCause.code,
    causeName: primaryCause.name,
    disconnectReason: mostSpecificReleaseReason(session, primaryCause, connected ? terminationHints : signalHints),
    disconnectClassification: primaryCause.classification,
    connectedEvidence: session.connectedEvidence || [],
    connectionSupportingEvidence: session.connectionSupportingEvidence || [],
    releaseEvidence: session.releaseEvidence || [],
  };
}
