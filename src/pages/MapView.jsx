// src/pages/MapView.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import { toast } from "react-toastify";
import { Filter } from "lucide-react";

import { mapViewApi, settingApi } from "../api/apiEndpoints";
import Spinner from "../components/common/Spinner";
import MapWithMultipleCircles from "../components/unifiedMap/MapwithMultipleCircle";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import MapViewSide from "@/components/MapView/MapViewSide";
import NetworkPlannerMap from "@/components/unifiedMap/NetworkPlannerMap";

const defaultThresholds = {
  rsrp: [],
  rsrq: [],
  sinr: [],
  dl_thpt: [],
  ul_thpt: [],
  mos: [],
  lte_bler: [],
};

const canonicalOperatorName = (raw) => {
  if (!raw && raw !== 0) return "Unknown";
  let s = String(raw).trim();
  s = s.replace(/^IND[-\s]*/i, "");
  const lower = s.toLowerCase();
  if (lower === "//////" || lower === "404011") return "Unknown";
  if (lower.includes("jio")) return "JIO";
  if (lower.includes("airtel")) return "Airtel";
  if (lower.includes("vodafone") || lower.startsWith("vi"))
    return "Vi (Vodafone Idea)";
  return s;
};

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 }; 

const SimpleMapView = () => {
  const [rawLocations, setRawLocations] = useState([]);
  const [thresholds, setThresholds] = useState(defaultThresholds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeMarker, setActiveMarker] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState("rsrp");
  const [isSideOpen, setIsSideOpen] = useState(false);
  const [ui, setUi] = useState({ basemapStyle: "roadmap" });

  // --- Read project + session from URL ---
  const projectParam =
    searchParams.get("project_id") ?? searchParams.get("project") ?? "";
  const [projectId, setProjectId] = useState(projectParam ? Number(projectParam) : "");

  const sessionIds = useMemo(() => {
    const sessionParam =
      searchParams.get("sessionId") ?? searchParams.get("session");
    return sessionParam
      ? sessionParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id)
      : [];
  }, [searchParams]);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  // --- Load thresholds ---
  useEffect(() => {
    const run = async () => {
      try {
        const res = await settingApi.getThresholdSettings();
        const d = res?.Data;
        if (d) {
          setThresholds({
            rsrp: JSON.parse(d.rsrp_json || "[]"),
            rsrq: JSON.parse(d.rsrq_json || "[]"),
            sinr: JSON.parse(d.sinr_json || "[]"),
            dl_thpt: JSON.parse(d.dl_thpt_json || "[]"),
            ul_thpt: JSON.parse(d.ul_thpt_json || "[]"),
            mos: JSON.parse(d.mos_json || "[]"),
            lte_bler: JSON.parse(d.lte_bler_json || "[]"),
          });
        }
      } catch (e) {
        console.error("Failed to load thresholds:", e);
      }
    };
    run();
  }, []);

  // --- Fetch session logs ---
  useEffect(() => {
    if (sessionIds.length === 0) {
      setError("No session ID provided in the URL.");
      setLoading(false);
      return;
    }

    const fetchSessionLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const promises = sessionIds.map((sessionId) =>
          mapViewApi.getNetworkLog({ session_id: sessionId })
        );
        const results = await Promise.all(promises);
        const allLogs = results.flatMap(
          (resp) => resp?.Data ?? resp?.data ?? resp ?? []
        );

        if (allLogs.length === 0) {
          toast.warn("No location data found for the specified session(s).");
          setRawLocations([]);
        } else {
          const formatted = allLogs
            .map((log) => {
              const lat = parseFloat(
                log.lat ?? log.Lat ?? log.latitude ?? log.Latitude
              );
              const lng = parseFloat(
                log.lon ?? log.lng ?? log.Lng ?? log.longitude ?? log.Longitude
              );
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              return {
                lat,
                lng,
                radius: 18,
                timestamp:
                  log.timestamp ??
                  log.time ??
                  log.created_at ??
                  log.createdAt,
                rsrp: log.rsrp ?? log.RSRP ?? log.rsrp_dbm,
                rsrq: log.rsrq ?? log.RSRQ,
                sinr: log.sinr ?? log.SINR,
                dl_thpt: log.dl_thpt ?? log.dl_tpt ?? log.DL ?? log.download,
                ul_thpt: log.ul_thpt ?? log.ul_tpt ?? log.UL ?? log.upload,
                mos: log.mos ?? log.MOS,
                lte_bler: log.lte_bler ?? log.LTE_BLER ?? log.bler,
                operator: canonicalOperatorName(log.operator_name),
                technology: log.technology,
                band: log.band,
              };
            })
            .filter(Boolean);
          setRawLocations(formatted);
        }
      } catch (err) {
        console.error("Error fetching session logs:", err);
        toast.error(`Failed to fetch session data: ${err.message || "Unknown"}`);
        setError(
          `Failed to load data for session ID(s): ${sessionIds.join(", ")}`
        );
        setRawLocations([]);
      } finally {
        setLoading(false);
      }
    };
    fetchSessionLogs();
  }, [sessionIds]);

  const handleUIChange = useCallback((changes) => {
    setUi((prev) => ({ ...prev, ...changes }));
  }, []);

  // Update URL on Apply & Reload in sidebar (keeps session(s), normalizes project param)
  const reloadFromSidebar = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (projectId) {
        next.set("project", String(projectId));
        next.delete("projectId"); // normalize
      } else {
        next.delete("project");
        next.delete("projectId");
      }
      return next;
    });
    toast.info("Project updated in URL");
  }, [projectId, setSearchParams]);

  // Compute map center (avg of points) or fallback
  const mapCenter = useMemo(() => {
    if (rawLocations.length === 0) return DEFAULT_CENTER;
    const { lat, lng } = rawLocations.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 }
    );
    return { lat: lat / rawLocations.length, lng: lng / rawLocations.length };
  }, [rawLocations]);

  const mapOptions = useMemo(() => {
    const style =
      ui.basemapStyle === "satellite" ||
      ui.basemapStyle === "hybrid" ||
      ui.basemapStyle === "terrain"
        ? ui.basemapStyle
        : "roadmap";
    return { mapTypeId: style };
  }, [ui.basemapStyle]);

  // --- Loading & Error States ---
  if (!isLoaded)
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  if (loadError)
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error loading map library.
      </div>
    );
  if (loading)
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  if (error)
    return (
      <div className="flex items-center justify-center h-screen text-red-500 p-4 text-center">
        {error}
      </div>
    );

  return (
    <div className="p-4 md:p-6 h-screen flex flex-col bg-gray-50 dark:bg-gray-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h1 className="text-xl md:text-2xl font-semibold dark:text-white">
          Drive Session Map View
          <span className="text-base font-normal text-gray-600 dark:text-gray-400 block sm:inline sm:ml-2">
            (Session: {sessionIds.join(", ")} | Project: {projectId || "-"})
          </span>
        </h1>
        <div className="flex gap-5 justify-center items-center">
          <button
            onClick={() => setIsSideOpen(!isSideOpen)}
            className="flex gap-1 items-center bg-blue-600 hover:bg-blue-500 text-white text-sm sm:text-base rounded-md px-3 py-1"
          >
            <Filter className="h-4" />
            {isSideOpen ? "Close Filters" : "Open Filters"}
          </button>
          <Link
            to="/drive-test-sessions"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm sm:text-base"
          >
            ← Back to All Sessions
          </Link>
        </div>
      </div>

      {/* Sidebar */}
      <MapViewSide
        open={isSideOpen}
        onOpenChange={setIsSideOpen}
        metric={selectedMetric}
        setMetric={setSelectedMetric}
        ui={ui}
        onUIChange={handleUIChange}
        loading={loading}
        position="left"
        projectId={projectId}
        setProjectId={setProjectId}
        sessionId={sessionIds.join(",")}
        reloadData={reloadFromSidebar}
      />

      {/* Map */}
      <div className="flex-grow rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden relative">
        <div className="absolute bottom-2 left-2 z-10 bg-white/80 dark:bg-gray-800/80 p-1 px-2 rounded text-xs text-gray-600 dark:text-gray-300 shadow">
          {rawLocations.length} points loaded. Colors reflect {selectedMetric.toUpperCase()} thresholds.
        </div>

        <div className="relative h-full w-full">
          {rawLocations.length > 0 || ui.showSectors ? (
            <MapWithMultipleCircles
              isLoaded={isLoaded}
              loadError={loadError}
              locations={rawLocations}
              thresholds={thresholds}
              selectedMetric={selectedMetric}
              activeMarkerIndex={activeMarker}
              onMarkerClick={setActiveMarker}
              options={mapOptions}
              center={mapCenter}           // used when no fit to bounds
              defaultZoom={15}             // used when not fitting to points
              fitToLocations={rawLocations.length > 0}
            >
              {ui.showSectors && <NetworkPlannerMap />}
            </MapWithMultipleCircles>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <p className="text-gray-600 dark:text-gray-300">
                No valid location data to display for this session.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleMapView;