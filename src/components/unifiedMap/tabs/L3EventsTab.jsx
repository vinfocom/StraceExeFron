import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Upload, Loader2, AlertTriangle, X, Search, Play, Pause, RotateCcw, Rewind, FastForward, Hand, PhoneCall, PhoneOff } from "lucide-react";
import { GoogleMap, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { DataFilterExtension } from "@deck.gl/extensions";
import { Rnd } from "react-rnd";
import { extractL3AndEventFiles } from "@/utils/l3Events/zipParser";
import { parseL3CSV } from "@/utils/l3Events/l3Parser";
import { parseEventCSV } from "@/utils/l3Events/eventParser";
import { parseNetworkLogCSV } from "@/utils/l3Events/networkLogParser";
import { mergeTimeline } from "@/utils/l3Events/timelineBuilder";
import { buildCallSummary, formatDurationMs } from "@/utils/l3Events/callSummaryBuilder";
import { buildProtocolAnalysis } from "@/utils/l3Events/protocolAnalyzer";
import { ProtocolAnalyzerView } from "./l3Events/ProtocolAnalyzerView";
import { TimelineCard } from "./l3Events/TimelineCard";
import { ExcelSignalingView } from "./l3Events/ExcelSignalingView";
import { buildUnifiedSignalingRows } from "@/utils/l3Events/signalingModel";
import { getNrRrcPayloadInsights } from "@/utils/l3Events/nrRrcPayloadInsights";
import useColorForLog from "@/hooks/useColorForLog";
import {
  GOOGLE_MAPS_LOADER_OPTIONS,
  getGoogleMapsConfigError,
  getGoogleMapsErrorMessage,
} from "@/lib/googleMapsLoader";

const VIEW_TABS = [
  { id: "summary", label: "Call Summary" },
  { id: "map", label: "Map View" },
  { id: "excel", label: "Excel View" },
  { id: "analyzer", label: "Analyzer" },
  { id: "l3", label: "All L3 Messages" },
  { id: "events", label: "All Events" },
];

const NR_RRC_MESSAGE_FIELDS = ["NR PCI", "NR ARFCN", "NR Frequency", "NR Band"];
const NR_RRC_MAP_RAW_FIELD_LABELS = {
  "NR PCI": "PCI",
  "NR ARFCN": "EARFCN / NR ARFCN",
  "NR Frequency": "Frequency",
  "NR Band": "Band",
};
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };
const MAP_INTERFACE_COLOR_STORAGE_KEY = "l3-events-map-interface-colors";
const MAP_COLOR_MODE_STORAGE_KEY = "l3-events-map-color-mode";
const MAP_TRAIL_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });
const MAX_VISIBLE_EVENT_MARKERS = 75;
const MAX_VISIBLE_MAP_MESSAGES = 1000;
const MAP_MESSAGE_ROW_HEIGHT = 52;
const MAP_MESSAGE_OVERSCAN = 8;
const CALL_MARKER_TYPES = new Set(["call-start", "disconnect", "dropped", "not-connected"]);
const RADIO_MARKER_TYPES = new Set([
  "vonr-start", "volte-start", "rrc-configuration", "rrc-request",
  "endc-start", "endc-end", "endc-failure", "rach", "rach-failure",
]);
const MAP_INTERFACE_COLOR_PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#f59e0b",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#84cc16",
  "#64748b",
];
const MAP_UNKNOWN_RSRP_COLOR = "#64748b";
const HANDOVER_FAILURE_TEXT_RE = /\b(?:hand(?:\s|-)?over|ho)\b.{0,120}\b(?:fail(?:ed|ure|uire)?|reject(?:ed)?|drop|timeout|abort(?:ed)?)\b|\bhandover\s*fail(?:ure|uire)?\b/i;

const normalizeMapLabel = (value = "") => String(value)
  .replace(/^\(new\)\s*/i, "")
  .replace(/^.*?\s*->\s*/, "")
  .replace(/^-?\d+\(([^)]+)\).*$/, "$1")
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase()
  .replace(/\b\w/g, (character) => character.toUpperCase());

function detailValue(item, label) {
  return item?.details?.find((detail) => detail.label === label)?.value || "";
}

function getMapPointInterface(item) {
  return normalizeMapLabel(
    item?.interface
      || detailValue(item, "Interface")
      || item?.sourceCategory
      || item?.protocol
      || item?.category
      || (item?.sourceType === "l3" || item?.type === "l3" ? "L3" : "Event"),
  );
}

function getDefaultMapInterfaceColor(label, index = 0) {
  if (/fail|drop|reject|error/i.test(label)) return "#ef4444";
  if (/lte|4g/i.test(label)) return "#22c55e";
  if (/nr|5g/i.test(label)) return "#38bdf8";
  if (/nas|ims|sip|core|amf|mme/i.test(label)) return "#a78bfa";
  if (/rrc/i.test(label)) return "#f59e0b";
  return MAP_INTERFACE_COLOR_PALETTE[index % MAP_INTERFACE_COLOR_PALETTE.length];
}

function hexToRgbArray(hex, alpha = 255) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [100, 116, 139, alpha];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
    alpha,
  ];
}

export function buildRsrpByRowId(analysis) {
  const byId = new Map();
  analysis?.procedures?.forEach((procedure) => {
    if (!Number.isFinite(Number(procedure.rsrpValue))) return;
    procedure.items?.forEach((item) => {
      if (!item?.id || byId.has(item.id)) return;
      byId.set(item.id, {
        value: Number(procedure.rsrpValue),
        label: procedure.rsrpSummary || procedure.rsrp || `${Number(procedure.rsrpValue).toFixed(0)} dBm`,
        matchedAt: procedure.rsrpMatchedAt || "",
      });
    });
  });
  return byId;
}

