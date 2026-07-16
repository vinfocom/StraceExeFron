import { analyzeCalls } from "./CallAnalyzer.js";
import { buildSummary } from "./summaryBuilder.js";

export function buildCallSummary(timeline = []) {
  return buildSummary(analyzeCalls(timeline));
}

export function formatDurationMs(ms = 0) {
  if (!ms || ms < 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
