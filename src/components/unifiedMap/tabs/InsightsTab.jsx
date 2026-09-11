import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getInsightSeverity,
  getInsightSeverityColor,
  getInsightValue,
} from "../insightUtils";

const severityVariant = (severity) => {
  const normalized = String(severity || "").toUpperCase();
  if (normalized === "HIGH" || normalized === "CRITICAL") return "destructive";
  if (normalized === "MEDIUM" || normalized === "WARNING") return "warning";
  if (normalized === "LOW") return "success";
  return "secondary";
};

const InsightsTab = ({ insights = [] }) => {
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const toggleRow = (rowKey) => {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  if (!insights.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
        No insights found for the selected session.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-800/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-12 px-3 py-3" aria-label="Expand insight" />
              <th className="px-3 py-3">Severity</th>
              <th className="px-3 py-3">Title</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {insights.map((insight, index) => {
              const rowKey = String(getInsightValue(insight, "id", "Id") ?? index);
              const expanded = expandedRows.has(rowKey);
              const severity = getInsightSeverity(insight);
              const title = getInsightValue(insight, "title", "Title") || "Untitled insight";
              const description = getInsightValue(insight, "description", "Description") || "No description available";

              return (
                <React.Fragment key={`${rowKey}-${index}`}>
                  <tr className="text-slate-200 hover:bg-slate-900/80">
                    <td className="px-3 py-3 align-middle">
                      <button
                        type="button"
                        onClick={() => toggleRow(rowKey)}
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-white"
                        aria-label={`${expanded ? "Collapse" : "Expand"} insight ${title}`}
                        title={expanded ? "Collapse insight" : "Expand insight"}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <Badge
                        variant={severityVariant(severity)}
                        style={{ borderColor: getInsightSeverityColor(severity) }}
                      >
                        {severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 align-middle font-medium">{title}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-slate-900/50">
                      <td colSpan={3} className="px-12 py-4">
                        <div className="space-y-4 text-sm">
                          <div>
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Description
                            </div>
                            <p className="leading-6 text-slate-300">{description}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InsightsTab;