export const L3EventsTab = () => {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [networkLogRows, setNetworkLogRows] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [activeView, setActiveView] = useState("summary");
  const [search, setSearch] = useState("");

  const fileInputRef = useRef(null);

 

  const handleFile = useCallback(async (files) => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;

    setStatus("loading");
    setErrorMessage("");
    setWarningMessage("");
    setFileName(selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files selected`);
    setSelectedCall(null);
    setActiveView("summary");
    setSearch("");

    try {
      const extractedFiles = await Promise.all(selectedFiles.map((file) => extractL3AndEventFiles(file)));
      const l3Files = extractedFiles.flatMap((entry) => entry.l3Files);
      const eventFiles = extractedFiles.flatMap((entry) => entry.eventFiles);

      if (!l3Files.length && !eventFiles.length) {
        setTimeline([]);
        setNetworkLogRows([]);
        setStatus("error");
        setErrorMessage("The selected files do not contain supported Layer 3 or Event logs.");
        return;
      }

      const l3Rows = l3Files.flatMap((f) => parseL3CSV(f.text, f.name));
      const eventRows = eventFiles.flatMap((f) => parseEventCSV(f.text, f.name));
      const networkRows = extractedFiles
        .flatMap((entry) => entry.networkLogFiles || [])
        .flatMap((f) => parseNetworkLogCSV(f.text, f.name));
      const merged = mergeTimeline(l3Rows, eventRows);

      let warning = "";
      if (!l3Files.length) warning = "No Layer 3 logs found.";
      else if (!eventFiles.length) warning = "No Event logs found.";

      setTimeline(merged);
      setNetworkLogRows(networkRows);
      setWarningMessage(warning);
      setStatus("ready");
    } catch (error) {
      setTimeline([]);
      setNetworkLogRows([]);
      setStatus("error");
      setErrorMessage("Failed to read the selected files. Please confirm they are valid CSV, ZIP, or .xlsx workbooks.");
    }
  }, []);

  const onInputChange = (event) => {
    const files = event.target.files;
    handleFile(files);
    event.target.value = "";
  };

  const filteredProtocolTimeline = useMemo(() => {
    const callStart = selectedCall?.startTime?.getTime();
    const callEnd = (selectedCall?.endTime || selectedCall?.startTime)?.getTime();

    return timeline.filter((item) => {
      if (selectedCall) {
        const t = item.timestamp?.getTime();
        if (t == null || callStart == null || callEnd == null || t < callStart || t > callEnd) return false;
      }
      return true;
    });
  }, [timeline, selectedCall]);

  const handleSelectCall = useCallback((call) => {
    setSelectedCall(call?.startTime ? call : null);
  }, []);

  const callSummary = useMemo(() => buildCallSummary(timeline), [timeline]);
  const fullProtocolAnalysis = useMemo(() => buildProtocolAnalysis(timeline, networkLogRows), [timeline, networkLogRows]);
  const enrichedCallSummary = useMemo(
    () => enrichCallSummaryTechnology(callSummary, fullProtocolAnalysis.procedures),
    [callSummary, fullProtocolAnalysis.procedures],
  );
  const protocolAnalysis = useMemo(() => buildProtocolAnalysis(filteredProtocolTimeline, networkLogRows), [filteredProtocolTimeline, networkLogRows]);
  const signalingRows = useMemo(
    () => buildUnifiedSignalingRows(timeline, enrichedCallSummary.calls, fullProtocolAnalysis),
    [timeline, enrichedCallSummary.calls, fullProtocolAnalysis],
  );
  const rsrpByRowId = useMemo(() => buildRsrpByRowId(fullProtocolAnalysis), [fullProtocolAnalysis]);
  const mapPoints = useMemo(() => buildMapPoints(signalingRows, rsrpByRowId), [signalingRows, rsrpByRowId]);
  const l3Messages = useMemo(() => timeline.filter((item) => item.type === "l3"), [timeline]);
  const eventMessages = useMemo(() => timeline.filter((item) => item.type === "event"), [timeline]);
  const visibleRawMessages = useMemo(() => {
    const source = activeView === "events" ? eventMessages : l3Messages;
    const query = search.trim().toLowerCase();
    if (!query) return source;
    return source.filter((item) => {
      const haystack = [
        item.timestampLabel,
        item.title,
        item.category,
        item.domain,
        item.summary,
        item.rawMessage,
        item.sourceFile,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [activeView, eventMessages, l3Messages, search]);

  return (
    <div className="flex h-full w-full max-w-full min-w-0 flex-col overflow-hidden">
      <div className="w-full max-w-full min-w-0 shrink-0 overflow-hidden border-b border-slate-700 bg-slate-800/60">
        <div className="flex w-full max-w-full min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">
              {fileName || "L3 Events"}
            </h2>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden">
            {status === "ready" && (
              <div className="scrollbar-hide flex min-w-0 flex-1 justify-end gap-2 overflow-x-auto overflow-y-hidden">
                {VIEW_TABS.map((tab) => {
                  const count = tab.id === "summary" ? (enrichedCallSummary?.totalCalls ?? 0) : tab.id === "map" ? mapPoints.length : tab.id === "excel" ? signalingRows.length : tab.id === "l3" ? l3Messages.length : tab.id === "events" ? eventMessages.length : protocolAnalysis.stats.totalProcedures;
                  const isActive = activeView === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveView(tab.id)}
                      className={`shrink-0  border px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex shrink-0 items-center gap-2 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <Upload className="h-4 w-4" />
              {fileName ? "Change File" : "Upload CSV, ZIP, or Excel"}
            </button>
            <input ref={fileInputRef} type="file" multiple accept=".csv,.zip,.xlsx" className="hidden" onChange={onInputChange} />
            {status === "loading" && (
              <span className="flex shrink-0 items-center gap-2 text-xs text-blue-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing logs...
              </span>
            )}
          </div>
        </div>
      </div>

      {status === "idle" && (
        <div className="flex min-h-0 flex-1 items-center justify-center border border-dashed border-slate-700 text-center text-sm text-white">
          Upload a CSV, ZIP archive, or `.xlsx` workbook to build a standards-based Layer 3 and Event protocol analyzer.
        </div>
      )}

      {status === "error" && (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 border border-amber-500/30 bg-amber-500/10 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {status === "ready" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {warningMessage && (
            <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
              {warningMessage}
            </div>
          )}

          {activeView === "summary" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <HomeCallSummary summary={enrichedCallSummary} timeline={timeline} />
            </div>
          )}

          {activeView === "analyzer" && selectedCall && (
            <div className="shrink-0 flex items-center justify-between gap-2 border-b border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs">
              <span className="text-blue-300 truncate">
                Analyzer scoped to {selectedCall.id} starting at{" "}
                {selectedCall.startTime.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                className="flex items-center gap-1 text-blue-300 hover:text-blue-200 shrink-0 font-medium"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          )}

          {activeView === "map" ? (
            <L3EventsMapView points={mapPoints} />
          ) : activeView === "excel" ? (
            <ExcelSignalingView
              rows={signalingRows}
              calls={enrichedCallSummary.calls}
              selectedCall={selectedCall}
              onSelectCall={handleSelectCall}
              sourceFileName={fileName}
            />
          ) : activeView === "analyzer" ? (
            <ProtocolAnalyzerView analysis={protocolAnalysis} callScoped={Boolean(selectedCall)} />
          ) : activeView === "l3" || activeView === "events" ? (
            <div className="flex min-h-0 w-full max-w-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-900/70">
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-800/70 px-2 py-1">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {activeView === "l3" ? "All L3 Messages" : "All Event Rows"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Showing {visibleRawMessages.length.toLocaleString()} of {(activeView === "l3" ? l3Messages.length : eventMessages.length).toLocaleString()} parsed rows.
                  </p>
                </div>
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search timestamp, file, title, or raw text..."
                    className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto space-y-2">
                {visibleRawMessages.length > 0 ? (
                  visibleRawMessages.map((item) => <TimelineCard key={item.id} item={item} />)
                ) : (
                  <div className="py-10 text-center text-sm text-slate-400">
                    No matching {activeView === "l3" ? "L3 messages" : "event rows"}.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

function DiagnosticApiOverview({ summary, timeline = [] }) {
  const kpis = Array.isArray(summary.kpis) ? summary.kpis : [];
  const mobility = Array.isArray(summary.mobility) ? summary.mobility : [];
  const parameters = Array.isArray(summary.parameters) ? summary.parameters : [];
  const dashboardValues = [...kpis, ...mobility, ...parameters];
  const detectedServices = summary.detectedServices;
  const technologies = [];
  const technologyIndexes = new Map();
  (Array.isArray(summary.technologies) ? summary.technologies : []).forEach((item) => {
    const name = String(item.technology ?? item.Technology ?? "").trim();
    if (!name || /^unknown$/i.test(name)) return;
    const key = name.toLocaleLowerCase();
    const existingIndex = technologyIndexes.get(key);
    if (existingIndex !== undefined) {
      technologies[existingIndex].rows += Number(item.rows ?? item.Rows ?? 0) || 0;
      return;
    }
    technologyIndexes.set(key, technologies.length);
    technologies.push({
      name,
      rows: Number(item.rows ?? item.Rows ?? 0) || 0,
      interfaces: item.interfaces ?? item.Interfaces ?? "",
      observedEvents: item.observedEvents ?? item.ObservedEvents,
    });
  });
  technologies.sort((left, right) => right.rows - left.rows || left.name.localeCompare(right.name));
  const [activeTechnology, setActiveTechnology] = useState("");
  const [parameterColumnWidth, setParameterColumnWidth] = useState(230);
  const overviewTableRef = useRef(null);
  const resizeStartRef = useRef(null);
  const selectedTechnology = activeTechnology === "All"
    ? null
    : technologies.find((item) => item.name.toLocaleLowerCase() === activeTechnology.toLocaleLowerCase()) || technologies[0] || null;
  const showAll = activeTechnology === "All" || !selectedTechnology;
  const hasOverview = dashboardValues.length || technologies.length || summary.totalRows != null || summary.l3Rows != null || summary.eventRows != null || detectedServices;
  if (!hasOverview) return null;

  const getParameter = (item) => String(item.parameter ?? item.Parameter ?? "");
  const getResult = (item) => item.result ?? item.Result ?? "—";
  const rowsForTechnology = (technology) => timeline.filter((row) => (
    String(row.technology ?? row.Technology ?? "Unknown").trim().toLocaleLowerCase() === technology.toLocaleLowerCase()
  ));
  const countObservedEvents = (rows) => rows.reduce((counts, row) => {
    const text = [
      row.title, row.officialName, row.message, row.eventKey, row.category, row.sourceCategory,
      row.summary, row.rawMessage, row.procedure, row.protocol,
    ].filter(Boolean).join(" ");
    if (/\b(?:en[-\s]?dc|scg|secondary\s+cell\s+group|s?gnb)\b/i.test(text)
      && /\b(?:setup|addition|add|request|reconfig(?:uration)?|activation|activate|active|establish(?:ment)?)\b/i.test(text)) {
      counts.endcSetupRows += 1;
    }
    if (/\bhand[\s-]?over\b/i.test(text)) counts.handoverRows += 1;
    return counts;
  }, { endcSetupRows: 0, handoverRows: 0 });
  const backendObservedEvents = summary.observedEvents;
  const allObservedEvents = backendObservedEvents || countObservedEvents(timeline);
  const visibleObservedEvents = showAll ? allObservedEvents
    : selectedTechnology?.observedEvents || (backendObservedEvents
      ? { endcSetupRows: 0, handoverRows: 0 }
      : countObservedEvents(rowsForTechnology(selectedTechnology.name)));
  const technologyMobility = selectedTechnology
    ? mobility
      .filter((item) => getParameter(item).toLocaleLowerCase().startsWith((selectedTechnology.name + " ").toLocaleLowerCase()))
      .map((item) => ({ ...item, parameter: getParameter(item).slice(selectedTechnology.name.length).trim() }))
    : [];
  const scopedValues = selectedTechnology
    ? [...kpis, ...parameters].filter((item) => (
      String(item.technology ?? item.Technology ?? "").toLocaleLowerCase() === selectedTechnology.name.toLocaleLowerCase()
    ))
    : [];
  const tableValues = showAll
    ? [
      ...dashboardValues,
      ...(detectedServices ? [
        { parameter: "VoLTE detected", result: detectedServices.hasVolte ? "Yes" : "No" },
        { parameter: "VoLTE text rows", result: String(detectedServices.volteTextRows) },
        { parameter: "VoLTE network rows", result: String(detectedServices.volteNetworkRows) },
        { parameter: "VoLTE call -1 rows", result: String(detectedServices.volteCallMinusOneRows) },
        { parameter: "VoLTE active rows", result: String(detectedServices.volteCallActiveRows) },
        { parameter: "VoLTE blank rows", result: String(detectedServices.volteCallBlankRows) },
        { parameter: "VoNR detected", result: detectedServices.hasVonr ? "Yes" : "No" },
        { parameter: "VoNR text rows", result: String(detectedServices.vonrTextRows) },
        { parameter: "TMSI detected", result: detectedServices.hasTmsi ? "Yes" : "No" },
        { parameter: "TMSI rows", result: String(detectedServices.tmsiRows) },
        { parameter: "RRC/SIB Parameters detected", result: detectedServices.hasRrcSibParameters ? "Yes" : "No" },
        { parameter: "RRC/SIB Parameter rows", result: String(detectedServices.rrcSibParameterRows) },
        { parameter: "Network log rows", result: String(detectedServices.networkLogRows) },
      ] : []),
      ...(!backendObservedEvents ? [
        { parameter: "Observed EN-DC setup rows", result: String(allObservedEvents.endcSetupRows) },
        { parameter: "Observed handover rows", result: String(allObservedEvents.handoverRows) },
      ] : []),
    ]
    : [
      { parameter: "Technology", result: selectedTechnology.name },
      { parameter: "Rows", result: String(selectedTechnology.rows) },
      { parameter: "Interfaces", result: selectedTechnology.interfaces || "—" },
      { parameter: "Observed EN-DC setup rows", result: String(visibleObservedEvents.endcSetupRows) },
      { parameter: "Observed handover rows", result: String(visibleObservedEvents.handoverRows) },
      ...technologyMobility,
      ...scopedValues,
    ];
  const startParameterColumnResize = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: parameterColumnWidth,
    };
  };
  const moveParameterColumnResize = (event) => {
    const start = resizeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const tableWidth = overviewTableRef.current?.clientWidth || 520;
    const maxWidth = Math.max(180, tableWidth - 180);
    setParameterColumnWidth(Math.min(maxWidth, Math.max(160, start.startWidth + event.clientX - start.startX)));
  };
  const stopParameterColumnResize = (event) => {
    if (resizeStartRef.current?.pointerId === event.pointerId) resizeStartRef.current = null;
  };
  const handleParameterColumnResizeKey = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setParameterColumnWidth((width) => Math.max(160, width + (event.key === "ArrowRight" ? 20 : -20)));
  };

  return (
    <section className="mt-4 rounded-lg border border-slate-700 bg-slate-950/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-white">Overview</h4>
        <span className="text-[10px] text-slate-500">Message text observations; these are not unique handovers or confirmed successes.</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Observed EN-DC Setup Rows</div>
          <div className="mt-1 text-lg font-semibold text-white">{allObservedEvents.endcSetupRows.toLocaleString()}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Observed Handover Rows</div>
          <div className="mt-1 text-lg font-semibold text-white">{allObservedEvents.handoverRows.toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
        <nav role="tablist" aria-label="Overview by technology" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <button type="button" role="tab" aria-selected={showAll} onClick={() => setActiveTechnology("All")} className={"shrink-0 rounded px-3 py-2 text-left text-xs " + (showAll ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800")}>
            All technologies ({(summary.totalRows ?? timeline.length).toLocaleString()})
          </button>
          {technologies.map((technology) => {
            const active = !showAll && selectedTechnology?.name === technology.name;
            return (
              <button key={technology.name} type="button" role="tab" aria-selected={active} onClick={() => setActiveTechnology(technology.name)} className={"shrink-0 rounded px-3 py-2 text-left text-xs " + (active ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800")}>
                {technology.name} ({technology.rows.toLocaleString()})
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 overflow-x-auto rounded border border-slate-700" onPointerMove={moveParameterColumnResize} onPointerUp={stopParameterColumnResize} onPointerCancel={stopParameterColumnResize}>
          <table ref={overviewTableRef} className="w-full min-w-[520px] table-fixed border-collapse text-xs">
            <colgroup><col style={{ width: `${parameterColumnWidth}px` }} /><col /></colgroup>
            <thead className="bg-slate-800/90 text-left text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="relative border-b border-r border-slate-700 px-2 py-2">Parameter<button type="button" role="separator" aria-orientation="vertical" aria-label="Resize Parameter column" title="Drag to resize column" onPointerDown={startParameterColumnResize} onKeyDown={handleParameterColumnResizeKey} className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none bg-slate-600/40 hover:bg-blue-400/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-300" /></th><th className="border-b border-slate-700 px-2 py-2">Result</th></tr></thead>
            <tbody>{tableValues.map((item, index) => <tr key={getParameter(item) + "-" + index} className="border-b border-slate-800/90 last:border-b-0"><td className="border-r border-slate-800 px-2 py-1.5 text-slate-200">{getParameter(item) || "—"}</td><td className="px-2 py-1.5 text-slate-300">{getResult(item)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
export function HomeCallSummary({ summary, timeline = [] }) {
  const stats = [
    { label: "Connected", value: summary.connected || 0, className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" },
    { label: "Dropped", value: summary.dropped || 0, className: "border-red-500/35 bg-red-500/10 text-red-300" },
    { label: "Not Connected", value: summary.notConnected || 0, className: "border-amber-500/35 bg-amber-500/10 text-amber-300" },
    { label: "Avg Call Setup", value: formatAverageSetupMs(summary.averageSetupTime), className: "border-blue-500/35 bg-blue-500/10 text-blue-300" },
    { label: "Avg Connected Duration", value: formatDurationMs(summary.averageTalkTime || 0), className: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300" },
   
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Summary</h3>
          <p className="text-[11px] text-slate-400">
            {summary.totalCalls || 0} total call attempt{summary.totalCalls === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-[11px] text-slate-500">Select a tab above to open a detailed view.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-lg border p-3 ${stat.className}`}>
            <div className="text-[11px] uppercase tracking-wide opacity-80">{stat.label}</div>
            <div className="mt-1 text-2xl font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </div>
      {summary.calls?.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[980px] border-collapse text-xs">
            <thead className="bg-slate-800/90 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">Call</th>
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">Start</th>
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">End</th>
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">Technology</th>
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">Setup Time</th>
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">Call Duration</th>
                <th className="border-b border-slate-700 px-3 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {summary.calls.map((call) => {
                const technology = call.technologyStart && call.technologyEnd && call.technologyStart !== call.technologyEnd
                  ? `${call.technologyStart} → ${call.technologyEnd}`
                  : call.technologyStart || call.technologyEnd || "Unknown";
                return (
                  <tr key={call.id} className="border-b border-slate-800/90 bg-slate-950/40 text-slate-200 last:border-b-0 hover:bg-slate-800/50">
                    <td className="border-r border-slate-800 px-3 py-2 font-mono font-semibold text-blue-300">{call.id}</td>
                    <td className="border-r border-slate-800 px-3 py-2 font-mono whitespace-nowrap">{formatHomeCallTime(call.startTime)}</td>
                    <td className="border-r border-slate-800 px-3 py-2 font-mono whitespace-nowrap">{formatHomeCallTime(call.terminationTime || call.endTime)}</td>
                    <td className="border-r border-slate-800 px-3 py-2 whitespace-nowrap">{technology}</td>
                    <td className="border-r border-slate-800 px-3 py-2 whitespace-nowrap">
                      {formatHomeCallDuration(call.callSetupTimeMs, call.connectionEstimated)}
                    </td>
                    <td className="border-r border-slate-800 px-3 py-2 whitespace-nowrap">
                      {formatHomeCallDuration(call.connectedDurationMs, call.connectionEstimated)}
                    </td>
                    <td className="max-w-72 px-3 py-2 text-slate-300" title={call.disconnectReason || ""}>{call.disconnectReason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </section>
      <DiagnosticApiOverview summary={summary} timeline={timeline} />
    </div>
  );
}

function formatHomeCallTime(value) {
  if (!(value instanceof Date)) return "—";
  return value.toLocaleTimeString([], { hour12: false, timeZone: "UTC" });
}

function formatAverageSetupMs(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0.00s";
  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}m ${(totalSeconds - (minutes * 60)).toFixed(2)}s`;
}

function formatHomeCallDuration(value, estimated = false) {
  if (value === null || value === undefined) return "—";
  return `${estimated ? "~" : ""}${formatDurationMs(value)}`;
}

function isUnknownTechnology(value) {
  return !value || /^unknown$/i.test(String(value).trim());
}

function procedureTechnologyForCall(call, procedures = []) {
  const callStartMs = call?.startTime instanceof Date ? call.startTime.getTime() : null;
  const callEndDate = call?.terminationTime || call?.endTime || call?.disconnectTime || call?.startTime;
  const callEndMs = callEndDate instanceof Date ? callEndDate.getTime() : callStartMs;

  const matchingProcedures = procedures.filter((procedure) => {
    if (procedure.callId && procedure.callId === call.id) return true;
    const startMs = procedure.startTime instanceof Date ? procedure.startTime.getTime() : null;
    const endMs = procedure.endTime instanceof Date ? procedure.endTime.getTime() : startMs;
    if (callStartMs === null || callEndMs === null || startMs === null || endMs === null) return false;
    return startMs <= callEndMs && endMs >= callStartMs;
  });

  return matchingProcedures.find((procedure) => !isUnknownTechnology(procedure.technology))?.technology || "";
}

export function enrichCallSummaryTechnology(summary, procedures = []) {
  if (!summary?.calls?.length) return summary;

  return {
    ...summary,
    calls: summary.calls.map((call) => {
      const procedureTechnology = procedureTechnologyForCall(call, procedures);
      if (!procedureTechnology) return call;
      return {
        ...call,
        technologyStart: isUnknownTechnology(call.technologyStart) ? procedureTechnology : call.technologyStart,
        technologyEnd: isUnknownTechnology(call.technologyEnd) ? procedureTechnology : call.technologyEnd,
      };
    }),
  };
}

function getMapEventMarker(item = {}) {
  const milestone = String(item.milestone || "").trim().toUpperCase();
  const eventKey = String(item.eventKey || "").trim().toUpperCase();
  const handoverClassification = String(item.handoverClassification || "").trim().toLowerCase();
  const text = [item.cause, item.message, item.title, item.summary, item.rawMessage, item.category].filter(Boolean).join(" ");

  if (handoverClassification === "confirmed_handover" || milestone === "HANDOVER COMPLETE") {
    return {
      markerType: "handover",
      markerSymbol: "✋",
      markerLabel: item.handoverType || "Handover Complete",
      markerColor: "#f59e0b",
    };
  }

  if (handoverClassification === "failed_handover" || milestone === "HANDOVER FAILURE" || HANDOVER_FAILURE_TEXT_RE.test(text)) {
    return {
      markerType: "handover-failure",
      markerSymbol: "✋",
      markerLabel: "Handover Failure",
      markerColor: "#ef4444",
    };
  }

  if (milestone === "NOT CONNECTED") {
    return {
      markerType: "not-connected",
      markerSymbol: "☎",
      markerLabel: "Not Connected",
      markerColor: "#facc15",
    };
  }

  if (milestone === "DROPPED") {
    return {
      markerType: "dropped",
      markerSymbol: "☎",
      markerLabel: "Dropped Call",
      markerColor: "#ef4444",
    };
  }

  if (milestone === "CALL DISCONNECT" || eventKey === "CALL_DISCONNECTED") {
    return {
      markerType: "disconnect",
      markerSymbol: "☎",
      markerLabel: "Call End",
      markerColor: "#ef4444",
    };
  }

  if (milestone === "CALL START" || eventKey === "CALL_DIAL_INITIATED") {
    return {
      markerType: "call-start",
      markerSymbol: "☎",
      markerLabel: "Call Start",
      markerColor: "#22c55e",
    };
  }

  return null;
}

function getRadioMapEventMarker(item = {}) {
  const text = [
    item.cause, item.message, item.title, item.summary, item.rawMessage, item.category,
    item.sourceCategory, item.protocol, item.procedure, item.officialName, item.type,
    item.result, item.severity, item.eventKey, item.milestone, item.technology,
    item.technologyStart, item.technologyEnd, item.serviceType,
  ].filter(Boolean).join(" ").replace(/[_-]+/g, " ");
  const milestone = String(item.milestone || "").toUpperCase();
  const eventKey = String(item.eventKey || "").toUpperCase();
  const isVoNR = /\bvonr\b|voice\s+over\s+nr/i.test(text);
  const isVoLTE = /\bvolte\b|ims\s+volte|voice\s+over\s+lte/i.test(text);
  const callStart = milestone.includes("CALL START") || /(?:vonr|volte).*(?:start|initiated|originat|setup)/i.test(text)
    || /(?:CALL DIAL INITIATED|CALL START|VONR.*START|VOLTE.*START)/.test(eventKey)
    || /\b(?:call|voice)\b.{0,50}\b(?:start|initiated|originat(?:e|ed|ing)|setup|establish(?:ed|ment)?)\b|\b(?:start|initiated|originat(?:e|d|ing)|setup|establish(?:ed|ment)?)\b.{0,50}\b(?:call|voice)\b/i.test(text);

  if (callStart && isVoNR) return { markerType: "vonr-start", markerSymbol: "N", markerLabel: "VoNR Start", markerColor: "#8b5cf6" };
  if (callStart && isVoLTE) return { markerType: "volte-start", markerSymbol: "V", markerLabel: "VoLTE Start", markerColor: "#06b6d4" };

  if (/\b(?:scg|endc|secondary\s+cell\s+group)\b.{0,100}\b(?:fail(?:ed|ure)?|reject(?:ed|ion)?|timeout|abort(?:ed)?)\b|\b(?:scg|endc)\s*(?:failure|fail)\b|\b(?:scg|endc)(?:failure|fail)\b/i.test(text)) {
    return { markerType: "endc-failure", markerSymbol: "!", markerLabel: "EN-DC Failure", markerColor: "#ef4444" };
  }
  if (/\b(?:endc|scg|secondary\s+cell\s+group)\b.{0,100}\b(?:release|released|remove|removed|deactivat(?:e|ed|ion)|end)\b|\b(?:release|remove|deactivat(?:e|ed|ion))\b.{0,60}\b(?:endc|scg|secondary\s+cell\s+group)\b|\b(?:endc|scg)(?:release|remove|deactivation)\b/i.test(text)) {
    return { markerType: "endc-end", markerSymbol: "-", markerLabel: "EN-DC End / Release", markerColor: "#94a3b8" };
  }
  if (/\b(?:endc|scg|secondary\s+cell\s+group)\b.{0,100}\b(?:addition|add(?:ed)?|setup|activat(?:e|ed|ion)|start|establish(?:ed|ment)?)\b|\b(?:addition|add(?:ed)?|setup|activat(?:e|ed|ion))\b.{0,60}\b(?:endc|scg|secondary\s+cell\s+group)\b|\b(?:endc|scg)(?:addition|add|setup|activation)\b/i.test(text)) {
    return { markerType: "endc-start", markerSymbol: "+", markerLabel: "EN-DC Start / Add", markerColor: "#22c55e" };
  }
  if (/\b(?:rrc|radio\s+resource\s+control)\b.{0,100}\b(?:reconfiguration|configuration|config(?:ure|ured|uration)?)\b|\brrc(?:connection)?(?:reconfiguration|configuration)\b|\bnr\s+rrc\s+config\b/i.test(text)) {
    return { markerType: "rrc-configuration", markerSymbol: "CFG", markerLabel: "RRC Configuration", markerColor: "#f59e0b" };
  }
  if (/\b(?:rrc|radio\s+resource\s+control)\b.{0,100}\b(?:connection\s*)?request\b|\brrcconnectionrequest\b/i.test(text)) {
    return { markerType: "rrc-request", markerSymbol: "REQ", markerLabel: "RRC Request", markerColor: "#3b82f6" };
  }
  if (/\brach\b|\bnr\s+rach\b|random\s+access\s+(?:preamble|request|procedure)/i.test(text)) {
    const failed = /\b(?:rach|random\s+access)\b.{0,100}\b(?:fail(?:ed|ure)?|reject(?:ed|ion)?|timeout)\b/i.test(text);
    return failed
      ? { markerType: "rach-failure", markerSymbol: "!", markerLabel: "RACH Failure", markerColor: "#ef4444" }
      : { markerType: "rach", markerSymbol: "R", markerLabel: "RACH", markerColor: "#eab308" };
  }
  return null;
}

function isCallMarker(point) {
  return CALL_MARKER_TYPES.has(point?.markerType);
}

function isHandoverMarker(point) {
  return point?.markerType === "handover" || point?.markerType === "handover-failure";
}

function isRadioMarker(point) {
  return RADIO_MARKER_TYPES.has(point?.markerType);
}

export function buildMapPoints(timeline, rsrpByRowId = new Map()) {
  const toMapCoordinate = (value, min, max) => {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
  };

  return (timeline || [])
    .map((item, index) => {
      const lat = toMapCoordinate(item?.latitude, -90, 90);
      const lng = toMapCoordinate(item?.longitude, -180, 180);
      if (lat === null || lng === null) return null;
      const rsrpMatch = rsrpByRowId.get(item?.id) || null;
      const baseEventMarker = getMapEventMarker(item);
      const eventMarker = baseEventMarker?.markerType === "call-start"
        ? getRadioMapEventMarker(item) || baseEventMarker
        : baseEventMarker || getRadioMapEventMarker(item);
      return {
        id: item?.id || `l3-map-point-${index}`,
        index,
        lat,
        lng,
        type: item?.type || "event",
        category: item?.category || item?.sourceCategory || "",
        interface: item?.interface || "",
        protocol: item?.protocol || "",
        procedure: item?.procedure || "",
        title: item?.message || item?.title || item?.summary || "Message",
        summary: item?.summary || "",
        rawMessage: item?.rawMessage || "",
        cause: item?.cause || "",
        severity: item?.severity || "",
        milestone: item?.milestone || "",
        callId: item?.callId || "",
        eventKey: item?.eventKey || "",
        result: item?.result || "",
        handoverClassification: item?.handoverClassification || "",
        handoverType: item?.handoverType || "",
        handoverEvaluationReason: item?.handoverEvaluationReason || "",
        handoverSourceCell: item?.handoverSourceCell || null,
        handoverTargetCell: item?.handoverTargetCell || null,
        markerType: eventMarker?.markerType || "",
        markerSymbol: eventMarker?.markerSymbol || "",
        markerLabel: eventMarker?.markerLabel || "",
        markerColor: eventMarker?.markerColor || "",
        state: getMapPointInterface(item),
        rsrpValue: Number.isFinite(Number(rsrpMatch?.value)) ? Number(rsrpMatch.value) : null,
        rsrpLabel: rsrpMatch?.label || "",
        rsrpMatchedAt: rsrpMatch?.matchedAt || "",
        timestampLabel: item?.timestampLabel || item?.timestamp?.toLocaleTimeString([], { hour12: false, timeZone: "UTC" }) || "",
        timestampMs: item?.timestamp instanceof Date ? item.timestamp.getTime() : null,
        sourceFile: item?.sourceFile || "",
      };
    })
    .filter(Boolean);
}

function formatMapRawMessage(point) {
  if (!point) return "No raw message available.";
  const decodedInsights = getNrRrcPayloadInsights({
    rawMessage: point.rawMessage,
    message: point.title,
    interface: point.interface,
    protocol: point.protocol || point.category,
    procedure: point.procedure,
    sourceCategory: point.category,
  }).filter((detail) => NR_RRC_MESSAGE_FIELDS.includes(detail.label));

  if (decodedInsights.length > 0) {
    const decodedText = decodedInsights
      .map((detail) => `${NR_RRC_MAP_RAW_FIELD_LABELS[detail.label] || detail.label}: ${detail.value || "—"}`)
      .join("\n");
    return decodedText;
  }
  return point.rawMessage || "No raw message available.";
}

function isFailurePoint(point) {
  const text = [point?.severity, point?.title, point?.summary, point?.rawMessage, point?.cause, point?.category].filter(Boolean).join(" ");
  return HANDOVER_FAILURE_TEXT_RE.test(text) || /\b(fail(?:ed|ure|uire)?|reject(?:ed)?|timeout|error|rlf|radio link failure|dropped|forbidden|unavailable)\b|\b[45]\d{2}\b/i.test(text);
}

export function L3EventsMapView({ points, onNeedRsrpAnalysis, active = true }) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const { getThresholdInfo, getThresholdsForMetric } = useColorForLog();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showCallMarkers, setShowCallMarkers] = useState(true);
  const [showHandoverMarkers, setShowHandoverMarkers] = useState(true);
  const [showRadioMarkers, setShowRadioMarkers] = useState(true);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState(750);
  const [messageSearch, setMessageSearch] = useState("");
  const [messagePanelWidth, setMessagePanelWidth] = useState(340);
  const [messageScrollTop, setMessageScrollTop] = useState(0);
  const [messageViewportHeight, setMessageViewportHeight] = useState(420);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedEventMarker, setSelectedEventMarker] = useState(null);
  const [colorMode, setColorMode] = useState(() => {
    try {
      const savedMode = window.localStorage.getItem(MAP_COLOR_MODE_STORAGE_KEY);
      return savedMode === "rsrp" ? "rsrp" : "interface";
    } catch {
      return "interface";
    }
  });
  const [interfaceColorOverrides, setInterfaceColorOverrides] = useState(() => {
    try {
      const savedColors = JSON.parse(window.localStorage.getItem(MAP_INTERFACE_COLOR_STORAGE_KEY) || "{}");
      return savedColors && typeof savedColors === "object" && !Array.isArray(savedColors) ? savedColors : {};
    } catch {
      return {};
    }
  });
  const activeCardRef = useRef(null);
  const messageListRef = useRef(null);
  const mapStageRef = useRef(null);
  const pointSetKey = useMemo(() => `${points.length}:${points[0]?.id || ""}:${points[points.length - 1]?.id || ""}`, [points]);
  const [mapStageWidth, setMapStageWidth] = useState(0);
  const mapsError = getGoogleMapsConfigError() || (loadError ? getGoogleMapsErrorMessage(loadError) : null);
  const currentPoint = points[currentIndex] || points[0] || null;
  const handleEventMarkerClick = useCallback((point) => setSelectedEventMarker(point), []);
  const currentRawMessage = useMemo(() => formatMapRawMessage(currentPoint), [currentPoint]);
  const progressPercent = points.length > 1 ? (currentIndex / (points.length - 1)) * 100 : 100;
  const interfaceLegend = useMemo(() => {
    const counts = new Map();
    points.forEach((point) => counts.set(point.state, (counts.get(point.state) || 0) + 1));
    return Array.from(counts, ([state, count], index) => ({
      state,
      count,
      color: interfaceColorOverrides[state] || getDefaultMapInterfaceColor(state, index),
    }));
  }, [points, interfaceColorOverrides]);
  const interfaceColors = useMemo(
    () => Object.fromEntries(interfaceLegend.map(({ state, color }) => [state, color])),
    [interfaceLegend],
  );
  const rsrpThresholds = useMemo(() => (
    (getThresholdsForMetric("rsrp") || [])
      .map((threshold) => {
        const min = Number(threshold.min);
        const max = Number(threshold.max);
        const range = threshold.range || `${threshold.min} to ${threshold.max}`;
        const label = threshold.label || range;
        return {
          key: `${threshold.min}-${threshold.max}-${label}`,
          min,
          max,
          label,
          range,
          color: threshold.color || MAP_UNKNOWN_RSRP_COLOR,
        };
      })
      .filter((threshold) => Number.isFinite(threshold.min) && Number.isFinite(threshold.max))
      .sort((left, right) => left.min - right.min)
  ), [getThresholdsForMetric]);
  const rsrpLegend = useMemo(() => {
    const counts = new Map(rsrpThresholds.map((threshold) => [threshold.key, 0]));
    let unknownCount = 0;
    points.forEach((point) => {
      const thresholdInfo = getThresholdInfo(point.rsrpValue, "rsrp");
      if (!thresholdInfo) {
        unknownCount += 1;
        return;
      }
      const thresholdKey = `${thresholdInfo.min}-${thresholdInfo.max}-${thresholdInfo.label || thresholdInfo.range}`;
      counts.set(thresholdKey, (counts.get(thresholdKey) || 0) + 1);
    });
    return [
      ...rsrpThresholds.map((threshold) => ({
        ...threshold,
        count: counts.get(threshold.key) || 0,
      })),
      { key: "no-rsrp", label: "No RSRP", range: "No matched RSRP", color: MAP_UNKNOWN_RSRP_COLOR, count: unknownCount },
    ];
  }, [getThresholdInfo, points, rsrpThresholds]);
  const getMapPointColor = useCallback((point) => (
    colorMode === "rsrp"
      ? getThresholdInfo(point?.rsrpValue, "rsrp")?.color || MAP_UNKNOWN_RSRP_COLOR
      : interfaceColors[point?.state] || MAP_UNKNOWN_RSRP_COLOR
  ), [colorMode, getThresholdInfo, interfaceColors]);
  const deckTrailPoints = useMemo(
    () => points.map((point) => ({ ...point, colorHex: getMapPointColor(point) })),
    [getMapPointColor, points],
  );
  const deckActivePoint = useMemo(
    () => (currentPoint ? [{ ...currentPoint, colorHex: getMapPointColor(currentPoint) }] : []),
    [currentPoint, getMapPointColor],
  );
  const deckEventMarkers = useMemo(() => {
    const reachedPoints = showAllPoints ? points : points.slice(0, currentIndex + 1);
    const eventPoints = reachedPoints
      .filter((point) => point.markerSymbol)
      .filter((point) => {
        if (isCallMarker(point)) return showCallMarkers;
        if (isHandoverMarker(point)) return showHandoverMarkers;
        if (isRadioMarker(point)) return showRadioMarkers;
        return true;
      });
    const callMarkers = eventPoints.filter(isCallMarker);
    const otherMarkers = eventPoints
      .filter((point) => !isCallMarker(point))
      .slice(-MAX_VISIBLE_EVENT_MARKERS);

    return [...otherMarkers, ...callMarkers]
      .map((point) => ({ ...point, colorHex: point.markerColor || getMapPointColor(point) }));
  }, [currentIndex, getMapPointColor, points, showAllPoints, showCallMarkers, showHandoverMarkers, showRadioMarkers]);
  const eventMarkerStats = useMemo(() => {
    const stats = {
      handover: 0,
      handoverFailure: 0,
      callStart: 0,
      disconnect: 0,
      dropped: 0,
      notConnected: 0,
      vonrStart: 0,
      volteStart: 0,
      rrcConfiguration: 0,
      rrcRequest: 0,
      endcStart: 0,
      endcEnd: 0,
      endcFailure: 0,
      rach: 0,
      rachFailure: 0,
    };
    points.forEach((point) => {
      if (point.markerType === "handover") stats.handover += 1;
      if (point.markerType === "handover-failure") stats.handoverFailure += 1;
      if (point.markerType === "call-start") stats.callStart += 1;
      if (point.markerType === "disconnect") stats.disconnect += 1;
      if (point.markerType === "dropped") stats.dropped += 1;
      if (point.markerType === "not-connected") stats.notConnected += 1;
      if (point.markerType === "vonr-start") stats.vonrStart += 1;
      if (point.markerType === "volte-start") stats.volteStart += 1;
      if (point.markerType === "rrc-configuration") stats.rrcConfiguration += 1;
      if (point.markerType === "rrc-request") stats.rrcRequest += 1;
      if (point.markerType === "endc-start") stats.endcStart += 1;
      if (point.markerType === "endc-end") stats.endcEnd += 1;
      if (point.markerType === "endc-failure") stats.endcFailure += 1;
      if (point.markerType === "rach") stats.rach += 1;
      if (point.markerType === "rach-failure") stats.rachFailure += 1;
    });
    return stats;
  }, [pointSetKey]);
  const filteredMessagePoints = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return points.map((point, index) => ({ point, index }));
    return points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => [
        point.title,
        point.cause,
        point.rawMessage,
        point.summary,
        point.timestampLabel,
        point.sourceFile,
      ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [messageSearch, points]);
  const visibleMessagePoints = useMemo(() => {
    if (filteredMessagePoints.length <= MAX_VISIBLE_MAP_MESSAGES) return filteredMessagePoints;
    const activePos = filteredMessagePoints.findIndex(({ index }) => index === currentIndex);
    if (activePos === -1) return filteredMessagePoints.slice(0, MAX_VISIBLE_MAP_MESSAGES);
    const half = Math.floor(MAX_VISIBLE_MAP_MESSAGES / 2);
    let start = Math.max(0, activePos - half);
    const end = Math.min(filteredMessagePoints.length, start + MAX_VISIBLE_MAP_MESSAGES);
    start = Math.max(0, end - MAX_VISIBLE_MAP_MESSAGES);
    return filteredMessagePoints.slice(start, end);
  }, [filteredMessagePoints, currentIndex]);
  const messageWindowStart = Math.max(0, Math.floor(messageScrollTop / MAP_MESSAGE_ROW_HEIGHT) - MAP_MESSAGE_OVERSCAN);
  const messageWindowEnd = Math.min(
    visibleMessagePoints.length,
    messageWindowStart + Math.ceil(messageViewportHeight / MAP_MESSAGE_ROW_HEIGHT) + MAP_MESSAGE_OVERSCAN * 2,
  );
  const virtualMessagePoints = visibleMessagePoints.slice(messageWindowStart, messageWindowEnd);
  const center = points.length
    ? {
        lat: currentPoint?.lat ?? points.reduce((sum, point) => sum + point.lat, 0) / points.length,
        lng: currentPoint?.lng ?? points.reduce((sum, point) => sum + point.lng, 0) / points.length,
      }
    : DEFAULT_MAP_CENTER;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setShowAllPoints(false);
    setMessageSearch("");
    setSelectedEventMarker(null);
  }, [points]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_INTERFACE_COLOR_STORAGE_KEY, JSON.stringify(interfaceColorOverrides));
    } catch {
      // The map still works when browser storage is unavailable.
    }
  }, [interfaceColorOverrides]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_COLOR_MODE_STORAGE_KEY, colorMode);
    } catch {
      // The selected color mode is non-critical.
    }
  }, [colorMode]);

  useEffect(() => {
    if (colorMode === "rsrp") onNeedRsrpAnalysis?.();
  }, [colorMode, onNeedRsrpAnalysis]);

  useEffect(() => {
    if (!active || !mapInstance || !window.google?.maps?.event) return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.google.maps.event.trigger(mapInstance, "resize");
      if (currentPoint) mapInstance.setCenter({ lat: currentPoint.lat, lng: currentPoint.lng });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, currentPoint, mapInstance]);

  useEffect(() => {
    if (!isPlaying || points.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setCurrentIndex((index) => {
        if (index >= points.length - 1) {
          setIsPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, playbackSpeedMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeedMs, points.length]);

  useEffect(() => {
    const listEl = messageListRef.current;
    if (!listEl) return;
    const activePosition = visibleMessagePoints.findIndex(({ index }) => index === currentIndex);
    if (activePosition < 0) return;
    const activeTop = activePosition * MAP_MESSAGE_ROW_HEIGHT;
    const activeBottom = activeTop + MAP_MESSAGE_ROW_HEIGHT;
    const viewTop = listEl.scrollTop;
    const viewBottom = viewTop + listEl.clientHeight;
    if (activeTop < viewTop + MAP_MESSAGE_ROW_HEIGHT || activeBottom > viewBottom - MAP_MESSAGE_ROW_HEIGHT) {
      listEl.scrollTo({ top: Math.max(0, activeTop - MAP_MESSAGE_ROW_HEIGHT * 2), behavior: isPlaying ? "auto" : "smooth" });
    }
  }, [currentIndex, isPlaying, visibleMessagePoints]);

  useEffect(() => {
    const listEl = messageListRef.current;
    if (!listEl) return undefined;
    const updateHeight = () => setMessageViewportHeight(listEl.clientHeight || 420);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(listEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mapStageRef.current) return undefined;
    const updateWidth = () => setMapStageWidth(mapStageRef.current?.clientWidth || 0);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(mapStageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedEventMarker) return;
    if (isCallMarker(selectedEventMarker) && !showCallMarkers) {
      setSelectedEventMarker(null);
      return;
    }
    if (isHandoverMarker(selectedEventMarker) && !showHandoverMarkers) {
      setSelectedEventMarker(null);
    }
    if (isRadioMarker(selectedEventMarker) && !showRadioMarkers) {
      setSelectedEventMarker(null);
    }
  }, [selectedEventMarker, showCallMarkers, showHandoverMarkers, showRadioMarkers]);

  const togglePlayback = () => {
    if (currentIndex >= points.length - 1) setCurrentIndex(0);
    setShowAllPoints(false);
    setIsPlaying((value) => !value);
  };

  const resetPlayback = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const seekBySeconds = (seconds) => {
    setIsPlaying(false);
    setShowAllPoints(false);
    setCurrentIndex((index) => {
      const currentMs = points[index]?.timestampMs;
      if (!Number.isFinite(currentMs)) {
        return Math.min(points.length - 1, Math.max(0, index + (seconds > 0 ? 5 : -5)));
      }
      const targetMs = currentMs + seconds * 1000;
      if (seconds > 0) {
        const nextIndex = points.findIndex((point, pointIndex) => pointIndex > index && Number.isFinite(point.timestampMs) && point.timestampMs >= targetMs);
        return nextIndex >= 0 ? nextIndex : points.length - 1;
      }
      for (let pointIndex = index - 1; pointIndex >= 0; pointIndex -= 1) {
        if (Number.isFinite(points[pointIndex]?.timestampMs) && points[pointIndex].timestampMs <= targetMs) return pointIndex;
      }
      return 0;
    });
  };

  const seekByProgressPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || points.length <= 1) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setIsPlaying(false);
    setShowAllPoints(false);
    setCurrentIndex(Math.round(ratio * (points.length - 1)));
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
      if (isEditable) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBySeconds(-5);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBySeconds(5);
      } else if (event.key === "Escape") {
        event.preventDefault();
        resetPlayback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, points]);

  return (
    <div className="flex min-h-0 flex-1 w-full max-w-full min-w-0 flex-col overflow-hidden bg-slate-900/70">
      <div ref={mapStageRef} className="relative min-h-0 w-full max-w-full min-w-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 min-w-0 overflow-hidden"
          style={{ right: messagePanelWidth }}
        >
          {mapsError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-300">
              {mapsError}
            </div>
          ) : !isLoaded ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-300">
              Loading map...
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={center}
              zoom={points.length > 1 ? 13 : 15}
              onLoad={setMapInstance}
              onUnmount={() => setMapInstance(null)}
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: true,
                clickableIcons: false,
                gestureHandling: "greedy",
                scrollwheel: true,
              }}
            >
              <L3MapDeckOverlay
                map={mapInstance}
                trailPoints={deckTrailPoints}
                activePoints={deckActivePoint}
                trailEndIndex={showAllPoints ? points.length - 1 : currentIndex - 1}
                eventMarkers={deckEventMarkers}
                onEventMarkerClick={handleEventMarkerClick}
              />
              {selectedEventMarker && (
                <InfoWindow
                  position={{ lat: selectedEventMarker.lat, lng: selectedEventMarker.lng }}
                  onCloseClick={() => setSelectedEventMarker(null)}
                  options={{ pixelOffset: new window.google.maps.Size(0, -34) }}
                >
                  <L3EventMarkerInfo point={selectedEventMarker} />
                </InfoWindow>
              )}
            </GoogleMap>
          )}
          {!mapsError && isLoaded && !points.length && (
            <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-slate-900/20 px-6 text-center text-sm text-slate-700">
              No diagnostic rows have valid latitude and longitude. The map and message panel are ready when coordinates are available.
            </div>
          )}
        </div>
        <div
          className="absolute top-3 z-[5] flex max-h-[calc(100%-24px)] w-48 flex-col gap-2 text-xs text-slate-200"
          style={{ right: messagePanelWidth + 12 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="shrink-0 rounded-lg border border-slate-600/80 bg-slate-950/90 p-2 shadow-xl backdrop-blur-sm">
            <div className="mb-1.5 font-semibold text-white">Event Legend</div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                <span className="flex items-center gap-1 text-amber-400"><Hand className="h-3 w-3" /> HO</span>
                <span className="font-mono text-slate-200">{eventMarkerStats.handover.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                <span className="flex items-center gap-1 text-red-400"><Hand className="h-3 w-3" /> Fail</span>
                <span className="font-mono text-slate-200">{eventMarkerStats.handoverFailure.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                <span className="flex items-center gap-1 text-emerald-400"><PhoneCall className="h-3 w-3" /> Start</span>
                <span className="font-mono text-slate-200">{eventMarkerStats.callStart.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                <span className="flex items-center gap-1 text-red-400"><PhoneOff className="h-3 w-3" /> End</span>
                <span className="font-mono text-slate-200">{eventMarkerStats.disconnect.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                <span className="flex items-center gap-1 text-red-400"><PhoneOff className="h-3 w-3" /> Drop</span>
                <span className="font-mono text-slate-200">{eventMarkerStats.dropped.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                <span className="flex items-center gap-1 text-yellow-300"><PhoneOff className="h-3 w-3" /> NC</span>
                <span className="font-mono text-slate-200">{eventMarkerStats.notConnected.toLocaleString()}</span>
              </div>
              {[
                ["VoNR", "vonrStart", "#8b5cf6"],
                ["VoLTE", "volteStart", "#06b6d4"],
                ["RRC Config", "rrcConfiguration", "#f59e0b"],
                ["RRC Request", "rrcRequest", "#3b82f6"],
                ["EN-DC Start", "endcStart", "#22c55e"],
                ["EN-DC End", "endcEnd", "#94a3b8"],
                ["EN-DC Fail", "endcFailure", "#ef4444"],
                ["RACH", "rach", "#eab308"],
                ["RACH Fail", "rachFailure", "#ef4444"],
              ].map(([label, countKey, color]) => (
                <div key={countKey} className="flex items-center justify-between gap-1 rounded bg-slate-950 px-1.5 py-1">
                  <span className="flex min-w-0 items-center gap-1 truncate" style={{ color }}>
                    <span className="inline-flex h-3 w-4 shrink-0 items-center justify-center rounded-sm border border-current text-[8px] font-bold">
                      {countKey.startsWith("endc") ? (countKey === "endcStart" ? "+" : countKey === "endcEnd" ? "-" : "!")
                        : countKey.startsWith("rrc") ? (countKey === "rrcRequest" ? "R" : "C")
                          : countKey.startsWith("rach") ? (countKey === "rachFailure" ? "!" : "R")
                            : countKey === "vonrStart" ? "N" : "V"}
                    </span>
                    {label}
                  </span>
                  <span className="font-mono text-slate-200">{eventMarkerStats[countKey].toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto rounded-lg border border-slate-600/80 bg-slate-950/90 p-2 shadow-xl backdrop-blur-sm">
            <div className="mb-1.5 font-semibold text-white">State Legend</div>
            <div className="mb-2 grid grid-cols-2 overflow-hidden rounded border border-slate-700 bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setColorMode("interface")}
                className={`rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                  colorMode === "interface" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                Interface
              </button>
              <button
                type="button"
                onClick={() => setColorMode("rsrp")}
                className={`rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                  colorMode === "rsrp" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                RSRP
              </button>
            </div>
            <div className="space-y-1">
              {colorMode === "rsrp" ? rsrpLegend.map(({ key, label, range, count, color }) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded px-1 py-1"
                  title={range}
                >
                  <span className="h-4 w-4 shrink-0 rounded-full border border-white/70" style={{ backgroundColor: color }} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{count.toLocaleString()}</span>
                </div>
              )) : interfaceLegend.map(({ state, count, color }) => (
                <label
                  key={state}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 transition-colors hover:bg-white/10"
                  title={`Click to change the ${state} color`}
                >
                  <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full border border-white/70" style={{ backgroundColor: color }}>
                    <input
                      type="color"
                      value={color}
                      aria-label={`Change ${state} color`}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={(event) => setInterfaceColorOverrides((current) => ({
                        ...current,
                        [state]: event.target.value,
                      }))}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{state}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{count.toLocaleString()}</span>
                </label>
              ))}
            </div>
            {colorMode === "interface" && (
              <div className="mt-1.5 border-t border-slate-700 pt-1.5 text-[10px] text-slate-400">
                Click a color to customize it.
              </div>
            )}
          </div>
        </div>
        <Rnd
          size={{ width: messagePanelWidth, height: "100%" }}
          position={{ x: Math.max(0, mapStageWidth - messagePanelWidth), y: 0 }}
          disableDragging
          minWidth={260}
          maxWidth={560}
          bounds="parent"
          enableResizing={{ left: true, top: false, right: false, bottom: false, topLeft: false, topRight: false, bottomLeft: false, bottomRight: false }}
          onResizeStop={(event, direction, ref) => setMessagePanelWidth(ref.offsetWidth)}
          className="z-10"
          style={{ position: "absolute", top: 0 }}
        >
          <div className="flex h-full w-full flex-col overflow-hidden border-l border-slate-700 bg-slate-950/95 text-[10px] text-slate-200 shadow-2xl shadow-black/30 transition-colors duration-200 sm:text-xs">
            <div className="shrink-0 border-b border-slate-800">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="font-medium text-white">Messages</span>
                <span className="font-mono text-[10px] text-slate-400 sm:text-[11px]">
                  {points.length ? currentIndex + 1 : 0} / {points.length}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={messageSearch}
                  onChange={(event) => setMessageSearch(event.target.value)}
                  placeholder="Search message..."
                  className="h-8 w-full border-0 border-t border-slate-800 bg-slate-950 pl-7 pr-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </div>
            <div
              ref={messageListRef}
              onScroll={(event) => setMessageScrollTop(event.currentTarget.scrollTop)}
              className="min-h-0 flex-1 w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden"
            >
              {filteredMessagePoints.length > MAX_VISIBLE_MAP_MESSAGES && (
                <div className="border-b border-slate-800 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-400">
                  Showing {MAX_VISIBLE_MAP_MESSAGES.toLocaleString()} of {filteredMessagePoints.length.toLocaleString()} messages. Search to narrow.
                </div>
              )}
              {visibleMessagePoints.length > 0 ? (
                <>
                  <div aria-hidden="true" style={{ height: messageWindowStart * MAP_MESSAGE_ROW_HEIGHT }} />
                  {virtualMessagePoints.map(({ point, index }) => (
                    <MapMessageCard
                      key={point.id}
                      ref={index === currentIndex ? activeCardRef : null}
                      point={point}
                      stateColor={getMapPointColor(point)}
                      colorMode={colorMode}
                      active={index === currentIndex}
                      onClick={() => {
                        setIsPlaying(false);
                        setShowAllPoints(false);
                        setCurrentIndex(index);
                      }}
                    />
                  ))}
                  <div aria-hidden="true" style={{ height: Math.max(0, (visibleMessagePoints.length - messageWindowEnd) * MAP_MESSAGE_ROW_HEIGHT) }} />
                </>
              ) : (
                <div className="px-2 py-4 text-center text-xs text-slate-500">No matching messages.</div>
              )}
            </div>
            <div className="h-[28%] shrink-0 overflow-hidden border-t border-slate-700 bg-black/30 transition-colors duration-200">
              <div className="border-b border-slate-800 px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">Raw Message</div>
              <pre className="h-[calc(100%-24px)] overflow-auto whitespace-pre-wrap break-words px-2 py-1 text-xs leading-snug text-white">
                {currentRawMessage}
              </pre>
            </div>
          </div>
        </Rnd>
      </div>
      <div className="shrink-0 border-t border-slate-700 bg-slate-950/95 px-2 py-1 text-[10px] text-slate-300 sm:text-xs">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek timeline"
          aria-valuemin={1}
          aria-valuemax={points.length}
          aria-valuenow={currentIndex + 1}
          className="mb-1 h-2 w-full cursor-pointer overflow-hidden rounded-full bg-slate-800"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekByProgressPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 1) return;
            seekByProgressPointer(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              resetPlayback();
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              seekBySeconds(-5);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              seekBySeconds(5);
            }
          }}
        >
          <div
            className="h-full rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.75)] transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex min-w-0 items-center justify-center gap-2 overflow-x-auto overflow-y-hidden">
          <button
            type="button"
            onClick={resetPlayback}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-200 transition-colors duration-200 hover:bg-slate-800"
            title="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => seekBySeconds(-5)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-slate-600 bg-slate-900 px-2 text-slate-200 transition-colors duration-200 hover:bg-slate-800"
            title="Back 5 seconds"
          >
            <Rewind className="h-3.5 w-3.5" />
            5s
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-500/60 bg-blue-600 text-white shadow-[0_0_14px_rgba(37,99,235,0.45)] transition-all duration-200 hover:bg-blue-500 hover:shadow-[0_0_18px_rgba(59,130,246,0.7)]"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => seekBySeconds(5)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-slate-600 bg-slate-900 px-2 text-slate-200 transition-colors duration-200 hover:bg-slate-800"
            title="Forward 5 seconds"
          >
            5s
            <FastForward className="h-3.5 w-3.5" />
          </button>
          <label className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-slate-600 bg-slate-900 px-2 text-slate-200">
            <input
              type="checkbox"
              checked={showAllPoints}
              onChange={(event) => {
                setShowAllPoints(event.target.checked);
                if (event.target.checked) setIsPlaying(false);
              }}
              className="accent-blue-500"
            />
            Plot All
          </label>
          <button
            type="button"
            onClick={() => setShowCallMarkers((value) => !value)}
            aria-pressed={showCallMarkers}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 transition-colors duration-200 ${
              showCallMarkers
                ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                : "border-slate-600 bg-slate-900 text-slate-400 hover:bg-slate-800"
            }`}
            title={showCallMarkers ? "Hide call markers" : "Show call markers"}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Call
          </button>
          <button
            type="button"
            onClick={() => setShowHandoverMarkers((value) => !value)}
            aria-pressed={showHandoverMarkers}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 transition-colors duration-200 ${
              showHandoverMarkers
                ? "border-amber-500/70 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                : "border-slate-600 bg-slate-900 text-slate-400 hover:bg-slate-800"
            }`}
            title={showHandoverMarkers ? "Hide handover markers" : "Show handover markers"}
          >
            <Hand className="h-3.5 w-3.5" />
            Handover
          </button>
          <button
            type="button"
            onClick={() => setShowRadioMarkers((value) => !value)}
            aria-pressed={showRadioMarkers}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 transition-colors duration-200 ${
              showRadioMarkers
                ? "border-violet-500/70 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                : "border-slate-600 bg-slate-900 text-slate-400 hover:bg-slate-800"
            }`}
            title={showRadioMarkers ? "Hide radio procedure markers" : "Show radio procedure markers"}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-current text-[9px] font-bold">R</span>
            Radio
          </button>
          <select
            value={playbackSpeedMs}
            onChange={(event) => setPlaybackSpeedMs(Number(event.target.value))}
            className="h-8 shrink-0 rounded-full border border-slate-600 bg-slate-900 px-2 text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value={1200}>0.5x</option>
            <option value={750}>1x</option>
            <option value={350}>2x</option>
            <option value={150}>4x</option>
          </select>
          <span className="shrink-0 font-mono text-slate-400">{currentIndex + 1} / {points.length.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function EventMarkerGlyph({ point, className = "h-4 w-4", color }) {
  if (point?.markerType === "handover" || point?.markerType === "handover-failure") {
    return <Hand className={className} fill={color} />;
  }
  if (point?.markerType === "call-start") {
    return <PhoneCall className={className} fill={color} />;
  }
  if (isCallMarker(point)) {
    return <PhoneOff className={className} fill={color} />;
  }
  return <span>{point?.markerSymbol}</span>;
}

function formatMapCell(cell) {
  if (!cell) return "";
  return [
    cell.pci ? `PCI ${cell.pci}` : "",
    cell.cellId ? `Cell ${cell.cellId}` : "",
    cell.frequency ? `ARFCN ${cell.frequency}` : "",
    cell.rat || "",
  ].filter(Boolean).join(" · ");
}

function L3EventMarkerInfo({ point }) {
  const rawMessage = formatMapRawMessage(point);
  const details = [
    ["Time", point.timestampLabel],
    ["Type", point.markerLabel || point.milestone || point.title],
    ["Call ID", point.callId],
    ["HO Type", point.handoverType],
    ["From", formatMapCell(point.handoverSourceCell)],
    ["To", formatMapCell(point.handoverTargetCell)],
    ["Procedure", point.procedure],
    ["Protocol", point.protocol || point.category],
    ["Interface", point.interface || point.state],
    ["Result", point.severity || point.result],
    ["Evidence", point.handoverEvaluationReason],
    ["Source", point.sourceFile],
  ].filter(([, value]) => value);

  return (
    <div className="max-w-[320px] text-slate-900">
      <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-base font-bold"
          style={{ color: point.markerColor || point.colorHex }}
        >
          <EventMarkerGlyph point={point} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{point.markerLabel || point.title}</div>
          <div className="text-[11px] text-slate-500">{point.markerType || "event"}</div>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        {details.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[72px_1fr] gap-2">
            <span className="font-semibold text-slate-500">{label}</span>
            <span className="break-words text-slate-800">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-4 text-slate-700">
        {point.summary || rawMessage || "No additional event details available."}
      </div>
    </div>
  );
}

function L3MapDeckOverlay({ map, trailPoints, activePoints, trailEndIndex, eventMarkers, onEventMarkerClick }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;
    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        // Keep Google Maps DOM tooltips above the WebGL event/log layer.
        interleaved: true,
        glOptions: { preserveDrawingBuffer: false },
      });
    }

    overlayRef.current.setMap(map);
    return () => {
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers: [] });
        overlayRef.current.setMap(null);
      }
    };
  }, [map]);

  const layers = useMemo(() => [
    new ScatterplotLayer({
      id: "l3-events-trail-points",
      data: trailPoints,
      extensions: [MAP_TRAIL_FILTER_EXTENSION],
      getFilterValue: (point) => point.index,
      filterRange: [0, trailEndIndex],
      getPosition: (point) => [point.lng, point.lat],
      getFillColor: (point) => hexToRgbArray(point.colorHex, 220),
      getLineColor: [15, 23, 42, 230],
      getLineWidth: 1,
      getRadius: 4,
      lineWidthUnits: "pixels",
      radiusUnits: "pixels",
      stroked: true,
      filled: true,
      pickable: false,
      updateTriggers: { getFillColor: [trailPoints] },
    }),
    new ScatterplotLayer({
      id: "l3-events-active-point",
      data: activePoints,
      getPosition: (point) => [point.lng, point.lat],
      getFillColor: (point) => hexToRgbArray(point.colorHex, 255),
      getLineColor: [255, 255, 255, 255],
      getLineWidth: 2,
      getRadius: 10,
      lineWidthUnits: "pixels",
      radiusUnits: "pixels",
      stroked: true,
      filled: true,
      pickable: false,
      updateTriggers: {
        getFillColor: [activePoints],
      },
    }),
    new ScatterplotLayer({
      id: "l3-events-event-markers",
      data: eventMarkers,
      getPosition: (point) => [point.lng, point.lat],
      getFillColor: (point) => hexToRgbArray(point.colorHex, 255),
      getLineColor: [15, 23, 42, 245],
      getLineWidth: 1.5,
      getRadius: (point) => isCallMarker(point) ? 11 : (String(point.markerSymbol || "").length > 1 ? 15 : 9),
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      stroked: true,
      filled: true,
      pickable: true,
      onClick: ({ object }) => {
        if (object) onEventMarkerClick?.(object);
        return Boolean(object);
      },
      updateTriggers: { getFillColor: [eventMarkers] },
    }),
    new TextLayer({
      id: "l3-events-event-marker-glyphs",
      data: eventMarkers,
      getPosition: (point) => [point.lng, point.lat],
      getText: (point) => {
        if (point.markerType === "handover" || point.markerType === "handover-failure") return "↗";
        if (point.markerType === "call-start") return "☎";
        if (isCallMarker(point)) return "×";
        return point.markerSymbol || "•";
      },
      getColor: [255, 255, 255, 255],
      getSize: (point) => isCallMarker(point) ? 15 : (String(point.markerSymbol || "").length > 1 ? 10 : 12),
      sizeUnits: "pixels",
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "Arial, sans-serif",
      outlineWidth: 1,
      outlineColor: [15, 23, 42, 255],
      pickable: false,
      characterSet: "auto",
    }),
  ], [activePoints, eventMarkers, onEventMarkerClick, trailEndIndex, trailPoints]);

  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers });
  }, [layers]);

  useEffect(() => () => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: [] });
    overlayRef.current.setMap(null);
    overlayRef.current.finalize();
    overlayRef.current = null;
  }, []);

  return null;
}

const MapMessageCard = React.forwardRef(function MapMessageCard({ point, stateColor, colorMode, active, onClick }, ref) {
  const failure = isFailurePoint(point);
  const metaLabel = colorMode === "rsrp"
    ? point.rsrpLabel || "No matched RSRP"
    : point.state;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`block h-[52px] w-full max-w-full overflow-hidden border-b px-2 py-1.5 text-left transition-colors duration-200 ${
        active
          ? failure
            ? "border-red-300 bg-red-600/80 text-white shadow-[inset_0_0_18px_rgba(127,29,29,0.55)] backdrop-blur-sm"
            : "border-blue-400 bg-blue-600/90 text-white"
          : failure
            ? "border-red-500/40 bg-red-950/45 text-red-100 shadow-[inset_0_0_16px_rgba(127,29,29,0.35)] backdrop-blur-sm hover:bg-red-900/50"
            : "border-slate-800 bg-slate-900/70 text-slate-200 hover:bg-slate-800/90"
      }`}
    >
      <div className="flex min-w-0 items-start gap-1.5 text-[11px] font-semibold leading-snug sm:text-xs">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stateColor }} />
        <span className="min-w-0 truncate">{point.title || "Message"}</span>
      </div>
      <div className="mt-0.5 pl-3.5 text-[9px] font-medium uppercase tracking-wide opacity-70">{metaLabel}</div>
    </button>
  );
});

export default L3EventsTab;
