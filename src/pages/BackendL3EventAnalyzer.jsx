import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, FileUp, History, Loader2, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "react-toastify";
import { l3EventApi } from "@/api/apiEndpoints";
import { parseTimestampValue } from "@/utils/l3Events/timelineBuilder";
import { decodeEventItem, decodeL3Item } from "@/utils/l3Events/eventDecoder";
import { buildProtocolAnalysis } from "@/utils/l3Events/protocolAnalyzer";
import { buildUnifiedSignalingRows } from "@/utils/l3Events/signalingModel";
import { ExcelSignalingView } from "@/components/unifiedMap/tabs/l3Events/ExcelSignalingView";
import { ProtocolAnalyzerView } from "@/components/unifiedMap/tabs/l3Events/ProtocolAnalyzerView";
import { TimelineCard } from "@/components/unifiedMap/tabs/l3Events/TimelineCard";
import {
  HomeCallSummary,
  L3EventsMapView,
  buildMapPoints,
  buildRsrpByRowId,
  enrichCallSummaryTechnology,
} from "@/components/unifiedMap/tabs/L3EventsTab";

const TAKE = 50000;
const VIEW_TABS = [
  { id: "map", label: "Map View" },
  { id: "excel", label: "Excel View" },
  { id: "analyzer", label: "Analyzer" },
  { id: "l3", label: "All L3 Messages" },
  { id: "events", label: "All Events" },
];

const valueOf = (row, ...keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
    const pascalKey = key ? key.charAt(0).toUpperCase() + key.slice(1) : key;
    if (row?.[pascalKey] !== undefined && row?.[pascalKey] !== null) return row[pascalKey];
  }
  return null;
};

const asDate = (value) => {
  if (value instanceof Date) return value;
  return parseTimestampValue(value);
};

function normalizeTimelineRow(row = {}, forcedType = null) {
  const sourceType = forcedType || valueOf(row, "sourceType", "type", "SourceType", "Type") || "event";
  const rawId = valueOf(row, "id", "sourceId", "Id", "SourceId") ?? Math.random().toString(36).slice(2);
  const timestampLabel = valueOf(row, "timestampLabel", "timestampText", "timestamp", "TimestampLabel", "TimestampText", "Timestamp") || "";
  const message = valueOf(row, "message", "eventName", "title", "officialName", "category", "Message", "EventName", "Title", "OfficialName", "Category") || "Log row";
  const detail = valueOf(row, "rawMessage", "rawText", "detail", "summary", "RawMessage", "RawText", "Detail", "Summary") || message;
  const category = valueOf(row, "category", "sourceCategory", "Category", "SourceCategory") || (sourceType === "l3" ? "L3" : "Event");
  const sourceCategory = valueOf(row, "sourceCategory", "SourceCategory") || category;
  const raw = valueOf(row, "raw", "metadata", "rawJson", "Raw", "Metadata", "RawJson") || row;
  const decoded = sourceType === "l3"
    ? decodeL3Item({
      layer: sourceCategory,
      message,
      decodedText: detail,
      latitude: valueOf(row, "latitude", "Latitude"),
      longitude: valueOf(row, "longitude", "Longitude"),
      raw,
    })
    : decodeEventItem({
      category: sourceCategory,
      eventName: valueOf(row, "eventKey", "eventName", "message", "EventKey", "EventName", "Message") || message,
      value: detail,
      originSource: valueOf(row, "originSource", "source", "OriginSource", "Source"),
      severity: valueOf(row, "severity", "Severity"),
      latitude: valueOf(row, "latitude", "Latitude"),
      longitude: valueOf(row, "longitude", "Longitude"),
      raw,
    });
  return {
    ...row,
    id: String(rawId).startsWith(`${sourceType}-`) ? String(rawId) : `${sourceType}-${rawId}`,
    type: sourceType,
    sourceType,
    timestamp: asDate(valueOf(row, "timestamp", "timestampText", "timestampLabel", "Timestamp", "TimestampText", "TimestampLabel")),
    timestampLabel,
    category: decoded.category || category,
    sourceCategory,
    domain: decoded.domain || valueOf(row, "domain", "Domain") || "Radio",
    title: decoded.title || valueOf(row, "title", "message", "eventName", "Title", "Message", "EventName") || message,
    officialName: valueOf(row, "officialName", "message", "eventName", "OfficialName", "Message", "EventName") || decoded.title || message,
    message,
    summary: decoded.summary || valueOf(row, "summary", "detail", "Summary", "Detail") || detail,
    rawMessage: detail,
    sourceFile: valueOf(row, "sourceFile", "sourceFileName", "SourceFile", "SourceFileName") || "",
    sourceIndex: valueOf(row, "sourceIndex", "rowNo", "SourceIndex", "RowNo"),
    severity: valueOf(row, "severity", "Severity") || "info",
    eventKey: decoded.eventKey || valueOf(row, "eventKey", "message", "eventName", "EventKey", "Message", "EventName"),
    technology: valueOf(row, "technology", "Technology") || "Unknown",
    protocol: valueOf(row, "protocol", "Protocol") || category,
    interface: valueOf(row, "interface", "Interface") || category,
    procedure: valueOf(row, "procedure", "Procedure") || category,
    latitude: valueOf(row, "latitude", "Latitude"),
    longitude: valueOf(row, "longitude", "Longitude"),
    callId: valueOf(row, "callId", "CallId"),
    details: Array.isArray(row.details) && row.details.length ? row.details : decoded.details || [],
    metadata: raw,
    icon: decoded.icon || (sourceType === "l3" ? "📡" : "📋"),
  };
}

