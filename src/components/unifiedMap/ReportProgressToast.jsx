import React from "react";

const formatClock = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

const formatEta = (totalSeconds) => {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (seconds < 60) return "less than a minute left";
  return `about ${Math.round(seconds / 60)} min left`;
};

/**
 * Body of the "report generating" toast: current step, percentage bar,
 * elapsed time and (once the backend can estimate it) the time left.
 */
export default function ReportProgressToast({ percent, label, elapsedSeconds, etaSeconds }) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  const hasEta = etaSeconds !== null && etaSeconds !== undefined && Number.isFinite(Number(etaSeconds));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 text-sm font-medium">
        <span className="min-w-0 break-words leading-snug">{label || "Report generating..."}</span>
        <span className="shrink-0">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs opacity-90">
        Elapsed {formatClock(elapsedSeconds)}
        {hasEta ? ` · ${formatEta(etaSeconds)}` : ""}
      </div>
    </div>
  );
}
