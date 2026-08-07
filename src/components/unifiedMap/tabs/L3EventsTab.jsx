import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Upload, Loader2, AlertTriangle, X, Search, FileText, ListOrdered } from "lucide-react";
import toast from "react-hot-toast";
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { extractL3AndEventFiles } from "@/utils/l3Events/zipParser";
import { parseL3CSV } from "@/utils/l3Events/l3Parser";
import { parseEventCSV } from "@/utils/l3Events/eventParser";
import { parseNetworkLogCSV } from "@/utils/l3Events/networkLogParser";
import { mergeTimeline } from "@/utils/l3Events/timelineBuilder";
import { buildCallSummary, formatDurationMs } from "@/utils/l3Events/callSummaryBuilder";
import { buildProtocolAnalysis } from "@/utils/l3Events/protocolAnalyzer";
import { downloadL3CallSummaryPdfReport, downloadL3EventPdfReport } from "@/utils/l3Events/pdfReport";
import { NETWORK_FLOW_MODELS } from "@/utils/l3Events/flowModels";
import { FlowModelCatalog } from "./l3Events/FlowModelCatalog";
import { ProtocolAnalyzerView } from "./l3Events/ProtocolAnalyzerView";
import { TimelineCard } from "./l3Events/TimelineCard";
import { ExcelSignalingView } from "./l3Events/ExcelSignalingView";
import { buildUnifiedSignalingRows } from "@/utils/l3Events/signalingModel";
import {
  GOOGLE_MAPS_LOADER_OPTIONS,
  getGoogleMapsConfigError,
  getGoogleMapsErrorMessage,
} from "@/lib/googleMapsLoader";

