import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, FileUp, History, Loader2, Plus, Search, Upload } from "lucide-react";
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { toast } from "react-toastify";
import { l3EventApi } from "@/api/apiEndpoints";
import { parseTimestampValue } from "@/utils/l3Events/timelineBuilder";
import { buildProtocolAnalysis } from "@/utils/l3Events/protocolAnalyzer";
import { buildUnifiedSignalingRows } from "@/utils/l3Events/signalingModel";
import { ExcelSignalingView } from "@/components/unifiedMap/tabs/l3Events/ExcelSignalingView";
import { ProtocolAnalyzerView } from "@/components/unifiedMap/tabs/l3Events/ProtocolAnalyzerView";
import { TimelineCard } from "@/components/unifiedMap/tabs/l3Events/TimelineCard";
import { FlowModelCatalog } from "@/components/unifiedMap/tabs/l3Events/FlowModelCatalog";
import { CallSummaryPanel } from "@/components/unifiedMap/tabs/l3Events/CallSummaryPanel";
import { GOOGLE_MAPS_LOADER_OPTIONS, getGoogleMapsConfigError, getGoogleMapsErrorMessage } from "@/lib/googleMapsLoader";

const TAKE = 50000;
const VIEW_TABS = [
  { id: "map", label: "Map View", countKey: "map_view_count" },
  { id: "excel", label: "Excel View", countKey: "excel_view_count" },
  { id: "analyzer", label: "Analyzer", countKey: "analyzer_count" },
  { id: "flows", label: "Flow Models", countKey: "flow_model_count" },
  { id: "l3", label: "All L3 Messages", countKey: "l3_count" },
  { id: "events", label: "All Events", countKey: "event_count" },
];

const valueOf = (row, ...keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return null;
};

const asDate = (value) => {
  if (value instanceof Date) return value;
  return parseTimestampValue(value);
};

function normalizeTimelineRow(row = {}, forcedType = null) {
  const sourceType = forcedType || valueOf(row, "sourceType", "type") || "event";
  const rawId = valueOf(row, "id", "sourceId") ?? Math.random().toString(36).slice(2);
  const timestampLabel = valueOf(row, "timestampLabel", "timestampText", "timestamp") || "";
  const message = valueOf(row, "message", "eventName", "title", "category") || "Log row";
  const detail = valueOf(row, "rawMessage", "rawText", "detail", "summary") || message;
  const category = valueOf(row, "category", "sourceCategory") || (sourceType === "l3" ? "L3" : "Event");
  return {
    ...row,
    id: String(rawId).startsWith(`${sourceType}-`) ? String(rawId) : `${sourceType}-${rawId}`,
    type: sourceType,
    sourceType,
    timestamp: asDate(valueOf(row, "timestamp", "timestampText", "timestampLabel")),
    timestampLabel,
    category,
    sourceCategory: valueOf(row, "sourceCategory") || category,
    domain: valueOf(row, "domain") || "Radio",
    title: valueOf(row, "title", "message", "eventName") || message,
    officialName: valueOf(row, "officialName", "message", "eventName") || message,
    summary: valueOf(row, "summary", "detail") || detail,
    rawMessage: detail,
    sourceFile: valueOf(row, "sourceFile", "sourceFileName") || "",
    sourceIndex: valueOf(row, "sourceIndex", "rowNo"),
    severity: valueOf(row, "severity") || "info",
    eventKey: valueOf(row, "eventKey", "message", "eventName"),
    technology: valueOf(row, "technology") || "Unknown",
    protocol: valueOf(row, "protocol") || category,
    interface: valueOf(row, "interface") || category,
    procedure: valueOf(row, "procedure") || category,
    latitude: valueOf(row, "latitude"),
    longitude: valueOf(row, "longitude"),
    callId: valueOf(row, "callId"),
    details: Array.isArray(row.details) ? row.details : [],
    metadata: row.metadata || row,
    icon: sourceType === "l3" ? "📡" : "📋",
  };
}

