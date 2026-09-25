import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, Edit3, FileUp, History, Loader2, RefreshCw, Save, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "react-toastify";
import { l3EventApi, mapViewApi } from "@/api/apiEndpoints";
import { parseTimestampValue } from "@/utils/l3Events/timelineBuilder";
import { decodeEventItem, decodeL3Item } from "@/utils/l3Events/eventDecoder";
import { createBackendL3Loader, createBackendScopedLoader } from "@/utils/l3Events/backendDetailModel";
import { ExcelSignalingView } from "@/components/unifiedMap/tabs/l3Events/ExcelSignalingView";
import { ProtocolAnalyzerView } from "@/components/unifiedMap/tabs/l3Events/ProtocolAnalyzerView";
import { TimelineCard } from "@/components/unifiedMap/tabs/l3Events/TimelineCard";
import {
  HomeCallSummary,
  L3EventsMapView,
  buildMapPoints,
  buildRsrpByRowId,
} from "@/components/unifiedMap/tabs/L3EventsTab";

const TAKE = 50000;
const VIEW_TABS = [
  { id: "summary", label: "Summary" },
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
  const rawServiceIndicators = valueOf(row, "serviceIndicators", "ServiceIndicators");
  const serviceIndicators = Array.isArray(rawServiceIndicators)
    ? [...new Set(rawServiceIndicators.map((indicator) => String(indicator || "").trim()).filter(Boolean))]
    : typeof rawServiceIndicators === "string" && rawServiceIndicators.trim()
      ? [rawServiceIndicators.trim()]
      : [];
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
    serviceIndicators,
    latitude: valueOf(row, "latitude", "Latitude"),
    longitude: valueOf(row, "longitude", "Longitude"),
    direction: valueOf(row, "direction", "Direction") || null,
    channel: valueOf(row, "channel", "Channel") || null,
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
  const startTime = valueOf(call, "startTime", "start");
  const endTime = valueOf(call, "endTime", "end", "terminationTime");
  const setupTimeMs = valueOf(call, "callSetupTimeMs", "setupTimeMs");
  const durationMs = valueOf(call, "connectedDurationMs", "talkTimeMs", "durationMs");
  const setupTimeSeconds = valueOf(call, "setupTime");
  const durationSeconds = valueOf(call, "duration");
  if (startTime !== null) normalized.startTime = startTime;
  if (endTime !== null) {
    normalized.endTime = endTime;
    normalized.terminationTime = endTime;
  }
  if (setupTimeMs !== null) normalized.callSetupTimeMs = Number(setupTimeMs);
  else if (setupTimeSeconds !== null && Number.isFinite(Number(setupTimeSeconds))) normalized.callSetupTimeMs = Math.round(Number(setupTimeSeconds) * 1000);
  if (durationMs !== null) normalized.connectedDurationMs = Number(durationMs);
  else if (durationSeconds !== null && Number.isFinite(Number(durationSeconds))) normalized.connectedDurationMs = Math.round(Number(durationSeconds) * 1000);
  normalized.status = valueOf(call, "status", "result", "callResult") || normalized.status || "Not Connected";
  normalized.disconnectReason = valueOf(call, "disconnectReason", "reason") || normalized.disconnectReason || "";
  const technology = valueOf(call, "technology");
  if (technology !== null) {
    normalized.technologyStart = normalized.technologyStart || technology;
    normalized.technologyEnd = normalized.technologyEnd || technology;
  }
  ["startTime", "dialTime", "alertingTime", "connectedTime", "endTime", "terminationTime"].forEach((key) => {
    normalized[key] = asDate(normalized[key]);
  });
  normalized.id = normalized.id || normalized.call || "Call";
  return normalized;
}

function normalizeDetectedServices(services) {
  if (!services || typeof services !== "object" || Array.isArray(services)) return null;
  const count = (key) => {
    const value = Number(valueOf(services, key));
    return Number.isFinite(value) ? value : 0;
  };
  const values = valueOf(services, "volteCallValues");
  return {
    hasVolte: Boolean(valueOf(services, "hasVolte")),
    hasVonr: Boolean(valueOf(services, "hasVonr")),
    hasTmsi: Boolean(valueOf(services, "hasTmsi")),
    hasRrcSibParameters: Boolean(valueOf(services, "hasRrcSibParameters")),
    volteTextRows: count("volteTextRows"),
    vonrTextRows: count("vonrTextRows"),
    tmsiRows: count("tmsiRows"),
    rrcSibParameterRows: count("rrcSibParameterRows"),
    networkLogRows: count("networkLogRows"),
    volteNetworkRows: count("volteNetworkRows"),
    volteCallMinusOneRows: count("volteCallMinusOneRows"),
    volteCallActiveRows: count("volteCallActiveRows"),
    volteCallBlankRows: count("volteCallBlankRows"),
    volteCallValues: values && typeof values === "object" && !Array.isArray(values) ? values : {},
    evidence: Array.isArray(valueOf(services, "evidence")) ? valueOf(services, "evidence") : [],
  };
}

function unwrapDiagnosticSummary(response) {
  if (Array.isArray(response)) return { rows: response };
  if (!response || typeof response !== "object") return null;

  const payload = response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data
    : response;
  const nestedSummary = payload.summary || payload.frontend_summary || payload.frontendSummary;
  return nestedSummary && typeof nestedSummary === "object" && !Array.isArray(nestedSummary)
    ? { ...payload, ...nestedSummary }
    : payload;
}

function diagnosticRowsFromResponse(response) {
  if (Array.isArray(response)) return response;
  const payload = unwrapDiagnosticSummary(response) || {};
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.timeline)) return payload.timeline;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === "object") {
    return [
      ...(Array.isArray(payload.data.events) ? payload.data.events : []),
      ...(Array.isArray(payload.data.l3) ? payload.data.l3 : []),
    ];
  }
  return [];
}

