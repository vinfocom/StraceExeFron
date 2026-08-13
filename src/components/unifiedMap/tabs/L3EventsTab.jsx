import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Upload, Loader2, AlertTriangle, X, Search, Play, Pause, RotateCcw, Rewind, FastForward } from "lucide-react";
import { CircleF, GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
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
import {
  GOOGLE_MAPS_LOADER_OPTIONS,
  getGoogleMapsConfigError,
  getGoogleMapsErrorMessage,
} from "@/lib/googleMapsLoader";

const VIEW_TABS = [
  { id: "map", label: "Map View" },
  { id: "excel", label: "Excel View" },
  { id: "analyzer", label: "Analyzer" },
  { id: "l3", label: "All L3 Messages" },
  { id: "events", label: "All Events" },
];

const NR_RRC_MESSAGE_FIELDS = ["NR PCI", "NR ARFCN", "NR Frequency", "NR Band"];
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };

export const L3EventsTab = () => {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [networkLogRows, setNetworkLogRows] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [activeView, setActiveView] = useState(null);
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
    setActiveView(null);
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
  const mapPoints = useMemo(() => buildMapPoints(timeline), [timeline]);
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
                  const count = tab.id === "map" ? mapPoints.length : tab.id === "excel" ? signalingRows.length : tab.id === "l3" ? l3Messages.length : tab.id === "events" ? eventMessages.length : protocolAnalysis.stats.totalProcedures;
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

          {!activeView && (
            <div className="min-h-0 flex-1 overflow-auto">
              <HomeCallSummary summary={enrichedCallSummary} />
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

function HomeCallSummary({ summary }) {
  const stats = [
    { label: "Connected", value: summary.connected || 0, className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" },
    { label: "Dropped", value: summary.dropped || 0, className: "border-red-500/35 bg-red-500/10 text-red-300" },
    { label: "Not Connected", value: summary.notConnected || 0, className: "border-amber-500/35 bg-amber-500/10 text-amber-300" },
    { label: "Avg Call Setup", value: formatDurationMs(summary.averageSetupTime || 0), className: "border-blue-500/35 bg-blue-500/10 text-blue-300" },
    { label: "Avg Connected Duration", value: formatDurationMs(summary.averageTalkTime || 0), className: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300" },
  ];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Call Summary</h3>
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
                <th className="border-b border-r border-slate-700 px-3 py-2 text-left">Result</th>
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
                const statusClass = call.status === "Connected"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : call.status === "Dropped"
                    ? "border-red-500/30 bg-red-500/10 text-red-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300";
                return (
                  <tr key={call.id} className="border-b border-slate-800/90 bg-slate-950/40 text-slate-200 last:border-b-0 hover:bg-slate-800/50">
                    <td className="border-r border-slate-800 px-3 py-2 font-mono font-semibold text-blue-300">{call.id}</td>
                    <td className="border-r border-slate-800 px-3 py-2 font-mono whitespace-nowrap">{formatHomeCallTime(call.startTime)}</td>
                    <td className="border-r border-slate-800 px-3 py-2 font-mono whitespace-nowrap">{formatHomeCallTime(call.terminationTime || call.endTime)}</td>
                    <td className="border-r border-slate-800 px-3 py-2 whitespace-nowrap">{technology}</td>
                    <td className="border-r border-slate-800 px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}>{call.status}</span>
                      <div className="mt-1 text-[10px] text-slate-500">{call.detailedStatus || "Unknown"}</div>
                    </td>
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
    </div>
  );
}

function formatHomeCallTime(value) {
  if (!(value instanceof Date)) return "—";
  return value.toLocaleTimeString([], { hour12: false, timeZone: "UTC" });
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

function enrichCallSummaryTechnology(summary, procedures = []) {
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

function buildMapPoints(timeline) {
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
      return {
        id: item?.id || `l3-map-point-${index}`,
        lat,
        lng,
        type: item?.type || "event",
        category: item?.category || item?.sourceCategory || "",
        title: item?.title || item?.summary || "Message",
        summary: item?.summary || "",
        rawMessage: item?.rawMessage || "",
        severity: item?.severity || "",
        timestampLabel: item?.timestampLabel || item?.timestamp?.toLocaleTimeString([], { hour12: false, timeZone: "UTC" }) || "",
        timestampMs: item?.timestamp instanceof Date ? item.timestamp.getTime() : null,
        sourceFile: item?.sourceFile || "",
      };
    })
    .filter(Boolean);
}

function formatMapRawMessage(point) {
  if (!point) return "No raw message available.";
  const isNrRrcConfigInfo = /NR\s*RRC\s*Config\s*Info/i.test(String(point.title || point.rawMessage || ""));
  if (isNrRrcConfigInfo) {
    const decodedInsights = getNrRrcPayloadInsights({
      rawMessage: point.rawMessage,
      message: point.title,
      protocol: point.category,
      sourceCategory: point.category,
    }).filter((detail) => NR_RRC_MESSAGE_FIELDS.includes(detail.label));

    if (decodedInsights.length > 0) {
      return decodedInsights.map((detail) => `${detail.label}: ${detail.value || "—"}`).join(" | ");
    }
  }
  return point.rawMessage || "No raw message available.";
}

function isFailurePoint(point) {
  const text = [point?.severity, point?.title, point?.summary, point?.rawMessage, point?.category].filter(Boolean).join(" ");
  return /\b(fail(?:ed|ure)?|reject(?:ed)?|timeout|error|rlf|radio link failure|dropped|forbidden|unavailable)\b|\b[45]\d{2}\b/i.test(text);
}

function L3EventsMapView({ points }) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState(750);
  const [messageSearch, setMessageSearch] = useState("");
  const [messagePanelWidth, setMessagePanelWidth] = useState(340);
  const activeCardRef = useRef(null);
  const mapStageRef = useRef(null);
  const [mapStageWidth, setMapStageWidth] = useState(0);
  const mapsError = getGoogleMapsConfigError() || (loadError ? getGoogleMapsErrorMessage(loadError) : null);
  const currentPoint = points[currentIndex] || points[0] || null;
  const currentRawMessage = useMemo(() => formatMapRawMessage(currentPoint), [currentPoint]);
  const progressPercent = points.length > 1 ? (currentIndex / (points.length - 1)) * 100 : 100;
  const trailPoints = showAllPoints ? points : points.slice(0, currentIndex);
  const filteredMessagePoints = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return points.map((point, index) => ({ point, index }));
    return points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => [
        point.title,
        point.rawMessage,
        point.summary,
        point.timestampLabel,
        point.sourceFile,
      ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [messageSearch, points]);
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
  }, [points]);

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
    activeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [currentIndex]);

  useEffect(() => {
    if (!mapStageRef.current) return undefined;
    const updateWidth = () => setMapStageWidth(mapStageRef.current?.clientWidth || 0);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(mapStageRef.current);
    return () => observer.disconnect();
  }, []);

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

  if (!points.length) {
    return (
      <div className="flex min-h-0 flex-1 w-full max-w-full min-w-0 items-center justify-center overflow-hidden bg-slate-900/70 text-center text-xs text-slate-300 sm:text-sm">
        No lat/lon available in the uploaded L3/Event data.
      </div>
    );
  }

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
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: true,
                clickableIcons: false,
                gestureHandling: "greedy",
                scrollwheel: true,
              }}
            >
              {trailPoints.map((point, index) => (
                <CircleF
                  key={`${point.id}-trail`}
                  center={{ lat: point.lat, lng: point.lng }}
                  radius={6}
                  options={{
                    fillColor: index === 0 ? "#f59e0b" : "#38bdf8",
                    fillOpacity: 0.85,
                    strokeColor: "#0f172a",
                    strokeOpacity: 0.85,
                    strokeWeight: 1,
                    clickable: false,
                    zIndex: 1,
                  }}
                />
              ))}
              {currentPoint && (
                <MarkerF
                  key={currentPoint.id}
                  position={{ lat: currentPoint.lat, lng: currentPoint.lng }}
                  title={`${currentIndex + 1}. ${currentPoint.title}${currentPoint.timestampLabel ? ` - ${currentPoint.timestampLabel}` : ""}`}
                  label={{ text: currentPoint.type === "l3" ? "L3" : "EV", color: "#ffffff", fontSize: "10px", fontWeight: "700" }}
                />
              )}
            </GoogleMap>
          )}
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
                  {currentIndex + 1} / {points.length}
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
            <div className="min-h-0 flex-1 w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden">
              {filteredMessagePoints.length > 0 ? filteredMessagePoints.map(({ point, index }) => (
                <MapMessageCard
                  key={point.id}
                  ref={index === currentIndex ? activeCardRef : null}
                  point={point}
                  active={index === currentIndex}
                  onClick={() => {
                    setIsPlaying(false);
                    setShowAllPoints(false);
                    setCurrentIndex(index);
                  }}
                />
              )) : (
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

const MapMessageCard = React.forwardRef(function MapMessageCard({ point, active, onClick }, ref) {
  const failure = isFailurePoint(point);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`block w-full max-w-full overflow-hidden border-b px-2 py-1.5 text-left transition-colors duration-200 ${
        active
          ? failure
            ? "border-red-300 bg-red-600/80 text-white shadow-[inset_0_0_18px_rgba(127,29,29,0.55)] backdrop-blur-sm"
            : "border-blue-400 bg-blue-600/90 text-white"
          : failure
            ? "border-red-500/40 bg-red-950/45 text-red-100 shadow-[inset_0_0_16px_rgba(127,29,29,0.35)] backdrop-blur-sm hover:bg-red-900/50"
            : "border-slate-800 bg-slate-900/70 text-slate-200 hover:bg-slate-800/90"
      }`}
    >
      <div className="min-w-0 break-words text-[11px] font-semibold leading-snug sm:text-xs">
        {point.title || "Message"}
      </div>
    </button>
  );
});

export default L3EventsTab;
