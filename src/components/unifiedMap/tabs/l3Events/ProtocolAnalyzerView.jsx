import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  GitBranch,
  Info,
  Layers,
  Phone,
  Radio,
  Search,
} from "lucide-react";
import { getDirectionInfo } from "@/utils/l3Events/direction";
import { getMatchedFlowSteps } from "@/utils/l3Events/flowModels";

const RESULT_CLASS = {
  Success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Failure: "bg-red-500/15 text-red-300 border-red-500/30",
  Observed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  Ongoing: "bg-blue-500/15 text-blue-300 border-blue-500/30",
};

const COLOR_CLASS = {
  blue: "border-blue-500/40 bg-blue-500/10 text-blue-200",
  purple: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  gray: "border-slate-500/40 bg-slate-500/10 text-slate-200",
};

function formatTime(date) {
  if (!(date instanceof Date)) return "--:--:--.---";
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join(":") + `.${pad(date.getUTCMilliseconds(), 3)}`;
}

function formatDuration(ms = 0) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function firstProcedure(procedures) {
  return procedures?.[0] || null;
}

const ALL_PROCEDURES_ID = "__all-procedures__";

const MESSAGE_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "l3", label: "L3" },
  { id: "event", label: "Events" },
];

function combineProcedureResults(procedures) {
  if (procedures.some((procedure) => procedure.result === "Failure")) return "Failure";
  if (procedures.every((procedure) => procedure.result === "Success")) return "Success";
  if (procedures.some((procedure) => procedure.result === "Ongoing")) return "Ongoing";
  return "Observed";
}

function firstTruthy(procedures, key) {
  return procedures.find((procedure) => procedure[key])?.[key] || "";
}

function buildCombinedProcedure(procedures) {
  const items = procedures
    .flatMap((procedure) => procedure.items)
    .sort((left, right) => {
      const leftMs = left.timestamp instanceof Date ? left.timestamp.getTime() : 0;
      const rightMs = right.timestamp instanceof Date ? right.timestamp.getTime() : 0;
      return leftMs - rightMs;
    });

  const startTimes = procedures.map((procedure) => procedure.startTime).filter((date) => date instanceof Date);
  const endTimes = procedures.map((procedure) => procedure.endTime).filter((date) => date instanceof Date);
  const startTime = startTimes.length ? new Date(Math.min(...startTimes.map((date) => date.getTime()))) : null;
  const endTime = endTimes.length ? new Date(Math.max(...endTimes.map((date) => date.getTime()))) : null;
  const single = procedures.length === 1 ? procedures[0] : null;

  return {
    id: ALL_PROCEDURES_ID,
    callId: firstTruthy(procedures, "callId"),
    name: "All Procedures",
    protocol: single?.protocol || "Multiple",
    technology: single?.technology || "Multiple",
    spec: single?.spec || "Multiple",
    section: single?.section || "Multiple",
    result: combineProcedureResults(procedures),
    items,
    startTime,
    endTime,
    durationMs: startTime && endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : 0,
    servingCell: firstTruthy(procedures, "servingCell"),
    targetCell: firstTruthy(procedures, "targetCell"),
    pci: firstTruthy(procedures, "pci"),
    earfcn: firstTruthy(procedures, "earfcn"),
    band: firstTruthy(procedures, "band"),
    tac: firstTruthy(procedures, "tac"),
    plmn: firstTruthy(procedures, "plmn"),
    flowModel: single?.flowModel || null,
    color: "gray",
  };
}

function flowModelLabel(procedure) {
  if (procedure.id === ALL_PROCEDURES_ID && !procedure.flowModel) return "Combined (All Procedures)";
  return procedure.flowModel?.name || "Generic Row Analysis";
}

