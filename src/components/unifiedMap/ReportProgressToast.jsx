import React, { useState } from "react";

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

const linkButton =
  "cursor-pointer rounded px-1 font-semibold underline underline-offset-2 hover:opacity-80 focus:outline-none focus-visible:ring-1 focus-visible:ring-white";

/**
 * Body of the "report generating" toast: current step, percentage bar,
 * elapsed time and (once the backend can estimate it) the time left.
 * `stageLabel` (optional) adds a small "Stage 1 of 3 · Setup" line above the step,
 * used by the project-setup toast; the report toasts don't pass it.
 *
 * `onCancel` (optional) adds a Cancel control that asks "Stop this run?" first and
 * then calls onCancel. While `cancelling` is true it shows "Cancelling..." instead.
 * Toasts without onCancel look exactly as before.
 */
export default function ReportProgressToast({
  percent,
  label,
  elapsedSeconds,
  etaSeconds,
  stageLabel,
  onCancel,
  cancelling = false,
}) {
  const [confirming, setConfirming] = useState(false);
  const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  const hasEta = etaSeconds !== null && etaSeconds !== undefined && Number.isFinite(Number(etaSeconds));
  const canCancel = typeof onCancel === "function" && !cancelling;

  const press = (handler) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  };

  return (
    <div className="w-full">
      {stageLabel ? <div className="mb-0.5 text-[11px] leading-tight opacity-85">{stageLabel}</div> : null}
      <div className="flex items-center justify-between gap-3 text-sm font-medium">
        <span className={stageLabel ? "min-w-0 truncate leading-snug" : "min-w-0 break-words leading-snug"}>
          {cancelling ? "Cancelling..." : label || "Report generating..."}
        </span>
        <span className="shrink-0">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {canCancel && confirming ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span>Stop this run?</span>
          <span>
            <button type="button" className={linkButton} onClick={press(() => { setConfirming(false); onCancel(); })}>
              Yes, stop
            </button>
            <button type="button" className={linkButton} onClick={press(() => setConfirming(false))}>
              Keep running
            </button>
          </span>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-90">
          <span className="min-w-0 truncate">
            Elapsed {formatClock(elapsedSeconds)}
            {hasEta ? ` · ${formatEta(etaSeconds)}` : stageLabel ? " · calculating time left" : ""}
          </span>
          {cancelling ? (
            <span className="shrink-0">Stopping...</span>
          ) : canCancel ? (
            <button type="button" className={`${linkButton} shrink-0`} onClick={press(() => setConfirming(true))}>
              Cancel
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
