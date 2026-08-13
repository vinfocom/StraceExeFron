import { evaluateL3HandoverTimeline } from "../handoverTransitions.js";

const START_EVENT_RE = /^CALL_DIAL_INITIATED$/i;
const ACTIVE_EVENT_RE = /^CALL_ACTIVE$/i;
const END_EVENT_RE = /^CALL_DISCONNECTED$/i;
const DISCONNECT_CAUSE_EVENT_RE = /^CALL_DISCONNECT_NONZERO_CAUSE$/i;
const CALL_STATE_EVENT_RE = /^(CallState|mPreciseCallState)$/i;
const DIALING_EVENT_RE = /^CALL_DIALING$/i;
const ALERTING_EVENT_RE = /^CALL_ALERTING$/i;

const DIALING_STATE_RE = /\b(dial(?:ing)?|calling|trying)\b/i;
const RINGING_RE = /\b(ring(?:ing)?|alert(?:ing)?)\b/i;
const IDLE_RE = /\b(idle|disconnected|disconnecting|ended)\b/i;
const CONNECTED_STATE_RE = /\b(connected|established|answered|in[- ]?call)\b/i;
const INCOMING_RE = /\b(incoming|mt call|mobile terminated)\b/i;
const OUTGOING_RE = /\b(outgoing|dial|mo call|mobile originated)\b/i;
const FAILURE_RE = /\b(fail(?:ed|ure)?|error|reject(?:ed)?|timeout|lost signal|out of service|busy)\b/i;
const CAUSE_CODE_RE = /\bcause\s*[:=]\s*(-?\d+)\b/i;
const CALL_TYPE_3_RE = /\bcalltype\s*=\s*3\b/i;
const CALL_TYPE_2_RE = /\bcalltype\s*=\s*2\b/i;
const REMOTE_CAPABILITY_RE = /\b(applyRemoteCallCapabilities|CALL_CAPS_REMOTE)\b/i;
const CAPABILITY_ONLY_RE = /\b(applyLocalCallCapabilities|applyRemoteCallCapabilities|CALL_CAPS_LOCAL|CALL_CAPS_REMOTE)\b/i;
const SIP_INVITE_RE = /\bSIP\b.*\bINVITE\b|\bINVITE\b/i;
const SIP_TRYING_RE = /\b100\b.*\bTrying\b/i;
const SIP_RINGING_RE = /\b180\b.*\bRinging\b/i;
const SIP_PROGRESS_RE = /\b183\b.*\bSession Progress\b/i;
const SIP_200_OK_RE = /\b200\b.*\bOK\b/i;
const SIP_ACK_RE = /\bSIP\b.*\bACK\b|\bACK\b/i;
const SIP_BYE_RE = /\bSIP\b.*\bBYE\b|\bBYE\b/i;
const SIP_CANCEL_RE = /\bSIP\b.*\bCANCEL\b|\bCANCEL\b/i;
const SIP_487_RE = /\b487\b.*\bRequest Terminated\b/i;
const SIP_408_RE = /\b408\b.*\bRequest Timeout\b/i;
const SIP_480_RE = /\b480\b.*\bTemporarily Unavailable\b/i;
const SIP_486_RE = /\b486\b.*\bBusy Here\b/i;
const SIP_FAILURE_RE = /\b([456]\d{2})\b/;
const SIP_CONTEXT_RE = /\bSIP(?:\/2\.0)?\b/i;
const MEDIA_ESTABLISHED_RE = /\b(media|voice bearer|bearer|rtp|qos flow)\b.*\b(established|active|connected|setup (?:complete|success(?:ful)?))\b/i;
const CODEC_NEGOTIATED_RE = /\bCODEC_(?:AMR_(?:NB|WB)|EVS)\b|updateMediaCapabilities.{0,160}\bcodec\s*=/i;
const RADIO_FAILURE_RE = /\b(radio link failure|rlf|rrc re[- ]?establishment failure|rrc reestablishment failure|unexpected rrc release|bearer loss|scgfail|scg failure)\b/i;
const HANDOVER_FAILURE_RE = /\b(hand(?: |-)?over|ho)\b.*\b(fail|failure|reject|drop|timeout)\b/i;
const HANDOVER_ATTEMPT_RE = /\b(hand(?: |-)?over|ho)\b.*\b(command|start|attempt|request)\b/i;
const IMS_FAILURE_RE = /\b(ims registration lost|ims deregistration|ims deregistered|ims unregistered|sip 408|sip 503)\b/i;
const RRC_REESTABLISHMENT_REQUEST_RE = /\brrc.*re[- ]?establishment.*request\b/i;
const RRC_REESTABLISHMENT_SUCCESS_RE = /\brrc.*re[- ]?establishment.*complete\b|\brrc.*re[- ]?established\b/i;
const RRC_REESTABLISHMENT_FAILURE_RE = /\brrc.*re[- ]?establishment.*(?:reject|failure|failed)\b/i;
const RECOVERY_SIGNAL_RE = /\b(recover(?:ed|y)?|service restored|rrc.*complete|sip ack|sip 200 ok|call_active|connected)\b/i;

