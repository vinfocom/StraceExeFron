import React, { memo, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { downloadExcelSignalingSummaryPdf } from "@/utils/l3Events/pdfReport";
import { getNrRrcPayloadInsights } from "@/utils/l3Events/nrRrcPayloadInsights";

const SOURCE_OPTIONS = ["l3", "event"];

const SEVERITY_CLASS = {
  failure: "bg-red-500/10 text-red-100",
  success: "bg-emerald-500/[0.07] text-slate-100",
  warning: "bg-amber-500/[0.08] text-amber-50",
  request: "bg-cyan-500/[0.06] text-slate-100",
  neutral: "text-slate-200",
};

const NR_RRC_MESSAGE_FIELDS = ["NR PCI", "NR ARFCN", "NR Frequency", "NR Band"];

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort();
}

function laneValue(row, lane) {
  if (!row.directionKnown) return lane === "ue" ? "—" : "";
  const from = String(row.sourceNode || "");
  const to = String(row.destinationNode || "");
  const combined = `${from} ${to}`;
  if (lane === "ue" && /\bUE\b/i.test(combined)) return from === "UE" ? "UE →" : "← UE";
  if (lane === "radio" && /(eNodeB|gNB|BTS|BSC|NodeB|RNC)/i.test(combined)) {
    const node = /(eNodeB|gNB|BTS\/BSC|NodeB\/RNC)/i.exec(combined)?.[0] || "RAN";
    return from.toLowerCase().includes(node.toLowerCase()) ? `${node} →` : `→ ${node}`;
  }
  if (lane === "core" && /(MME|AMF|IMS|MSC|Core)/i.test(combined)) {
    const node = /(MME|AMF|IMS|MSC|Core)/i.exec(combined)?.[0] || "Core";
    return from.toLowerCase().includes(node.toLowerCase()) ? `${node} →` : `→ ${node}`;
  }
  return "";
}

function laneDirection(row, lane) {
  if (!row.directionKnown || !laneValue(row, lane)) return "unknown";
  const from = String(row.sourceNode || "");
  const to = String(row.destinationNode || "");
  const hasUeSource = from === "UE";
  const hasUeDestination = to === "UE";

  if (hasUeSource) return "uplink";
  if (hasUeDestination) return "downlink";
  if (lane === "core" && /(MME|AMF|IMS|MSC|Core)/i.test(to)) return "uplink";
  if (lane === "core" && /(MME|AMF|IMS|MSC|Core)/i.test(from)) return "downlink";
  if (lane === "radio" && /(eNodeB|gNB|BTS|BSC|NodeB|RNC)/i.test(to)) return "uplink";
  if (lane === "radio" && /(eNodeB|gNB|BTS|BSC|NodeB|RNC)/i.test(from)) return "downlink";
  return "unknown";
}

function compareRows(left, right, sort) {
  const a = sort.key === "timestamp" ? left.timestamp?.getTime() : String(left[sort.key] || "").toLowerCase();
  const b = sort.key === "timestamp" ? right.timestamp?.getTime() : String(right[sort.key] || "").toLowerCase();
  const result = a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : left.rowNumber - right.rowNumber;
  return sort.direction === "asc" ? result : -result;
}