function normalizeCall(call = {}) {
  const dateKeys = ["startTime", "dialTime", "connectedTime", "endTime", "terminationTime"];
  const normalized = { ...call };
  dateKeys.forEach((key) => {
    normalized[key] = asDate(call[key]);
  });
  normalized.id = call.id || call.call || "Call";
  return normalized;
}

function normalizeSummary(summary, fallbackCalls = []) {
  const calls = (summary?.calls || fallbackCalls || []).map(normalizeCall);
  return {
    totalCalls: summary?.totalCalls ?? calls.length,
    connected: summary?.connected ?? calls.filter((call) => call.status === "Connected").length,
    dropped: summary?.dropped ?? calls.filter((call) => call.status === "Dropped").length,
    notConnected: summary?.notConnected ?? calls.filter((call) => call.status === "Not Connected").length,
    averageSetupTime: summary?.averageSetupTime || 0,
    averageTalkTime: summary?.averageTalkTime || 0,
    totalDurationMs: summary?.totalDurationMs || 0,
    totalConnectedDurationMs: summary?.totalConnectedDurationMs || 0,
    calls,
  };
}

function buildBackendMapPoints(rows = []) {
  return rows.map((row) => {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { id: row.id, lat, lng, title: row.message || row.title, timestampLabel: row.timestampLabel };
  }).filter(Boolean);
}

function BackendMapView({ points = [] }) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const mapsError = getGoogleMapsConfigError() || (loadError ? getGoogleMapsErrorMessage(loadError) : null);
  if (mapsError) return <div className="flex h-full items-center justify-center p-6 text-center text-amber-300">{mapsError}</div>;
  if (!isLoaded) return <div className="flex h-full items-center justify-center text-blue-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading map…</div>;
  if (!points.length) return <div className="flex h-full items-center justify-center text-slate-400">No rows contain valid map coordinates.</div>;
  const center = points[0];
  return <GoogleMap mapContainerStyle={{ width: "100%", height: "100%" }} center={center} zoom={15} options={{ streetViewControl: false, mapTypeControl: false }}>
    <PolylineF path={points} options={{ strokeColor: "#3b82f6", strokeOpacity: 0.75, strokeWeight: 3 }} />
    {points.map((point) => <MarkerF key={point.id} position={point} title={`${point.timestampLabel || ""} ${point.title || ""}`} />)}
  </GoogleMap>;
}