const DEDUPE_WINDOW_MS = 1000;
const L3_CORRELATION_LEAD_MS = 1000;
const L3_CORRELATION_TAIL_MS = 1000;
const SCRIPTED_TALK_DURATION_MS = 90_000;
const MIN_SCRIPTED_ATTEMPT_MS = 85_000;
const MAX_SCRIPTED_ATTEMPT_MS = 130_000;
const MIN_INFERRED_SETUP_MS = 1_000;
const MAX_INFERRED_SETUP_MS = 30_000;

function getTimeMs(date) {
  return date instanceof Date ? date.getTime() : null;
}

function rowText(item) {
  return [
    item?.category,
    item?.domain,
    item?.title,
    item?.summary,
    item?.rawMessage,
  ].filter(Boolean).join(" ");
}

function sortTimeline(timeline = []) {
  return timeline
    .map((item, index) => ({ ...item, __order: index }))
    .sort((left, right) => {
      const leftTime = getTimeMs(left.timestamp);
      const rightTime = getTimeMs(right.timestamp);
      if (leftTime === null && rightTime === null) return left.__order - right.__order;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.__order - right.__order;
    });
}

function isCallScopedEvent(item) {
  if (item?.isStale) return false;
  return item?.category === "Call" || item?.domain?.includes("CS") || item?.domain?.includes("PS");
}

function isDialInitiatedEvent(item) {
  return START_EVENT_RE.test(item?.eventKey || "");
}

function isIncomingRingingEvent(item) {
  const text = item?.rawMessage || "";
  return CALL_STATE_EVENT_RE.test(item?.eventKey || "")
    && RINGING_RE.test(text)
    && INCOMING_RE.test(text);
}

function isDialingStateEvent(item) {
  return DIALING_EVENT_RE.test(item?.eventKey || "")
    || (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && DIALING_STATE_RE.test(item?.rawMessage || ""));
}

function isAlertingStateEvent(item) {
  return ALERTING_EVENT_RE.test(item?.eventKey || "")
    || (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && RINGING_RE.test(item?.rawMessage || ""));
}

function isSessionStartEvent(item) {
  return isDialInitiatedEvent(item)
    || isIncomingRingingEvent(item)
    || isDialingStateEvent(item);
}

function isDuplicateStartEvent(current, item) {
  if (!current || !isSessionStartEvent(item)) return false;
  const currentStartMs = getTimeMs(current.startTime);
  const itemMs = getTimeMs(item.timestamp);
  if (currentStartMs === null || itemMs === null) return false;
  return Math.abs(itemMs - currentStartMs) <= DEDUPE_WINDOW_MS;
}

function isDisconnectEvent(item) {
  return END_EVENT_RE.test(item?.eventKey || "");
}

function isIdleEndedEvent(item) {
  return CALL_STATE_EVENT_RE.test(item?.eventKey || "") && IDLE_RE.test(item?.rawMessage || "");
}

