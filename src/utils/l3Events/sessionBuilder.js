const START_EVENT_RE = /^CALL_DIAL_INITIATED$/i;
const ACTIVE_EVENT_RE = /^CALL_ACTIVE$/i;
const END_EVENT_RE = /^CALL_DISCONNECTED$/i;
const DISCONNECT_CAUSE_EVENT_RE = /^CALL_DISCONNECT_NONZERO_CAUSE$/i;
const CALL_STATE_EVENT_RE = /^(CallState|mPreciseCallState)$/i;

const RINGING_RE = /\bring(?:ing)?\b/i;
const ACTIVE_STATE_RE = /\b(active|offhook|in[- ]?call|answered)\b/i;
const IDLE_RE = /\b(idle|disconnected|disconnecting|ended)\b/i;
const INCOMING_RE = /\b(incoming|mt call|mobile terminated)\b/i;
const OUTGOING_RE = /\b(outgoing|dial|mo call|mobile originated)\b/i;
const FAILURE_RE = /\b(fail(?:ed|ure)?|error|reject(?:ed)?|timeout|lost signal|out of service|busy)\b/i;
const CAUSE_CODE_RE = /\bcause\s*[:=]\s*(-?\d+)\b/i;

function getTimeMs(date) {
  return date instanceof Date ? date.getTime() : null;
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
  return item?.category === "Call" || item?.domain?.includes("CS") || item?.domain?.includes("PS");
}

function isDialInitiatedEvent(item) {
  return START_EVENT_RE.test(item?.eventKey || "");
}

function isIncomingRingingEvent(item) {
  return CALL_STATE_EVENT_RE.test(item?.eventKey || "") && RINGING_RE.test(item?.rawMessage || "");
}

function isActiveEvent(item) {
  return ACTIVE_EVENT_RE.test(item?.eventKey || "") ||
    (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && ACTIVE_STATE_RE.test(item?.rawMessage || ""));
}

function isEndEvent(item) {
  return END_EVENT_RE.test(item?.eventKey || "") ||
    (CALL_STATE_EVENT_RE.test(item?.eventKey || "") && IDLE_RE.test(item?.rawMessage || ""));
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

function createSession(item, index) {
  return {
    id: `call-${index}`,
    startTime: item?.timestamp || null,
    answerTime: null,
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
  };
}

function absorbEvent(session, item) {
  session.lastEventIndex = item?.__order ?? session.lastEventIndex;
  session.missingTimestamps += item?.timestamp ? 0 : 1;
  session.sawFailureHint = session.sawFailureHint || FAILURE_RE.test(String(item?.rawMessage || ""));

  const direction = inferDirection(item);
  if (session.direction === "Unknown" && direction !== "Unknown") {
    session.direction = direction;
  }

  if (isActiveEvent(item)) {
    session.activeEventCount += 1;
    if (!session.answerTime) {
      session.answerTime = item.timestamp || null;
    }
  }

  if (isCauseEvent(item)) {
    const causeCode = extractCauseCode(item);
    if (causeCode !== null) {
      session.disconnectCauseHistory.push(causeCode);
    }
    if (item?.rawMessage) {
      session.rawDisconnectReasons.push(item.rawMessage);
    }
  }

  if (isEndEvent(item)) {
    session.hasDisconnectEvent = true;
    session.endTime = item.timestamp || session.endTime || session.answerTime || session.startTime;
  }
}

export function buildSessions(timeline = []) {
  const orderedTimeline = sortTimeline(timeline);
  const callItems = orderedTimeline.filter(isCallScopedEvent);
  const sessions = [];
  let current = null;
  let state = "IDLE";

  for (const item of callItems) {
    const startsNewSession = isDialInitiatedEvent(item) || isIncomingRingingEvent(item);

    if (state === "IDLE") {
      if (!startsNewSession) {
        continue;
      }

      current = createSession(item, sessions.length);
      sessions.push(current);
      state = "CALL_IN_PROGRESS";
      continue;
    }

    if (!current) {
      state = "IDLE";
      continue;
    }

    absorbEvent(current, item);

    if (current.hasDisconnectEvent) {
      current = null;
      state = "IDLE";
    }
  }

  if (current) {
    current.wasClosedAtEof = true;
    current.endTime = current.endTime || current.answerTime || current.startTime;
  }

  return {
    sessions,
    orderedTimeline,
  };
}

export function attachSessionEvents(sessions = [], orderedTimeline = []) {
  let cursor = 0;

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    const nextSession = sessions[index + 1] || null;
    const startMs = getTimeMs(session.startTime);
    const endBoundary = session.endTime || nextSession?.startTime || session.startTime;
    const endMs = getTimeMs(endBoundary);

    while (cursor < orderedTimeline.length) {
      const item = orderedTimeline[cursor];
      const itemMs = getTimeMs(item.timestamp);
      if (startMs !== null && itemMs !== null && itemMs < startMs) {
        cursor += 1;
        continue;
      }
      break;
    }

    let scan = cursor;
    while (scan < orderedTimeline.length) {
      const item = orderedTimeline[scan];
      const itemMs = getTimeMs(item.timestamp);

      if (endMs !== null && itemMs !== null && itemMs > endMs) {
        break;
      }

      if (startMs === null || itemMs === null || (itemMs >= startMs && (endMs === null || itemMs <= endMs))) {
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
  }

  return sessions;
}
