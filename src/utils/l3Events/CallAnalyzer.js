import { buildSessions, attachSessionEvents } from "./sessionBuilder.js";
import { calculateDurations } from "./durationCalculator.js";
import { collectWarnings, buildRecommendations } from "./validation.js";
import { classifyCall } from "./callClassifier.js";

function sanitizeTimeline(timeline = []) {
  if (!Array.isArray(timeline)) return [];
  return timeline.filter(Boolean);
}

const formatCallId = (index) => `Cl${index + 1}`;

function lastTechnology(events = []) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.technology) return events[index].technology;
  }
  return "Unknown";
}

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
      setupCompletionTime: enrichedSession.setupCompletionTime,
      disconnectTime: enrichedSession.disconnectTime,
      idleTime: enrichedSession.idleTime,
      endTime: enrichedSession.endTime,
      terminationTime: enrichedSession.endTime || enrichedSession.disconnectTime || enrichedSession.idleTime,
      dialToAlertingMs: enrichedSession.dialToAlertingMs,
      callSetupTimeMs: enrichedSession.callSetupTimeMs,
      connectedDurationMs: enrichedSession.connectedDurationMs,
      attemptDurationMs: enrichedSession.attemptDurationMs,
      setupTimeMs: enrichedSession.setupTimeMs,
      setupAttemptDurationMs: enrichedSession.setupAttemptDurationMs,
      talkTimeMs: enrichedSession.talkTimeMs,
      totalDurationMs: enrichedSession.totalDurationMs,
      ringingDelayMs: enrichedSession.ringingDelayMs,
      durationMs: enrichedSession.durationMs,
      status: enrichedSession.status,
      detailedStatus: enrichedSession.detailedStatus,
      callResult: enrichedSession.callResult,
      classification: enrichedSession.classification,
      confidence: enrichedSession.confidence,
      evidence: enrichedSession.evidence,
      connectionEstimated: enrichedSession.connectionEstimated,
      connectionInference: enrichedSession.connectionInference,
      direction: enrichedSession.direction,
      technologyStart: enrichedSession.events?.find((item) => item.technology)?.technology || "Unknown",
      technologyEnd: lastTechnology(enrichedSession.events),
      disconnectReason: enrichedSession.disconnectReason,
      disconnectCause: enrichedSession.causeCode,
      callDropReason: enrichedSession.status === "Dropped" ? enrichedSession.detailedStatus : null,
      radioFailureReason: enrichedSession.hasRadioFailure ? enrichedSession.disconnectReason : null,
      imsFailureReason: enrichedSession.hasImsFailure ? enrichedSession.disconnectReason : null,
      causeCode: enrichedSession.causeCode,
      causeName: enrichedSession.causeName,
      connectedEvidence: enrichedSession.connectedEvidence,
      connectionSupportingEvidence: enrichedSession.connectionSupportingEvidence,
      releaseEvidence: enrichedSession.releaseEvidence,
      handoverAttempts: enrichedSession.handoverAttempts,
      successfulHandovers: enrichedSession.successfulHandovers,
      failedHandovers: enrichedSession.failedHandovers,
      handovers: [
        ...(enrichedSession.handoverAttempts || []).map((item) => ({ timestamp: item.timestamp || null, result: "UNKNOWN", message: item.rawMessage || item.title || "" })),
        ...(enrichedSession.successfulHandovers || []).map((item) => ({ timestamp: item.timestamp || null, result: "SUCCESS", message: item.rawMessage || item.title || "" })),
        ...(enrichedSession.failedHandovers || []).map((item) => ({ timestamp: item.timestamp || null, result: "FAILURE", message: item.rawMessage || item.title || "" })),
      ],
      rrcRecoveryEvents: enrichedSession.rrcRecoveryEvents,
      radioIssueDetected: enrichedSession.radioIssueDetected,
      radioRecovered: enrichedSession.radioRecovered,
      sipEvents: enrichedSession.l3Analysis?.supportingMessages?.filter((entry) => /SIP/i.test(entry.label)) || [],
      imsEvents: enrichedSession.events?.filter((item) => /IMS|SIP/i.test(`${item.category || ""} ${item.domain || ""} ${item.rawMessage || ""}`)) || [],
      l3Events: enrichedSession.events?.filter((item) => item.type === "l3") || [],
      eventEvents: enrichedSession.events?.filter((item) => item.type === "event") || [],
      events: enrichedSession.events,
      warnings: enrichedSession.warnings,
      recommendations: enrichedSession.recommendations,
    };
  });
}
