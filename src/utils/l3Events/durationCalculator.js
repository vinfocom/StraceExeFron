function safeDiffMs(startTime, endTime) {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) return 0;
  return Math.max(0, endTime.getTime() - startTime.getTime());
}

export function calculateDurations(session) {
  const dialTime = session.dialTime || session.startTime;
  const connectedTime = session.connectedTime || session.answerTime;
  const setupCompletionTime = connectedTime || session.setupCompletionTime;
  const disconnectTime = session.disconnectTime || session.endTime;
  const setupTimeMs = setupCompletionTime ? safeDiffMs(dialTime, setupCompletionTime) : 0;
  const setupAttemptDurationMs = safeDiffMs(dialTime, disconnectTime);
  const talkTimeMs = connectedTime ? safeDiffMs(connectedTime, disconnectTime) : 0;
  const totalDurationMs = safeDiffMs(dialTime, disconnectTime);
  const ringingDelayMs = safeDiffMs(dialTime, session.alertingTime);

  return {
    setupTimeMs,
    setupAttemptDurationMs,
    talkTimeMs,
    totalDurationMs,
    ringingDelayMs,
    durationMs: talkTimeMs,
  };
}
