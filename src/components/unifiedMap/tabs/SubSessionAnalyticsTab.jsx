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

const formatBytes = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  const bytes = Number(value);

  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes.toFixed(0)} B`;
};

const toCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMetric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatLatLng = (position) => {
  if (!position || position.lat == null || position.lng == null) return "N/A";
  const lat = Number(position.lat);
  const lng = Number(position.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return "N/A";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
};

const SORT_OPTIONS = [
  { key: "NONE", label: "SORT" },
  { key: "MX_SPD", label: "MX SPD" },
  { key: "MN_SPD", label: "MN SPD" },
  { key: "FS", label: "FS" },
];

export default function SubSessionAnalyticsTab({
  subSessionData = [],
  subSessionSummary = null,
  requestedSessionIds = [],
  loading = false,
  onSubSessionSelect,
  selectedSubSessionTarget = null,
}) {
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState("NONE");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef(null);

  const safeSummary = useMemo(() => subSessionSummary || {}, [subSessionSummary]);
  const summaryCounts = safeSummary.status_counts || {};
  const summaryTotal = toCount(summaryCounts.total);
  const summarySuccess = toCount(summaryCounts.success);
  const summaryFailed = toCount(summaryCounts.failed);
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

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedSortLabel = useMemo(
    () => SORT_OPTIONS.find((option) => option.key === sortBy)?.label || "SORT",
    [sortBy],
  );

  const rows = useMemo(() => {
    if (!Array.isArray(subSessionData)) return [];

    return subSessionData.flatMap((session, sessionIndex) =>
      (session.subSessions || []).map((sub, subIndex) => {
        const subMetrics = sub.metrics || {};
        return {
          rowKey: `sub-row-${session.sessionId ?? sessionIndex}-${sub.subSessionId ?? subIndex}-${subIndex}`,
          sessionId: session.sessionId,
          subSessionId: sub.subSessionId,
          status: String(sub.resultStatus || "FAILED").toUpperCase(),
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
          duration: toMetric(
            sub.duration ??
              sub.total_duration ??
              subMetrics.total_duration ??
              session.metrics?.avg_duration,
          ),
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
    }

    return sorted;
  }, [rows, sortBy]);

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
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">Overall Pass vs Fail</h4>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              Success {summarySuccess} | Failed {summaryFailed}
            </span>
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              Total Sub Sessions: {formatNumber(summaryTotal, 0)}
            </span>
            <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-1 rounded">
              Req Sessions: {requestedCount}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total Duration</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatDuration(safeSummary.total_duration)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Average Duration</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatDuration(safeSummary.avg_duration)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Average Speed</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatSpeedKbps(safeSummary.avg_speed)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Min Speed</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatSpeedKbps(safeSummary.min_speed)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Max Speed</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatSpeedKbps(safeSummary.max_speed)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total File Size</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatBytes(safeSummary.total_file_size)}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold text-slate-200">Sub Session Table</h5>
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
                {SORT_OPTIONS.map((option) => (
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

        <div className="grid grid-cols-5 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-300">
          <span>Session ID</span>
          <span>Sub Session ID</span>
          <span>Status</span>
          <span>Map</span>
          <span>Drop</span>
        </div>

        {sortedRows.map((row) => {
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
                className={`grid grid-cols-5 px-2 py-1.5 text-xs border-t border-slate-700 ${
                  isSelected ? "bg-cyan-900/20 text-cyan-100" : "text-slate-200"
                }`}
              >
                <span>{row.sessionId}</span>
                <span>{row.subSessionId}</span>
                <span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] border ${
                      row.status === "SUCCESS"
                        ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
                        : "border-rose-700/40 bg-rose-900/20 text-rose-300"
                    }`}
                  >
                    {row.status === "SUCCESS" ? "Success" : "Failed"}
                  </span>
                </span>
                <span>
                  <button
                    type="button"
                    onClick={() => handleHighlight(row)}
                    disabled={!row.position}
                    className={`px-2 py-0.5 rounded border ${
                      row.position
                        ? "border-cyan-600/60 text-cyan-200 hover:bg-cyan-800/40"
                        : "border-slate-700 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    {row.position ? "Highlight" : "No Point"}
                  </button>
                </span>
                <span>
                  <button
                    type="button"
                    onClick={() => toggleRow(row.rowKey)}
                    className="px-2 py-0.5 rounded border border-slate-600 text-slate-200 hover:bg-slate-800"
                  >
                    {isExpanded ? "Hide" : "Drop"}
                  </button>
                </span>
              </div>

              {isExpanded && (
                <div
                  className={`border-t border-slate-700 px-3 py-2 ${
                    isSelected ? "bg-cyan-900/10 text-cyan-100" : "bg-slate-900/30 text-slate-300"
                  }`}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                    <span className="bg-slate-800/70 rounded px-2 py-1">MX SPD: {formatSpeedKbps(row.maxSpeed)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">MN SPD: {formatSpeedKbps(row.minSpeed)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">FS: {formatBytes(row.fileSize)}</span>
                    <span className="bg-slate-800/70 rounded px-2 py-1">DUR: {formatDuration(row.duration)}</span>
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
