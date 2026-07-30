import { getDisconnectCauseInfo } from "./disconnectCauseMapper.js";

const IMS_FAILURE_RE = /\b(ims|sip)\b.*\b(fail|error|timeout|unreachable|blocked|deregister|forbidden)\b|\b403\b|\b404\b|\b480\b|\b486\b|\b500\b|\b503\b/i;
const RADIO_FAILURE_RE = /\b(radio link failure|rlf|rrc release|reestablishment reject|re[- ]?establishment failure|lost signal|out of service|power off|emergency only|access blocked|unexpected rrc release)\b/i;
const HANDOVER_FAILURE_RE = /\b(hand(?: |-)?over|ho)\b.*\b(fail|failure|reject|drop|timeout)\b/i;
const REJECTED_RE = /\b(reject|decline|answered elsewhere)\b/i;
const BUSY_RE = /\bbusy\b/i;
const SIP_CANCEL_RE = /\bSIP\b.*\bCANCEL\b|\b487\b.*\bRequest Terminated\b/i;
const SIP_NOT_CONNECTED_RE = /\b(408|480|486)\b|\bRequest Timeout\b|\bTemporarily Unavailable\b|\bBusy Here\b/i;
const WEAK_CONNECTED_EVIDENCE_LABELS = new Set([
  "IMS profile transitioned to callType=3",
]);
const DEVICE_PROFILE_CAUSE_CODES = new Set([2, 3, 4]);

function findSignalHints(events = []) {
  let hasImsFailure = false;
  let hasRadioFailure = false;
  let hasHandoverFailure = false;

  for (const item of events) {
    const text = `${item?.category || ""} ${item?.title || ""} ${item?.summary || ""} ${item?.rawMessage || ""}`;
    if (!hasImsFailure && IMS_FAILURE_RE.test(text)) hasImsFailure = true;
    if (!hasRadioFailure && RADIO_FAILURE_RE.test(text)) hasRadioFailure = true;
    if (!hasHandoverFailure && HANDOVER_FAILURE_RE.test(text)) hasHandoverFailure = true;
  }

  return { hasImsFailure, hasRadioFailure, hasHandoverFailure };
}

function pickPrimaryCause(causeCodes = []) {
  if (!causeCodes.length) {
    return getDisconnectCauseInfo(null);
  }

  const lastCode = causeCodes[causeCodes.length - 1];
  return getDisconnectCauseInfo(lastCode);
}

function mostSpecificReleaseReason(session, primaryCause, signalHints) {
  if (primaryCause.classification !== "UNKNOWN") return primaryCause.description;
  if (signalHints.hasHandoverFailure) return "Handover Failure";
  if (signalHints.hasRadioFailure) return "Radio Failure";
  if (signalHints.hasImsFailure) return "IMS Failure";
  const l3ReleaseReason = session.l3Analysis?.releaseReason;
  if (l3ReleaseReason) return l3ReleaseReason;
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
  if (DEVICE_PROFILE_CAUSE_CODES.has(primaryCause.code)) return "Dropped";
  if (signalHints.hasImsFailure || primaryCause.status === "IMS Failure") return "IMS Failure";
  return "Dropped";
}

function hasOnlyWeakConnectionEvidence(session) {
  const evidence = session.connectedEvidence || [];
  if (!evidence.length) return false;
  return evidence.every((entry) => WEAK_CONNECTED_EVIDENCE_LABELS.has(entry.label));
}

function canTreatCompletedCauseAsConnected(session, primaryCause, signalHints) {
  if (primaryCause.classification !== "COMPLETED") return false;
  if (signalHints.hasHandoverFailure || signalHints.hasImsFailure || signalHints.hasRadioFailure) return false;
  if (SIP_CANCEL_RE.test(session.rawDisconnectReasons.join(" "))) return false;
  return Boolean(session.alertingTime || session.dialingTime || session.talkTimeMs > 0 || session.totalDurationMs > 0);
}

export function classifyCall(session) {
  const signalHints = findSignalHints(session.events);
  const primaryCause = pickPrimaryCause(session.disconnectCauseHistory);
  const weakOnlyConnected = hasOnlyWeakConnectionEvidence(session);
  const connectedByEvidence = session.connectedTime instanceof Date;
  const connectedByCompletedCause = !connectedByEvidence && canTreatCompletedCauseAsConnected(session, primaryCause, signalHints);
  const connected = connectedByEvidence || connectedByCompletedCause;
  const disconnected = session.hasDisconnectEvent || session.disconnectTime instanceof Date || session.idleTime instanceof Date;
  const normalRelease = Boolean(session.l3Analysis?.normalReleaseConfirmed) || primaryCause.classification === "COMPLETED";
  const abnormalRelease = Boolean(session.l3Analysis?.abnormalReleaseConfirmed) || primaryCause.classification === "DROPPED";

  let status = "Not Connected";
  let detailedStatus = "Unknown";

  if (!disconnected) {
    status = connected ? "Dropped" : "Not Connected";
    detailedStatus = connected ? "Ongoing" : "Unknown";
  } else if (primaryCause.classification === "NOT_CONNECTED" && (!session.l3Analysis?.connectedConfirmed || weakOnlyConnected)) {
    status = "Not Connected";
    detailedStatus = inferNotConnectedDetail(session, primaryCause, signalHints);
  } else if (primaryCause.classification === "DROPPED") {
    if (connected) {
      status = "Dropped";
      detailedStatus = inferDroppedDetail(session, primaryCause, signalHints);
    } else {
      status = "Not Connected";
      detailedStatus = inferNotConnectedDetail(session, primaryCause, signalHints);
    }
  } else if (primaryCause.classification === "COMPLETED") {
    status = "Connected";
    detailedStatus = "Completed";
  } else if (!connected) {
    status = "Not Connected";
    detailedStatus = inferNotConnectedDetail(session, primaryCause, signalHints);
  } else if (normalRelease && !abnormalRelease) {
    status = "Connected";
    detailedStatus = "Completed";
  } else if (signalHints.hasHandoverFailure || signalHints.hasImsFailure || signalHints.hasRadioFailure || abnormalRelease) {
    status = "Dropped";
    detailedStatus = inferDroppedDetail(session, primaryCause, signalHints);
  } else {
    status = "Connected";
    detailedStatus = "Completed";
  }

  return {
    ...signalHints,
    status,
    detailedStatus,
    classification:
      status === "Connected" ? "COMPLETED" : status === "Dropped" ? "DROPPED" : "NOT_CONNECTED",
    causeCode: primaryCause.code,
    causeName: primaryCause.name,
    disconnectReason: mostSpecificReleaseReason(session, primaryCause, signalHints),
    disconnectClassification: primaryCause.classification,
    connectedEvidence: session.connectedEvidence || [],
    releaseEvidence: session.releaseEvidence || [],
  };
}