function isEndEvent(item) {
  return isDisconnectEvent(item) || isIdleEndedEvent(item);
}

function isCauseEvent(item) {
  return DISCONNECT_CAUSE_EVENT_RE.test(item?.eventKey || "") || CAUSE_CODE_RE.test(item?.rawMessage || "");
}

function inferDirection(item) {
  const text = `${item?.eventKey || ""} ${item?.title || ""} ${item?.rawMessage || ""}`;
  if (INCOMING_RE.test(text)) return "Incoming";
  if (OUTGOING_RE.test(text)) return "Outgoing";
  if (isDialInitiatedEvent(item)) return "Outgoing";
  if (isIncomingRingingEvent(item)) return "Incoming";
  return "Unknown";
}

function extractCauseCode(item) {
  const match = String(item?.rawMessage || "").match(CAUSE_CODE_RE);
  return match ? Number(match[1]) : null;
}

function dedupeTimestamp(session, key, date) {
  if (!(date instanceof Date)) return false;
  const currentMs = date.getTime();
  const previousMs = session.markerTimes[key];
  if (typeof previousMs === "number" && Math.abs(currentMs - previousMs) <= DEDUPE_WINDOW_MS) {
    return false;
  }
  session.markerTimes[key] = currentMs;
  return true;
}

function setFirstTimestamp(session, key, markerKey, date) {
  if (!(date instanceof Date)) return;
  if (!dedupeTimestamp(session, markerKey, date)) return;
  if (!session[key]) {
    session[key] = date;
  }
}

function pushUniqueCause(session, causeCode, reason) {
  if (causeCode !== null && !session.disconnectCauseHistory.includes(causeCode)) {
    session.disconnectCauseHistory.push(causeCode);
  }
  if (reason && !session.rawDisconnectReasons.includes(reason)) {
    session.rawDisconnectReasons.push(reason);
  }
}

function recordEvidence(bucket, date, item, label) {
  bucket.push({
    at: date instanceof Date ? date : item?.timestamp || null,
    label,
    itemId: item?.id || null,
    message: rowText(item),
  });
}

function createSession(item, index) {
  const startedDialing = isDialingStateEvent(item);
  const startedAlerting = isAlertingStateEvent(item);
  const startedIncoming = isIncomingRingingEvent(item);
  return {
    id: `call-${index}`,
    startTime: item?.timestamp || null,
    dialTime: isDialInitiatedEvent(item) || startedDialing ? item?.timestamp || null : null,
    dialingTime: startedDialing ? item?.timestamp || null : null,
    alertingTime: startedIncoming || startedAlerting ? item?.timestamp || null : null,
    answerTime: null,
    connectedTime: null,
    setupCompletionTime: null,
    disconnectTime: null,
    idleTime: null,
    endTime: null,
    direction: inferDirection(item),
    firstEventIndex: item?.__order ?? index,
    lastEventIndex: item?.__order ?? index,
    activeEventCount: 0,
    hasDisconnectEvent: false,
    disconnectCauseHistory: [],
    rawDisconnectReasons: [],
    warnings: [],
    recommendations: [],
    events: [],
    missingTimestamps: item?.timestamp ? 0 : 1,
    sawStartEvent: true,
    sawFailureHint: FAILURE_RE.test(String(item?.rawMessage || "")),
    wasClosedByNextStart: false,
    wasClosedAtEof: false,
    markerTimes: {},
    connectedEvidence: [],
    connectionSupportingEvidence: [],
    connectionEstimated: false,
    connectionInference: null,
    releaseEvidence: [],
    rrcRecoveryEvents: [],
    radioIssueDetected: false,
    radioRecovered: false,
    handoverAttempts: [],
    successfulHandovers: [],
    failedHandovers: [],
    l3Analysis: {
      inviteTime: null,
      tryingTime: null,
      ringingTime: null,
      progressTime: null,
      sip200Time: null,
      ackTime: null,
      byeTime: null,
      cancelTime: null,
      sipFinalCode: null,
      connectedConfirmed: false,
      normalReleaseConfirmed: false,
      abnormalReleaseConfirmed: false,
      releaseReason: "",
      supportingMessages: [],
    },
  };
}

