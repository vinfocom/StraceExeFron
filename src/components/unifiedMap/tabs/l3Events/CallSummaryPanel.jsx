import React, { useState } from "react";
import { Phone, PhoneMissed, PhoneOff, Clock, ChevronDown, ChevronUp } from "lucide-react";

import { StatCard } from "../../common/StatCard";
import { formatDurationMs } from "@/utils/l3Events/callSummaryBuilder";

const STATUS_BADGE_CLASS = {
  Connected: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Dropped: "bg-red-500/15 text-red-300 border-red-500/30",
  "Not Connected": "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

export const CallSummaryPanel = ({ summary, selectedCallId, onSelectCall }) => {
  const [expanded, setExpanded] = useState(false);

  if (!summary || summary.totalCalls === 0) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Call Summary (CS)</h4>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          {expanded ? "Hide" : "Show"} calls
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard icon={Phone} label="Calls Made" value={summary.totalCalls} color="blue"  />
        <StatCard icon={Phone} label="Connected" value={summary.connected} color="green"  />
        <StatCard icon={PhoneOff} label="Dropped" value={summary.dropped} color="red"  />
        <StatCard icon={PhoneMissed} label="Not Connected" value={summary.notConnected} color="yellow"  />
        <StatCard
          icon={Clock}
          label="Total Duration"
          value={formatDurationMs(summary.totalDurationMs)}
          color="cyan"
          
        />
      </div>

      

      {expanded && (
        <div className="overflow-x-auto border border-slate-300/30 rounded-xl p-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700">
                <th className="text-left py-1.5 pr-3 font-medium">Start</th>
                <th className="text-left py-1.5 pr-3 font-medium">End</th>
                <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                <th className="text-left py-1.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {summary.calls.map((call) => {
                const isSelected = call.id === selectedCallId;
                const isClickable = Boolean(call.startTime && onSelectCall);
                return (
                  <tr
                    key={call.id}
                    onClick={isClickable ? () => onSelectCall(call) : undefined}
                    title={isClickable ? "View this call's events in the timeline" : undefined}
                    className={`border-b border-slate-800/70 ${
                      isClickable ? "cursor-pointer hover:bg-slate-700/40" : ""
                    } ${isSelected ? "bg-blue-500/10" : ""}`}
                  >
                    <td className="py-1.5 pr-3 font-mono text-slate-300">
                      {call.startTime
                        ? call.startTime.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })
                        : "--:--:--"}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-slate-300">
                      {call.endTime
                        ? call.endTime.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })
                        : "--:--:--"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          STATUS_BADGE_CLASS[call.status] || "bg-slate-700 text-slate-300 border-slate-600"
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-300">{formatDurationMs(call.durationMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
