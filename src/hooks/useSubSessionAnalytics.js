import { useCallback, useEffect, useRef, useState } from "react";
import { mapViewApi } from "@/api/apiEndpoints";
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from "@/utils/projectSessionCache";

const EMPTY_ANALYTICS = Object.freeze({
  requestedSessionIds: [],
  sessions: [],
  summary: null,
  markers: [],
  rawResponse: null,
});

const isRequestCancelled = (error) => {
  if (!error) return false;
  return (
    error.isCancelled === true ||
    error.name === "AbortError" ||
    error.name === "CanceledError" ||
    error.code === "ERR_CANCELED" ||
    error.message === "Request cancelled"
  );
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLatLng = (latRaw, lngRaw, allowZero = false) => {
  const lat = toFiniteNumber(latRaw);
  const lng = toFiniteNumber(lngRaw);

  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!allowZero && lat === 0 && lng === 0) return null;

  return { lat, lng };
};

const normalizeStatusCounts = (statusCounts = {}) => {
  const success = toFiniteNumber(statusCounts.success) ?? 0;
  const failed = toFiniteNumber(statusCounts.failed) ?? 0;
  const total = toFiniteNumber(statusCounts.total) ?? success + failed;

  return { success, failed, total };
};

const normalizeComparisonEntry = (entry = {}) => ({
  count: toFiniteNumber(entry.count) ?? 0,
  total_duration: toFiniteNumber(entry.total_duration),
  avg_duration: toFiniteNumber(entry.avg_duration),
  avg_speed: toFiniteNumber(entry.avg_speed),
  min_speed: toFiniteNumber(entry.min_speed),
  max_speed: toFiniteNumber(entry.max_speed),
  total_file_size: toFiniteNumber(entry.total_file_size),
  avg_file_size: toFiniteNumber(entry.avg_file_size),
});

const normalizeComparison = (comparison = {}) => ({
  success: normalizeComparisonEntry(comparison.success || {}),
  failed: normalizeComparisonEntry(comparison.failed || {}),
});

const normalizeMetrics = (metrics = {}) => ({
  total_duration: toFiniteNumber(metrics.total_duration),
  avg_duration: toFiniteNumber(metrics.avg_duration),
  total_speed: toFiniteNumber(metrics.total_speed),
  avg_speed: toFiniteNumber(metrics.avg_speed),
  min_speed: toFiniteNumber(metrics.min_speed),
  max_speed: toFiniteNumber(metrics.max_speed),
  total_file_size: toFiniteNumber(metrics.total_file_size),
  avg_file_size: toFiniteNumber(metrics.avg_file_size),
  status_counts: normalizeStatusCounts(metrics.status_counts || metrics.statusCounts || {}),
  comparison: normalizeComparison(
    metrics.comparison || metrics.status_comparison || metrics.statusComparison || {},
  ),
});

const normalizeSubSessionItem = (item = {}) => {
  const subSessionId =
    item.sub_session_id ?? item.subSessionId ?? item.subsession_id ?? null;

  const coordinates = item.coordinates || {};
  const start = normalizeLatLng(coordinates.start_lat, coordinates.start_lon);
  const end = normalizeLatLng(coordinates.end_lat, coordinates.end_lon);

  return {
    subSessionId,
    start,
    end,
    resultStatus: String(
      item.result_status ?? item.resultStatus ?? item.status ?? "FAILED",
    ).toUpperCase(),
    rawCoordinates: coordinates,
    markerId: null,
    markerPosition: null,
  };
};

const normalizeSessionItem = (item = {}, index = 0) => {
  const sessionId = item.session_id ?? item.sessionId ?? item.id ?? `session-${index}`;
  const coordinates = item.coordinates || {};
  const sessionStart = normalizeLatLng(coordinates.start_lat, coordinates.start_lon);
  const sessionEnd = normalizeLatLng(coordinates.end_lat, coordinates.end_lon);
  const baseSubSessions = Array.isArray(item.sub_sessions)
    ? item.sub_sessions.map(normalizeSubSessionItem)
    : [];

  const metrics = normalizeMetrics(item.metrics || {});
  const subSessionCount =
    toFiniteNumber(item.sub_session_count) ??
    toFiniteNumber(item.subSessionCount) ??
    baseSubSessions.length;

  const markers = [];
  const subSessions = [];

  let lastKnownPos = sessionStart;

  baseSubSessions.forEach((sub, subIndex) => {
    let position = sub.start;

    if (!position && subIndex === 0) {
      position = sessionStart;
    } else if (!position) {
      position = lastKnownPos;
    }

    if (sub.end) {
      lastKnownPos = sub.end;
    } else if (position) {
      lastKnownPos = position;
    }

    let markerId = null;

    if (position) {
      markerId = `sub-${sessionId}-${sub.subSessionId ?? subIndex}`;

      markers.push({
        id: markerId,
        markerType: "sub-session-start",
        sessionId,
        subSessionId: sub.subSessionId,
        resultStatus: sub.resultStatus,
        position: position,
        start: position,
        end: sub.end,
        sessionStart,
        sessionEnd,
        subSessionCount,
        metrics,
      });
    }

    subSessions.push({
      ...sub,
      markerId,
      markerPosition: position,
    });
  });

  let primaryMarkerId = null;
  let primaryMarkerPosition = null;

  if (markers.length === 0 && sessionStart) {
    primaryMarkerId = `session-${sessionId}`;
    primaryMarkerPosition = sessionStart;
    markers.push({
      id: primaryMarkerId,
      markerType: "session-start",
      sessionId,
      subSessionId: null,
      resultStatus: "FAILED",
      position: sessionStart,
      start: sessionStart,
      end: sessionEnd,
      sessionStart,
      sessionEnd,
      subSessionCount,
      metrics,
    });
  } else if (markers.length > 0) {
    primaryMarkerId = markers[0].id;
    primaryMarkerPosition = markers[0].position;
  }

  return {
    sessionId,
    start: sessionStart,
    end: sessionEnd,
    subSessionCount,
    subSessions,
    metrics,
    rawCoordinates: coordinates,
    markers,
    primaryMarkerId,
    primaryMarkerPosition,
  };
};

