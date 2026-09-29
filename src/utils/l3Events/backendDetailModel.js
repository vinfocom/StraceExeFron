import { buildProtocolAnalysis } from "./protocolAnalyzer.js";
import { buildUnifiedSignalingRows } from "./signalingModel.js";
import { parseTimestampValue } from "./timelineBuilder.js";

export function sortTimelineChronologically(rows = []) {
  return rows
    .map((row, sourceOrder) => {
      const rawTimestamp = row?.timestamp ?? row?.timestampLabel ?? row?.timestampText;
      const parsed = rawTimestamp instanceof Date
        ? rawTimestamp
        : typeof rawTimestamp === "number"
          ? new Date(rawTimestamp)
          : parseTimestampValue(rawTimestamp);
      const timestampMs = parsed instanceof Date && Number.isFinite(parsed.getTime())
        ? parsed.getTime()
        : null;
      const originalRow = row?.originalTimelineIndex === undefined
        ? { ...row, originalTimelineIndex: sourceOrder }
        : row;
      return { row: originalRow, sourceOrder, timestampMs };
    })
    .sort((left, right) => {
      if (left.timestampMs !== null && right.timestampMs !== null) {
        return left.timestampMs - right.timestampMs || left.sourceOrder - right.sourceOrder;
      }
      if (left.timestampMs !== null) return -1;
      if (right.timestampMs !== null) return 1;
      return left.sourceOrder - right.sourceOrder;
    })
    .map(({ row }) => row);
}

export function getFiniteRsrpValue(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function addPlaybackIndexes(points = []) {
  return points.map((point, playbackIndex) => ({
    ...point,
    index: playbackIndex,
    playbackIndex,
  }));
}

export function buildPlaybackPoints(timeline = [], toPoint) {
  return addPlaybackIndexes(timeline
    .map((row, originalIndex) => toPoint(row, originalIndex))
    .filter(Boolean));
}

export function shouldResetMapNavigation(previousDatasetKey, nextDatasetKey) {
  return previousDatasetKey !== nextDatasetKey;
}

export function shouldEnableMapShortcuts(active) {
  return active === true;
}

export function shouldKeepExcelViewMounted(hasRows) {
  return Boolean(hasRows);
}

export function getCompletenessNotice(loadedCount, take, reportedCount = null, explicitIncomplete = false) {
  const loaded = Math.max(0, Number(loadedCount) || 0);
  const requested = Math.max(0, Number(take) || 0);
  const reported = reportedCount === null || reportedCount === undefined || reportedCount === ""
    ? null
    : Number(reportedCount);
  if (explicitIncomplete || (Number.isFinite(reported) && reported > loaded)) {
    return `Partial data: loaded ${loaded.toLocaleString()} of ${Number.isFinite(reported) ? reported.toLocaleString() : "an unknown total"} rows. The backend must expose continuation support to load the remainder.`;
  }
  if (Number.isFinite(reported)) return "";
  if (requested > 0 && loaded >= requested) {
    return `At least ${loaded.toLocaleString()} rows were returned, reaching the ${requested.toLocaleString()}-row request cap. Results may be incomplete; backend continuation support is required to verify or load the remainder.`;
  }
  return "";
}

export function readReportedRowCount(payload) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const candidates = [
    source?.totalRows, source?.total_rows, source?.totalCount, source?.total_count,
    source?.rowCount, source?.row_count, source?.count,
  ];
  const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
  const parsed = value === undefined ? null : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function hasExplicitlyIncompleteRows(payload) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return Boolean(
    source?.isPartial || source?.is_partial || source?.truncated || source?.isTruncated ||
    source?.is_truncated || source?.hasMore || source?.has_more ||
    source?.isComplete === false || source?.is_complete === false,
  );
}

// Keep summary and on-demand detail requests separate, deduplicating effect
// replays and tab changes within one open analyzer.
export function createBackendL3Loader(fetchSummary) {
  let current = null;
  return (scope) => {
    const { includeRows = false, ...selection } = scope;
    const key = JSON.stringify(selection);
    if (current?.key !== key) current = { key, requests: new Map() };
    const entry = current;
    if (entry.requests.has(includeRows)) return entry.requests.get(includeRows);
    const promise = Promise.resolve().then(() => fetchSummary({ ...selection, includeRows })).catch((error) => {
      entry.requests.delete(includeRows);
      throw error;
    });
    entry.requests.set(includeRows, promise);
    return promise;
  };
}

// Per-view endpoints use the same scope-level in-flight deduplication as the
// summary/timeline loader while keeping each view's response independent.
export function createBackendScopedLoader(fetchRows) {
  let current = null;
  return (scope) => {
    const key = JSON.stringify(scope);
    if (current?.key !== key) current = { key, promise: null };
    if (current.promise) return current.promise;
    const entry = current;
    entry.promise = Promise.resolve().then(() => fetchRows(scope)).catch((error) => {
      if (current === entry) entry.promise = null;
      throw error;
    });
    return entry.promise;
  };
}

// Build once per loaded response. Tab selection must not clear another view's data.
export function buildBackendDetailModel(timeline, calls = []) {
  const analysis = buildProtocolAnalysis(timeline, []);
  return {
    analysis,
    signalingRows: buildUnifiedSignalingRows(timeline, calls, analysis),
  };
}
