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
      answerTime: enrichedSession.answerTime,
      endTime: enrichedSession.endTime,
      setupTimeMs: enrichedSession.setupTimeMs,
      talkTimeMs: enrichedSession.talkTimeMs,
      totalDurationMs: enrichedSession.totalDurationMs,
      durationMs: enrichedSession.durationMs,
      status: enrichedSession.status,
      detailedStatus: enrichedSession.detailedStatus,
      direction: enrichedSession.direction,
      disconnectReason: enrichedSession.disconnectReason,
      causeCode: enrichedSession.causeCode,
      causeName: enrichedSession.causeName,
      events: enrichedSession.events,
      warnings: enrichedSession.warnings,
      recommendations: enrichedSession.recommendations,
    };
  });
}