function absorbBoundaryEvent(session, item) {
  if (item?.isStale) return;
  session.lastEventIndex = item?.__order ?? session.lastEventIndex;
  session.missingTimestamps += item?.timestamp ? 0 : 1;
  session.sawFailureHint = session.sawFailureHint || FAILURE_RE.test(String(item?.rawMessage || ""));

  const direction = inferDirection(item);
  if (session.direction === "Unknown" && direction !== "Unknown") {
    session.direction = direction;
  }

  if (isDialInitiatedEvent(item)) {
    setFirstTimestamp(session, "dialTime", "dial", item.timestamp || null);
  }

  if (DIALING_EVENT_RE.test(item?.eventKey || "") || (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && DIALING_STATE_RE.test(item?.rawMessage || ""))) {
    setFirstTimestamp(session, "dialingTime", "dialing", item.timestamp || null);
  }

  if (ALERTING_EVENT_RE.test(item?.eventKey || "") || (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && RINGING_RE.test(item?.rawMessage || ""))) {
    setFirstTimestamp(session, "alertingTime", "alerting", item.timestamp || null);
  }

  if (ACTIVE_EVENT_RE.test(item?.eventKey || "")) {
    session.activeEventCount += 1;
  }

  if (isCauseEvent(item)) {
    pushUniqueCause(session, extractCauseCode(item), item?.rawMessage || "");
  }

  if (isDisconnectEvent(item)) {
    session.hasDisconnectEvent = true;
    if (!session.disconnectTime) {
      session.disconnectTime = item.timestamp || null;
    }
    if (item?.rawMessage && !session.rawDisconnectReasons.includes(item.rawMessage)) {
      session.rawDisconnectReasons.push(item.rawMessage);
    }
    session.endTime = session.disconnectTime || session.endTime || session.startTime;
  }

  if (isIdleEndedEvent(item)) {
    if (!session.idleTime) {
      session.idleTime = item.timestamp || null;
    }
    if (item?.rawMessage && !session.rawDisconnectReasons.includes(item.rawMessage)) {
      session.rawDisconnectReasons.push(item.rawMessage);
    }
    session.hasDisconnectEvent = true;
    session.endTime = session.endTime || session.idleTime || session.disconnectTime || session.startTime;
  }
}

function isCapabilityOnlyActive(item) {
  const text = rowText(item);
  return CAPABILITY_ONLY_RE.test(text) || (CALL_TYPE_2_RE.test(text) && !CALL_TYPE_3_RE.test(text));
}

function isExplicitConnectedEvent(item) {
  const text = rowText(item);
  if (ACTIVE_EVENT_RE.test(item?.eventKey || "")) {
    return !isCapabilityOnlyActive(item);
  }
  if (!CALL_STATE_EVENT_RE.test(item?.eventKey || "")) {
    return false;
  }
  return CONNECTED_STATE_RE.test(text);
}

function isMediaEstablishedEvent(item) {
  return MEDIA_ESTABLISHED_RE.test(rowText(item));
}

