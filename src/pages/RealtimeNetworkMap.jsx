import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, Polyline, useJsApiLoader } from "@react-google-maps/api";
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

const extractRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response?.rows)) return response.rows;
  return [];
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
    lat,
    lng,
    timestamp: row?.timestamp ?? row?.Timestamp ?? row?.time ?? row?.created_at ?? null,
    rsrp: row?.rsrp ?? row?.RSRP ?? null,
    rsrq: row?.rsrq ?? row?.RSRQ ?? null,
    sinr: row?.sinr ?? row?.SINR ?? null,
  };
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
  const mapRef = useRef(null);
  const refreshTimerRef = useRef(null);

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

  const loadLogs = useCallback(async ({ silent = false } = {}) => {
    if (sessionIds.length === 0) {
      setPoints([]);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const response = await mapViewApi.getNetworkLog({
        session_ids: sessionIds,
        project_id: projectId || undefined,
        page: 1,
        limit: 20000,
      });

      const nextPoints = extractRows(response)
        .map(normalizePoint)
        .filter(Boolean);

      setPoints(nextPoints);
      setLastUpdated(new Date());
      window.setTimeout(() => fitPoints(nextPoints), 0);
    } catch (error) {
      toast.error(error?.message || "Failed to load realtime network logs.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fitPoints, projectId, sessionIds]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

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
              fitPoints(points);
            }}
            onUnmount={() => {
              mapRef.current = null;
            }}
            options={{
              streetViewControl: false,
              fullscreenControl: true,
              mapTypeControl: true,
              clickableIcons: false,
            }}
          >
            {points.length > 1 && (
              <Polyline
                path={points.map((point) => ({ lat: point.lat, lng: point.lng }))}
                options={{
                  strokeColor: "#2563eb",
                  strokeOpacity: 0.85,
                  strokeWeight: 4,
                }}
              />
            )}
            {points.slice(0, 500).map((point, index) => (
              <MarkerF
                key={point.id}
                position={{ lat: point.lat, lng: point.lng }}
                label={index === 0 ? "S" : index === points.length - 1 ? "E" : undefined}
              />
            ))}
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
