// Groups the "Call" category timeline items into individual call sessions
// (dial -> [active] -> disconnect) and classifies each as Connected, Dropped,
// or Not Connected, using Android's standard telephony disconnect-cause
// codes (android.telephony.DisconnectCause) to tell a normal hangup (2 =
// NORMAL, 3 = LOCAL) apart from an abnormal/dropped one.

const START_EVENT_RE = /^CALL_DIAL_INITIATED$/i;
const ACTIVE_EVENT_RE = /^CALL_ACTIVE$/i;
const END_EVENT_RE = /^CALL_DISCONNECTED$/i;
const CALL_STATE_EVENT_RE = /^CallState$/i;
const RINGING_STATE_RE = /ringing/i;
const IDLE_STATE_RE = /idle/i;
const DISCONNECT_CAUSE_EVENT_RE = /^CALL_DISCONNECT_NONZERO_CAUSE$/i;
const DISCONNECT_CAUSE_VALUE_RE = /cause\s*[:=]\s*(-?\d+)/i;

// Codes that represent a normal/expected call end - anything else numeric is
// treated as an abnormal disconnect (dropped). 0 = NOT_DISCONNECTED (no real
// cause), 2 = NORMAL, 3 = LOCAL (locally hung up).
const NORMAL_DISCONNECT_CAUSES = new Set([0, 2, 3]);

function extractCauseCode(text = "") {
  const match = text.match(DISCONNECT_CAUSE_VALUE_RE);
  return match ? Number(match[1]) : null;
}

function closeSession(session, endItem) {
  session.endTime = endItem?.timestamp || session.lastEventTime || session.startTime;
}

// Walks the Call-category items in order and splits them into sessions.
function groupIntoSessions(callItems) {
  const sessions = [];
  let current = null;

  for (const item of callItems) {
    const key = item.eventKey || "";
    const isCallState = CALL_STATE_EVENT_RE.test(key);
    const isRingingState = isCallState && RINGING_STATE_RE.test(item.rawMessage || "");
    const isIdleEnded = isCallState && IDLE_STATE_RE.test(item.rawMessage || "");

    if (!current && (START_EVENT_RE.test(key) || isRingingState)) {
      current = {
        startTime: item.timestamp,
        lastEventTime: item.timestamp,
        connected: false,
        connectedAt: null,
        causeCodes: [],
      };
    }

    if (!current) continue;

    current.lastEventTime = item.timestamp || current.lastEventTime;

    if (ACTIVE_EVENT_RE.test(key) && !current.connected) {
      current.connected = true;
      current.connectedAt = item.timestamp;
    }

    if (DISCONNECT_CAUSE_EVENT_RE.test(key)) {
      const cause = extractCauseCode(item.rawMessage || "");
      if (cause !== null) current.causeCodes.push(cause);
    }

    if (END_EVENT_RE.test(key) || isIdleEnded) {
      closeSession(current, item);
      sessions.push(current);
      current = null;
    }
  }

  if (current) {
    closeSession(current, null);
    sessions.push(current);
  }

  return sessions;
}

function classifySession(session) {
  if (!session.connected) return "Not Connected";

  const hasAbnormalCause = session.causeCodes.some((code) => !NORMAL_DISCONNECT_CAUSES.has(code));
  return hasAbnormalCause ? "Dropped" : "Connected";
}

function durationMs(session, status) {
  const end = session.endTime;
  if (!end) return 0;

  const start = status === "Not Connected" ? session.startTime : session.connectedAt || session.startTime;
  if (!start) return 0;

  return Math.max(0, end.getTime() - start.getTime());
}

export function buildCallSummary(timeline = []) {
  const callItems = timeline
    .filter((item) => item.category === "Call")
    .slice()
    .sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));

  const sessions = groupIntoSessions(callItems);

  const summary = {
    totalCalls: sessions.length,
    connected: 0,
    dropped: 0,
    notConnected: 0,
    totalDurationMs: 0,
    calls: [],
  };

  sessions.forEach((session) => {
    const status = classifySession(session);
    const duration = durationMs(session, status);

    if (status === "Connected") summary.connected += 1;
    else if (status === "Dropped") summary.dropped += 1;
    else summary.notConnected += 1;

    summary.totalDurationMs += duration;
    summary.calls.push({
      id: `call-${summary.calls.length}`,
      startTime: session.startTime,
      endTime: session.endTime,
      status,
      durationMs: duration,
    });
  });

  return summary;
}

export function formatDurationMs(ms = 0) {
  if (!ms || ms < 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
