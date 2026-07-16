function safeDiffMs(startTime, endTime) {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) return 0;
  return Math.max(0, endTime.getTime() - startTime.getTime());
}

export function calculateDurations(session) {
  const setupTimeMs = safeDiffMs(session.startTime, session.answerTime);
  const talkTimeMs = safeDiffMs(session.answerTime, session.endTime);
  const totalDurationMs = safeDiffMs(session.startTime, session.endTime);

  return {
    setupTimeMs,
    talkTimeMs,
    totalDurationMs,
    durationMs: totalDurationMs,
  };
}
