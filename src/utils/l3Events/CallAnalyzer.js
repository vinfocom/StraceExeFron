import { buildSessions, attachSessionEvents } from "./sessionBuilder.js";
import { calculateDurations } from "./durationCalculator.js";
import { collectWarnings, buildRecommendations } from "./validation.js";
import { classifyCall } from "./callClassifier.js";

function sanitizeTimeline(timeline = []) {
  if (!Array.isArray(timeline)) return [];
  return timeline.filter(Boolean);
}

const formatCallId = (index) => `Cl${index + 1}`;

export function analyzeCalls(timeline = []) {
  const safeTimeline = sanitizeTimeline(timeline);
  const { sessions, orderedTimeline } = buildSessions(safeTimeline);
  attachSessionEvents(sessions, orderedTimeline);

  return sessions.map((session, index) => {
    const durations = calculateDurations(session);
    const classified = classifyCall({ ...session, ...durations });
    const enrichedSession = {
      ...session,
      ...durations,
      ...classified,
    };

    const warnings = collectWarnings(enrichedSession);
    enrichedSession.warnings = warnings;
    enrichedSession.recommendations = buildRecommendations({
      ...enrichedSession,
      warnings,
    });

    return {
      id: formatCallId(index),
      startTime: enrichedSession.startTime,
      dialTime: enrichedSession.dialTime,
      dialingTime: enrichedSession.dialingTime,
      alertingTime: enrichedSession.alertingTime,
      answerTime: enrichedSession.answerTime,
      connectedTime: enrichedSession.connectedTime,
      disconnectTime: enrichedSession.disconnectTime,
      idleTime: enrichedSession.idleTime,
      endTime: enrichedSession.endTime,
      setupTimeMs: enrichedSession.setupTimeMs,
      setupAttemptDurationMs: enrichedSession.setupAttemptDurationMs,
      talkTimeMs: enrichedSession.talkTimeMs,
      totalDurationMs: enrichedSession.totalDurationMs,
      ringingDelayMs: enrichedSession.ringingDelayMs,
      durationMs: enrichedSession.durationMs,
      status: enrichedSession.status,
      detailedStatus: enrichedSession.detailedStatus,
      classification: enrichedSession.classification,
      direction: enrichedSession.direction,
      disconnectReason: enrichedSession.disconnectReason,
      causeCode: enrichedSession.causeCode,
      causeName: enrichedSession.causeName,
      connectedEvidence: enrichedSession.connectedEvidence,
      releaseEvidence: enrichedSession.releaseEvidence,
      events: enrichedSession.events,
      warnings: enrichedSession.warnings,
      recommendations: enrichedSession.recommendations,
    };
  });
}