const VIEW_TABS = [
  { id: "map", label: "Map View" },
  { id: "excel", label: "Excel View" },
  { id: "analyzer", label: "Analyzer" },
  { id: "models", label: "Flow Models" },
  { id: "l3", label: "All L3 Messages" },
  { id: "events", label: "All Events" },
];

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
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [isExportingL3Summary, setIsExportingL3Summary] = useState(false);

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
  const protocolAnalysis = useMemo(() => buildProtocolAnalysis(filteredProtocolTimeline, networkLogRows), [filteredProtocolTimeline, networkLogRows]);
  const signalingRows = useMemo(
    () => buildUnifiedSignalingRows(timeline, callSummary.calls, fullProtocolAnalysis),
    [timeline, callSummary.calls, fullProtocolAnalysis],
  );
  const mapPoints = useMemo(() => buildMapPoints(timeline), [timeline]);
  const l3Messages = useMemo(() => timeline.filter((item) => item.type === "l3"), [timeline]);
  const eventMessages = useMemo(() => timeline.filter((item) => item.type === "event"), [timeline]);
  const canExportReport = status === "ready" && protocolAnalysis.procedures.length > 0;
  const scopedSequenceMessages = useMemo(() => (
    selectedCall ? filteredProtocolTimeline : timeline
  ), [filteredProtocolTimeline, selectedCall, timeline]);
  const canGenerateL3Summary = status === "ready" && scopedSequenceMessages.length > 0;
  const reportSummary = useMemo(() => {
    if (!selectedCall) return callSummary;

    const statusValue = selectedCall.status || "Unknown";
    return {
      totalCalls: 1,
      connected: statusValue === "Connected" ? 1 : 0,
      dropped: statusValue === "Dropped" ? 1 : 0,
      notConnected: statusValue === "Not Connected" ? 1 : 0,
      busy: selectedCall.detailedStatus === "Busy" ? 1 : 0,
      rejected: selectedCall.detailedStatus === "Rejected" ? 1 : 0,
      setupFailures: selectedCall.detailedStatus === "Call Setup Failure" ? 1 : 0,
      ongoing: selectedCall.detailedStatus === "Ongoing" ? 1 : 0,
      unknown: selectedCall.detailedStatus === "Unknown" ? 1 : 0,
      averageSetupTime: selectedCall.callSetupTimeMs || 0,
      averageTalkTime: selectedCall.connectedDurationMs || 0,
      totalDurationMs: selectedCall.connectedDurationMs || 0,
      totalConnectedDurationMs: selectedCall.connectedDurationMs || 0,
      totalAttemptDurationMs: selectedCall.attemptDurationMs || 0,
      successRate: statusValue === "Connected" ? 1 : 0,
      calls: [selectedCall],
    };
  }, [callSummary, selectedCall]);
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

  const handleExportReport = useCallback(async () => {
    if (!canExportReport) return;

    setIsExportingReport(true);
    try {
      downloadL3EventPdfReport({
        sourceFileName: fileName,
        summary: reportSummary,
        analysis: protocolAnalysis,
        timeline: filteredProtocolTimeline,
        selectedCall,
      });
      toast.success(selectedCall ? `PDF report generated for ${selectedCall.id}.` : "PDF report generated.");
    } catch (error) {
      console.error("Failed to export L3 event PDF report:", error);
      toast.error(error?.message || "Failed to generate PDF report.");
    } finally {
      setIsExportingReport(false);
    }
  }, [canExportReport, fileName, filteredProtocolTimeline, protocolAnalysis, reportSummary, selectedCall]);

  const handleGenerateL3Summary = useCallback(async () => {
    if (!canGenerateL3Summary) {
      toast.error("No L3 messages available to summarize.");
      return;
    }

    setIsExportingL3Summary(true);
    try {
      downloadL3CallSummaryPdfReport({
        sourceFileName: fileName,
        summary: reportSummary,
        messages: scopedSequenceMessages,
        selectedCall,
      });
      toast.success(selectedCall ? `L3 summary PDF generated for ${selectedCall.id}.` : "L3 summary PDF generated.");
    } catch (error) {
      console.error("Failed to export L3 summary PDF report:", error);
      toast.error(error?.message || "Failed to generate L3 summary PDF.");
    } finally {
      setIsExportingL3Summary(false);
    }
  }, [canGenerateL3Summary, fileName, reportSummary, scopedSequenceMessages, selectedCall]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          {fileName ? "Change File" : "Upload CSV, ZIP, or Excel"}
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".csv,.zip,.xlsx" className="hidden" onChange={onInputChange} />
        <button
          type="button"
          onClick={handleExportReport}
          disabled={!canExportReport || isExportingReport}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExportingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {isExportingReport ? "Generating PDF..." : "Generate PDF Report"}
        </button>
        <button
          type="button"
          onClick={handleGenerateL3Summary}
          disabled={!canGenerateL3Summary || isExportingL3Summary}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExportingL3Summary ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListOrdered className="h-4 w-4" />}
          {isExportingL3Summary ? "Generating L3 PDF..." : "Generate L3 Summary PDF"}
        </button>
        {fileName && <span className="text-xs text-white truncate max-w-[240px]">{fileName}</span>}
        {status === "loading" && (
          <span className="flex items-center gap-2 text-xs text-blue-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing logs...
          </span>
        )}
      </div>

      {status === "idle" && (
        <div className="text-sm text-white border border-dashed border-slate-700 rounded-lg p-8 text-center">
          Upload a CSV, ZIP archive, or `.xlsx` workbook to build a standards-based Layer 3 and Event protocol analyzer.
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {status === "ready" && (
        <>
          {warningMessage && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              {warningMessage}
            </div>
          )}

          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
            <div className="flex flex-wrap gap-2">
              {VIEW_TABS.map((tab) => {
                const count = tab.id === "map" ? mapPoints.length : tab.id === "excel" ? signalingRows.length : tab.id === "l3" ? l3Messages.length : tab.id === "events" ? eventMessages.length : tab.id === "models" ? NETWORK_FLOW_MODELS.length : protocolAnalysis.stats.totalProcedures;
                const isActive = activeView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveView(tab.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {!activeView && (
            <HomeCallSummary summary={callSummary} />
          )}

          {activeView === "analyzer" && selectedCall && (
            <div className="flex items-center justify-between gap-2 text-xs bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
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
              calls={callSummary.calls}
              selectedCall={selectedCall}
              onSelectCall={handleSelectCall}
              sourceFileName={fileName}
            />
          ) : activeView === "analyzer" ? (
            <ProtocolAnalyzerView analysis={protocolAnalysis} callScoped={Boolean(selectedCall)} />
          ) : activeView === "models" ? (
            <FlowModelCatalog />
          ) : activeView === "l3" || activeView === "events" ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/70 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-800/70 p-3">
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
              <div className="max-h-[720px] overflow-auto p-3 space-y-2">
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
        </>
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

function buildMapPoints(timeline) {
  return (timeline || [])
    .map((item, index) => {
      const lat = Number(item?.latitude);
      const lng = Number(item?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: item?.id || `l3-map-point-${index}`,
        lat,
        lng,
        title: item?.title || item?.summary || "Message",
        timestampLabel: item?.timestampLabel || item?.timestamp?.toLocaleTimeString([], { hour12: false, timeZone: "UTC" }) || "",
        sourceFile: item?.sourceFile || "",
      };
    })
    .filter(Boolean);
}

function L3EventsMapView({ points }) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const mapsError = getGoogleMapsConfigError() || (loadError ? getGoogleMapsErrorMessage(loadError) : null);
  const center = points.length
    ? {
        lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
        lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
      }
    : DEFAULT_MAP_CENTER;

  if (!points.length) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-sm text-slate-300">
        No latitude/longitude points were found in the uploaded L3/Event data.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/70">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
        <span>Map View</span>
        <span>{points.length.toLocaleString()} mapped point{points.length === 1 ? "" : "s"}</span>
      </div>
      <div className="h-[560px]">
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
            {points.length > 1 && (
              <PolylineF
                path={points.map((point) => ({ lat: point.lat, lng: point.lng }))}
                options={{ strokeColor: "#38bdf8", strokeOpacity: 0.95, strokeWeight: 3 }}
              />
            )}
            {points.map((point, index) => (
              <MarkerF
                key={point.id}
                position={{ lat: point.lat, lng: point.lng }}
                title={`${index + 1}. ${point.title}${point.timestampLabel ? ` - ${point.timestampLabel}` : ""}`}
                label={{ text: String(index + 1), color: "#ffffff", fontSize: "10px", fontWeight: "700" }}
              />
            ))}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}

export default L3EventsTab;