function analyseL3ForCall(session) {
  const result = {
    inviteTime: null,
    tryingTime: null,
    ringingTime: null,
    progressTime: null,
    sip200Time: null,
    ackTime: null,
    byeTime: null,
    cancelTime: null,
    sipFinalCode: null,
    connectedConfirmed: false,
    normalReleaseConfirmed: false,
    abnormalReleaseConfirmed: false,
    releaseReason: "",
    supportingMessages: [],
  };

  const endMs = getTimeMs(session.endTime) ?? Number.POSITIVE_INFINITY;

  for (const item of session.events) {
    const itemMs = getTimeMs(item.timestamp);
    if (itemMs !== null && itemMs > endMs) continue;

    const text = rowText(item);
    if (!text) continue;

    const remember = (label) => {
      result.supportingMessages.push({
        at: item.timestamp || null,
        label,
        message: text,
        itemId: item.id || null,
      });
    };

    if (!result.inviteTime && SIP_INVITE_RE.test(text)) {
      result.inviteTime = item.timestamp || null;
      remember("SIP INVITE");
    }
    if (!result.tryingTime && SIP_TRYING_RE.test(text)) {
      result.tryingTime = item.timestamp || null;
      remember("SIP 100 Trying");
    }
    if (!result.ringingTime && (SIP_RINGING_RE.test(text) || SIP_PROGRESS_RE.test(text))) {
      result.ringingTime = item.timestamp || null;
      remember(SIP_RINGING_RE.test(text) ? "SIP 180 Ringing" : "SIP 183 Session Progress");
    }
    if (!result.progressTime && SIP_PROGRESS_RE.test(text)) {
      result.progressTime = item.timestamp || null;
    }
    if (result.inviteTime && !result.sip200Time && SIP_200_OK_RE.test(text)) {
      result.sip200Time = item.timestamp || null;
      remember("SIP 200 OK");
    }
    if (!result.ackTime && SIP_ACK_RE.test(text)) {
      result.ackTime = item.timestamp || null;
      remember("SIP ACK");
    }
    if (!result.byeTime && SIP_BYE_RE.test(text)) {
      result.byeTime = item.timestamp || null;
      remember("SIP BYE");
    }
    if (!result.cancelTime && SIP_CANCEL_RE.test(text)) {
      result.cancelTime = item.timestamp || null;
      remember("SIP CANCEL");
    }

    if (result.sipFinalCode === null) {
      if (SIP_487_RE.test(text)) result.sipFinalCode = 487;
      else if (SIP_408_RE.test(text)) result.sipFinalCode = 408;
      else if (SIP_480_RE.test(text)) result.sipFinalCode = 480;
      else if (SIP_486_RE.test(text)) result.sipFinalCode = 486;
      else if (SIP_CONTEXT_RE.test(text)) {
        const match = text.match(SIP_FAILURE_RE);
        const code = match ? Number(match[1]) : null;
        if (code >= 400) result.sipFinalCode = code;
      }
      if (result.sipFinalCode !== null) {
        remember(`SIP ${result.sipFinalCode}`);
      }
    }

    if (!result.releaseReason) {
      if (RADIO_FAILURE_RE.test(text)) result.releaseReason = "Radio Link Failure";
      else if (HANDOVER_FAILURE_RE.test(text)) result.releaseReason = "Handover Failure";
      else if (IMS_FAILURE_RE.test(text)) result.releaseReason = "IMS Registration Lost";
    }
  }

  const inviteMs = getTimeMs(result.inviteTime);
  const okMs = getTimeMs(result.sip200Time);
  const ackMs = getTimeMs(result.ackTime);
  result.connectedConfirmed = Boolean(
    result.inviteTime
    && result.sip200Time
    && result.ackTime
    && (inviteMs === null || okMs === null || inviteMs <= okMs)
    && (okMs === null || ackMs === null || okMs <= ackMs),
  );
  result.normalReleaseConfirmed = Boolean(result.byeTime && !result.sipFinalCode);
  result.abnormalReleaseConfirmed = Boolean(result.cancelTime || (result.sipFinalCode !== null && result.sipFinalCode >= 400));
  if (!result.releaseReason && result.sipFinalCode !== null) {
    result.releaseReason = `SIP ${result.sipFinalCode}`;
  }

  return result;
}