const parseSessionIds = (value) => [...new Set(String(value || "")
  .split(",")
  .map((entry) => Number(entry.trim()))
  .filter((entry) => Number.isInteger(entry) && entry > 0))];

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function UploadHistoryLanding({ projectId, projectName, onOpenSessions, onBack }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRows, setHistoryRows] = useState([]);
  const [manualSessionIds, setManualSessionIds] = useState("");
  const fileInputRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await l3EventApi.getHistory({
        take: 50000,
      });
      setHistoryRows(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      toast.error(error?.message || "Failed to load L3/Event upload history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const uploadZip = async (selectedFile) => {
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith(".zip")) {
      toast.warn("Select a ZIP file containing L3 and Event files.");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const response = await l3EventApi.addSessionUpload(
        { projectId, zipFile: selectedFile, dataType: "L3Event" },
        (progressEvent) => {
          if (progressEvent.total) setProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        },
      );
      if (response?.status !== 1) throw new Error(response?.message || "Upload failed.");
      toast.success(`${response.fileName || selectedFile.name} parsed successfully. Session ${response.sessionId} is ready for analysis.`);
      await loadHistory();
    } catch (error) {
      toast.error(error?.message || "Failed to upload the diagnostic session.");
    } finally {
      setUploading(false);
    }
  };

  const selectZip = () => {
    fileInputRef.current?.click();
  };

  const onZipSelected = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (selectedFile) uploadZip(selectedFile);
  };

  const addManualSessions = () => {
    const parsed = parseSessionIds(manualSessionIds);
    if (!parsed.length) {
      toast.warn("Enter at least one valid session ID.");
      return;
    }
    onOpenSessions(parsed);
  };

  return (
    <div className="min-h-full overflow-auto bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1 rounded border border-slate-700 px-3 text-xs hover:bg-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Projects</button>
          <div><h1 className="text-xl font-semibold">L3 / Event Sessions</h1><p className="text-sm text-slate-400">All previous authorized L3/Event uploads{projectId ? ` · Upload target: ${projectName} (${projectId})` : ""}</p></div>
        </div>

        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="flex items-center gap-2 text-sm font-semibold"><FileUp className="h-4 w-4 text-blue-300" />Upload L3 / Event ZIP</div><p className="mt-1 text-xs text-slate-400">Select a ZIP containing L3 and Event CSV/TXT files; matching files are parsed automatically.</p></div>
            <button type="button" onClick={selectZip} disabled={uploading} className="inline-flex h-9 items-center gap-2 rounded bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? `Uploading / parsing ${progress}%` : "Upload ZIP"}
            </button>
            <input ref={fileInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={onZipSelected} />
          </div>
          {uploading && <div className="mt-3 h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${progress}%` }} /></div>}
        </section>

        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-blue-300" />Combined L3 / Event Upload History</div>
            <div className="flex min-w-0 items-center gap-2">
              <input value={manualSessionIds} onChange={(event) => setManualSessionIds(event.target.value)} placeholder="Add session IDs: 7099,7100" className="h-9 w-64 rounded border border-slate-700 bg-slate-950 px-3 text-xs text-white" />
              <button type="button" onClick={addManualSessions} className="inline-flex h-9 items-center gap-1 rounded border border-blue-500/60 bg-blue-600 px-3 text-xs"><Plus className="h-3.5 w-3.5" />Open</button>
            </div>
          </div>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full min-w-[1050px] text-xs">
              <thead className="bg-slate-800 text-left text-slate-400"><tr><th className="px-3 py-2">Project</th><th>Type</th><th>Uploaded File Name</th><th>Session ID</th><th>L3 Rows</th><th>Event Rows</th><th>Uploaded By</th><th>Uploaded On</th><th className="px-3">Action</th></tr></thead>
              <tbody>
                {historyLoading ? <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : historyRows.length ? historyRows.map((row) => (
                  <tr key={row.id || row.uploadHistoryId} className="border-t border-slate-800 text-slate-200">
                    <td className="px-3 py-2"><div>{row.projectName || (row.projectId ? `Project ${row.projectId}` : "Unassigned upload")}</div><div className="font-mono text-[10px] text-slate-500">{row.projectId || "-"}</div></td>
                    <td><span className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-300">{row.l3 && row.event ? "L3 + Event" : row.l3 ? "L3" : "Event"}</span></td>
                    <td className="max-w-72 py-2"><div className="break-all font-medium text-white">{row.originalFileName || [row.l3FileName, row.eventFileName].filter(Boolean).join(", ") || "—"}</div>{row.l3 && row.event && <div className="mt-0.5 text-[10px] text-slate-500">L3: {row.l3FileName || "—"} · Event: {row.eventFileName || "—"}</div>}</td>
                    <td className="font-mono">{row.sessionId}</td><td>{row.l3RowsImported ?? "—"}</td><td>{row.eventRowsImported ?? "—"}</td><td>{row.uploadedByName || row.uploadedBy || "—"}</td><td>{row.uploadedOn ? new Date(row.uploadedOn).toLocaleString() : "—"}</td>
                    <td className="px-3"><button type="button" onClick={() => onOpenSessions([row.sessionId], row.projectId)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 font-medium hover:bg-blue-500"><Search className="h-3.5 w-3.5" />Analysis</button></td>
                  </tr>
                )) : <tr><td colSpan={9} className="p-8 text-center text-slate-500">No L3/Event upload history was found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function BackendAnalyzer({ sessionIds, projectName, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState(null);
  const [counts, setCounts] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [summary, setSummary] = useState(normalizeSummary(null));
  const [backendAnalyzer, setBackendAnalyzer] = useState(null);
  const [l3Messages, setL3Messages] = useState([]);
  const [eventMessages, setEventMessages] = useState([]);
  const [flowModels, setFlowModels] = useState([]);
  const scope = useMemo(() => ({ sessionIds, take: TAKE }), [sessionIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      l3EventApi.getTabCounts(scope),
      l3EventApi.getExcelRows(scope),
      l3EventApi.getCallSummary(scope),
      l3EventApi.getAnalyzerSummary(scope),
      l3EventApi.getL3Messages(scope),
      l3EventApi.getEvents(scope),
      l3EventApi.getFlowModels(),
    ]).then(([countResponse, rowResponse, callResponse, analyzerResponse, l3Response, eventResponse, flowResponse]) => {
      if (cancelled) return;
      const normalizedTimeline = (rowResponse?.rows || []).map((row) => normalizeTimelineRow(row));
      setCounts(countResponse || {});
      setTimeline(normalizedTimeline);
      setSummary(normalizeSummary(callResponse?.summary, rowResponse?.calls));
      setBackendAnalyzer(analyzerResponse?.analyzer || null);
      setL3Messages((l3Response?.l3 || []).map((row) => normalizeTimelineRow(row, "l3")));
      setEventMessages((eventResponse?.events || []).map((row) => normalizeTimelineRow(row, "event")));
      setFlowModels(flowResponse?.flowModels || flowResponse?.flow_models || []);
    }).catch((requestError) => {
      if (!cancelled) setError(requestError?.message || "Failed to load diagnostic session data.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scope]);

  const protocolTimeline = useMemo(() => {
    if (!selectedCall) return timeline;
    const start = selectedCall.startTime?.getTime();
    const end = (selectedCall.endTime || selectedCall.startTime)?.getTime();
    return timeline.filter((row) => {
      const time = row.timestamp?.getTime();
      return Number.isFinite(time) && Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end;
    });
  }, [selectedCall, timeline]);
  const fullAnalysis = useMemo(() => buildProtocolAnalysis(timeline, []), [timeline]);
  const protocolAnalysis = useMemo(() => buildProtocolAnalysis(protocolTimeline, []), [protocolTimeline]);
  const signalingRows = useMemo(() => buildUnifiedSignalingRows(timeline, summary.calls, fullAnalysis), [fullAnalysis, summary.calls, timeline]);
  const mapPoints = useMemo(() => buildBackendMapPoints(signalingRows), [signalingRows]);
  const rawRows = activeView === "events" ? eventMessages : l3Messages;
  const visibleRawRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rawRows;
    return rawRows.filter((row) => [row.timestampLabel, row.title, row.category, row.summary, row.rawMessage, row.sourceFile].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [rawRows, search]);

  const downloadPdf = async (kind) => {
    try {
      const blob = kind === "analyzer"
        ? await l3EventApi.downloadEventAnalyzerPdf(scope)
        : await l3EventApi.downloadL3SummaryPdf(scope);
      downloadBlob(blob, kind === "analyzer" ? "l3-event-analyzer.pdf" : "l3-summary.pdf");
    } catch (downloadError) {
      toast.error(downloadError?.message || "Failed to download PDF.");
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-slate-950 text-blue-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading backend L3/Event data…</div>;
  if (error) return <div className="flex h-full items-center justify-center bg-slate-950 text-red-300">{error}</div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800/70 px-2 py-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1.5 text-xs hover:bg-slate-700"><ArrowLeft className="h-3.5 w-3.5" />Upload & History</button>
        <div className="mr-auto min-w-0"><div className="truncate text-sm font-semibold">{projectName}</div><div className="text-[10px] text-slate-400">Sessions: {sessionIds.join(", ")}</div></div>
        {VIEW_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveView(tab.id)} className={`border px-2.5 py-1.5 text-xs ${activeView === tab.id ? "border-blue-500 bg-blue-600" : "border-slate-700 bg-slate-900 text-slate-300"}`}>{tab.label} ({counts[tab.countKey] ?? (tab.id === "flows" ? flowModels.length : 0)})</button>)}
        <button type="button" onClick={() => downloadPdf("analyzer")} className="inline-flex items-center gap-1 rounded border border-blue-500/50 px-2 py-1.5 text-xs"><Download className="h-3.5 w-3.5" />Analyzer PDF</button>
        <button type="button" onClick={() => downloadPdf("summary")} className="inline-flex items-center gap-1 rounded border border-blue-500/50 px-2 py-1.5 text-xs"><Download className="h-3.5 w-3.5" />L3 PDF</button>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        {!activeView && <div className="h-full overflow-auto p-3"><CallSummaryPanel summary={summary} selectedCallId={selectedCall?.id} onSelectCall={setSelectedCall} /></div>}
        {activeView === "map" && <BackendMapView points={mapPoints} />}
        {activeView === "excel" && <ExcelSignalingView rows={signalingRows} calls={summary.calls} selectedCall={selectedCall} onSelectCall={setSelectedCall} sourceFileName={`sessions-${sessionIds.join("-")}`} />}
        {activeView === "analyzer" && <div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 gap-3 border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-300"><span>RRC: {backendAnalyzer?.states?.rrc || "—"}</span><span>NAS: {backendAnalyzer?.states?.nas || "—"}</span><span>IMS: {backendAnalyzer?.states?.ims || "—"}</span><span>Failures: {backendAnalyzer?.stats?.failures ?? 0}</span></div><div className="min-h-0 flex-1"><ProtocolAnalyzerView analysis={protocolAnalysis} callScoped={Boolean(selectedCall)} /></div></div>}
        {activeView === "flows" && <div className="h-full overflow-auto"><FlowModelCatalog models={flowModels} /></div>}
        {(activeView === "l3" || activeView === "events") && <div className="flex h-full min-h-0 flex-col"><div className="relative shrink-0 border-b border-slate-700 p-2"><Search className="absolute left-4 top-4 h-3.5 w-3.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages…" className="h-8 w-full rounded border border-slate-700 bg-slate-900 pl-8 text-xs" /></div><div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">{visibleRawRows.map((row) => <TimelineCard key={row.id} item={row} />)}</div></div>}
      </main>
    </div>
  );
}

export default function BackendL3EventAnalyzer() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = location.state?.project || {};
  const projectId = Number(searchParams.get("projectId") || valueOf(project, "id", "projectId", "project_id")) || 0;
  const projectName = valueOf(project, "project_name", "projectName") || (projectId ? `Project ${projectId}` : "Selected L3/Event sessions");
  const sessionIds = parseSessionIds(searchParams.get("sessionIds"));

  const openSessions = (ids, selectedProjectId = projectId) => {
    const normalized = parseSessionIds(ids.join(","));
    const nextParams = { sessionIds: normalized.join(",") };
    if (Number(selectedProjectId) > 0) nextParams.projectId = String(selectedProjectId);
    setSearchParams(nextParams);
  };

  return (
    <div className="h-screen min-h-0 w-full overflow-hidden bg-slate-950">
      {sessionIds.length
        ? <BackendAnalyzer sessionIds={sessionIds} projectName={projectName} onBack={() => setSearchParams(projectId ? { projectId: String(projectId) } : {})} />
        : <UploadHistoryLanding projectId={projectId} projectName={projectName} onOpenSessions={openSessions} onBack={() => navigate("/viewProject")} />}
    </div>
  );
}