const Header = ({ label, sortKey, sort, onSort, className = "" }) => (
  <th
    className={`sticky top-0 z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-300 ${className}`}
  >
    {sortKey ? (
      <button type="button" onClick={() => onSort(sortKey)} className="flex w-full items-center gap-1 whitespace-nowrap hover:text-white">
        {label}<span className="text-slate-500">{sort.key === sortKey ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    ) : label}
  </th>
);

function formatCoordinate(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(6) : "—";
}

function ColumnTextFilter({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      placeholder={placeholder}
      className="h-7 w-full rounded border border-slate-700 bg-slate-950 px-2 text-[11px] font-normal normal-case text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
    />
  );
}

function ColumnSelectFilter({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      className="h-7 w-full rounded border border-slate-700 bg-slate-950 px-1.5 text-[11px] font-normal normal-case text-white focus:border-blue-500 focus:outline-none"
    >
      <option value="all">All Interfaces</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function DirectionFilter({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      className="h-7 w-full rounded border border-slate-700 bg-slate-950 px-1.5 text-[11px] font-normal normal-case text-white focus:border-blue-500 focus:outline-none"
    >
      <option value="all">All</option>
      <option value="uplink">Uplink</option>
      <option value="downlink">Downlink</option>
      <option value="unknown">Unknown</option>
    </select>
  );
}

const SignalingRow = memo(function SignalingRow({ row, selected, onSelect, includeLocation }) {
  const severityClass = SEVERITY_CLASS[row.severity] || SEVERITY_CLASS.neutral;
  return (
    <tr
      onClick={() => onSelect(row)}
      className={`h-8 cursor-pointer border-b border-slate-800/90 transition-colors hover:bg-blue-500/10 ${selected ? "outline outline-1 -outline-offset-1 outline-blue-400 bg-blue-500/15" : ""}`}
    >
      <td className={`border-r border-slate-800 px-2 font-mono text-[11px] whitespace-nowrap ${severityClass}`}>{row.timestampLabel}</td>
      <td className={`border-r border-slate-800 px-2 text-center font-mono text-[10px] text-cyan-200 whitespace-nowrap ${severityClass}`}>{laneValue(row, "ue")}</td>
      <td className={`border-r border-slate-800 px-2 text-center font-mono text-[10px] text-blue-200 whitespace-nowrap ${severityClass}`}>{laneValue(row, "radio")}</td>
      <td className={`border-r border-slate-800 px-2 text-center font-mono text-[10px] text-violet-200 whitespace-nowrap ${severityClass}`}>{laneValue(row, "core")}</td>
      {includeLocation && (
        <>
          <td className={`border-r border-slate-800 px-2 font-mono text-[10px] text-slate-200 whitespace-nowrap ${severityClass}`}>{formatCoordinate(row.latitude)}</td>
          <td className={`border-r border-slate-800 px-2 font-mono text-[10px] text-slate-200 whitespace-nowrap ${severityClass}`}>{formatCoordinate(row.longitude)}</td>
        </>
      )}
      <td className={`max-w-40 truncate border-r border-slate-800 px-2 text-[10px] text-slate-300 ${severityClass}`} title={row.interface}>{row.interface}</td>
      <td className="max-w-72 truncate border-r border-slate-800 px-2 text-[12px] font-medium text-white" title={row.message}>
        {row.message}
      </td>
    </tr>
  );
});

function SelectFilter({ label, value, onChange, options, allLabel = "All" }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
      <span>{label}:</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-white focus:border-blue-500 focus:outline-none">
        <option value="all">{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function DetailPanel({ row }) {
  if (!row) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a signaling row to inspect the raw message.</div>;
  const showDecodedNrRrc = /NR\s*RRC\s*Config\s*Info/i.test(String(row.message || ""));
  const decodedInsights = showDecodedNrRrc
    ? getNrRrcPayloadInsights(row).filter((detail) => NR_RRC_MESSAGE_FIELDS.includes(detail.label))
    : [];
  const messageText = decodedInsights.length > 0
    ? decodedInsights.map((detail) => `${detail.label}: ${detail.value || "—"}`).join(" | ")
    : row.rawMessage || "—";

  return (
    <div className="h-full overflow-auto bg-slate-950/95 px-2 py-1">
      <p>Message</p>
      <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-white">{messageText}</div>
    </div>
  );
}

export function ExcelSignalingView({ rows = [], calls = [], selectedCall, onSelectCall, sourceFileName = "" }) {
  const [callFilter, setCallFilter] = useState(selectedCall?.id || "all");
  const [technology, setTechnology] = useState("all");
  const [sources, setSources] = useState(new Set(SOURCE_OPTIONS));
  const [query, setQuery] = useState("");
  const [interfaceColumnFilter, setInterfaceColumnFilter] = useState("all");
  const [messageColumnFilter, setMessageColumnFilter] = useState("");
  const [ueDirection, setUeDirection] = useState("all");
  const [radioDirection, setRadioDirection] = useState("all");
  const [coreDirection, setCoreDirection] = useState("all");
  const [failureOnly, setFailureOnly] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [sort, setSort] = useState({ key: "timestamp", direction: "asc" });
  const [selectedRow, setSelectedRow] = useState(null);
  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);

  useEffect(() => setCallFilter(selectedCall?.id || "all"), [selectedCall]);

  const technologies = useMemo(() => uniqueValues(rows, "technology"), [rows]);
  const interfaces = useMemo(() => uniqueValues(rows, "interface"), [rows]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const messageNeedle = messageColumnFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (callFilter !== "all" && row.callId !== callFilter) return false;
      if (technology !== "all" && row.technology !== technology) return false;
      if (!sources.has(row.sourceType)) return false;
      if (ueDirection !== "all" && laneDirection(row, "ue") !== ueDirection) return false;
      if (radioDirection !== "all" && laneDirection(row, "radio") !== radioDirection) return false;
      if (coreDirection !== "all" && laneDirection(row, "core") !== coreDirection) return false;
      if (interfaceColumnFilter !== "all" && row.interface !== interfaceColumnFilter) return false;
      if (messageNeedle && !String(row.message || "").toLowerCase().includes(messageNeedle)) return false;
      if (failureOnly && row.severity !== "failure") return false;
      if (!needle) return true;
      return [row.timestampLabel, row.sourceFile, row.message, row.procedure, row.protocol, row.interface, row.rawMessage, row.callId].filter(Boolean).join(" ").toLowerCase().includes(needle);
    }).sort((a, b) => compareRows(a, b, sort));
  }, [rows, callFilter, technology, sources, ueDirection, radioDirection, coreDirection, interfaceColumnFilter, messageColumnFilter, failureOnly, query, sort]);

  const exportCalls = useMemo(() => {
    if (callFilter !== "all") {
      const call = calls.find((item) => item.id === callFilter);
      return call ? [call] : [];
    }
    const visibleCallIds = new Set(filtered.map((row) => row.callId).filter(Boolean));
    return visibleCallIds.size ? calls.filter((call) => visibleCallIds.has(call.id)) : calls;
  }, [callFilter, calls, filtered]);

  const changeCall = (value) => {
    setCallFilter(value);
    onSelectCall?.(value === "all" ? null : calls.find((call) => call.id === value) || null);
  };
  const toggleSource = (source) => setSources((current) => {
    const next = new Set(current);
    if (next.has(source)) next.delete(source); else next.add(source);
    return next;
  });
  const clearFilters = () => {
    setCallFilter("all");
    setTechnology("all");
    setSources(new Set(SOURCE_OPTIONS));
    setQuery("");
    setInterfaceColumnFilter("all");
    setMessageColumnFilter("");
    setUeDirection("all");
    setRadioDirection("all");
    setCoreDirection("all");
    setFailureOnly(false);
    setIncludeLocation(false);
    onSelectCall?.(null);
  };
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const downloadSummary = async () => {
    if (!filtered.length || isDownloadingSummary) return;
    setIsDownloadingSummary(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const scopedCall = callFilter === "all" ? null : exportCalls[0] || null;
      downloadExcelSignalingSummaryPdf({
        sourceFileName,
        rows: filtered,
        calls: exportCalls,
        selectedCall: scopedCall,
        includeLocation,
      });
      toast.success("Summary PDF downloaded.");
    } catch (error) {
      console.error("Failed to download summary PDF:", error);
      toast.error(error?.message || "Failed to generate summary PDF.");
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  const columnCount = includeLocation ? 8 : 6;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-900/80">
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800/70 px-1 py-1">
        <SelectFilter label="Call" value={callFilter} onChange={changeCall} options={calls.map((call) => call.id)} allLabel="All Calls" />
        <SelectFilter label="Technology" value={technology} onChange={setTechnology} options={technologies} />
        <div className="flex items-center gap-2 text-[11px] text-slate-400">Source:{SOURCE_OPTIONS.map((source) => <label key={source} className="flex items-center gap-1 uppercase text-slate-300"><input type="checkbox" checked={sources.has(source)} onChange={() => toggleSource(source)} className="accent-blue-500" />{source}</label>)}</div>
        <label className="flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={includeLocation} onChange={(event) => setIncludeLocation(event.target.checked)} className="accent-blue-500" />Include Lat/Lon</label>
        <label className="flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={failureOnly} onChange={(event) => setFailureOnly(event.target.checked)} className="accent-red-500" />Failures only</label>
        <div className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search signaling..." className="h-8 w-full rounded border border-slate-700 bg-slate-950 pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" /></div>
        <button type="button" onClick={clearFilters} className="flex h-8 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-300 hover:bg-slate-700"><X className="h-3 w-3" />Clear Filters</button>
        <button
          type="button"
          onClick={downloadSummary}
          disabled={!filtered.length || isDownloadingSummary}
          className="flex h-8 items-center gap-1.5 rounded border border-blue-500/60 bg-blue-600 px-3 text-[11px] font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDownloadingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download Summary
        </button>
      </div>
      <div className="shrink-0 flex items-center justify-between border-b border-slate-800 px-1 py-0.5 text-[10px] text-slate-400">
        <span>Showing {filtered.length.toLocaleString()} matching rows ({rows.length.toLocaleString()} total)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`w-full border-collapse ${includeLocation ? "min-w-[1180px]" : "min-w-[980px]"}`}>
          <thead>
            <tr>
              <Header label="Timestamp" sortKey="timestamp" sort={sort} onSort={changeSort} />
              <Header label="UE" />
              <Header label="eNB/gNB" />
              <Header label="MME/AMF/Core" />
              {includeLocation && (
                <>
                  <Header label="Lat" />
                  <Header label="Lon" />
                </>
              )}
              <Header label="Interface" sortKey="interface" sort={sort} onSort={changeSort} />
              <Header label="Message" sortKey="message" sort={sort} onSort={changeSort} />
            </tr>
            <tr>
              <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1" />
              <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1"><DirectionFilter value={ueDirection} onChange={setUeDirection} /></th>
              <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1"><DirectionFilter value={radioDirection} onChange={setRadioDirection} /></th>
              <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1"><DirectionFilter value={coreDirection} onChange={setCoreDirection} /></th>
              {includeLocation && (
                <>
                  <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1" />
                  <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1" />
                </>
              )}
              <th className="sticky top-[33px] z-10 border-b border-r border-slate-700 bg-slate-800 px-2 py-1"><ColumnSelectFilter value={interfaceColumnFilter} onChange={setInterfaceColumnFilter} options={interfaces} /></th>
              <th className="sticky top-[33px] z-10 border-b border-slate-700 bg-slate-800 px-2 py-1"><ColumnTextFilter value={messageColumnFilter} onChange={setMessageColumnFilter} placeholder="Filter message" /></th>
            </tr>
          </thead>
          <tbody>{filtered.length ? filtered.map((row) => <SignalingRow key={row.id} row={row} selected={selectedRow?.id === row.id} onSelect={setSelectedRow} includeLocation={includeLocation} />) : <tr><td colSpan={columnCount} className="py-16 text-center text-xs text-slate-500">No signaling rows match the current filters.</td></tr>}</tbody>
        </table>
      </div>
      <div className="basis-[22%] shrink-0 border-t border-slate-700 shadow-2xl shadow-black/30"><DetailPanel row={selectedRow} /></div>
    </div>
  );
}