function inferScriptedConnectionTime(session, codecNegotiated = []) {
  const dialMs = getTimeMs(session.dialTime || session.startTime);
  const endMs = getTimeMs(session.endTime);
  const alertingMs = getTimeMs(session.alertingTime);
  if (dialMs === null || endMs === null || alertingMs === null) return null;

  const attemptMs = endMs - dialMs;
  if (attemptMs < MIN_SCRIPTED_ATTEMPT_MS || attemptMs > MAX_SCRIPTED_ATTEMPT_MS) return null;
  if (!session.disconnectCauseHistory.includes(3)) return null;

  const disconnectMs = getTimeMs(session.disconnectTime);
  const idleMs = getTimeMs(session.idleTime);
  const modemEndPrecededIdle = disconnectMs !== null && idleMs !== null && disconnectMs <= idleMs;
  if (!codecNegotiated.length && !modemEndPrecededIdle) return null;

  const inferredMs = endMs - SCRIPTED_TALK_DURATION_MS;
  const setupMs = inferredMs - dialMs;
  if (setupMs < MIN_INFERRED_SETUP_MS || setupMs > MAX_INFERRED_SETUP_MS || inferredMs < alertingMs) return null;
  return new Date(inferredMs);
}

function finalizeSessionMilestones(session) {
  const analysisEndMs = getTimeMs(session.endTime) ?? Number.POSITIVE_INFINITY;
  const explicitConnected = [];
  const callTypeConnected = [];
  const mediaConnected = [];
  const codecNegotiated = [];
  const handoverEvaluation = evaluateL3HandoverTimeline(session.events);
  let radioFailureOpen = false;

  for (const item of session.events) {
    if (item?.isStale) continue;
    const itemMs = getTimeMs(item.timestamp);
    if (isCauseEvent(item)) {
      pushUniqueCause(session, extractCauseCode(item), item?.rawMessage || "");
    }
    // Both callbacks belong to the same termination even when the second one
    // arrives just after the first end marker. Capture both so their ordering
    // can distinguish a completed local hang-up from an unanswered timeout.
    if (isDisconnectEvent(item) && !session.disconnectTime) {
      session.disconnectTime = item.timestamp || null;
      session.hasDisconnectEvent = true;
    }
    if (isIdleEndedEvent(item) && !session.idleTime) {
      session.idleTime = item.timestamp || null;
      session.hasDisconnectEvent = true;
    }
    if (itemMs !== null && itemMs > analysisEndMs) continue;

    const text = rowText(item);
    if (!text) continue;

    if (DIALING_EVENT_RE.test(item?.eventKey || "") || (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && DIALING_STATE_RE.test(text))) {
      setFirstTimestamp(session, "dialingTime", "dialing", item.timestamp || null);
    }
    if (ALERTING_EVENT_RE.test(item?.eventKey || "") || (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && RINGING_RE.test(text))) {
      setFirstTimestamp(session, "alertingTime", "alerting", item.timestamp || null);
    }
    if (CALL_TYPE_3_RE.test(text)
      && !REMOTE_CAPABILITY_RE.test(text)
      && (!session.alertingTime || itemMs === null || itemMs >= getTimeMs(session.alertingTime))) {
      callTypeConnected.push(item);
    }
    if (isExplicitConnectedEvent(item)) {
      explicitConnected.push(item);
    }
    if (isMediaEstablishedEvent(item)) {
      mediaConnected.push(item);
    }
    if (CODEC_NEGOTIATED_RE.test(text)) {
      codecNegotiated.push(item);
    }
    if (HANDOVER_ATTEMPT_RE.test(text)) session.handoverAttempts.push(item);
    if (HANDOVER_FAILURE_RE.test(text)) session.failedHandovers.push(item);
    if (handoverEvaluation.byId.get(item.id)?.classification === "confirmed_handover") {
      session.successfulHandovers.push(item);
    }
    if (RRC_REESTABLISHMENT_REQUEST_RE.test(text)) {
      session.radioIssueDetected = true;
      radioFailureOpen = true;
      session.rrcRecoveryEvents.push({
        timestamp: item.timestamp || null,
        type: "RRC_REESTABLISHMENT_REQUEST",
        cause: text,
        success: false,
        recovered: false,
      });
    }
    if (RRC_REESTABLISHMENT_FAILURE_RE.test(text)) {
      session.radioIssueDetected = true;
      radioFailureOpen = true;
      session.rrcRecoveryEvents.push({
        timestamp: item.timestamp || null,
        type: "RRC_REESTABLISHMENT_FAILURE",
        cause: text,
        success: false,
        recovered: false,
      });
    }
    if (radioFailureOpen && (RRC_REESTABLISHMENT_SUCCESS_RE.test(text) || RECOVERY_SIGNAL_RE.test(text))) {
      session.radioRecovered = true;
      radioFailureOpen = false;
      session.rrcRecoveryEvents.push({
        timestamp: item.timestamp || null,
        type: "RRC_RECOVERY",
        cause: text,
        success: true,
        recovered: true,
      });
    }
  }


  const terminalTimes = [session.disconnectTime, session.idleTime]
    .filter((date) => date instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime());
  if (terminalTimes.length) session.endTime = terminalTimes[0];

  session.l3Analysis = analyseL3ForCall(session);

  const strongConnectedItem =
    (session.l3Analysis.connectedConfirmed && session.l3Analysis.ackTime ? { timestamp: session.l3Analysis.ackTime, id: "sip-ack", title: "SIP ACK", rawMessage: "SIP 200 OK / ACK confirmed" } : null) ||
    explicitConnected[0] ||
    callTypeConnected[0] ||
    mediaConnected[0] ||
    null;

  if (strongConnectedItem?.timestamp instanceof Date) {
    session.answerTime = strongConnectedItem.timestamp;
    session.connectedTime = strongConnectedItem.timestamp;
  }

  if (!session.connectedTime) {
    const inferredConnectionTime = inferScriptedConnectionTime(session, codecNegotiated);
    if (inferredConnectionTime) {
      session.answerTime = inferredConnectionTime;
      session.connectedTime = inferredConnectionTime;
      session.connectionEstimated = true;
      session.connectionInference = "Estimated from a locally completed fixed-duration drive-test call";
    }
  }

  if (!session.setupCompletionTime) {
    session.setupCompletionTime = session.connectedTime || session.answerTime || null;
  }

  if (session.l3Analysis.connectedConfirmed) {
    recordEvidence(session.connectedEvidence, session.answerTime, strongConnectedItem, "SIP 200 OK followed by ACK");
  } else if (explicitConnected[0]) {
    recordEvidence(session.connectedEvidence, explicitConnected[0].timestamp, explicitConnected[0], "Explicit connected state");
  } else if (callTypeConnected[0]) {
    recordEvidence(session.connectedEvidence, callTypeConnected[0].timestamp, callTypeConnected[0], "IMS profile transitioned to connected callType=3");
  } else if (mediaConnected[0]) {
    recordEvidence(session.connectedEvidence, mediaConnected[0].timestamp, mediaConnected[0], "Media or bearer establishment confirmed");
  } else if (session.connectionEstimated) {
    recordEvidence(session.connectedEvidence, session.connectedTime, null, session.connectionInference);
  }
  if (callTypeConnected[0] && strongConnectedItem !== callTypeConnected[0]) {
    recordEvidence(session.connectionSupportingEvidence, callTypeConnected[0].timestamp, callTypeConnected[0], "Supporting IMS profile callType=3");
  }
  codecNegotiated.forEach((item) => {
    recordEvidence(session.connectionSupportingEvidence, item.timestamp, item, "IMS voice codec negotiated");
  });

  session.l3Analysis.supportingMessages.forEach((entry) => {
    if (/SIP (?:487|408|480|486|\d{3})|SIP CANCEL|SIP BYE/.test(entry.label)) {
      session.releaseEvidence.push(entry);
    }
  });
  session.events.forEach((item) => {
    if (item?.isStale) return;
    const itemMs = getTimeMs(item.timestamp);
    if (itemMs !== null && itemMs > analysisEndMs) return;
    const text = rowText(item);
    if (RADIO_FAILURE_RE.test(text) || HANDOVER_FAILURE_RE.test(text) || IMS_FAILURE_RE.test(text)) {
      recordEvidence(session.releaseEvidence, item.timestamp, item, "Abnormal protocol termination evidence");
    }
  });

  if (session.disconnectTime && !session.endTime) {
    session.endTime = session.disconnectTime;
  }
  if (session.idleTime && (!session.endTime || getTimeMs(session.idleTime) < getTimeMs(session.endTime))) {
    session.endTime = session.idleTime;
  }
  const lastObservedTime = session.events.map((item) => item.timestamp).filter((date) => date instanceof Date).at(-1) || null;
  session.endTime = session.endTime || session.disconnectTime || session.idleTime || lastObservedTime || session.connectedTime || session.startTime;
}

