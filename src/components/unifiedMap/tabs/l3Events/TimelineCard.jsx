import React, { memo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const TYPE_BADGE_CLASS = {
  l3: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  event: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const DOMAIN_BADGE_CLASS = {
  CS: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PS: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "CS+PS": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

const WARNING_SEVERITIES = new Set(["WARN", "WARNING", "ERROR", "FATAL"]);
const isWarningSeverity = (severity) => WARNING_SEVERITIES.has(String(severity || "").toUpperCase());

function TimelineCardComponent({ item }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-start gap-3 p-3 text-left"
      >
        <span className="text-xl leading-none mt-0.5">{item.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isWarningSeverity(item.severity) && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" title={`Severity: ${item.severity}`} />
            )}
            <span className="font-medium text-white text-sm">{item.title}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                TYPE_BADGE_CLASS[item.type] || "bg-slate-700 text-white border-slate-600"
              }`}
            >
              {item.category}
            </span>
            {item.domain && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  DOMAIN_BADGE_CLASS[item.domain] || "bg-slate-700 text-white border-slate-600"
                }`}
                title="PS/CS domain"
              >
                {item.domain}
              </span>
            )}
            <span className="text-xs text-white ml-auto font-mono shrink-0">{item.timestampLabel}</span>
          </div>
          {item.summary && <p className="text-xs text-white mt-1 truncate">{item.summary}</p>}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-white mt-1 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white mt-1 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-700/70 space-y-2">
          <div className="text-xs text-white pt-2">
            <span className="font-semibold text-white">Category:</span> {item.category}
            {item.domain && (
              <span className="ml-3">
                <span className="font-semibold text-white">Domain:</span> {item.domain}
              </span>
            )}
            {item.originSource && <span className="ml-3 text-white">Origin: {item.originSource}</span>}
            {item.sourceFile && <span className="ml-3 text-white">File: {item.sourceFile}</span>}
          </div>

          {item.details?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {item.details.map((detail, idx) => (
                <div key={`${detail.label}-${idx}`} className="bg-slate-900/60 rounded px-2 py-1">
                  <div className="text-[10px] text-white uppercase tracking-wide">{detail.label}</div>
                  <div className="text-sm text-white">{detail.value}</div>
                </div>
              ))}
            </div>
          )}

          {item.rawMessage && (
            <div className="mt-3">
              <span className="text-xs font-semibold text-slate-400 mb-1 block">
                Raw {item.type === "l3" ? "Layer 3 Message" : "Event Text"}:
              </span>
              <pre className="mt-1 max-h-40 overflow-auto text-[11px] leading-relaxed bg-slate-950 text-white rounded p-2 whitespace-pre-wrap border border-slate-800">
                {item.rawMessage}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const TimelineCard = memo(TimelineCardComponent);
