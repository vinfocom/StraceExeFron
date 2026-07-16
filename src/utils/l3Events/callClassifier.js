import { getDisconnectCauseInfo } from "./disconnectCauseMapper.js";

const MIN_TALK_TIME_MS = 1000;

const IMS_FAILURE_RE = /\b(ims|sip)\b.*\b(fail|error|timeout|unreachable|blocked|deregister|forbidden)\b|\b403\b|\b404\b|\b480\b|\b486\b|\b500\b|\b503\b/i;
const RADIO_FAILURE_RE = /\b(radio link failure|rlf|rrc release|reestablishment reject|lost signal|out of service|power off|emergency only|access blocked)\b/i;
const HANDOVER_FAILURE_RE = /\b(hand(?: |-)?over|ho)\b.*\b(fail|failure|reject|drop|timeout)\b/i;
const REJECTED_RE = /\b(reject|decline|answered elsewhere)\b/i;

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

export function classifyCall(session) {
  const signalHints = findSignalHints(session.events);
  const primaryCause = pickPrimaryCause(session.disconnectCauseHistory);
  const talkTimeMs = session.talkTimeMs || 0;
  const hasStableTalkTime = talkTimeMs >= MIN_TALK_TIME_MS;
  const hadAnswer = session.answerTime instanceof Date;
  const hasAbnormalCause = primaryCause.code !== null && !primaryCause.isNormal;

  let status = "Not Connected";
  if (hadAnswer) {
    status = !hasStableTalkTime || hasAbnormalCause ? "Dropped" : "Connected";
  }

  let detailedStatus = status;
  if (!session.hasDisconnectEvent) {
    detailedStatus = hadAnswer ? "Ongoing" : "Unknown";
  } else if (!hadAnswer) {
    if (signalHints.hasHandoverFailure) detailedStatus = "Handover Failure";
    else if (signalHints.hasImsFailure || primaryCause.status === "IMS Failure") detailedStatus = "IMS Failure";
    else if (signalHints.hasRadioFailure || primaryCause.status === "Radio Failure") detailedStatus = "Radio Failure";
    else if (primaryCause.status === "Busy") detailedStatus = "Busy";
    else if (primaryCause.status === "Rejected" || REJECTED_RE.test(session.rawDisconnectReasons.join(" "))) detailedStatus = "Rejected";
    else if (primaryCause.status === "User Cancelled") detailedStatus = "User Cancelled";
    else if (primaryCause.status === "Call Setup Failure") detailedStatus = "Call Setup Failure";
  } else if (status === "Dropped") {
    if (signalHints.hasHandoverFailure) detailedStatus = "Handover Failure";
    else if (signalHints.hasImsFailure || primaryCause.status === "IMS Failure") detailedStatus = "IMS Failure";
    else if (signalHints.hasRadioFailure || primaryCause.status === "Radio Failure") detailedStatus = "Radio Failure";
    else if (!hasStableTalkTime) detailedStatus = "Call Setup Failure";
  }

  return {
    ...signalHints,
    status,
    detailedStatus,
    causeCode: primaryCause.code,
    causeName: primaryCause.name,
    disconnectReason: session.rawDisconnectReasons.at(-1) || primaryCause.description,
  };
}
