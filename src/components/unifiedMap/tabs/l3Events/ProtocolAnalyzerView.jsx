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

const LINE_COLOR = {
  blue: "#60a5fa",
  purple: "#c084fc",
  green: "#34d399",
  orange: "#fb923c",
  gray: "#94a3b8",
};

function formatTime(date) {
  return date instanceof Date ? date.toLocaleTimeString([], { hour12: false, timeZone: "UTC" }) : "--:--:--";
}

function formatDuration(ms = 0) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function firstProcedure(procedures) {
  return procedures?.[0] || null;
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

function ProcedureTree({ procedures, selectedProcedureId, onSelect, query, setQuery }) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return procedures.filter((procedure) => containsQuery(procedure, normalized));
  }, [procedures, query]);

  return (
    <aside className="min-h-[720px] rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden flex flex-col">
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

      <div className="flex-1 overflow-auto p-2 space-y-2">
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
    ["Serving Cell", procedure.servingCell || "N/A"],
    ["Target Cell", procedure.targetCell || "N/A"],
    ["PCI", procedure.pci || "N/A"],
    ["EARFCN", procedure.earfcn || "N/A"],
    ["Technology", procedure.technology || "N/A"],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {fields.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
          <div className="text-[10px] uppercase text-slate-500">{label}</div>
          <div className="text-xs text-white font-medium truncate">{value}</div>
        </div>
      ))}
    </div>
  );
}

function columnIndex(columns, node) {
  const found = columns.indexOf(node);
  return found >= 0 ? found : 0;
}

function LadderDiagram({ procedure, columns, selectedMessageId, onSelectMessage }) {
  const safeColumns = columns.length ? columns : ["UE", "eNodeB", "MME", "IMS", "gNB"];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 overflow-hidden min-h-[520px] flex flex-col">
      <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/70 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{procedure.id} {procedure.name}</h3>
          <p className="text-[11px] text-slate-400">
            Absolute and relative timing, with Event CSV annotations merged into the signaling ladder.
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded border ${RESULT_CLASS[procedure.result] || RESULT_CLASS.Ongoing}`}>
          {procedure.result}
        </span>
      </div>

      <div className="p-3 border-b border-slate-800">
        <ProcedureSummary procedure={procedure} />
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="min-w-[760px]">
          <div
            className="grid gap-2 sticky top-0 z-20 bg-slate-900/95 pb-3"
            style={{ gridTemplateColumns: `64px repeat(${safeColumns.length}, minmax(110px, 1fr))` }}
          >
            <div className="text-[10px] text-slate-500 uppercase">Delta</div>
            {safeColumns.map((column) => (
              <div key={column} className="text-center text-[11px] font-semibold text-slate-200">
                {column}
              </div>
            ))}
          </div>

          <div className="relative">
            <div
              className="absolute inset-0 grid gap-2 pointer-events-none"
              style={{ gridTemplateColumns: `64px repeat(${safeColumns.length}, minmax(110px, 1fr))` }}
            >
              <div />
              {safeColumns.map((column) => (
                <div key={column} className="flex justify-center">
                  <div className="w-px min-h-full bg-slate-700/70" />
                </div>
              ))}
            </div>

            <div className="relative z-10 space-y-3">
              {procedure.items.map((item) => {
                const fromIndex = columnIndex(safeColumns, item.from);
                const toIndex = columnIndex(safeColumns, item.to);
                const start = Math.min(fromIndex, toIndex) + 2;
                const end = Math.max(fromIndex, toIndex) + 3;
                const leftToRight = fromIndex <= toIndex;
                const selected = item.id === selectedMessageId;
                const color = LINE_COLOR[item.color] || LINE_COLOR.gray;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectMessage(item)}
                    className={`grid gap-2 w-full items-center text-left min-h-[44px] rounded-md px-1 transition-colors ${
                      selected ? "bg-blue-500/15 ring-1 ring-blue-500/50" : "hover:bg-slate-800/50"
                    }`}
                    style={{ gridTemplateColumns: `64px repeat(${safeColumns.length}, minmax(110px, 1fr))` }}
                  >
                    <div className="text-[10px] text-slate-400 font-mono">
                      {item.relativeTime || "+0 ms"}
                    </div>
                    <div
                      className="flex items-center"
                      style={{ gridColumn: `${start} / ${end}`, flexDirection: leftToRight ? "row" : "row-reverse" }}
                    >
                      <div className="h-px flex-1" style={{ backgroundColor: color }} />
                      <div
                        className="px-2 py-1 rounded border bg-slate-950 text-[11px] font-semibold text-white max-w-[260px] truncate"
                        style={{ borderColor: color }}
                        title={item.summary || item.rawMessage || item.officialName}
                      >
                        {item.type === "event" ? "EVENT: " : ""}
                        {item.officialName}
                      </div>
                      <div className="h-px flex-1" style={{ backgroundColor: color }} />
                      <span className="text-sm font-bold" style={{ color }}>
                        {leftToRight ? ">" : "<"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageDetails({ procedure, message }) {
  const selected = message || procedure.items[0];

  return (
    <aside className="min-h-[720px] rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden flex flex-col">
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
    ["Procedures", analysis.stats.totalProcedures, Radio],
    ["Call Procedures", analysis.stats.callProcedures, Phone],
    ["Failures", analysis.stats.failures, AlertTriangle],
    ["RRC State", state.rrc || "RRC_IDLE", Activity],
    ["NAS State", state.nas || "NAS Deregistered", CheckCircle2],
    ["IMS State", state.ims || "IMS Unregistered", CheckCircle2],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
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

export function ProtocolAnalyzerView({ analysis }) {
  const [selectedProcedureId, setSelectedProcedureId] = useState(firstProcedure(analysis.procedures)?.id || "");
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const first = firstProcedure(analysis.procedures);
    if (!first) {
      setSelectedProcedureId("");
      setSelectedMessage(null);
      return;
    }
    if (!analysis.procedures.some((procedure) => procedure.id === selectedProcedureId)) {
      setSelectedProcedureId(first.id);
      setSelectedMessage(first.items[0] || null);
    }
  }, [analysis.procedures, selectedProcedureId]);

  const selectedProcedure = analysis.procedures.find((procedure) => procedure.id === selectedProcedureId) || firstProcedure(analysis.procedures);

  useEffect(() => {
    if (!selectedProcedure) return;
    if (!selectedMessage || selectedMessage.procedureId !== selectedProcedure.id) {
      setSelectedMessage(selectedProcedure.items[0] || null);
    }
  }, [selectedProcedure, selectedMessage]);

  if (!analysis.procedures.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-8 text-center text-sm text-slate-300">
        No recognizable 3GPP procedures were found in this upload.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnalyzerStats analysis={analysis} />

      <div className="grid grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_330px] gap-3 items-start">
        <ProcedureTree
          procedures={analysis.procedures}
          selectedProcedureId={selectedProcedure?.id}
          onSelect={(id) => {
            setSelectedProcedureId(id);
            const next = analysis.procedures.find((procedure) => procedure.id === id);
            setSelectedMessage(next?.items[0] || null);
          }}
          query={query}
          setQuery={setQuery}
        />

        <LadderDiagram
          procedure={selectedProcedure}
          columns={analysis.columns}
          selectedMessageId={selectedMessage?.id}
          onSelectMessage={setSelectedMessage}
        />

        <MessageDetails procedure={selectedProcedure} message={selectedMessage} />
      </div>

      <RawBottomPanel procedure={selectedProcedure} message={selectedMessage} />
    </div>
  );
}

export default ProtocolAnalyzerView;
