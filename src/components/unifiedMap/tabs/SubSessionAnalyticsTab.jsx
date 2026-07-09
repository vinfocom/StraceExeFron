import { ChevronDown } from "lucide-react";
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

const CALL_SUCCESS_DURATION_MS = 90 * 1000;
const CALL_DROP_MIN_DURATION_SECONDS = 15;
const CALL_SUCCESS_DURATION_SECONDS = 90;

const toPositiveMetric = (value) => {
  const parsed = toMetric(value);
  if (parsed == null) return null;
  return parsed > 0 ? parsed : null;
};

const formatLatLng = (position) => {
  if (!position || position.lat == null || position.lng == null) return "N/A";
  const lat = Number(position.lat);
  const lng = Number(position.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return "N/A";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
};

const normalizeSubSessionResultStatus = (statusRaw, durationMs = null) => {
  const duration = toMetric(durationMs);
  if (duration != null && duration > CALL_SUCCESS_DURATION_MS) {
    return "success";
  }

  const numeric = Number(statusRaw);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return "success";
    if (numeric === 2) return "failed";
  }

  const raw = String(statusRaw ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (!raw) return "failed";

  if (["success", "succeeded", "pass", "passed", "connected"].includes(raw)) {
    return "success";
  }

  if (["failed", "fail", "error", "not connected", "disconnected"].includes(raw)) {
    return "failed";
  }

  return "failed";
};

const normalizeSubSessionType = (typeRaw) => {
  const value = String(typeRaw ?? "").trim();
  if (value === "1") return "1"; // PS
  if (value === "2") return "2"; // CS
  return "other";
};

const CALL_TYPE_TAB = "CS";
const DETAIL_TYPE_TAB = "PS";

const getSubSessionTypeForTab = (typeTab) => (typeTab === CALL_TYPE_TAB ? "2" : "1");

const getSubSessionTypeLabel = (typeNormalized) => {
  if (typeNormalized === "1") return "PS";
  if (typeNormalized === "2") return "CS";
  return "N/A";
};

const PS_SORT_OPTIONS = [
  { key: "NONE", label: "SORT" },
  { key: "MX_SPD", label: "MX SPD" },
  { key: "MN_SPD", label: "MN SPD" },
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
  requestedSessionIds = [],
  loading = false,
  onSubSessionSelect,
  selectedSubSessionTarget = null,
  selectedSubSessionTargets = [],
}) {
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState("NONE");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [activeTypeTab, setActiveTypeTab] = useState("CS");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const sortRef = useRef(null);
  const [info, setInfo] = useState(false);

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
    if (activeTypeTab !== CALL_TYPE_TAB) {
      setInfo(false);
    }
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

        return {
          rowKey: `sub-row-${session.sessionId ?? sessionIndex}-${sub.subSessionId ?? subIndex}-${subIndex}`,
          sessionId: session.sessionId,
          subSessionId: sub.subSessionId,
          subSessionType: sub.subSessionType,
          subSessionTypeNormalized: normalizeSubSessionType(sub.subSessionType),
          number: sub.number ?? sub.phone_number ?? sub.phoneNumber ?? null,
          direction: sub.direction ?? sub.call_direction ?? sub.callDirection ?? null,
          status: normalizeSubSessionResultStatus(
            sub.resultStatusRaw ??
              sub.result_status_raw ??
            sub.resultStatus ??
              sub.result_status ??
              sub.status ??
              sub.connection_status ??
              sub.connectionStatus ??
              "Not Connected",
            duration,
          ),
          markerId: sub.markerId ?? null,
          position: sub.markerPosition ?? sub.start ?? session.start ?? null,
          start: sub.start ?? null,
          end: sub.end ?? null,
          maxSpeed: toMetric(
            sub.max_speed ??
              sub.maxSpeed ??
              subMetrics.max_speed ??
              session.metrics?.max_speed,
          ),
          minSpeed: toMetric(
            sub.min_speed ??
              sub.minSpeed ??
              subMetrics.min_speed ??
              session.metrics?.min_speed,
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
              sub.setup_time ??
              subMetrics.avg_setup_time ??
              session.metrics?.avg_setup_time,
          ),
          duration,
        };
      }),
    );
  }, [subSessionData]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows];

    if (sortBy === "MX_SPD") {
      sorted.sort((a, b) => {
        if (a.maxSpeed == null && b.maxSpeed == null) return 0;
        if (a.maxSpeed == null) return 1;
        if (b.maxSpeed == null) return -1;
        return b.maxSpeed - a.maxSpeed;
      });
    } else if (sortBy === "MN_SPD") {
      sorted.sort((a, b) => {
        if (a.minSpeed == null && b.minSpeed == null) return 0;
        if (a.minSpeed == null) return 1;
        if (b.minSpeed == null) return -1;
        return a.minSpeed - b.minSpeed;
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
      total_speed: metric((row) => row.maxSpeed, "sum", true),
      avg_speed: metric((row) => row.maxSpeed, "avg", true),
      min_speed: metric((row) => row.minSpeed, "min", true),
      max_speed: metric((row) => row.maxSpeed, "max", true),
      total_file_size: metric((row) => row.fileSize, "sum", true),
    };
  }, [filteredRows]);

  // calculation ayah pe ho rahi hai 
  const callKpis = useMemo(() => {
    const callRows = filteredRows.filter((row) => getSubSessionTypeLabel(row.subSessionTypeNormalized) === CALL_TYPE_TAB);
    const totalCalls = callRows.length;

    let connectedCalls = 0;
    let notConnectedCalls = 0;
    let dropCalls = 0;
    let successCalls = 0;

    callRows.forEach((row) => {
      const isCallType = getSubSessionTypeLabel(row.subSessionTypeNormalized) === CALL_TYPE_TAB;
      if (!isCallType) return;

      const status = normalizeSubSessionResultStatus(row.status, row.duration);
      const durationMs = toPositiveMetric(row.duration);
      const durationSec = durationMs != null ? durationMs / 1000 : null;
      const isSuccessCall = durationSec != null && durationSec > CALL_SUCCESS_DURATION_SECONDS;

      if (isSuccessCall || status === "success") {
        connectedCalls += 1;
      } else {
        notConnectedCalls += 1;
      }

      if (isSuccessCall) {
        successCalls += 1;
      }

      if (
        durationSec != null &&
        durationSec >= CALL_DROP_MIN_DURATION_SECONDS &&
        durationSec <= CALL_SUCCESS_DURATION_SECONDS
      ) {
        dropCalls += 1;
      }
    });

    const callSetupRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;
    const dropCallRate = totalCalls > 0 ? (dropCalls / totalCalls) * 100 : 0;

    return {
      totalCalls,
      connectedCalls,
      notConnectedCalls,
      dropCalls,
      successCalls,
      callSetupRate,
      dropCallRate,
    };
  }, [filteredRows]);

  const toggleRow = (rowKey) => {
    setExpandedRows((previous) => ({
      ...previous,
      [rowKey]: !previous[rowKey],
    }));
  };

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
          {activeTypeTab === CALL_TYPE_TAB && (
            <button
              type="button"
              onClick={() => setInfo((prev) => !prev)}
              className="h-6 w-6 rounded-full border border-slate-600 bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
              aria-label="Show CS call rules"
              title="Show CS call rules"
            >
              i
            </button>
          )}
        </div>
        {activeTypeTab === CALL_TYPE_TAB && info && (
          <div className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-[11px] text-slate-200">
            Call Success: Above 90 sec | Call Drop: 15 sec to 90 sec | Less than 15 sec: Not Connected
          </div>
        )}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">{activeTypeTab} Pass vs Fail</h4>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              Success {formatNumber(tabSummary.success, 0)} | Failed {formatNumber(tabSummary.failed, 0)}
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
          <div className="text-[11px] text-slate-400">Drop Call </div>
          <div className="text-sm font-semibold text-rose-300 mt-1">
            {formatNumber(callKpis.dropCalls, 0)} ({formatPercent(callKpis.dropCallRate)})
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Success Call</div>
          <div className="text-sm font-semibold text-emerald-300 mt-1">
            {formatNumber(callKpis.successCalls, 0)}
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
            <div className="text-[11px] text-slate-400">Avg Setup Time</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatPreciseSeconds(tabSummary.avg_setup_time)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Min Speed</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatSpeedKbps(tabSummary.min_speed)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Max Speed</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatSpeedKbps(tabSummary.max_speed)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Total File Size</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatBytes(tabSummary.total_file_size)}
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
          className={`grid ${
            activeTypeTab === CALL_TYPE_TAB ? "" : "grid-cols-6"
          } bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-300`}
          style={
            activeTypeTab === CALL_TYPE_TAB
              ? { gridTemplateColumns: "0.8fr 0.95fr 1.15fr 0.8fr 0.8fr 1fr 0.8fr" }
              : undefined
          }
        >
          <span>Session ID</span>
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
              <span>Sub Session ID</span>
              <span>Type</span>
              <span>Status</span>
              <span>Map</span>
              <span>Details</span>
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
          const isExpanded = Boolean(expandedRows[row.rowKey]);

          return (
            <React.Fragment key={row.rowKey}>
              <div
                className={`grid ${
                  activeTypeTab === CALL_TYPE_TAB ? "" : "grid-cols-6"
                } px-2 py-1.5 text-xs border-t border-slate-700 ${
                  isSelected || isMultiSelected ? "bg-cyan-900/20 text-cyan-100" : "text-slate-200"
                }`}
                style={
                  activeTypeTab === CALL_TYPE_TAB
                    ? { gridTemplateColumns: "0.8fr 0.95fr 1.15fr 0.8fr 0.8fr 1fr 0.8fr" }
                    : undefined
                }
              >
                <span>{row.sessionId}</span>
                {activeTypeTab === CALL_TYPE_TAB ? (
                  <>
                    <span>{formatPreciseSeconds(row.setupTime)}</span>
                    <span className="truncate" title={formatText(row.number)}>{formatText(row.number)}</span>
                    <span className="capitalize">{formatText(row.direction)}</span>
                    <span>{formatDuration(row.duration)}</span>
                  </>
                ) : (
                  <>
                    <span>{row.subSessionId}</span>
                    <span>{getSubSessionTypeLabel(row.subSessionTypeNormalized)}</span>
                  </>
                )}
                <span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] border ${
                      row.status === "success"
                        ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
                        : "border-rose-700/40 bg-rose-900/20 text-rose-300"
                    }`}
                  >
                    {row.status === "success"
                      ? isCallRow
                        ? "Connected"
                        : "Success"
                      : isCallRow
                        ? "Not Connected"
                        : "Failed"}
                  </span>
                </span>
                <span>
                  <button
                    type="button"
                    onClick={() => handleHighlight(row)}
                    disabled={!row.position}
                    className={`px-2 py-0.5 rounded border ${
                      row.position
                        ? isMultiSelected
                          ? "border-cyan-400 bg-cyan-900/30 text-cyan-100 hover:bg-cyan-800/50"
                          : "border-cyan-600/60 text-cyan-200 hover:bg-cyan-800/40"
                        : "border-slate-700 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    {row.position ? (isMultiSelected ? "Selected" : "Highlight") : "No Point"}
                  </button>
                </span>
                {activeTypeTab !== CALL_TYPE_TAB && (
                  <span>
                    <button
                      type="button"
                      onClick={() => toggleRow(row.rowKey)}
                      className="px-2 py-0.5 rounded border border-slate-600 text-slate-200 hover:bg-slate-800"
                    >
                      {isExpanded ? "Hide" : <ChevronDown />}
                    </button>
                  </span>
                )}
              </div>

              {activeTypeTab !== CALL_TYPE_TAB && isExpanded && (
                <div
                  className={`border-t border-slate-700 px-3 py-2 ${
                    isSelected || isMultiSelected ? "bg-cyan-900/10 text-cyan-100" : "bg-slate-900/30 text-slate-300"
                  }`}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                    <span className="bg-slate-800/70 rounded px-2 py-1">MX SPD: {formatSpeedKbps(row.maxSpeed)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">MN SPD: {formatSpeedKbps(row.minSpeed)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">FS: {formatBytes(row.fileSize)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">DUR: {formatDuration(row.duration)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">SETUP: {formatPreciseSeconds(row.setupTime)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">ST: {formatLatLng(row.start)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">END: {formatLatLng(row.end)}</span>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