function normalizeCall(call = {}) {
  const canonicalKeys = [
    "id", "call", "startTime", "dialTime", "alertingTime", "connectedTime", "endTime", "terminationTime",
    "callSetupTimeMs", "setupTimeMs", "connectedDurationMs", "talkTimeMs", "durationMs", "attemptDurationMs",
    "totalDurationMs", "status", "detailedStatus", "callResult", "classification", "confidence",
    "connectionEstimated", "direction", "technologyStart", "technologyEnd", "disconnectReason", "causeCode",
    "causeName", "connectedEvidence", "connectionSupportingEvidence", "releaseEvidence", "handoverAttempts",
    "successfulHandovers", "failedHandovers", "handovers", "rrcRecoveryEvents", "radioIssueDetected",
    "radioRecovered", "sipEvents", "imsEvents", "l3Events", "eventEvents", "events", "warnings", "recommendations",
  ];
  const normalized = { ...call };
  canonicalKeys.forEach((key) => {
    const value = valueOf(call, key);
    if (value !== null) normalized[key] = value;
  });
  ["startTime", "dialTime", "alertingTime", "connectedTime", "endTime", "terminationTime"].forEach((key) => {
    normalized[key] = asDate(normalized[key]);
  });
  normalized.id = normalized.id || normalized.call || "Call";
  return normalized;
}