function networkLogRowsFromResponse(response) {
  const payload = response?.data ?? response ?? {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.Data)) return payload.Data;
  if (Array.isArray(payload.logs)) return payload.logs;
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.Result)) return payload.Result;
  return [];
}

async function loadMapNetworkRows(scope, signal) {
  const sessionIds = String(scope?.sessionIds || "").trim();
  if (!sessionIds) return [];

  const pageSize = 10000;
  const maxPages = 20;
  const rows = [];
  let totalCount = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await mapViewApi.getNetworkLog({ session_ids: sessionIds, page, limit: pageSize, signal });
    const pageRows = networkLogRowsFromResponse(response);
    const body = response?.data ?? response ?? {};
    if (page === 1) totalCount = Number(body.total_count ?? body.totalCount ?? body.TotalCount) || 0;
    rows.push(...pageRows);
    if (pageRows.length < pageSize || (totalCount > 0 && rows.length >= totalCount)) break;
  }

  return rows.map((row, index) => {
    const status = valueOf(row, "volte_call", "volteCall", "VolteCall");
    const latitude = valueOf(row, "lat", "latitude", "Latitude");
    const longitude = valueOf(row, "lon", "lng", "longitude", "Longitude");
    if (status === null || String(status).trim() === "" || latitude === null || longitude === null) return null;

    const id = valueOf(row, "id", "Id") ?? index;
    const sessionId = valueOf(row, "session_id", "sessionId", "SessionId") ?? "unknown";
    const statusText = String(status).trim();
    const rawMessage = `volte_call: ${statusText}`;
    const timestamp = valueOf(row, "timestamp", "time", "Timestamp") || "";
    return normalizeTimelineRow({
      ...row,
      id: `network-volte-${sessionId}-${id}`,
      type: "event",
      sourceType: "event",
      sourceFile: "Network Log",
      sourceCategory: "Network Log",
      category: "Network Log",
      title: "VoLTE Network Status",
      officialName: "VoLTE Network Status",
      message: "VoLTE Network Status",
      eventKey: "VOLTE_NETWORK_STATUS",
      summary: rawMessage,
      rawMessage,
      timestamp,
      timestampLabel: timestamp,
      technology: "4G LTE",
      protocol: "VoLTE",
      procedure: "VoLTE Network Status",
      serviceIndicators: ["VoLTE"],
      latitude,
      longitude,
    }, "event");
  }).filter(Boolean);
}

function normalizeSummary(summary) {
  const backendCalls = valueOf(summary, "calls");
  const calls = (Array.isArray(backendCalls) ? backendCalls : []).map(normalizeCall);
  return {
    sourceFile: valueOf(summary, "sourceFile"),
    scope: valueOf(summary, "scope"),
    generatedAt: valueOf(summary, "generatedAt"),
    totalRows: valueOf(summary, "totalRows"),
    l3Rows: valueOf(summary, "l3Rows"),
    eventRows: valueOf(summary, "eventRows"),
    kpis: Array.isArray(valueOf(summary, "kpis")) ? valueOf(summary, "kpis") : [],
    mobility: Array.isArray(valueOf(summary, "mobility")) ? valueOf(summary, "mobility") : [],
    parameters: Array.isArray(valueOf(summary, "parameters")) ? valueOf(summary, "parameters") : [],
    technologies: Array.isArray(valueOf(summary, "technologies")) ? valueOf(summary, "technologies") : [],
    totalCalls: valueOf(summary, "totalCalls") ?? 0,
    observedEvents: valueOf(summary, "observedEvents"),
    summaryVersion: valueOf(summary, "summaryVersion"),
    connected: valueOf(summary, "connected") ?? 0,
    dropped: valueOf(summary, "dropped") ?? 0,
    notConnected: valueOf(summary, "notConnected") ?? 0,
    averageSetupTime: valueOf(summary, "averageSetupTime") ?? 0,
    averageTalkTime: valueOf(summary, "averageTalkTime") ?? 0,
    totalDurationMs: valueOf(summary, "totalDurationMs") ?? 0,
    totalConnectedDurationMs: valueOf(summary, "totalConnectedDurationMs") ?? 0,
    totalAttemptDurationMs: valueOf(summary, "totalAttemptDurationMs", "total_attempt_duration_ms") ?? 0,
    detectedServices: normalizeDetectedServices(valueOf(summary, "detectedServices")),
    successRate: valueOf(summary, "successRate", "success_rate"),
    busy: valueOf(summary, "busy"),
    rejected: valueOf(summary, "rejected"),
    setupFailures: valueOf(summary, "setupFailures", "setup_failures"),
    ongoing: valueOf(summary, "ongoing"),
    unknown: valueOf(summary, "unknown"),
    calls,
  };
}

const parseSessionIds = (value) => [...new Set(String(value || "")
  .split(",")
  .map((entry) => Number(entry.trim()))
  .filter((entry) => Number.isInteger(entry) && entry > 0))];

const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeL3HistoryRow = (row = {}) => {
  const projectId = numberOrNull(valueOf(row, "projectId", "project_id"));
  const sessionId = numberOrNull(valueOf(row, "sessionId", "session_id"));
  const originalFileName = valueOf(row, "originalFileName", "original_file_name") || "";
  const uploadedOn = valueOf(row, "uploadedOn", "uploaded_on");

  return {
    ...row,
    id: valueOf(row, "id"),
    projectId,
    project_id: projectId,
    projectName: valueOf(row, "projectName", "project_name"),
    project_name: valueOf(row, "projectName", "project_name"),
    sessionId,
    session_id: sessionId,
    uploadedOn,
    uploaded_on: uploadedOn,
    originalFileName,
    original_file_name: originalFileName,
    l3Rows: Number(valueOf(row, "l3Rows", "l3_rows") ?? 0),
    eventsRows: Number(valueOf(row, "eventsRows", "events_rows") ?? 0),
    status: Number(valueOf(row, "status") ?? 1),
  };
};

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