export function buildSessions(timeline = []) {
  const orderedTimeline = sortTimeline(timeline);
  const callItems = orderedTimeline.filter((item) => isCallScopedEvent(item) && !item.isStale);
  const sessions = [];
  let current = null;

  for (const item of callItems) {
    if (current?.hasDisconnectEvent && current.endTime) {
      const currentEndMs = getTimeMs(current.endTime);
      const itemMs = getTimeMs(item.timestamp);
      const startsNextSession = isSessionStartEvent(item);
      if (startsNextSession || (currentEndMs !== null && itemMs !== null && itemMs > currentEndMs)) {
        current = null;
      }
    }

    if (!current) {
      if (!isSessionStartEvent(item)) continue;
      current = createSession(item, sessions.length);
      sessions.push(current);
      continue;
    }

    if (isSessionStartEvent(item)) {
      if (isDialingStateEvent(item)) {
        absorbBoundaryEvent(current, item);
        continue;
      }
      if (isDuplicateStartEvent(current, item)) {
        absorbBoundaryEvent(current, item);
        continue;
      }
      current.wasClosedByNextStart = true;
      current.endTime = current.endTime || current.disconnectTime || current.idleTime || null;
      current = createSession(item, sessions.length);
      sessions.push(current);
      continue;
    }

    absorbBoundaryEvent(current, item);
  }

  if (current) {
    current.wasClosedAtEof = !current.hasDisconnectEvent;
    current.endTime = current.endTime || current.disconnectTime || current.idleTime || null;
  }

  return {
    sessions,
    orderedTimeline,
  };
}

