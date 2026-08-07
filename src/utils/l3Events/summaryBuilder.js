const SUMMARY_COUNTER_KEYS = [
  "connected",
  "dropped",
  "notConnected",
  "busy",
  "rejected",
  "setupFailures",
  "ongoing",
  "unknown",
];

function incrementForStatus(summary, status, detailedStatus) {
  if (status === "Connected") summary.connected += 1;
  else if (status === "Dropped") summary.dropped += 1;
  else summary.notConnected += 1;

  if (detailedStatus === "Busy") summary.busy += 1;
  else if (detailedStatus === "Rejected") summary.rejected += 1;
  else if (detailedStatus === "Call Setup Failure") summary.setupFailures += 1;
  else if (detailedStatus === "Ongoing") summary.ongoing += 1;
  else if (detailedStatus === "Unknown") summary.unknown += 1;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildSummary(calls = []) {
  const summary = {
    totalCalls: calls.length,
    connected: 0,
    dropped: 0,
    notConnected: 0,
    busy: 0,
    rejected: 0,
    setupFailures: 0,
    ongoing: 0,
    unknown: 0,
    averageSetupTime: 0,
    averageTalkTime: 0,
    totalDurationMs: 0,
    totalConnectedDurationMs: 0,
    totalAttemptDurationMs: 0,
    successRate: 0,
    calls,
  };

  const setupTimes = [];
  const talkTimes = [];

  for (const call of calls) {
    incrementForStatus(summary, call.status, call.detailedStatus);
    const connectedDurationMs = call.connectedDurationMs ?? call.talkTimeMs ?? 0;
    const attemptDurationMs = call.attemptDurationMs ?? call.totalDurationMs ?? 0;
    summary.totalConnectedDurationMs += connectedDurationMs;
    summary.totalAttemptDurationMs += attemptDurationMs;
    if (call.callSetupTimeMs > 0) setupTimes.push(call.callSetupTimeMs);
    else if (call.setupTimeMs > 0) setupTimes.push(call.setupTimeMs);
    if (connectedDurationMs > 0) talkTimes.push(connectedDurationMs);
  }

  // Keep the historical field used by reports/UI, but define "call
  // duration" as connected media time rather than ringing/setup attempts.
  summary.totalDurationMs = summary.totalConnectedDurationMs;

  summary.averageSetupTime = average(setupTimes);
  summary.averageTalkTime = average(talkTimes);
  summary.successRate = summary.totalCalls > 0
    ? Number((summary.connected / summary.totalCalls).toFixed(3))
    : 0;

  SUMMARY_COUNTER_KEYS.forEach((key) => {
    if (typeof summary[key] !== "number") summary[key] = 0;
  });

  return summary;
}
