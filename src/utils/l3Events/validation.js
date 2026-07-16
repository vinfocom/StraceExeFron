const VERY_SHORT_CALL_MS = 5000;
const TIMESTAMP_GAP_WARNING_MS = 30000;

function getTimestampMs(item) {
  return item?.timestamp instanceof Date ? item.timestamp.getTime() : null;
}

export function collectWarnings(session) {
  const warnings = [];

  if (!session.answerTime) {
    warnings.push("Missing ACTIVE event");
  }

  if (session.disconnectCauseHistory.length > 1) {
    warnings.push("Multiple disconnect causes");
  }

  if (session.activeEventCount > 1) {
    warnings.push("Duplicate ACTIVE events");
  }

  if (!session.hasDisconnectEvent) {
    warnings.push("No disconnect event");
  }

  if (session.answerTime && session.talkTimeMs > 0 && session.talkTimeMs < VERY_SHORT_CALL_MS) {
    warnings.push("Very short call");
  }

  const startMs = getTimestampMs(session.startTime ? { timestamp: session.startTime } : null);
  const answerMs = getTimestampMs(session.answerTime ? { timestamp: session.answerTime } : null);
  const endMs = getTimestampMs(session.endTime ? { timestamp: session.endTime } : null);

  if (answerMs !== null && startMs !== null && answerMs < startMs) {
    warnings.push("Unexpected ordering");
  }

  if (endMs !== null && startMs !== null && endMs < startMs) {
    warnings.push("Negative duration");
  }

  let previousMs = null;
  for (const item of session.events) {
    const currentMs = getTimestampMs(item);
    if (currentMs === null) continue;
    if (previousMs !== null && currentMs - previousMs > TIMESTAMP_GAP_WARNING_MS) {
      warnings.push("Timestamp gap");
      break;
    }
    previousMs = currentMs;
  }

  if (session.wasClosedByNextStart || session.wasClosedAtEof) {
    warnings.push("Log ending mid-call");
  }

  if (session.missingTimestamps > 0) {
    warnings.push("Malformed logs");
  }

  return Array.from(new Set(warnings));
}

export function buildRecommendations(session) {
  const recommendations = [];

  if (session.status === "IMS Failure") {
    recommendations.push("Inspect IMS registration and SIP failure events around call setup.");
  }

  if (session.status === "Radio Failure" || session.status === "Handover Failure") {
    recommendations.push("Review RRC release, radio link failure, and handover signaling around the drop.");
  }

  if (session.status === "Call Setup Failure") {
    recommendations.push("Check early setup signaling and disconnect causes before media establishment.");
  }

  if (session.warnings.includes("No disconnect event")) {
    recommendations.push("Correlate with later logs because the disconnect sequence may be truncated.");
  }

  if (session.warnings.includes("Multiple disconnect causes")) {
    recommendations.push("Verify vendor-specific duplicate cause reporting before trusting the final reason.");
  }

  if (session.warnings.includes("Timestamp gap")) {
    recommendations.push("Validate log continuity because large time gaps can hide intermediate call states.");
  }

  return recommendations;
}