export function attachSessionEvents(sessions = [], orderedTimeline = []) {
  let cursor = 0;

  const freshTimeline = orderedTimeline.filter((item) => !item.isStale);

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    const nextSession = sessions[index + 1] || null;
    const startMs = getTimeMs(session.startTime);
    const lowerMs = startMs === null ? null : startMs - L3_CORRELATION_LEAD_MS;
    const sessionEndMs = getTimeMs(session.endTime);
    const tailEndMs = sessionEndMs === null ? null : sessionEndMs + L3_CORRELATION_TAIL_MS;
    const nextStartMs = getTimeMs(nextSession?.startTime);
    const upperMs = nextStartMs === null ? tailEndMs : tailEndMs === null ? nextStartMs - 1 : Math.min(tailEndMs, nextStartMs - 1);

    while (cursor < freshTimeline.length) {
      const item = freshTimeline[cursor];
      const itemMs = getTimeMs(item.timestamp);
      if (lowerMs !== null && itemMs !== null && itemMs < lowerMs) {
        cursor += 1;
        continue;
      }
      break;
    }

    let scan = cursor;
    while (scan < freshTimeline.length) {
      const item = freshTimeline[scan];
      const itemMs = getTimeMs(item.timestamp);
      if (upperMs !== null && itemMs !== null && itemMs > upperMs) {
        break;
      }
      if (lowerMs === null || itemMs === null || (itemMs >= lowerMs && (upperMs === null || itemMs <= upperMs))) {
        session.events.push(item);
      }
      scan += 1;
    }

    session.events.sort((left, right) => {
      const leftTime = getTimeMs(left.timestamp);
      const rightTime = getTimeMs(right.timestamp);
      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime;
    });

    finalizeSessionMilestones(session);
  }

  return sessions;
}
