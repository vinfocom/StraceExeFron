import React, { useEffect, useMemo, useRef, useState } from "react";

const formatNumber = (value, digits = 2) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
};

const formatSpeedKbps = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${formatNumber(Number(value) / 1000)} Mbps`;
};

const formatDuration = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  const totalSeconds = Math.floor(Number(value) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatPreciseSeconds = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${(Number(value) / 1000).toFixed(3)}s`;
};

const formatBytes = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  const bytes = Number(value);

  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes.toFixed(0)} B`;
};

const formatPercent = (value) => {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${Number(value).toFixed(1)}%`;
};

const formatSignalMetric = (value, unit = "dB") => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${formatNumber(value, 1)} ${unit}`;
};

const formatText = (value) => {
  const text = String(value ?? "").trim();
  return text || "N/A";
};

const toMetric = (value) => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPositiveMetric = (value) => {
  const parsed = toMetric(value);
  if (parsed == null) return null;
  return parsed > 0 ? parsed : null;
};

const normalizeStatusText = (statusRaw) =>
  String(statusRaw ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");

const isDroppedCallStatus = (statusRaw) => {
  const raw = normalizeStatusText(statusRaw);
  return ["drop", "dropped", "drop call", "dropped call", "call drop", "call dropped"].includes(raw);
};

const normalizeSubSessionResultStatus = (statusRaw) => {
  const numeric = Number(statusRaw);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return "success";
    if (numeric === 2) return "failed";
  }

  const raw = normalizeStatusText(statusRaw);
  if (!raw) return "failed";

  // A dropped call was connected before it dropped, so it belongs to the
  // binary Connected bucket while retaining its explicit display label.
  if (isDroppedCallStatus(raw)) return "success";

  if (["success", "succeeded", "pass", "passed", "connected"].includes(raw)) {
    return "success";
  }

  if (["failed", "fail", "error", "not connected", "disconnected"].includes(raw)) {
    return "failed";
  }

  return "failed";
};

const toDisplayCase = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[_\s-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const getSubSessionResultStatusDisplay = (statusRaw) => {
  const numeric = Number(statusRaw);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return "Success";
    if (numeric === 2) return "Failed";
  }

  const normalizedRaw = String(statusRaw ?? "").trim();
  if (!normalizedRaw) return "Failed";

  return toDisplayCase(normalizedRaw);
};

const normalizeSubSessionType = (typeRaw) => {
  const value = String(typeRaw ?? "").trim();
  if (value === "1") return "1"; // PS
  if (value === "2") return "2"; // CS
  return "other";
};

const CALL_TYPE_TAB = "CS";
const DETAIL_TYPE_TAB = "PS";
const CS_TABLE_GRID_TEMPLATE = "0.88fr 1.1fr 0.8fr 0.86fr 1.35fr 0.42fr";
const PS_TABLE_GRID_TEMPLATE = "1.35fr 0.8fr 0.84fr 0.72fr 0.58fr 0.58fr 0.58fr 0.38fr";

const getSubSessionTypeForTab = (typeTab) => (typeTab === CALL_TYPE_TAB ? "2" : "1");

const getSubSessionTypeLabel = (typeNormalized) => {
  if (typeNormalized === "1") return "PS";
  if (typeNormalized === "2") return "CS";
  return "N/A";
};

const NETWORK_LOG_BUCKET_PRECISION = 4;
const MAX_SIGNAL_MATCH_DISTANCE_METERS = 50;

const toBucketKey = (lat, lng) =>
  `${Number(lat).toFixed(NETWORK_LOG_BUCKET_PRECISION)}|${Number(lng).toFixed(NETWORK_LOG_BUCKET_PRECISION)}`;

const getDistanceMeters = (start, end) => {
  if (!start || !end) return Number.POSITIVE_INFINITY;

  const earthRadius = 6371000;
  const lat1 = (Number(start.lat) * Math.PI) / 180;
  const lat2 = (Number(end.lat) * Math.PI) / 180;
  const deltaLat = ((Number(end.lat) - Number(start.lat)) * Math.PI) / 180;
  const deltaLng = ((Number(end.lng) - Number(start.lng)) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const findNearestSignalSample = (position, bucketedLogs) => {
  if (!position || !bucketedLogs) return null;

  const centerLat = Number(position.lat);
  const centerLng = Number(position.lng);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return null;

  const candidates = [];
  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
      const bucketLat = centerLat + latOffset / 10 ** NETWORK_LOG_BUCKET_PRECISION;
      const bucketLng = centerLng + lngOffset / 10 ** NETWORK_LOG_BUCKET_PRECISION;
      const bucket = bucketedLogs.get(toBucketKey(bucketLat, bucketLng));
      if (Array.isArray(bucket) && bucket.length > 0) {
        candidates.push(...bucket);
      }
    }
  }

  if (candidates.length === 0) return null;

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((sample) => {
    const samplePosition = { lat: sample.lat ?? sample.latitude, lng: sample.lng ?? sample.longitude };
    const distance = getDistanceMeters(position, samplePosition);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = sample;
    }
  });

  if (bestDistance > MAX_SIGNAL_MATCH_DISTANCE_METERS) return null;
  return bestMatch;
};

const PS_SORT_OPTIONS = [
  { key: "NONE", label: "SORT" },
  { key: "AVG_SPD", label: "AVG SPD" },
  { key: "FS", label: "FS" },
  { key: "DUR_HI", label: "DUR ↓" },
  { key: "DUR_LO", label: "DUR ↑" },
];

const CS_SORT_OPTIONS = [
  { key: "NONE", label: "SORT" },
  { key: "DUR_HI", label: "DUR ↓" },
  { key: "DUR_LO", label: "DUR ↑" },
];

export default function SubSessionAnalyticsTab({
  subSessionData = [],
  subSessionSummary: _subSessionSummary = null,
  networkLogData = [],
  requestedSessionIds = [],
  loading = false,
  onSubSessionSelect,
  selectedSubSessionTarget = null,
  selectedSubSessionTargets = [],
}) {
  const [sortBy, setSortBy] = useState("NONE");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [activeTypeTab, setActiveTypeTab] = useState("CS");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const sortRef = useRef(null);

  const isCallTab = activeTypeTab === CALL_TYPE_TAB;
  const sortOptions = isCallTab ? CS_SORT_OPTIONS : PS_SORT_OPTIONS;
  const statusFilterOptions = useMemo(
    () => [
      { key: "all", label: "All" },
      { key: "success", label: isCallTab ? "Connected" : "Success" },
      { key: "failed", label: isCallTab ? "Not Connected" : "Failed" },
    ],
    [isCallTab],
  );

  const requestedCount = Array.isArray(requestedSessionIds) ? requestedSessionIds.length : 0;

  const selectedSessionKey = useMemo(
    () =>
      selectedSubSessionTarget?.sessionId != null
        ? String(selectedSubSessionTarget.sessionId)
        : null,
    [selectedSubSessionTarget],
  );

  const selectedSubSessionKey = useMemo(
    () =>
      selectedSubSessionTarget?.subSessionId != null
        ? String(selectedSubSessionTarget.subSessionId)
        : null,
    [selectedSubSessionTarget],
  );

  const selectedMarkerKey = useMemo(
    () =>
      selectedSubSessionTarget?.markerId != null
        ? String(selectedSubSessionTarget.markerId)
        : null,
    [selectedSubSessionTarget],
  );

  const selectedSubSessionKeys = useMemo(() => {
    const targets = Array.isArray(selectedSubSessionTargets) ? selectedSubSessionTargets : [];
    return new Set(
      targets
        .map((target) => {
          if (target?.markerId != null) return `marker:${String(target.markerId)}`;
          if (target?.sessionId != null && target?.subSessionId != null) {
            return `session:${String(target.sessionId)}|sub:${String(target.subSessionId)}`;
          }
          return null;
        })
        .filter(Boolean),
    );
  }, [selectedSubSessionTargets]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    // Drop a sort/status selection that isn't valid for the newly active tab.
    setSortBy((current) =>
      (isCallTab ? CS_SORT_OPTIONS : PS_SORT_OPTIONS).some((option) => option.key === current)
        ? current
        : "NONE",
    );
  }, [activeTypeTab, isCallTab]);

  const selectedSortLabel = useMemo(
    () => sortOptions.find((option) => option.key === sortBy)?.label || "SORT",
    [sortOptions, sortBy],
  );

  const bucketedNetworkLogs = useMemo(() => {
    if (!Array.isArray(networkLogData) || networkLogData.length === 0) return new Map();

    return networkLogData.reduce((accumulator, log) => {
      const lat = Number(log?.lat ?? log?.latitude);
      const lng = Number(log?.lng ?? log?.longitude ?? log?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return accumulator;
      if (String(log?.log_type ?? log?.connection_type ?? "").toLowerCase() === "wifi") {
        return accumulator;
      }

      const key = toBucketKey(lat, lng);
      const current = accumulator.get(key) || [];
      current.push(log);
      accumulator.set(key, current);
      return accumulator;
    }, new Map());
  }, [networkLogData]);

  const rows = useMemo(() => {
    if (!Array.isArray(subSessionData)) return [];

    return subSessionData.flatMap((session, sessionIndex) =>
      (session.subSessions || []).map((sub, subIndex) => {
        const subMetrics = sub.metrics || {};
        const duration = toMetric(
          sub.duration_ms ??
            sub.durationMs ??
            sub.duration ??
            sub.total_duration ??
            subMetrics.total_duration,
        );
        const resultStatusRaw =
          sub.resultStatusRaw ??
          sub.result_status_raw ??
          sub.resultStatus ??
          sub.result_status ??
          sub.status ??
          sub.connection_status ??
          sub.connectionStatus ??
          "Not Connected";
        const startPosition = sub.start ?? null;
        const matchedSignalSample = findNearestSignalSample(startPosition, bucketedNetworkLogs);

        return {
          rowKey: `sub-row-${session.sessionId ?? sessionIndex}-${sub.subSessionId ?? subIndex}-${subIndex}`,
          sessionId: session.sessionId,
          subSessionId: sub.subSessionId,
          subSessionType: sub.subSessionType,
          subSessionTypeNormalized: normalizeSubSessionType(sub.subSessionType),
          number: sub.number ?? sub.phone_number ?? sub.phoneNumber ?? null,
          direction: sub.direction ?? sub.call_direction ?? sub.callDirection ?? null,
          statusRaw: resultStatusRaw,
          status: normalizeSubSessionResultStatus(resultStatusRaw),
          statusDisplay: getSubSessionResultStatusDisplay(resultStatusRaw),
          isDroppedCall: isDroppedCallStatus(resultStatusRaw),
          markerId: sub.markerId ?? null,
          position: sub.markerPosition ?? sub.start ?? session.start ?? null,
          start: startPosition,
          end: sub.end ?? null,
          avgSpeed: toMetric(
            sub.avg_speed ??
              sub.avgSpeed ??
              sub.max_speed ??
              sub.maxSpeed ??
              subMetrics.avg_speed ??
              subMetrics.max_speed ??
              session.metrics?.avg_speed ??
              session.metrics?.max_speed,
          ),
          fileSize: toMetric(
            sub.file_size ??
              sub.fileSize ??
              sub.total_file_size ??
              subMetrics.total_file_size ??
              session.metrics?.total_file_size,
          ),
          setupTime: toMetric(
            sub.setup_ms ??
              sub.setupTime ??
              sub.setup_time,
          ),
          duration,
          rsrp: toMetric(matchedSignalSample?.rsrp),
          rsrq: toMetric(matchedSignalSample?.rsrq),
          sinr: toMetric(matchedSignalSample?.sinr),
        };
      }),
    );
  }, [bucketedNetworkLogs, subSessionData]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows];

    if (sortBy === "AVG_SPD") {
      sorted.sort((a, b) => {
        if (a.avgSpeed == null && b.avgSpeed == null) return 0;
        if (a.avgSpeed == null) return 1;
        if (b.avgSpeed == null) return -1;
        return b.avgSpeed - a.avgSpeed;
      });
    } else if (sortBy === "FS") {
      sorted.sort((a, b) => {
        if (a.fileSize == null && b.fileSize == null) return 0;
        if (a.fileSize == null) return 1;
        if (b.fileSize == null) return -1;
        return b.fileSize - a.fileSize;
      });
    } else if (sortBy === "DUR_HI") {
      sorted.sort((a, b) => {
        if (a.duration == null && b.duration == null) return 0;
        if (a.duration == null) return 1;
        if (b.duration == null) return -1;
        return b.duration - a.duration;
      });
    } else if (sortBy === "DUR_LO") {
      sorted.sort((a, b) => {
        if (a.duration == null && b.duration == null) return 0;
        if (a.duration == null) return 1;
        if (b.duration == null) return -1;
        return a.duration - b.duration;
      });
    }

    return sorted;
  }, [rows, sortBy]);

  const filteredRows = useMemo(() => {
    const targetType = getSubSessionTypeForTab(activeTypeTab);
    return sortedRows.filter((row) => row.subSessionTypeNormalized === targetType);
  }, [sortedRows, activeTypeTab]);

  
  const tableRows = useMemo(() => {
    const terms = searchQuery
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);
    return filteredRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!terms.length) return true;
      const haystack = [row.sessionId, row.subSessionId, row.number, row.direction]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return terms.some((term) => haystack.includes(term));
    });
  }, [filteredRows, searchQuery, statusFilter]);

  const isFilterActive = searchQuery.trim() !== "" || statusFilter !== "all";

  const tabSummary = useMemo(() => {
    const success = filteredRows.filter((row) => row.status === "success").length;
    const failed = filteredRows.filter((row) => row.status === "failed").length;
    const total = filteredRows.length;

    const metric = (selector, mode = "avg", positiveOnly = false) => {
      const values = filteredRows
        .map(selector)
        .map((value) => (positiveOnly ? toPositiveMetric(value) : toMetric(value)))
        .filter((value) => value != null);

      if (!values.length) return null;
      if (mode === "sum") return values.reduce((acc, value) => acc + value, 0);
      if (mode === "min") return Math.min(...values);
      if (mode === "max") return Math.max(...values);
      return values.reduce((acc, value) => acc + value, 0) / values.length;
    };

    return {
      total,
      success,
      failed,
      total_duration: metric((row) => row.duration, "sum", true),
      avg_duration: metric((row) => row.duration, "avg", true),
      total_setup_time: metric((row) => row.setupTime, "sum", true),
      avg_setup_time: metric((row) => row.setupTime, "avg", true),
      avg_speed: metric((row) => row.avgSpeed, "avg", true),
      total_file_size: metric((row) => row.fileSize, "sum", true),
    };
  }, [filteredRows]);

  // calculation ayah pe ho rahi hai 
  const callKpis = useMemo(() => {
    const callRows = filteredRows.filter((row) => getSubSessionTypeLabel(row.subSessionTypeNormalized) === CALL_TYPE_TAB);
    const totalCalls = callRows.length;

    let connectedCalls = 0;
    let notConnectedCalls = 0;
    callRows.forEach((row) => {
      const isCallType = getSubSessionTypeLabel(row.subSessionTypeNormalized) === CALL_TYPE_TAB;
      if (!isCallType) return;

      if (row.status === "success") {
        connectedCalls += 1;
      } else {
        notConnectedCalls += 1;
      }
    });

    const callSetupRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;

    return {
      totalCalls,
      connectedCalls,
      notConnectedCalls,
      callSetupRate,
    };
  }, [filteredRows]);

  const handleHighlight = (row) => {
    if (typeof onSubSessionSelect !== "function") return;

    onSubSessionSelect({
      sessionId: row.sessionId,
      subSessionId: row.subSessionId ?? null,
      markerId: row.markerId ?? null,
      position: row.position ?? null,
      resultStatus: row.status,
      source: "sub-session-table",
      toggle: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-300">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mr-2" />
        Loading sub-session analytics...
      </div>
    );
  }

  if (!Array.isArray(subSessionData) || subSessionData.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-sm text-slate-300">
        No sub-session analytics data found for the selected sessions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/60 p-1">
            <button
              type="button"
              onClick={() => setActiveTypeTab("CS")}
              className={`px-3 py-1 text-xs rounded ${
                activeTypeTab === "CS" ? "bg-cyan-700 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              CS
            </button>
            <button
              type="button"
              onClick={() => setActiveTypeTab("PS")}
              className={`px-3 py-1 text-xs rounded ${
                activeTypeTab === "PS" ? "bg-cyan-700 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              PS
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              {isCallTab ? "Connected" : "Success"} {formatNumber(tabSummary.success, 0)} | {isCallTab ? "Not Connected" : "Failed"} {formatNumber(tabSummary.failed, 0)}
            </span>
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              Total Sub Sessions: {formatNumber(tabSummary.total, 0)}
            </span>
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              Req Sessions: {requestedCount}
            </span>
          </div>
        </div>
      </div>

      {activeTypeTab === CALL_TYPE_TAB && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Call Rows</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatNumber(callKpis.totalCalls, 0)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Connected Calls</div>
          <div className="text-sm font-semibold text-emerald-300 mt-1">
            {formatNumber(callKpis.connectedCalls, 0)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Not Connected</div>
          <div className="text-sm font-semibold text-rose-300 mt-1">
            {formatNumber(callKpis.notConnectedCalls, 0)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Call Setup Rate</div>
          <div className="text-sm font-semibold text-cyan-200 mt-1">
            {formatPercent(callKpis.callSetupRate)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Avg Setup Time</div>
          <div className="text-sm font-semibold text-cyan-200 mt-1">
            {formatPreciseSeconds(tabSummary.avg_setup_time)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total Setup Time</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatPreciseSeconds(tabSummary.total_setup_time)}
          </div>
        </div>
      </div>
      )}

      



      {activeTypeTab === DETAIL_TYPE_TAB && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Total Duration</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatDuration(tabSummary.total_duration)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Average Duration</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatDuration(tabSummary.avg_duration)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Average Speed</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatSpeedKbps(tabSummary.avg_speed)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Total File Size</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatBytes(tabSummary.total_file_size)}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold text-slate-200">Sub Session Table</h5>
          <div className="flex items-center gap-2">
            {selectedSubSessionKeys.size > 0 && (
              <button
                type="button"
                onClick={() => onSubSessionSelect?.(null)}
                className="text-[11px] font-medium border border-cyan-700/60 text-cyan-100 bg-cyan-950/40 hover:bg-cyan-900/40 rounded px-2 py-1"
              >
                Clear Map Selection ({selectedSubSessionKeys.size})
              </button>
            )}
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setIsSortOpen((previous) => !previous)}
                className="text-[11px] font-medium border border-slate-600 text-slate-200 bg-slate-800 hover:bg-slate-700 rounded px-2 py-1"
              >
                {selectedSortLabel} v
              </button>
              {isSortOpen && (
                <div className="absolute right-0 mt-1 w-28 rounded-md border border-slate-700 bg-slate-900 shadow-lg z-20">
                  {sortOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSortBy(option.key);
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 text-[11px] ${
                        option.key === sortBy
                          ? "bg-cyan-900/30 text-cyan-100"
                          : "text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sessions (comma-separated: 101, 102), sub-session, number…"
            className="flex-1 min-w-[180px] text-[11px] rounded border border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-500 px-2 py-1 outline-none focus:border-cyan-500"
          />
          <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/60 p-0.5">
            {statusFilterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatusFilter(option.key)}
                className={`px-2 py-1 text-[11px] rounded ${
                  statusFilter === option.key
                    ? "bg-cyan-700 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {isFilterActive && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="text-[11px] font-medium border border-slate-600 text-slate-200 bg-slate-800 hover:bg-slate-700 rounded px-2 py-1"
            >
              Clear
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">
            {tableRows.length} row{tableRows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div
          className="grid gap-x-1 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-300"
          style={{
            gridTemplateColumns:
              activeTypeTab === CALL_TYPE_TAB
                ? CS_TABLE_GRID_TEMPLATE
                : PS_TABLE_GRID_TEMPLATE,
          }}
        >
          {activeTypeTab === CALL_TYPE_TAB ? (
            <>
              <span>Setup Time</span>
              <span>Number</span>
              <span>Direction</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Map</span>
            </>
          ) : (
            <>
              <span>Status</span>
              <span>Duration</span>
              <span>Avg Speed</span>
              <span>File Size</span>
              <span>RSRP</span>
              <span>RSRQ</span>
              <span>SINR</span>
              <span>Map</span>
            </>
          )}
        </div>

        {tableRows.length === 0 && (
          <div className="border-t border-slate-700 px-3 py-6 text-center text-[11px] text-slate-400">
            {isFilterActive
              ? "No sub-sessions match the current filters."
              : "No sub-sessions for this type."}
          </div>
        )}

        {tableRows.map((row) => {
          const isCallRow = getSubSessionTypeLabel(row.subSessionTypeNormalized) === CALL_TYPE_TAB;
          const rowSelectionKey =
            row.markerId != null
              ? `marker:${String(row.markerId)}`
              : `session:${String(row.sessionId)}|sub:${String(row.subSessionId)}`;
          const isMultiSelected = selectedSubSessionKeys.has(rowSelectionKey);
          const isSelected =
            (selectedMarkerKey != null &&
              row.markerId != null &&
              selectedMarkerKey === String(row.markerId)) ||
            (selectedSessionKey === String(row.sessionId) &&
              selectedSubSessionKey != null &&
              selectedSubSessionKey === String(row.subSessionId));

          return (
            <React.Fragment key={row.rowKey}>
              <div
                className={`grid gap-x-1 px-2 py-1.5 text-xs border-t border-slate-700 ${
                  isSelected || isMultiSelected ? "bg-cyan-900/20 text-cyan-100" : "text-slate-200"
                }`}
                style={{
                  gridTemplateColumns:
                    activeTypeTab === CALL_TYPE_TAB
                      ? CS_TABLE_GRID_TEMPLATE
                      : PS_TABLE_GRID_TEMPLATE,
                }}
              >
                {activeTypeTab === CALL_TYPE_TAB ? (
                  <>
                    <span className="truncate">{formatPreciseSeconds(row.setupTime)}</span>
                    <span className="truncate" title={formatText(row.number)}>{formatText(row.number)}</span>
                    <span className="truncate capitalize">{formatText(row.direction)}</span>
                    <span className="truncate">{formatDuration(row.duration)}</span>
                    <span className="min-w-0">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] border ${
                          row.isDroppedCall
                            ? "border-amber-700/40 bg-amber-900/20 text-amber-300"
                            : row.status === "success"
                            ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
                            : "border-rose-700/40 bg-rose-900/20 text-rose-300"
                        }`}
                      >
                        {isCallRow && row.isDroppedCall
                          ? "Drop"
                          : row.status === "success"
                          ? isCallRow
                            ? "Connected"
                            : "Success"
                          : isCallRow
                            ? "Not Connected"
                            : "Failed"}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] border ${
                          row.isDroppedCall
                            ? "border-amber-700/40 bg-amber-900/20 text-amber-300"
                            : row.status === "success"
                            ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
                            : "border-rose-700/40 bg-rose-900/20 text-rose-300"
                        }`}
                      >
                        {isCallRow && row.isDroppedCall
                          ? "Drop"
                          : row.status === "success"
                            ? isCallRow
                              ? "Connected"
                              : row.statusDisplay
                            : isCallRow
                              ? "Not Connected"
                              : row.statusDisplay}
                      </span>
                    </span>
                    <span className="truncate">{formatDuration(row.duration)}</span>
                    <span className="truncate">{formatSpeedKbps(row.avgSpeed)}</span>
                    <span className="truncate">{formatBytes(row.fileSize)}</span>
                    <span className="truncate">{formatSignalMetric(row.rsrp, "dBm")}</span>
                    <span className="truncate">{formatSignalMetric(row.rsrq, "dB")}</span>
                    <span className="truncate">{formatSignalMetric(row.sinr, "dB")}</span>
                  </>
                )}
                <span className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleHighlight(row)}
                    disabled={!row.position}
                    aria-label={
                      row.position
                        ? isMultiSelected
                          ? "Selected on map"
                          : "Highlight on map"
                        : "No map point"
                    }
                    title={
                      row.position
                        ? isMultiSelected
                          ? "Selected on map"
                          : "Highlight on map"
                        : "No map point"
                    }
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-sm border ${
                      row.position
                        ? isMultiSelected
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                          : "border-cyan-600/60 text-cyan-200 hover:bg-cyan-800/40"
                        : "border-slate-700 text-slate-500 cursor-not-allowed bg-slate-800/40"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-[2px] border ${
                        row.position
                          ? isMultiSelected
                            ? "border-cyan-200 bg-cyan-300"
                            : "border-current bg-transparent"
                          : "border-slate-600 bg-transparent"
                      }`}
                    />
                  </button>
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