function UploadHistoryLanding({ projectId, projectName, onOpenAnalysis, onBack }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRows, setHistoryRows] = useState([]);
  const [deletingHistoryId, setDeletingHistoryId] = useState(null);
  const [replacingHistoryRow, setReplacingHistoryRow] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [savingHistory, setSavingHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncCandidates, setSyncCandidates] = useState(null);
  const [selectedSyncSessionIds, setSelectedSyncSessionIds] = useState([]);
  const [manualSessionId, setManualSessionId] = useState("");
  const [manualRemarks, setManualRemarks] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const fileInputRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await l3EventApi.getHistory({
        take: 50000,
      });
      setHistoryRows(Array.isArray(response?.data) ? response.data.map(normalizeL3HistoryRow) : []);
    } catch (error) {
      toast.error(error?.message || "Failed to load L3 sessions.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const syncNewSessions = async () => {
    setSyncing(true);
    try {
      const selectedProjectId = numberOrNull(projectId);
      const response = await l3EventApi.syncNewSessionDiagnostics({ projectId: selectedProjectId });
      if (response?.status !== 1) throw new Error(response?.message || "Session sync failed.");
      const candidates = Array.isArray(response?.data) ? response.data : [];
      setSyncCandidates(candidates);
      setSelectedSyncSessionIds(candidates.map((session) => Number(session.sessionId)).filter((id) => id > 0));
      if (!candidates.length) toast.info(response.message || "No new sessions found.");
    } catch (error) {
      toast.error(error?.message || "Failed to sync new L3/Event sessions.");
    } finally {
      setSyncing(false);
    }
  };

  const importSelectedSessions = async () => {
    if (!selectedSyncSessionIds.length) {
      toast.warn("Select at least one session to synchronize.");
      return;
    }

    setSyncing(true);
    try {
      const selectedProjectId = numberOrNull(projectId);
      const response = await l3EventApi.syncNewSessionDiagnostics({
        projectId: selectedProjectId,
        sessionIds: selectedSyncSessionIds,
      });
      if (response?.status !== 1) throw new Error(response?.message || "Session sync failed.");

      const summary = response.summary || {};
      setSyncCandidates(null);
      setSelectedSyncSessionIds([]);
      await loadHistory();
      toast.success(`Sync complete: ${summary.imported || 0} imported, ${summary.alreadyAvailable || 0} already available, ${summary.zipNotFound || 0} ZIPs not found.`);
    } catch (error) {
      toast.error(error?.message || "Failed to sync selected L3/Event sessions.");
    } finally {
      setSyncing(false);
    }
  };

  const uploadZip = async (selectedFile, replaceRow = null) => {
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith(".zip")) {
      toast.warn("Select a ZIP file containing L3 and Event files.");
      return;
    }
    const replaceHistoryId = Number(replaceRow?.id);
    const selectedProjectId = replaceRow
      ? replaceRow.projectId || null
      : numberOrNull(projectId);
    const selectedSessionId = replaceRow
      ? replaceRow.sessionId || null
      : manualSessionId.trim() ? Number(manualSessionId) : null;
    const selectedRemarks = String(replaceRow?.remarks || manualRemarks || "").trim();
    if (replaceRow && (!Number.isInteger(replaceHistoryId) || replaceHistoryId <= 0)) {
      toast.error("This L3 session row does not have a valid ID.");
      return;
    }
    if (selectedProjectId !== null && (!Number.isInteger(selectedProjectId) || selectedProjectId <= 0)) {
      toast.warn("Project ID must be a positive number.");
      return;
    }
    if (selectedSessionId !== null && (!Number.isInteger(selectedSessionId) || selectedSessionId <= 0)) {
      toast.warn("Session ID must be a positive number when provided.");
      return;
    }
    if (!selectedRemarks) {
      toast.warn("Remarks are required for the L3/Event ZIP upload.");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const response = await l3EventApi.addSessionUpload(
        { projectId: selectedProjectId, sessionId: selectedSessionId, historyId: replaceHistoryId, remarks: selectedRemarks, zipFile: selectedFile, dataType: "L3Event" },
        (progressEvent) => {
          if (progressEvent.total) setProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        },
      );
      if (response?.status !== 1) throw new Error(response?.message || "Upload failed.");
      toast.success(`${response.fileName || selectedFile.name} ${replaceRow ? "updated" : "parsed"} successfully.`);
      await loadHistory();
    } catch (error) {
      toast.error(error?.message || "Failed to upload the diagnostic session.");
    } finally {
      setUploading(false);
      setReplacingHistoryRow(null);
    }
  };

  const selectZip = (replaceRow = null) => {
    setReplacingHistoryRow(replaceRow);
    fileInputRef.current?.click();
  };

  const onZipSelected = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    const replaceRow = replacingHistoryRow;
    if (selectedFile) uploadZip(selectedFile, replaceRow);
    else setReplacingHistoryRow(null);
  };

  const deleteHistory = async (row) => {
    const historyId = Number(row?.id);
    if (!Number.isInteger(historyId) || historyId <= 0) {
      toast.error("This L3 session row does not have a valid ID.");
      return;
    }
    const fileName = row.originalFileName || row.original_file_name || "this L3/Event upload";
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

  const openEditHistory = (row) => {
    setEditingRow({
      id: row.id || row.uploadHistoryId || "",
      projectId: row.projectId || "",
      sessionId: row.sessionId || "",
      originalFileName: row.originalFileName || row.original_file_name || "",
      l3Rows: row.l3Rows ?? 0,
      eventsRows: row.eventsRows ?? 0,
      status: row.status ?? 1,
    });
  };

  const updateEditField = (key, value) => {
    setEditingRow((current) => current ? { ...current, [key]: value } : current);
  };

  const saveHistoryEdit = async () => {
    const historyId = Number(editingRow?.id);
    if (!Number.isInteger(historyId) || historyId <= 0) {
      toast.error("This L3 session row does not have a valid ID.");
      return;
    }

    const numberOrNull = (value) => {
      const text = String(value ?? "").trim();
      if (!text) return null;
      const parsed = Number(text);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
    };
    const projectIdValue = numberOrNull(editingRow.projectId);
    const sessionIdValue = numberOrNull(editingRow.sessionId);
    const l3RowsValue = Number(editingRow.l3Rows);
    const eventsRowsValue = Number(editingRow.eventsRows);
    const statusValue = Number(editingRow.status);
    if ([projectIdValue, sessionIdValue].some(Number.isNaN)) {
      toast.warn("Project ID and Session ID must be positive numbers or blank.");
      return;
    }
    if (![l3RowsValue, eventsRowsValue, statusValue].every((value) => Number.isInteger(value) && value >= 0)) {
      toast.warn("Rows and status must be zero or positive whole numbers.");
      return;
    }

    setSavingHistory(true);
    try {
      const response = await l3EventApi.updateHistory(historyId, {
        projectId: projectIdValue,
        sessionId: sessionIdValue,
        originalFileName: String(editingRow.originalFileName || "").trim() || "L3/Event history",
        l3Rows: l3RowsValue,
        eventsRows: eventsRowsValue,
        status: statusValue,
      });
      if (response?.status !== 1) throw new Error(response?.message || "Update failed.");
      toast.success(response.message || "L3 session updated successfully.");
      setEditingRow(null);
      await loadHistory();
    } catch (error) {
      toast.error(error?.message || "Failed to update the L3 session.");
    } finally {
      setSavingHistory(false);
    }
  };

  const filteredHistoryRows = useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    if (!needle) return historyRows;

    return historyRows.filter((row) => [
      row.id,
      row.sessionId,
      row.originalFileName,
      row.uploadedOn,
      row.remarks,
    ].filter((value) => value !== null && value !== undefined).join(" ").toLowerCase().includes(needle));
  }, [historyRows, historySearch]);

  return (
    <div className="l3-analyzer-shell h-full min-h-0 overflow-auto p-[clamp(0.75rem,2vw,1.5rem)] text-white">
      <div className="l3-content-width mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} className="inline-flex h-9 shrink-0 items-center gap-1 rounded border border-slate-700 px-3 text-xs hover:bg-slate-800"><ArrowLeft className="h-3.5 w-3.5" />Projects</button>
            <div className="min-w-0"><h1 className="l3-page-title font-semibold">L3 / Event Sessions</h1><p className="l3-page-subtitle text-slate-400">All previous authorized L3/Event uploads{projectId ? ` · Upload target: ${projectName} (${projectId})` : ""}</p></div>
          </div>
          <button type="button" onClick={syncNewSessions} disabled={syncing || uploading || historyLoading || savingHistory} className="inline-flex h-10 shrink-0 items-center gap-2 rounded bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Checking sessions..." : "Find New Sessions"}
          </button>
        </div>

        <section className="l3-glass rounded-lg p-[clamp(0.8rem,1.7vw,1.25rem)]">
          <div className="mb-4 grid gap-3">
            <label className="text-xs text-slate-300">
              <span className="mb-1 block">Session ID (optional)</span>
              <input type="number" min="1" value={manualSessionId} onChange={(event) => setManualSessionId(event.target.value)} placeholder="Leave empty to create a new session" className="l3-glass-control l3-ui-copy h-9 w-full rounded px-3 text-white outline-none" />
            </label>
            <label className="text-xs text-slate-300">
              <span className="mb-1 block">Remarks <span className="text-red-300">*</span></span>
              <input value={manualRemarks} onChange={(event) => setManualRemarks(event.target.value)} placeholder="Enter a remark for this upload" className="l3-glass-control l3-ui-copy h-9 w-full rounded px-3 text-white outline-none" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="flex items-center gap-2 text-sm font-semibold"><FileUp className="h-4 w-4 text-blue-300" />Upload L3 / Event ZIP</div><p className="mt-1 text-xs text-slate-400">Select a ZIP containing L3 and Event CSV/TXT files; matching files are parsed automatically.</p></div>
            <button type="button" onClick={() => selectZip()} disabled={uploading} className="inline-flex h-9 items-center gap-2 rounded bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? `Uploading / parsing ${progress}%` : "Upload ZIP"}
            </button>
            <input ref={fileInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={onZipSelected} />
          </div>
          {uploading && <div className="mt-3 h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${progress}%` }} /></div>}
        </section>

        <section className="l3-glass rounded-lg p-[clamp(0.8rem,1.7vw,1.25rem)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-blue-300" />L3 Session</div>
            <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
              <span className="text-xs text-slate-500">Showing {filteredHistoryRows.length.toLocaleString()} of {historyRows.length.toLocaleString()}</span>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Search sessions, files, or remarks..."
                  aria-label="Search L3 session table"
                  className="l3-glass-control l3-ui-copy w-full rounded-md py-2 pl-8 pr-2 text-white outline-none"
                />
              </div>
            </div>
          </div>
          <div className="l3-table-shell max-h-[calc(100vh-360px)] rounded border border-slate-800/70">
            <table className="l3-history-table l3-ui-copy text-xs">
              <thead className="bg-slate-800 text-left text-slate-400"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Session ID</th><th className="px-3 py-2">File Name</th><th className="px-3 py-2">Uploaded On</th><th className="px-3 py-2">Remarks</th><th className="px-3 py-2">Action</th></tr></thead>
              <tbody>
                {historyLoading ? <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : filteredHistoryRows.length ? filteredHistoryRows.map((row) => (
                  <tr key={row.id || row.uploadHistoryId} className="border-t border-slate-800 text-slate-200">
                    <td className="px-3 py-2 font-mono">{row.id || "—"}</td>
                    <td className="px-3 py-2 font-mono">{row.sessionId || "—"}</td>
                    <td className="max-w-80 px-3 py-2"><div className="break-all font-medium text-white">{row.originalFileName || "—"}</div></td>
                    <td className="px-3 py-2">{row.uploadedOn ? new Date(row.uploadedOn).toLocaleString() : "—"}</td>
                    <td className="max-w-80 px-3 py-2">{row.remarks || "-"}</td>
                    <td className="px-3"><div className="flex items-center gap-2"><button type="button" onClick={() => onOpenAnalysis(row)} disabled={deletingHistoryId === Number(row.id) || uploading || savingHistory || !row.id} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 font-medium hover:bg-blue-500 disabled:opacity-50">Analysis</button><button type="button" onClick={() => openEditHistory(row)} disabled={deletingHistoryId !== null || uploading || savingHistory} className="inline-flex items-center gap-1 rounded border border-cyan-400/60 bg-cyan-400/10 px-3 py-1.5 font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50"><Edit3 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => deleteHistory(row)} disabled={deletingHistoryId !== null || uploading || savingHistory} className="inline-flex items-center gap-1 rounded border border-red-500/60 bg-red-500/10 px-3 py-1.5 font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50">{deletingHistoryId === Number(row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div></td>
                  </tr>
                )) : <tr><td colSpan={6} className="p-8 text-center text-slate-500">{historySearch.trim() ? "No L3 sessions match your search." : "No L3 sessions were found."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {syncCandidates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-lg border border-slate-700 bg-slate-900 p-4 text-white shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><div className="text-base font-semibold">New sessions available</div><p className="mt-1 text-xs text-slate-400">Select the sessions whose remote ZIP files should be downloaded and parsed.</p></div>
              <button type="button" onClick={() => setSyncCandidates(null)} disabled={syncing} className="rounded border border-slate-700 p-1.5 hover:bg-slate-800 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            {syncCandidates.length ? <div className="max-h-96 overflow-auto rounded border border-slate-800">
              <table className="w-full text-xs"><thead className="bg-slate-800 text-left text-slate-400"><tr><th className="w-10 px-3 py-2"></th><th className="px-3 py-2">Session ID</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th><th className="px-3 py-2">Uploaded</th><th className="px-3 py-2">Location</th></tr></thead>
                <tbody>{syncCandidates.map((session) => { const id = Number(session.sessionId); const checked = selectedSyncSessionIds.includes(id); return <tr key={id} className="border-t border-slate-800"><td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={() => setSelectedSyncSessionIds((current) => checked ? current.filter((value) => value !== id) : [...current, id])} /></td><td className="px-3 py-2 font-mono">{id}</td><td className="px-3 py-2">{session.start_time ? new Date(session.start_time).toLocaleString() : "-"}</td><td className="px-3 py-2">{session.end_time ? new Date(session.end_time).toLocaleString() : "-"}</td><td className="px-3 py-2">{session.uploaded_on ? new Date(session.uploaded_on).toLocaleString() : "-"}</td><td className="px-3 py-2">{session.start_address || session.end_address || "-"}</td></tr>; })}</tbody></table>
            </div> : <p className="rounded border border-slate-800 p-6 text-center text-sm text-slate-400">No sessions found after the latest imported session.</p>}
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setSyncCandidates(null)} disabled={syncing} className="inline-flex h-9 items-center gap-2 rounded border border-slate-700 px-4 text-sm hover:bg-slate-800 disabled:opacity-50">Cancel</button><button type="button" onClick={importSelectedSessions} disabled={syncing || !selectedSyncSessionIds.length} className="inline-flex h-9 items-center gap-2 rounded bg-emerald-600 px-4 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Sync Selected ({selectedSyncSessionIds.length})</button></div>
          </div>
        </div>
      )}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-[clamp(0.75rem,2vw,1.5rem)] backdrop-blur-sm">
          <div className="l3-glass w-full max-w-2xl rounded-lg p-[clamp(0.8rem,1.7vw,1.25rem)] shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Edit L3 Session #{editingRow.id}</div>
              <button type="button" onClick={() => setEditingRow(null)} disabled={savingHistory} className="rounded border border-slate-700 p-1.5 hover:bg-slate-800 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300"><span className="mb-1 block">Session ID</span><input type="number" min="1" value={editingRow.sessionId} onChange={(event) => updateEditField("sessionId", event.target.value)} className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500" /></label>
              <label className="text-xs text-slate-300"><span className="mb-1 block">Status</span><input type="number" min="0" value={editingRow.status} onChange={(event) => updateEditField("status", event.target.value)} className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500" /></label>
              <label className="text-xs text-slate-300 sm:col-span-2"><span className="mb-1 block">File Name</span><input value={editingRow.originalFileName} onChange={(event) => updateEditField("originalFileName", event.target.value)} className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500" /></label>
              <label className="text-xs text-slate-300"><span className="mb-1 block">L3 Rows</span><input type="number" min="0" value={editingRow.l3Rows} onChange={(event) => updateEditField("l3Rows", event.target.value)} className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500" /></label>
              <label className="text-xs text-slate-300"><span className="mb-1 block">Event Rows</span><input type="number" min="0" value={editingRow.eventsRows} onChange={(event) => updateEditField("eventsRows", event.target.value)} className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500" /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingRow(null)} disabled={savingHistory} className="inline-flex h-9 items-center gap-2 rounded border border-slate-700 px-4 text-sm hover:bg-slate-800 disabled:opacity-50"><X className="h-4 w-4" />Cancel</button>
              <button type="button" onClick={saveHistoryEdit} disabled={savingHistory} className="inline-flex h-9 items-center gap-2 rounded bg-cyan-600 px-4 text-sm font-medium hover:bg-cyan-500 disabled:opacity-50">{savingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackendAnalyzer({ sessionIds, analysisId, projectName, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("summary");
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState(null);
  const [counts, setCounts] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [mapRows, setMapRows] = useState(null);
  const [mapRsrpByRowId, setMapRsrpByRowId] = useState(null);
  const [mapRsrpRequested, setMapRsrpRequested] = useState(false);
  const [excelRows, setExcelRows] = useState(null);
  const [tabCounts, setTabCounts] = useState(null);
  const [viewErrors, setViewErrors] = useState({});
  const [viewRetry, setViewRetry] = useState({});
  const [protocolAnalysis, setProtocolAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [mapOpened, setMapOpened] = useState(false);
  const [loadResponse] = useState(() => createBackendL3Loader(l3EventApi.getDiagnosticL3Summary));
  const [loadMapRows] = useState(() => createBackendScopedLoader(l3EventApi.getMapRows));
  const [loadExcelRows] = useState(() => createBackendScopedLoader(l3EventApi.getExcelRows));
  const [loadTabCounts] = useState(() => createBackendScopedLoader(l3EventApi.getTabCounts));
  const [summary, setSummary] = useState(normalizeSummary(null));
  const [l3Messages, setL3Messages] = useState([]);
  const [eventMessages, setEventMessages] = useState([]);
  const sessionKey = sessionIds.join(",");
  const scope = useMemo(() => ({ sessionIds: sessionKey, uploadId: analysisId, take: TAKE }), [analysisId, sessionKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const loadDiagnosticData = async () => {
      const response = await loadResponse(scope);
      if (cancelled) return;
      const payload = unwrapDiagnosticSummary(response);
      if (payload?.summaryVersion !== 1) throw new Error("The backend must be updated to support Summary metrics.");
      setSummary(normalizeSummary(payload));
      setCounts({
        excel_view_count: payload.totalRows ?? 0,
        l3_count: payload.l3Rows ?? 0,
        event_count: payload.eventRows ?? 0,
      });
    };

    loadDiagnosticData().catch((requestError) => {
      if (!cancelled) setError(requestError?.response?.data?.message || requestError?.message || "Failed to load diagnostic summary.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scope, loadResponse]);

  useEffect(() => {
    if (loading || error || tabCounts) return;
    let cancelled = false;
    loadTabCounts(scope).then((response) => {
      if (cancelled) return;
      const payload = unwrapDiagnosticSummary(response) || {};
      setTabCounts(payload);
    }).catch(() => {
      // The count endpoint is an optimization; summary counts remain available.
    });
    return () => { cancelled = true; };
  }, [error, loadTabCounts, loading, scope, tabCounts]);

  useEffect(() => {
    if (loading || error || !["analyzer", "l3", "events"].includes(activeView) || detailsLoaded) return;
    let cancelled = false;
    setDetailsError("");
    loadResponse({ ...scope, includeRows: true }).then((response) => {
      if (cancelled) return;
      const payload = unwrapDiagnosticSummary(response);
      if (!Array.isArray(payload?.rows)) throw new Error("Invalid diagnostic response: timeline rows are missing.");
      const rows = diagnosticRowsFromResponse(response).map(row => normalizeTimelineRow(row));
      setTimeline(rows);
      setL3Messages(rows.filter((row) => row.type === "l3"));
      setEventMessages(rows.filter((row) => row.type === "event"));
      setDetailsLoaded(true);
    }).catch((requestError) => {
      if (!cancelled) setDetailsError(requestError?.response?.data?.message || requestError?.message || "Failed to load detailed logs.");
    });
    return () => { cancelled = true; };
  }, [activeView, detailsLoaded, detailsRetry, error, loading, loadResponse, scope]);

  useEffect(() => {
    if (loading || error || !["map", "excel"].includes(activeView)) return;
    const loaded = activeView === "map" ? mapRows : excelRows;
    if (loaded) return;
    let cancelled = false;
    let worker = null;
    const networkAbort = new AbortController();
    const loader = activeView === "map" ? loadMapRows : loadExcelRows;
    setViewErrors((current) => ({ ...current, [activeView]: "" }));
    const networkRowsRequest = activeView === "map" && summary.detectedServices?.hasVolte
      ? loadMapNetworkRows(scope, networkAbort.signal).catch((networkError) => {
        if (!networkAbort.signal.aborted) console.warn("Unable to load network log VoLTE map rows.", networkError);
        return [];
      })
      : Promise.resolve([]);
    Promise.all([loader(scope), networkRowsRequest]).then(([response, networkRows]) => {
      if (cancelled) return;
      const payload = unwrapDiagnosticSummary(response) || {};
      const rows = [
        ...diagnosticRowsFromResponse(response).map((row) => normalizeTimelineRow(row)),
        ...networkRows,
      ];
      if (!Array.isArray(payload.rows)) throw new Error(`Invalid diagnostic response: ${activeView} rows are missing.`);
      const calls = (Array.isArray(payload.calls) ? payload.calls : summary.calls).map(normalizeCall);
      worker = new Worker(new URL("../workers/backendProtocolAnalysis.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        if (cancelled) return;
        if (data.error) {
          setViewErrors((current) => ({ ...current, [activeView]: data.error }));
          worker.terminate();
          return;
        }
        if (activeView === "map") {
          setMapRows(data.rows);
          setMapOpened(true);
        } else setExcelRows(data.rows);
        worker.terminate();
      };
      worker.onerror = (workerError) => {
        if (!cancelled) setViewErrors((current) => ({ ...current, [activeView]: workerError.message || `Failed to prepare ${activeView} rows.` }));
        worker.terminate();
      };
      worker.postMessage({ id: `${activeView}:${scope.sessionIds}`, kind: "signaling", timeline: rows, calls });
    }).catch((requestError) => {
      if (!cancelled) setViewErrors((current) => ({ ...current, [activeView]: requestError?.response?.data?.message || requestError?.message || `Failed to load ${activeView} rows.` }));
    });
    return () => { cancelled = true; networkAbort.abort(); worker?.terminate(); };
  }, [activeView, error, excelRows, loadExcelRows, loadMapRows, loading, mapRows, scope, summary.calls, summary.detectedServices?.hasVolte, viewRetry]);

  const protocolTimeline = useMemo(() => {
    if (!selectedCall) return timeline;
    const start = selectedCall.startTime?.getTime();
    const end = (selectedCall.endTime || selectedCall.startTime)?.getTime();
    return timeline.filter((row) => {
      const time = row.timestamp?.getTime();
      return Number.isFinite(time) && Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end;
    });
  }, [selectedCall, timeline]);
  const enrichedSummary = summary;
  useEffect(() => {
    if (!detailsLoaded || activeView !== "analyzer") return;
    let cancelled = false;
    const worker = new Worker(new URL("../workers/backendProtocolAnalysis.worker.js", import.meta.url), { type: "module" });
    setAnalysisError("");
    setProtocolAnalysis(null);
    worker.onmessage = ({ data }) => {
      if (cancelled) return;
      if (data.error) setAnalysisError(data.error);
      else setProtocolAnalysis(data.analysis);
      worker.terminate();
    };
    worker.onerror = (workerError) => {
      if (!cancelled) setAnalysisError(workerError.message || "Protocol analysis worker failed.");
      worker.terminate();
    };
    worker.postMessage({ id: scope.sessionIds, timeline: protocolTimeline });
    return () => { cancelled = true; worker.terminate(); };
  }, [activeView, detailsLoaded, protocolTimeline, scope.sessionIds]);
  const mapPoints = useMemo(() => mapRows ? buildMapPoints(mapRows, mapRsrpByRowId || new Map()) : [], [mapRows, mapRsrpByRowId]);
  const requestMapRsrpAnalysis = useCallback(() => setMapRsrpRequested(true), []);
  useEffect(() => {
    if (!mapRsrpRequested || !mapRows || mapRsrpByRowId) return;
    let cancelled = false;
    const worker = new Worker(new URL("../workers/backendProtocolAnalysis.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (cancelled) return;
      if (data.error) setViewErrors((current) => ({ ...current, map: data.error }));
      else setMapRsrpByRowId(buildRsrpByRowId(data.analysis));
      worker.terminate();
    };
    worker.onerror = (workerError) => {
      if (!cancelled) setViewErrors((current) => ({ ...current, map: workerError.message || "Map RSRP analysis failed." }));
      worker.terminate();
    };
    worker.postMessage({ id: `map-rsrp:${scope.sessionIds}`, timeline: mapRows });
    return () => { cancelled = true; worker.terminate(); };
  }, [mapRows, mapRsrpByRowId, mapRsrpRequested, scope.sessionIds]);
  const rawRows = activeView === "events" ? eventMessages : l3Messages;
  const countForTab = useCallback((tabId) => {
    if (tabId === "summary") return enrichedSummary?.totalCalls ?? 0;
    if (tabId === "map") return tabCounts?.map_view_count ?? mapRows?.length ?? null;
    if (tabId === "excel") return tabCounts?.excel_view_count ?? excelRows?.length ?? counts.excel_view_count ?? 0;
    if (tabId === "analyzer") return tabCounts?.analyzer_count ?? protocolAnalysis?.stats?.totalProcedures ?? null;
    if (tabId === "l3") return l3Messages.length || counts.l3_count || 0;
    if (tabId === "events") return eventMessages.length || counts.event_count || 0;
    return 0;
  }, [activeView, counts.event_count, counts.excel_view_count, counts.l3_count, enrichedSummary?.totalCalls, eventMessages.length, l3Messages.length, mapRows?.length, excelRows?.length, protocolAnalysis?.stats?.totalProcedures, tabCounts]);
  const visibleRawRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rawRows;
    return rawRows.filter((row) => [row.timestampLabel, row.title, row.category, row.summary, row.rawMessage, row.sourceFile, ...(row.serviceIndicators || [])].filter(Boolean).join(" ").toLowerCase().includes(needle));
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

  if (loading) return <div className="l3-analyzer-shell flex h-full items-center justify-center px-4 text-center text-blue-300"><Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" />Loading backend L3/Event data…</div>;
  if (error) return <div className="l3-analyzer-shell flex h-full items-center justify-center px-4 text-center text-red-300">{error}</div>;

  return (
    <div className="l3-analyzer-shell flex h-full min-h-0 flex-col overflow-hidden text-white">
      <header className="l3-glass flex shrink-0 flex-wrap items-center gap-2 border-x-0 border-t-0 px-[clamp(0.5rem,1.2vw,1rem)] py-[clamp(0.5rem,1vw,0.75rem)]">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1.5 text-xs hover:bg-slate-700"><ArrowLeft className="h-3.5 w-3.5" />L3 Session</button>
        <div className="mr-auto min-w-0"><div className="l3-ui-copy max-w-[min(52vw,36rem)] truncate font-semibold">{projectName}</div><div className="l3-meta-copy text-slate-400">{analysisId ? `L3 Session ID: ${analysisId}` : `Sessions: ${sessionIds.join(", ")}`}</div></div>
        {VIEW_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveView(tab.id)} className={`border px-2.5 py-1.5 text-xs ${activeView === tab.id ? "border-blue-500 bg-blue-600" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-700"}`}>{tab.label}{countForTab(tab.id) != null ? ` (${countForTab(tab.id).toLocaleString()})` : ""}</button>)}
      </header>
      <main className="l3-analysis-main flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeView === "map" && !mapRows && (viewErrors.map
          ? <div className="p-4 text-red-300">{viewErrors.map}<button type="button" onClick={() => setViewRetry((current) => ({ ...current, map: (current.map || 0) + 1 }))} className="ml-3 rounded border border-slate-600 px-3 py-1 text-white">Retry</button></div>
          : <div className="flex items-center justify-center p-8 text-blue-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading map rows...</div>)}
        {activeView === "excel" && !excelRows && (viewErrors.excel
          ? <div className="p-4 text-red-300">{viewErrors.excel}<button type="button" onClick={() => setViewRetry((current) => ({ ...current, excel: (current.excel || 0) + 1 }))} className="ml-3 rounded border border-slate-600 px-3 py-1 text-white">Retry</button></div>
          : <div className="flex items-center justify-center p-8 text-blue-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading Excel rows...</div>)}
        {["analyzer", "l3", "events"].includes(activeView) && !detailsLoaded && (detailsError
          ? <div className="p-4 text-red-300">{detailsError}<button type="button" onClick={() => setDetailsRetry(value => value + 1)} className="ml-3 rounded border border-slate-600 px-3 py-1 text-white">Retry</button></div>
          : <div className="flex items-center justify-center p-8 text-blue-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading detailed logs...</div>)}
        {activeView === "summary" && <div className="h-full overflow-auto p-3"><HomeCallSummary summary={enrichedSummary} timeline={timeline} /></div>}
        {detailsLoaded && activeView === "analyzer" && selectedCall && (
          <div className="shrink-0 flex items-center justify-between gap-2 border-b border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs">
            <span className="truncate text-blue-300">
              Analyzer scoped to {selectedCall.id} starting at {selectedCall.startTime?.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })}
            </span>
            <button type="button" onClick={() => setSelectedCall(null)} className="flex shrink-0 items-center gap-1 font-medium text-blue-300 hover:text-blue-200">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        )}
        {mapOpened && <div className={`flex h-full min-h-0 min-w-0 ${activeView === "map" ? "" : "hidden"}`}><L3EventsMapView points={mapPoints} onNeedRsrpAnalysis={requestMapRsrpAnalysis} active={activeView === "map"} /></div>}
        {activeView === "excel" && excelRows && <ExcelSignalingView rows={excelRows} calls={enrichedSummary.calls} selectedCall={selectedCall} onSelectCall={setSelectedCall} sourceFileName={analysisId ? `l3-session-${analysisId}` : `sessions-${sessionIds.join("-")}`} />}
        {detailsLoaded && activeView === "analyzer" && <div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 gap-3 border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-300"><span>RRC: {protocolAnalysis?.states?.rrc || "—"}</span><span>NAS: {protocolAnalysis?.states?.nas || "—"}</span><span>IMS: {protocolAnalysis?.states?.ims || "—"}</span><span>Failures: {protocolAnalysis?.stats?.failures ?? 0}</span>{analysisError && <span className="text-red-300">{analysisError}</span>}</div><div className="min-h-0 flex-1">{protocolAnalysis ? <ProtocolAnalyzerView analysis={protocolAnalysis} calls={enrichedSummary.calls} callScoped={Boolean(selectedCall)} /> : <div className="flex h-full items-center justify-center text-blue-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Analyzing protocol rows...</div>}</div></div>}
        {detailsLoaded && (activeView === "l3" || activeView === "events") && <div className="l3-glass flex h-full min-h-0 flex-col"><div className="l3-glass-subtle flex shrink-0 flex-wrap items-center justify-between gap-2 border-x-0 border-t-0 px-2 py-1"><div><h3 className="l3-ui-copy font-semibold text-white">{activeView === "l3" ? "All L3 Messages" : "All Event Rows"}</h3><p className="l3-meta-copy text-slate-400">Showing {visibleRawRows.length.toLocaleString()} of {rawRows.length.toLocaleString()} backend rows.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search timestamp, file, title, or raw text..." className="l3-glass-control l3-ui-copy w-full rounded-md py-2 pl-8 pr-2 text-white outline-none" /></div></div><div className="min-h-0 flex-1 space-y-2 overflow-auto">{visibleRawRows.length ? visibleRawRows.map((row) => <TimelineCard key={row.id} item={row} />) : <div className="py-10 text-center l3-ui-copy text-slate-400">No matching {activeView === "l3" ? "L3 messages" : "event rows"}.</div>}</div></div>}
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
  const analysisId = numberOrNull(searchParams.get("uploadId"));

  const openAnalysis = (row) => {
    const normalizedRow = normalizeL3HistoryRow(row);
    const nextParams = {};
    if (normalizedRow.id) nextParams.uploadId = String(normalizedRow.id);
    if (Number(normalizedRow.projectId || projectId) > 0) nextParams.projectId = String(normalizedRow.projectId || projectId);
    setSearchParams(nextParams);
  };


  return (
    <div className="h-screen min-h-0 w-full overflow-hidden bg-slate-950">
      {sessionIds.length || analysisId
        ? <BackendAnalyzer key={`${analysisId || ""}:${sessionIds.join(",")}`} sessionIds={sessionIds} analysisId={analysisId} projectName={projectName} onBack={() => setSearchParams(projectId ? { projectId: String(projectId) } : {})} />
        : <UploadHistoryLanding projectId={projectId} projectName={projectName} onOpenAnalysis={openAnalysis} onBack={() => navigate("/viewProject")} />}
    </div>
  );
}