const normalizeResponse = (response) => {
  let body = response || {};
  let data = [];

  if (Array.isArray(response)) {
    data = response;
  } else if (response?.data && Array.isArray(response.data)) {
    data = response.data;
    body = response;
  } else if (response?.data) {
    body = response.data;
    data = Array.isArray(body.data) ? body.data : [];
  } else if (Array.isArray(body.data)) {
    data = body.data;
  }

  const sessions = data.map((item, index) => normalizeSessionItem(item, index));
  const markers = sessions.flatMap((session) => session.markers || []);

  const requestedSessionIdsRaw = Array.isArray(body?.requested_session_ids)
    ? body.requested_session_ids
    : [];

  const requestedSessionIds = requestedSessionIdsRaw
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);

  let rawSummary = body?.summary;
  if (!rawSummary && data.length > 0) {
    let total_duration = 0;
    let avg_duration_sum = 0;
    let total_speed = 0;
    let avg_speed_sum = 0;
    let min_speed = null;
    let max_speed = null;
    let total_file_size = 0;
    let avg_file_size_sum = 0;
    let countWithData = 0;
    const status_counts = { success: 0, failed: 0, total: 0 };

    data.forEach((item) => {
      const m = item.metrics || {};
      let hasData = false;
      if (m.total_duration != null) { total_duration += Number(m.total_duration); hasData = true; }
      if (m.avg_duration != null) { avg_duration_sum += Number(m.avg_duration); hasData = true; }
      if (m.total_speed != null) { total_speed += Number(m.total_speed); hasData = true; }
      if (m.avg_speed != null) { avg_speed_sum += Number(m.avg_speed); hasData = true; }
      if (m.min_speed != null) {
        const value = Number(m.min_speed);
        min_speed = min_speed == null ? value : Math.min(min_speed, value);
        hasData = true;
      }
      if (m.max_speed != null) {
        const value = Number(m.max_speed);
        max_speed = max_speed == null ? value : Math.max(max_speed, value);
        hasData = true;
      }
      if (m.total_file_size != null) { total_file_size += Number(m.total_file_size); hasData = true; }
      if (m.avg_file_size != null) { avg_file_size_sum += Number(m.avg_file_size); hasData = true; }
      if (m.status_counts) {
        status_counts.success += Number(m.status_counts.success || 0);
        status_counts.failed += Number(m.status_counts.failed || 0);
      }
      if (hasData) countWithData++;
    });

    status_counts.total = status_counts.success + status_counts.failed;

    rawSummary = {
      total_duration,
      avg_duration: countWithData > 0 ? avg_duration_sum / countWithData : 0,
      total_speed,
      avg_speed: countWithData > 0 ? avg_speed_sum / countWithData : 0,
      min_speed,
      max_speed,
      total_file_size,
      avg_file_size: countWithData > 0 ? avg_file_size_sum / countWithData : 0,
      status_counts,
      comparison: {
        success: { count: status_counts.success },
        failed: { count: status_counts.failed },
      },
    };
  }

  return {
    requestedSessionIds,
    sessions,
    summary: normalizeMetrics(rawSummary || {}),
    markers,
    rawResponse: response,
  };
};

export const useSubSessionAnalytics = (sessionIds, enabled = false) => {
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchKeyRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(
    async (force = false) => {
      const fetchKey = Array.isArray(sessionIds)
        ? [...sessionIds].map((id) => String(id ?? "").trim()).filter(Boolean).sort().join(",")
        : "";

      if (!enabled || !fetchKey) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (mountedRef.current) {
          setAnalytics(EMPTY_ANALYTICS);
          setLoading(false);
          setError(null);
        }
        return;
      }

      if (!force && isFetchingRef.current) return;
      if (!force && lastFetchKeyRef.current === fetchKey && analytics.sessions.length > 0) {
        return;
      }

      const cacheKey = makeProjectCacheKey({
        resource: "unified-sub-session-analytics",
        sessionIds: sessionIds || [],
      });

      if (!force) {
        const cached = readProjectSessionCache(cacheKey);
        if (cached && Array.isArray(cached?.sessions)) {
          if (mountedRef.current) {
            setAnalytics(cached);
            setLoading(false);
            setError(null);
            lastFetchKeyRef.current = fetchKey;
          }
          return;
        }
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      isFetchingRef.current = true;

      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await mapViewApi.getSubSessionAnalytics({
          sessionIds,
          signal: abortControllerRef.current.signal,
        });

        if (!mountedRef.current) return;

        const normalized = normalizeResponse(response);
        setAnalytics(normalized);
        writeProjectSessionCache(cacheKey, normalized);
        lastFetchKeyRef.current = fetchKey;
      } catch (err) {
        if (isRequestCancelled(err)) return;

        if (mountedRef.current) {
          setError(err?.message || "Failed to fetch sub-session analytics");
          setAnalytics(EMPTY_ANALYTICS);
        }
      } finally {
        isFetchingRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, sessionIds, analytics.sessions.length],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchData();
    }, 100);

    return () => clearTimeout(timeout);
  }, [fetchData]);

  return {
    ...analytics,
    loading,
    error,
    refetch: () => fetchData(true),
  };
};
