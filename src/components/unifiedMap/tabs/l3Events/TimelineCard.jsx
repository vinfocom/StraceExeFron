import React, { memo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const TYPE_BADGE_CLASS = {
  l3: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  event: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

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
            <span className="font-medium text-slate-100 text-sm">{item.title}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                TYPE_BADGE_CLASS[item.type] || "bg-slate-700 text-slate-300 border-slate-600"
              }`}
            >
              {item.category}
            </span>
            <span className="text-xs text-slate-400 ml-auto font-mono shrink-0">{item.timestampLabel}</span>
          </div>
          {item.summary && <p className="text-xs text-slate-400 mt-1 truncate">{item.summary}</p>}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-500 mt-1 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500 mt-1 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-700/70 space-y-2">
          <div className="text-xs text-slate-400 pt-2">
            <span className="font-semibold text-slate-300">Category:</span> {item.category}
            {item.sourceFile && <span className="ml-3 text-slate-500">Source: {item.sourceFile}</span>}
          </div>

          {item.details?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {item.details.map((detail, idx) => (
                <div key={`${detail.label}-${idx}`} className="bg-slate-900/60 rounded px-2 py-1">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">{detail.label}</div>
                  <div className="text-sm text-slate-200">{detail.value}</div>
                </div>
              ))}
            </div>
          )}

          {item.rawMessage && (
            <details className="mt-1">
              <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                Show Raw {item.type === "l3" ? "Layer 3 Message" : "Event Text"}
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto text-[11px] leading-relaxed bg-slate-950 text-slate-300 rounded p-2 whitespace-pre-wrap border border-slate-800">
                {item.rawMessage}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export const TimelineCard = memo(TimelineCardComponent);
