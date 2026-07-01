import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";

import { mapViewApi } from "../api/apiEndpoints";
import { connectNetworkLogRealtime } from "../api/networkLogRealtime";
import {
  GOOGLE_MAPS_LOADER_OPTIONS,
  getGoogleMapsConfigError,
  getGoogleMapsErrorMessage,
} from "../lib/googleMapsLoader";

const DEFAULT_CENTER = { lat: 25.033, lng: 121.5654 };
const mapContainerStyle = { width: "100%", height: "100%" };
const PAGE_SIZE = 20000;
const MAX_PAGES = 25;

const extractRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response?.rows)) return response.rows;
  return [];
};

const extractTotalCount = (response, fallback = 0) => {
  const body = response?.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data
    : response;

  const value =
    body?.total_count ??
    body?.totalCount ??
    body?.TotalCount ??
    body?.count ??
    body?.Count;

  const total = Number(value);
  return Number.isFinite(total) && total > 0 ? total : fallback;
};

const extractCacheState = (response) => {
  const body = response?.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data
    : response;
  return String(body?.cache_state || body?.cacheState || "").toUpperCase();
};

const readNumber = (row, keys) => {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const normalizePoint = (row, index) => {
  const lat = readNumber(row, ["lat", "latitude", "Latitude", "LAT"]);
  const lng = readNumber(row, ["lng", "lon", "longitude", "Longitude", "LON"]);

  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return {
    id: row?.id ?? row?.Id ?? `${lat}-${lng}-${index}`,
    sessionId: row?.session_id ?? row?.sessionId ?? row?.SessionId ?? null,
    lat,
    lng,
    timestamp: row?.timestamp ?? row?.Timestamp ?? row?.time ?? row?.created_at ?? null,
    rsrp: row?.rsrp ?? row?.RSRP ?? null,
    rsrq: row?.rsrq ?? row?.RSRQ ?? null,
    sinr: row?.sinr ?? row?.SINR ?? null,
  };
};

const toTimeMs = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const distanceMeters = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const buildPathSegments = (points) => {
  if (!Array.isArray(points) || points.length < 2) return [];

  const sorted = [...points].sort((a, b) => {
    const sessionA = Number(a.sessionId) || 0;
    const sessionB = Number(b.sessionId) || 0;
    if (sessionA !== sessionB) return sessionA - sessionB;

    const timeA = toTimeMs(a.timestamp) ?? 0;
    const timeB = toTimeMs(b.timestamp) ?? 0;
    if (timeA !== timeB) return timeA - timeB;

    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  const segments = [];
  let current = [];

  const pushCurrent = () => {
    if (current.length > 1) {
      segments.push({ path: current.map((point) => [point.lng, point.lat]) });
    }
    current = [];
  };

  sorted.forEach((point) => {
    const previous = current[current.length - 1];
    if (!previous) {
      current.push(point);
      return;
    }

    const sameSession = String(previous.sessionId ?? "") === String(point.sessionId ?? "");
    const timeA = toTimeMs(previous.timestamp);
    const timeB = toTimeMs(point.timestamp);
    const timeGapMs = timeA != null && timeB != null ? Math.abs(timeB - timeA) : 0;
    const isJump = distanceMeters(previous, point) > 750 || timeGapMs > 10 * 60 * 1000;

    if (!sameSession || isJump) {
      pushCurrent();
    }

    current.push(point);
  });

  pushCurrent();
  return segments;
};

const parseSessionIds = (value) => {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
};

const statusStyles = {
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  connecting: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-slate-50 text-slate-600 border-slate-200",
  error: "bg-red-50 text-red-700 border-red-200",
  unsupported: "bg-red-50 text-red-700 border-red-200",
  idle: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function RealtimeNetworkMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionQuery = searchParams.get("session_ids") || searchParams.get("sessionIds") || "";
  const projectId = searchParams.get("project_id") || searchParams.get("projectId") || "";
  const sessionIds = useMemo(() => parseSessionIds(sessionQuery), [sessionQuery]);
  const [sessionInput, setSessionInput] = useState(sessionQuery);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [mapInstance, setMapInstance] = useState(null);
  const mapRef = useRef(null);
  const deckOverlayRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const staleRetryTimerRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const mapsError = getGoogleMapsConfigError() || (loadError ? getGoogleMapsErrorMessage(loadError) : null);

  useEffect(() => {
    setSessionInput(sessionQuery);
  }, [sessionQuery]);

  const fitPoints = useCallback((nextPoints) => {
    if (!mapRef.current || !window.google?.maps || nextPoints.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    nextPoints.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));
    mapRef.current.fitBounds(bounds, 70);
  }, []);

  const loadLogs = useCallback(async ({ silent = false, staleRetryCount = 0 } = {}) => {
    if (sessionIds.length === 0) {
      setPoints([]);
      return;
    }

    if (fetchInFlightRef.current) {
      pendingRefreshRef.current = true;
      return;
    }

    fetchInFlightRef.current = true;
    if (!silent) setLoading(true);
    try {
      const nextPoints = [];
      let page = 1;
      let totalCount = 0;
      let hasMore = true;
      let sawStaleCache = false;

      while (hasMore && page <= MAX_PAGES) {
        const response = await mapViewApi.getNetworkLog({
          session_ids: sessionIds,
          project_id: projectId || undefined,
          page,
          limit: PAGE_SIZE,
          force_refresh: silent || staleRetryCount > 0,
        });

        const rows = extractRows(response);
        if (extractCacheState(response) === "STALE") sawStaleCache = true;
        if (page === 1) totalCount = extractTotalCount(response, rows.length);

        rows
          .map(normalizePoint)
          .filter(Boolean)
          .forEach((point) => nextPoints.push(point));

        hasMore = rows.length === PAGE_SIZE && nextPoints.length < totalCount;
        page += 1;
      }

      setPoints(nextPoints);
      setLastUpdated(new Date());
      window.setTimeout(() => fitPoints(nextPoints), 0);

      if (sawStaleCache && staleRetryCount < 3) {
        if (staleRetryTimerRef.current) window.clearTimeout(staleRetryTimerRef.current);
        staleRetryTimerRef.current = window.setTimeout(() => {
          loadLogs({ silent: true, staleRetryCount: staleRetryCount + 1 });
        }, 2500 * (staleRetryCount + 1));
      }
    } catch (error) {
      toast.error(error?.message || "Failed to load realtime network logs.");
    } finally {
      fetchInFlightRef.current = false;
      if (!silent) setLoading(false);
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        window.setTimeout(() => loadLogs({ silent: true }), 250);
      }
    }
  }, [fitPoints, projectId, sessionIds]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!mapInstance || !window.google?.maps) return undefined;

    if (!deckOverlayRef.current) {
      deckOverlayRef.current = new GoogleMapsOverlay({
        interleaved: true,
        glOptions: { preserveDrawingBuffer: false },
      });
    }

    try {
      deckOverlayRef.current.setMap(mapInstance);
    } catch {
      return undefined;
    }

    return () => {
      if (deckOverlayRef.current) {
        try {
          deckOverlayRef.current.setProps({ layers: [] });
          deckOverlayRef.current.setMap(null);
        } catch {
          // Ignore detach errors during fast map unmounts.
        }
      }
      if (staleRetryTimerRef.current) {
        window.clearTimeout(staleRetryTimerRef.current);
        staleRetryTimerRef.current = null;
      }
    };
  }, [mapInstance, isLoaded]);

  const deckLayers = useMemo(() => {
    const pathSegments = buildPathSegments(points);
    return [
      new PathLayer({
        id: "realtime-network-path",
        data: pathSegments,
        getPath: (item) => item.path,
        getColor: [37, 99, 235, 220],
        getWidth: 3,
        widthUnits: "pixels",
        rounded: true,
        jointRounded: true,
        capRounded: true,
        parameters: {
          depthTest: false,
        },
      }),
      new ScatterplotLayer({
        id: "realtime-network-points",
        data: points,
        getPosition: (point) => [point.lng, point.lat],
        getFillColor: [14, 165, 233, 220],
        getLineColor: [255, 255, 255, 210],
        getRadius: 4,
        radiusUnits: "pixels",
        lineWidthMinPixels: 1,
        stroked: true,
        filled: true,
        pickable: false,
        parameters: {
          depthTest: false,
        },
      }),
    ];
  }, [points]);

  useEffect(() => {
    if (!deckOverlayRef.current) return;
    deckOverlayRef.current.setProps({ layers: deckLayers });
  }, [deckLayers]);

  useEffect(() => {
    if (sessionIds.length === 0) {
      setStatus("idle");
      return undefined;
    }

    const disconnect = connectNetworkLogRealtime({
      sessionIds,
      onStatus: setStatus,
      onChanged: () => {
        setRefreshCount((count) => count + 1);
        if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = window.setTimeout(() => {
          loadLogs({ silent: true });
        }, 500);
      },
    });

    return () => {
      disconnect();
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [loadLogs, sessionIds]);

  const center = points[0] ? { lat: points[0].lat, lng: points[0].lng } : DEFAULT_CENTER;
  const statusClass = statusStyles[status] || statusStyles.idle;
  const StatusIcon = status === "connected" ? Wifi : WifiOff;

  const applySessions = (event) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    next.set("session_ids", sessionInput.trim());
    setSearchParams(next);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={applySessions} className="flex min-w-[280px] flex-1 items-center gap-2">
            <input
              value={sessionInput}
              onChange={(event) => setSessionInput(event.target.value)}
              placeholder="Session IDs, comma separated"
              className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Load
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 ${statusClass}`}>
              <StatusIcon className="h-4 w-4" />
              {status}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {points.length.toLocaleString()} points
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {refreshCount.toLocaleString()} live refreshes
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1">
        {mapsError ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-red-600">
            {mapsError}
          </div>
        ) : !isLoaded ? (
          <div className="flex h-full items-center justify-center text-slate-600">Loading map...</div>
        ) : (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={points.length ? 15 : 11}
            onLoad={(map) => {
              mapRef.current = map;
              setMapInstance(map);
              fitPoints(points);
            }}
            onUnmount={() => {
              if (deckOverlayRef.current) {
                try {
                  deckOverlayRef.current.setProps({ layers: [] });
                  deckOverlayRef.current.setMap(null);
                } catch {
                  // Ignore detach errors.
                }
              }
              mapRef.current = null;
              setMapInstance(null);
            }}
            options={{
              streetViewControl: false,
              fullscreenControl: true,
              mapTypeControl: true,
              clickableIcons: false,
            }}
          >
            {points[0] && <MarkerF position={{ lat: points[0].lat, lng: points[0].lng }} label="S" />}
            {points.length > 1 && (
              <MarkerF
                position={{ lat: points[points.length - 1].lat, lng: points[points.length - 1].lng }}
                label="E"
              />
            )}
          </GoogleMap>
        )}

        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow">
          Last loaded: {lastUpdated ? lastUpdated.toLocaleTimeString() : "Not loaded"}
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/45 text-sm font-medium text-slate-700">
            Loading network logs...
          </div>
        )}
      </div>
    </div>
  );
}