function containsQuery(procedure, query) {
  if (!query) return true;
  const haystack = [
    procedure.id,
    procedure.callId,
    procedure.name,
    procedure.protocol,
    procedure.technology,
    procedure.result,
    procedure.spec,
    ...procedure.items.map((item) => `${item.officialName} ${item.summary} ${item.rawMessage}`),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function ProcedureTree({ procedures, selectedProcedureId, onSelect, query, setQuery, callScoped }) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return procedures.filter((procedure) => containsQuery(procedure, normalized));
  }, [procedures, query]);

  return (
    <aside className="h-[1120px] max-h-[calc(100vh-1px)] min-h-[420px] rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden flex flex-col">
      <div className="p-3 border-b border-slate-700 bg-slate-800/70">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <GitBranch className="h-4 w-4 text-blue-300" />
          Procedure Tree
        </div>
        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search procedures..."
            className="w-full bg-slate-950 border border-slate-700 rounded-md pl-8 pr-2 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {callScoped && procedures.length > 0 && (
        <div className="p-2 border-b border-slate-800">
          <button
            type="button"
            onClick={() => onSelect(ALL_PROCEDURES_ID)}
            className={`w-full text-left rounded-md border p-2 transition-colors ${
              selectedProcedureId === ALL_PROCEDURES_ID
                ? "border-blue-500/60 bg-blue-500/15"
                : "border-slate-800 bg-slate-950/50 hover:bg-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-orange-300 shrink-0" />
              <span className="text-xs font-semibold text-white">All Procedures</span>
              <span className="ml-auto text-[10px] text-slate-400">{procedures.length}</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Draw the full call as one combined ladder.</p>
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">No matching procedures.</div>
        ) : (
          filtered.map((procedure) => {
            const selected = procedure.id === selectedProcedureId;
            return (
              <button
                key={procedure.id}
                type="button"
                onClick={() => onSelect(procedure.id)}
                className={`w-full text-left rounded-md border p-2 transition-colors ${
                  selected
                    ? "border-blue-500/60 bg-blue-500/15"
                    : "border-slate-800 bg-slate-950/50 hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-blue-300 shrink-0">{procedure.id}</span>
                  <span className="text-xs font-semibold text-white truncate">{procedure.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500 ml-auto shrink-0" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {procedure.callId && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-200">
                      <Phone className="h-3 w-3" />
                      {procedure.callId}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${COLOR_CLASS[procedure.color] || COLOR_CLASS.gray}`}>
                    {procedure.protocol}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${RESULT_CLASS[procedure.result] || RESULT_CLASS.Ongoing}`}>
                    {procedure.result}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                  <span>{formatTime(procedure.startTime)}</span>
                  <span className="text-right">{formatDuration(procedure.durationMs)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function ProcedureSummary({ procedure }) {
  const fields = [
    ["Start", formatTime(procedure.startTime)],
    ["End", formatTime(procedure.endTime)],
    ["Duration", formatDuration(procedure.durationMs)],
    ["Flow Model", flowModelLabel(procedure)],
    ["Access", procedure.flowModel?.access || procedure.technology || "N/A"],
    ["Serving Cell", procedure.servingCell || "N/A"],
    ["Target Cell", procedure.targetCell || "N/A"],
    ["PCI", procedure.pci || "N/A"],
    ["EARFCN", procedure.earfcn || "N/A"],
    ["Technology", procedure.technology || "N/A"],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {fields.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
          <div className="text-[10px] uppercase text-slate-500">{label}</div>
          <div className="text-xs text-white font-medium truncate">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ReferenceFlowModel({ procedure }) {
  const model = procedure.flowModel;
  if (!model) return null;

  const steps = getMatchedFlowSteps(procedure);
  const observedCount = steps.filter((modelStep) => modelStep.observed).length;

  return (
    <div className="border-b border-slate-800 bg-slate-950/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white">{model.name}</span>
            <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-200">
              {model.access}
            </span>
            <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300">
              {observedCount}/{steps.length} observed
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{model.objective}</p>
        </div>
        <div className="max-w-full text-right text-[11px] text-slate-300">
          <span className="text-slate-500">KPIs:</span> {model.kpis.join(", ")}
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {steps.map((modelStep, index) => (
          <div
            key={`${model.id}-${modelStep.label}-${index}`}
            className={`min-w-[150px] rounded-md border px-2 py-1.5 ${
              modelStep.observed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-slate-700 bg-slate-900/70 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${modelStep.observed ? "bg-emerald-400" : "bg-slate-600"}`} />
              <span className="text-[10px] font-semibold uppercase text-slate-400">Step {index + 1}</span>
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold" title={modelStep.label}>
              {modelStep.label}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-slate-400" title={`${modelStep.from} -> ${modelStep.to}`}>
              {modelStep.from} {"->"} {modelStep.to}
            </div>
          </div>
        ))}
      </div>

      {model.observation && <p className="mt-2 text-[11px] text-slate-500">{model.observation}</p>}
    </div>
  );
}

function columnIndex(columns, node) {
  const normalizedNode = String(node || "").toLowerCase();
  const found = columns.findIndex((column) => column === node);
  if (found >= 0) return found;

  const fuzzy = columns.findIndex((column) => {
    const normalizedColumn = column.toLowerCase();
    return normalizedColumn.includes(normalizedNode) || normalizedNode.includes(normalizedColumn);
  });
  return fuzzy >= 0 ? fuzzy : 0;
}

function nodePosition(index, total) {
  if (total <= 1) return 50;
  const leftPadding = 7;
  const usableWidth = 86;
  return leftPadding + (index / (total - 1)) * usableWidth;
}

function isGreenPhase(item = {}) {
  return /bearer|payload|data|rtp|voice|traffic|path\W*switch|endc\W*active|en-dc\W*active|pdu\W*session|qos\W*flow/i.test(
    [item.officialName, item.title, item.summary, item.rawMessage].filter(Boolean).join(" "),
  );
}

function SequenceArrow({ item, columns, y, selected, onSelectMessage }) {
  const fromIndex = columnIndex(columns, item.from);
  const toIndex = columnIndex(columns, item.to);
  const fromX = nodePosition(fromIndex, columns.length);
  const toX = nodePosition(toIndex, columns.length);
  const lineColor = isGreenPhase(item) ? "#22c55e" : "#111827";
  const markerId = isGreenPhase(item) ? "seqArrowGreen" : "seqArrowDark";
  const midX = (fromX + toX) / 2;
  const labelWidth = Math.min(220, Math.max(124, String(item.officialName || "").length * 6.2));

  return (
    <button
      type="button"
      onClick={() => onSelectMessage(item)}
      className="absolute inset-x-0 h-8 text-left focus:outline-none"
      style={{ top: `${y - 12}px` }}
      title={item.summary || item.rawMessage || item.officialName}
    >
      <svg className="absolute inset-0 h-8 w-full overflow-visible" viewBox="0 0 100 32" preserveAspectRatio="none">
        <line
          x1={fromX}
          y1="16"
          x2={toX}
          y2="16"
          stroke={lineColor}
          strokeWidth={selected ? "0.7" : "0.45"}
          markerEnd={`url(#${markerId})`}
        />
      </svg>
      <span
        className={`absolute top-0 -translate-x-1/2 rounded-sm border px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight shadow-sm ${
          selected
            ? "border-blue-500 bg-blue-50 text-blue-900"
            : isGreenPhase(item)
            ? "border-green-300 bg-green-50 text-green-800"
            : "border-slate-300 bg-white text-slate-900"
        }`}
        style={{ left: `${midX}%`, width: `${labelWidth}px`, maxWidth: "220px" }}
      >
        <span className="block truncate">{item.type === "event" ? "EVENT: " : ""}{item.officialName}</span>
      </span>
    </button>
  );
}

function LadderDiagram({ procedure, columns, selectedMessageId, onSelectMessage, typeFilter, onTypeFilterChange }) {
  const safeColumns = procedure.flowModel?.nodes?.length ? procedure.flowModel.nodes : columns.length ? columns : ["UE", "eNodeB", "MME", "IMS", "gNB"];
  const visibleItems = typeFilter && typeFilter !== "all"
    ? procedure.items.filter((item) => item.type === typeFilter)
    : procedure.items;
  const chartHeight = Math.max(560, visibleItems.length * 46 + 155);
  const procedureTitle = procedure.flowModel?.name || procedure.name;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 overflow-hidden min-h-[520px] flex flex-col">
      <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/70 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {procedure.id === ALL_PROCEDURES_ID
              ? `All Procedures${procedure.callId ? ` — ${procedure.callId}` : ""}`
              : `${procedure.id} ${procedure.name}`}
          </h3>
          <p className="text-[11px] text-slate-400">
            Absolute and relative timing, with Event CSV annotations merged into the signaling ladder.
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded border ${RESULT_CLASS[procedure.result] || RESULT_CLASS.Ongoing}`}>
          {procedure.result}
        </span>
      </div>

      <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Show</span>
        <div className="flex items-center gap-1">
          {MESSAGE_TYPE_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onTypeFilterChange?.(option.id)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                (typeFilter || "all") === option.id
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-b border-slate-800">
        <ProcedureSummary procedure={procedure} />
      </div>

      <ReferenceFlowModel procedure={procedure} />

      <div className="flex-1 overflow-auto bg-slate-950 p-4">
        <div
          className="relative mx-auto min-w-[820px] max-w-[1120px] bg-white px-8 pb-8 pt-5 text-slate-950 shadow-xl ring-1 ring-slate-300"
          style={{ height: `${chartHeight}px` }}
        >
          <div className="mx-auto h-7 max-w-[640px] bg-blue-700 text-center text-sm font-semibold leading-7 text-white shadow-sm">
            {procedureTitle}
          </div>

          <div className="absolute left-8 right-8 top-[72px] bottom-8">
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <marker id="seqArrowDark" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto">
                  <path d="M0,0 L4,2 L0,4 Z" fill="#111827" />
                </marker>
                <marker id="seqArrowGreen" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto">
                  <path d="M0,0 L4,2 L0,4 Z" fill="#22c55e" />
                </marker>
              </defs>
              {safeColumns.map((column, index) => {
                const x = nodePosition(index, safeColumns.length);
                return (
                  <line
                    key={column}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="100"
                    stroke="#9ca3af"
                    strokeWidth="0.14"
                  />
                );
              })}
            </svg>

            {safeColumns.map((column, index) => (
              <div
                key={column}
                className="absolute top-0 -translate-x-1/2 rounded-sm bg-red-700 px-2 py-1 text-center text-[10px] font-bold text-white shadow"
                style={{ left: `${nodePosition(index, safeColumns.length)}%`, minWidth: "54px", maxWidth: "110px" }}
                title={column}
              >
                <span className="block truncate">{column}</span>
              </div>
            ))}

            <div className="absolute left-0 top-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Time
            </div>

            {visibleItems.length === 0 && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-slate-400">
                No {typeFilter === "l3" ? "L3" : "Event"} messages in this selection.
              </div>
            )}

            {visibleItems.map((item, index) => {
              const y = index * 46 + 55;
              const selected = item.id === selectedMessageId;
              return (
                <React.Fragment key={item.id}>
                  <div
                    className={`absolute left-0 -translate-y-1/2 font-mono text-[10px] ${
                      selected ? "font-bold text-blue-700" : "text-slate-500"
                    }`}
                    style={{ top: `${y}px` }}
                  >
                    {item.absoluteTimestamp || formatTime(item.timestamp)}
                  </div>
                  <SequenceArrow
                    item={item}
                    columns={safeColumns}
                    y={y}
                    selected={selected}
                    onSelectMessage={onSelectMessage}
                  />
                </React.Fragment>
              );
            })}
          </div>

          <div className="absolute bottom-3 left-8 right-8 text-center text-[10px] text-slate-600">
            Reference model: {procedure.flowModel?.observation || "Rows are aligned by inferred source and destination nodes."}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageDetails({ procedure, message }) {
  const selected = message || procedure.items[0];
  const direction = getDirectionInfo(selected);

  return (
    <aside className="h-[1520px] max-h-[calc(100vh-10px)] min-h-[420px] rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden flex flex-col">
      <div className="p-3 border-b border-slate-700 bg-slate-800/70">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Info className="h-4 w-4 text-blue-300" />
          Message Details
        </div>
        <p className="text-[11px] text-slate-400 mt-1 truncate">{selected?.officialName || "Select a ladder message"}</p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        <DetailSection
          title="Protocol"
          rows={[
            ["Direction", selected?.direction || "N/A"],
            ["Flow", direction.shortLabel],
            ["Flow Model", flowModelLabel(procedure)],
            ["Access", procedure.flowModel?.access || procedure.technology || "N/A"],
            ["Protocol", selected?.protocol || procedure.protocol],
            ["Procedure", procedure.name],
            ["Procedure ID", procedure.id],
            ["Call ID", selected?.callId || procedure.callId || "N/A"],
            ["Absolute Time", selected?.absoluteTimestamp || "N/A"],
            ["Relative Time", selected?.relativeTime || "+0 ms"],
          ]}
        />

        <DetailSection
          title="Cell"
          rows={[
            ["Serving Cell", procedure.servingCell || "N/A"],
            ["Target Cell", procedure.targetCell || "N/A"],
            ["PCI", procedure.pci || "N/A"],
            ["EARFCN", procedure.earfcn || "N/A"],
            ["Band", procedure.band || "N/A"],
            ["TAC", procedure.tac || "N/A"],
            ["PLMN", procedure.plmn || "N/A"],
          ]}
        />

        <DetailSection
          title="State"
          rows={[
            ["RRC State", /release/i.test(selected?.officialName || "") ? "RRC_IDLE" : "RRC_CONNECTED"],
            ["NAS State", /registration|attach|security|authentication/i.test(procedure.name) ? "NAS Registered" : "N/A"],
            ["Call State", procedure.callId ? (/release|disconnect/i.test(selected?.officialName || "") ? "Call Released" : "Call Active") : "Call Idle"],
          ]}
        />

        {selected?.details?.length > 0 && (
          <div>
            <h5 className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Information Elements</h5>
            <div className="space-y-1.5">
              {selected.details.map((detail, index) => (
                <div key={`${detail.label}-${index}`} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-slate-500">{detail.label}</div>
                  <div className="text-xs text-white">{detail.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DetailSection
          title="3GPP Reference"
          rows={[
            ["Specification", selected?.spec || procedure.spec || "N/A"],
            ["Section", selected?.section || procedure.section || "N/A"],
            ["KPIs", procedure.flowModel?.kpis?.join(", ") || "N/A"],
          ]}
        />
      </div>
    </aside>
  );
}

function DetailSection({ title, rows }) {
  return (
    <div>
      <h5 className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">{title}</h5>
      <div className="rounded-md border border-slate-800 bg-slate-950/50 divide-y divide-slate-800">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[100px_1fr] gap-2 px-2 py-1.5 text-xs">
            <span className="text-slate-500">{label}</span>
            <span className="text-white break-words">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RawBottomPanel({ procedure, message }) {
  const selected = message || procedure.items[0];
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_220px]">
        <div className="p-3 border-b lg:border-b-0 lg:border-r border-slate-800">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 mb-2">
            <FileText className="h-3.5 w-3.5" />
            Raw CSV Row
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200 bg-slate-950 rounded-md border border-slate-800 p-2">
            {selected?.rawMessage || "No raw message text available."}
          </pre>
        </div>
        <div className="p-3 border-b lg:border-b-0 lg:border-r border-slate-800">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 mb-2">
            <Layers className="h-3.5 w-3.5" />
            3GPP Reference
          </div>
          <div className="text-xs text-white">{selected?.spec || procedure.spec || "N/A"}</div>
          <div className="text-xs text-slate-400 mt-1">Section {selected?.section || procedure.section || "N/A"}</div>
          <div className="text-xs text-slate-400 mt-2">{procedure.name}</div>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 mb-2">
            <Clock className="h-3.5 w-3.5" />
            Timing
          </div>
          <div className="text-xs text-white">Absolute: {selected?.absoluteTimestamp || "N/A"}</div>
          <div className="text-xs text-white mt-1">Relative: {selected?.relativeTime || "+0 ms"}</div>
          <div className="text-xs text-slate-400 mt-1">Procedure: {formatDuration(procedure.durationMs)}</div>
        </div>
      </div>
    </div>
  );
}

function AnalyzerStats({ analysis }) {
  const state = analysis.states || {};
  const stats = [
    ["Rows", `${analysis.stats.analyzedRows || 0}/${analysis.stats.totalRows || 0}`, FileText],
    ["Procedures", analysis.stats.totalProcedures, Radio],
    ["Call Procedures", analysis.stats.callProcedures, Phone],
    ["Failures", analysis.stats.failures, AlertTriangle],
    ["RRC State", state.rrc || "RRC_IDLE", Activity],
    ["NAS State", state.nas || "NAS Deregistered", CheckCircle2],
    ["IMS State", state.ims || "IMS Unregistered", CheckCircle2],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
      {stats.map(([label, value, Icon]) => (
        <div key={label} className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase text-slate-500">{label}</span>
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-sm font-semibold text-white mt-1 truncate">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function ProtocolAnalyzerView({ analysis, callScoped = false }) {
  const [selectedProcedureId, setSelectedProcedureId] = useState(
    () => (callScoped ? ALL_PROCEDURES_ID : firstProcedure(analysis.procedures)?.id || ""),
  );
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [query, setQuery] = useState("");
  const [messageTypeFilter, setMessageTypeFilter] = useState("all");

  useEffect(() => {
    if (!analysis.procedures.length) {
      setSelectedProcedureId("");
      return;
    }
    if (callScoped) {
      setSelectedProcedureId(ALL_PROCEDURES_ID);
    } else {
      setSelectedProcedureId(firstProcedure(analysis.procedures).id);
    }
  }, [analysis.procedures, callScoped]);

  const isAllSelected = selectedProcedureId === ALL_PROCEDURES_ID;
  const selectedProcedure = isAllSelected
    ? buildCombinedProcedure(analysis.procedures)
    : analysis.procedures.find((procedure) => procedure.id === selectedProcedureId) || firstProcedure(analysis.procedures);

  useEffect(() => {
    if (!selectedProcedure) return;
    const items = selectedProcedure.items || [];
    const stillValid = selectedMessage && items.some((item) => item.id === selectedMessage.id);
    if (!stillValid) {
      setSelectedMessage(items[0] || null);
    }
  }, [selectedProcedure, selectedMessage]);

  if (!analysis.procedures.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-8 text-center text-sm text-slate-300">
        No Layer 3 or Event rows were found in this upload.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnalyzerStats analysis={analysis} />

      <div className="grid grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_330px] gap-3 items-start">
        <ProcedureTree
          procedures={analysis.procedures}
          selectedProcedureId={selectedProcedureId}
          callScoped={callScoped}
          onSelect={(id) => {
            setSelectedProcedureId(id);
            if (id === ALL_PROCEDURES_ID) {
              setSelectedMessage(buildCombinedProcedure(analysis.procedures).items[0] || null);
            } else {
              const next = analysis.procedures.find((procedure) => procedure.id === id);
              setSelectedMessage(next?.items[0] || null);
            }
          }}
          query={query}
          setQuery={setQuery}
        />

        <LadderDiagram
          procedure={selectedProcedure}
          columns={analysis.columns}
          selectedMessageId={selectedMessage?.id}
          onSelectMessage={setSelectedMessage}
          typeFilter={messageTypeFilter}
          onTypeFilterChange={setMessageTypeFilter}
        />

        <MessageDetails procedure={selectedProcedure} message={selectedMessage} />
      </div>

      <RawBottomPanel procedure={selectedProcedure} message={selectedMessage} />
    </div>
  );
}

export default ProtocolAnalyzerView;
