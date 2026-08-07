function safeDiffMs(startTime, endTime) {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) return 0;
  return Math.max(0, endTime.getTime() - startTime.getTime());
}

export function calculateDurations(session) {
  const dialTime = session.dialTime || session.startTime;
  const connectedTime = session.connectedTime || session.answerTime;
  const setupCompletionTime = connectedTime || session.setupCompletionTime;
  // endTime is normalized to the first terminal marker (Idle or explicit
  // disconnect). Prefer it over later callback cleanup rows.
  const disconnectTime = session.endTime || session.disconnectTime || session.idleTime;
  const dialToAlertingMs = session.alertingTime ? safeDiffMs(dialTime, session.alertingTime) : null;
  const callSetupTimeMs = connectedTime ? safeDiffMs(dialTime, setupCompletionTime) : null;
  const attemptDurationMs = safeDiffMs(dialTime, disconnectTime);
  const connectedDurationMs = connectedTime ? safeDiffMs(connectedTime, disconnectTime) : null;
  const setupTimeMs = callSetupTimeMs ?? 0;
  const setupAttemptDurationMs = attemptDurationMs;
  const talkTimeMs = connectedDurationMs ?? 0;
  const totalDurationMs = attemptDurationMs;
  const ringingDelayMs = dialToAlertingMs ?? 0;

  return {
    dialToAlertingMs,
    callSetupTimeMs,
    connectedDurationMs,
    attemptDurationMs,
    setupTimeMs,
    setupAttemptDurationMs,
    talkTimeMs,
    totalDurationMs,
    ringingDelayMs,
    durationMs: talkTimeMs,
  };
}