function normalizeSummary(summary, fallbackCalls = []) {
  const backendCalls = valueOf(summary, "calls");
  const calls = (Array.isArray(backendCalls) ? backendCalls : fallbackCalls || []).map(normalizeCall);
  return {
    totalCalls: valueOf(summary, "totalCalls") ?? calls.length,
    connected: valueOf(summary, "connected") ?? calls.filter((call) => call.status === "Connected").length,
    dropped: valueOf(summary, "dropped") ?? calls.filter((call) => call.status === "Dropped").length,
    notConnected: valueOf(summary, "notConnected") ?? calls.filter((call) => call.status === "Not Connected").length,
    averageSetupTime: valueOf(summary, "averageSetupTime") || 0,
    averageTalkTime: valueOf(summary, "averageTalkTime") || 0,
    totalDurationMs: valueOf(summary, "totalDurationMs") || 0,
    totalConnectedDurationMs: valueOf(summary, "totalConnectedDurationMs") || 0,
    calls,
  };
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
  const [deletingHistoryId, setDeletingHistoryId] = useState(null);
  const [manualProjectId, setManualProjectId] = useState(projectId ? String(projectId) : "");
  const [manualSessionId, setManualSessionId] = useState("");
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
    const selectedProjectId = manualProjectId.trim() ? Number(manualProjectId) : null;
    const selectedSessionId = manualSessionId.trim() ? Number(manualSessionId) : null;
    if (selectedProjectId !== null && (!Number.isInteger(selectedProjectId) || selectedProjectId <= 0)) {
      toast.warn("Project ID must be a positive number.");
      return;
    }
    if (selectedSessionId !== null && (!Number.isInteger(selectedSessionId) || selectedSessionId <= 0)) {
      toast.warn("Session ID must be a positive number when provided.");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const response = await l3EventApi.addSessionUpload(
        { projectId: selectedProjectId, sessionId: selectedSessionId, zipFile: selectedFile, dataType: "L3Event" },
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

  const deleteHistory = async (row) => {
    const historyId = Number(row?.id);
    if (!Number.isInteger(historyId) || historyId <= 0) {
      toast.error("This upload history row does not have a valid ID.");
      return;
    }
    const fileName = row.originalFileName || "this L3/Event upload";
    if (!window.confirm(`Delete ${fileName}? This permanently removes its call summary, L3 rows, Event rows, and upload-history entry.`)) return;

    setDeletingHistoryId(historyId);
    try {
      const response = await l3EventApi.deleteHistory(historyId);
      if (response?.status !== 1) throw new Error(response?.message || "Delete failed.");
      setHistoryRows((current) => current.filter((item) => Number(item.id) !== historyId));
      toast.success(response.message || "L3/Event upload data deleted successfully.");
    } catch (error) {
      toast.error(error?.message || "Failed to delete the L3/Event upload data.");
    } finally {
      setDeletingHistoryId(null);
    }
  };

  return (
    <div className="min-h-full overflow-auto bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1 rounded border border-slate-700 px-3 text-xs hover:bg-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Projects</button>
          <div><h1 className="text-xl font-semibold">L3 / Event Sessions</h1><p className="text-sm text-slate-400">All previous authorized L3/Event uploads{projectId ? ` · Upload target: ${projectName} (${projectId})` : ""}</p></div>
        </div>

        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">
              <span className="mb-1 block">Project ID (optional)</span>
              <input type="number" min="1" value={manualProjectId} onChange={(event) => setManualProjectId(event.target.value)} placeholder="Enter project ID" className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-500" />
            </label>
            <label className="text-xs text-slate-300">
              <span className="mb-1 block">Session ID (optional)</span>
              <input type="number" min="1" value={manualSessionId} onChange={(event) => setManualSessionId(event.target.value)} placeholder="Leave empty to create a new session" className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-500" />
            </label>
          </div>
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
            <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-blue-300" />Upload History</div>
            <span className="text-xs text-slate-500">Select Analysis to reopen saved results without uploading again.</span>
          </div>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full min-w-[800px] text-xs">
              <thead className="bg-slate-800 text-left text-slate-400"><tr><th className="px-3 py-2">Project</th><th className="px-3 py-2">File Name</th><th className="px-3 py-2">Session ID</th><th className="px-3 py-2">Uploaded By</th><th className="px-3 py-2">Uploaded On</th><th className="px-3 py-2">Action</th></tr></thead>
              <tbody>
                {historyLoading ? <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : historyRows.length ? historyRows.map((row) => (
                  <tr key={row.id || row.uploadHistoryId} className="border-t border-slate-800 text-slate-200">
                    <td className="px-3 py-2"><div>{row.projectName || (row.projectId ? `Project ${row.projectId}` : "Unassigned upload")}</div><div className="font-mono text-[10px] text-slate-500">{row.projectId || "-"}</div></td>
                    <td className="max-w-80 px-3 py-2"><div className="break-all font-medium text-white">{row.originalFileName || [row.l3FileName, row.eventFileName].filter(Boolean).join(", ") || "—"}</div></td>
                    <td className="px-3 py-2 font-mono">{row.sessionId}</td>
                    <td className="px-3 py-2">{row.uploadedByName || row.uploadedBy || "—"}</td>
                    <td className="px-3 py-2">{row.uploadedOn ? new Date(row.uploadedOn).toLocaleString() : "—"}</td>
                    <td className="px-3"><div className="flex items-center gap-2"><button type="button" onClick={() => onOpenSessions([row.sessionId], row.projectId)} disabled={deletingHistoryId === Number(row.id)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 font-medium hover:bg-blue-500 disabled:opacity-50"><Search className="h-3.5 w-3.5" />Analysis</button><button type="button" onClick={() => deleteHistory(row)} disabled={deletingHistoryId !== null} className="inline-flex items-center gap-1 rounded border border-red-500/60 bg-red-500/10 px-3 py-1.5 font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50">{deletingHistoryId === Number(row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete</button></div></td>
                  </tr>
                )) : <tr><td colSpan={6} className="p-8 text-center text-slate-500">No L3/Event upload history was found.</td></tr>}
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
  const [mapTimeline, setMapTimeline] = useState([]);
  const [summary, setSummary] = useState(normalizeSummary(null));
  const [backendAnalyzer, setBackendAnalyzer] = useState(null);
  const [l3Messages, setL3Messages] = useState([]);
  const [eventMessages, setEventMessages] = useState([]);
  const scope = useMemo(() => ({ sessionIds, take: TAKE }), [sessionIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      l3EventApi.getTabCounts(scope),
      l3EventApi.getMapRows(scope),
      l3EventApi.getExcelRows(scope),
      l3EventApi.getCallSummary(scope),
      l3EventApi.getAnalyzerSummary(scope),
      l3EventApi.getL3Messages(scope),
      l3EventApi.getEvents(scope),
    ]).then(([countResponse, mapResponse, rowResponse, callResponse, analyzerResponse, l3Response, eventResponse]) => {
      if (cancelled) return;
      const normalizedMapTimeline = (mapResponse?.rows || rowResponse?.rows || []).map((row) => normalizeTimelineRow(row));
      const normalizedTimeline = (rowResponse?.rows || []).map((row) => normalizeTimelineRow(row));
      setCounts(countResponse || {});
      setMapTimeline(normalizedMapTimeline);
      setTimeline(normalizedTimeline);
      setSummary(normalizeSummary(callResponse?.summary, rowResponse?.calls));
      setBackendAnalyzer(analyzerResponse?.analyzer || null);
      setL3Messages((l3Response?.l3 || []).map((row) => normalizeTimelineRow(row, "l3")));
      setEventMessages((eventResponse?.events || []).map((row) => normalizeTimelineRow(row, "event")));
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
  const enrichedSummary = useMemo(
    () => enrichCallSummaryTechnology(summary, fullAnalysis.procedures),
    [fullAnalysis.procedures, summary],
  );
  const protocolAnalysis = useMemo(() => buildProtocolAnalysis(protocolTimeline, []), [protocolTimeline]);
  const signalingRows = useMemo(() => buildUnifiedSignalingRows(timeline, enrichedSummary.calls, fullAnalysis), [enrichedSummary.calls, fullAnalysis, timeline]);
  const mapFullAnalysis = useMemo(() => buildProtocolAnalysis(mapTimeline.length ? mapTimeline : timeline, []), [mapTimeline, timeline]);
  const mapSignalingRows = useMemo(
    () => buildUnifiedSignalingRows(mapTimeline.length ? mapTimeline : timeline, enrichedSummary.calls, mapFullAnalysis),
    [enrichedSummary.calls, mapFullAnalysis, mapTimeline, timeline],
  );
  const rsrpByRowId = useMemo(() => buildRsrpByRowId(mapFullAnalysis), [mapFullAnalysis]);
  const mapPoints = useMemo(() => buildMapPoints(mapSignalingRows, rsrpByRowId), [mapSignalingRows, rsrpByRowId]);
  const rawRows = activeView === "events" ? eventMessages : l3Messages;
  const countForTab = useCallback((tabId) => {
    if (tabId === "map") return mapPoints.length;
    if (tabId === "excel") return signalingRows.length || counts.excel_view_count || 0;
    if (tabId === "analyzer") return protocolAnalysis?.stats?.totalProcedures ?? counts.analyzer_count ?? 0;
    if (tabId === "l3") return l3Messages.length || counts.l3_count || 0;
    if (tabId === "events") return eventMessages.length || counts.event_count || 0;
    return 0;
  }, [counts.analyzer_count, counts.event_count, counts.excel_view_count, counts.l3_count, eventMessages.length, l3Messages.length, mapPoints.length, protocolAnalysis?.stats?.totalProcedures, signalingRows.length]);
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
        {VIEW_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveView(tab.id)} className={`border px-2.5 py-1.5 text-xs ${activeView === tab.id ? "border-blue-500 bg-blue-600" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-700"}`}>{tab.label} ({countForTab(tab.id).toLocaleString()})</button>)}
        <button type="button" onClick={() => downloadPdf("analyzer")} className="inline-flex items-center gap-1 rounded border border-blue-500/50 px-2 py-1.5 text-xs"><Download className="h-3.5 w-3.5" />Analyzer PDF</button>
        <button type="button" onClick={() => downloadPdf("summary")} className="inline-flex items-center gap-1 rounded border border-blue-500/50 px-2 py-1.5 text-xs"><Download className="h-3.5 w-3.5" />L3 PDF</button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!activeView && <div className="h-full overflow-auto p-3"><HomeCallSummary summary={enrichedSummary} /></div>}
        {activeView === "analyzer" && selectedCall && (
          <div className="shrink-0 flex items-center justify-between gap-2 border-b border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs">
            <span className="truncate text-blue-300">
              Analyzer scoped to {selectedCall.id} starting at {selectedCall.startTime?.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })}
            </span>
            <button type="button" onClick={() => setSelectedCall(null)} className="flex shrink-0 items-center gap-1 font-medium text-blue-300 hover:text-blue-200">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        )}
        {activeView === "map" && <L3EventsMapView points={mapPoints} />}
        {activeView === "excel" && <ExcelSignalingView rows={signalingRows} calls={enrichedSummary.calls} selectedCall={selectedCall} onSelectCall={setSelectedCall} sourceFileName={`sessions-${sessionIds.join("-")}`} />}
        {activeView === "analyzer" && <div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 gap-3 border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-300"><span>RRC: {backendAnalyzer?.states?.rrc || "—"}</span><span>NAS: {backendAnalyzer?.states?.nas || "—"}</span><span>IMS: {backendAnalyzer?.states?.ims || "—"}</span><span>Failures: {backendAnalyzer?.stats?.failures ?? 0}</span></div><div className="min-h-0 flex-1"><ProtocolAnalyzerView analysis={protocolAnalysis} callScoped={Boolean(selectedCall)} /></div></div>}
        {(activeView === "l3" || activeView === "events") && <div className="flex h-full min-h-0 flex-col bg-slate-900/70"><div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-800/70 px-2 py-1"><div><h3 className="text-sm font-semibold text-white">{activeView === "l3" ? "All L3 Messages" : "All Event Rows"}</h3><p className="text-[11px] text-slate-400">Showing {visibleRawRows.length.toLocaleString()} of {rawRows.length.toLocaleString()} backend rows.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search timestamp, file, title, or raw text..." className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" /></div></div><div className="min-h-0 flex-1 space-y-2 overflow-auto">{visibleRawRows.length ? visibleRawRows.map((row) => <TimelineCard key={row.id} item={row} />) : <div className="py-10 text-center text-sm text-slate-400">No matching {activeView === "l3" ? "L3 messages" : "event rows"}.</div>}</div></div>}
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
