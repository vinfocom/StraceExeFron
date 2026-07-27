import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Columns2,
  Map as MapIcon,
  Minus,
  Plus,
  Rows2,
  Trash2,
} from "lucide-react";


import { useNetworkSamples } from "@/hooks/useNetworkSamples";
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import useColorForLog from "@/hooks/useColorForLog";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";

import MapChild from "../components/multiMap/MapChild";
import Spinner from "../components/common/Spinner";
import MultiAnalytics from "@/components/multiMap/MultiAnalytics";
import DrawingControlsPanel from "@/components/map/layout/DrawingControlsPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

const MAX_MULTIVIEW_PRIMARY_POINTS = 120000;
const MAX_MULTIVIEW_NEIGHBOR_POINTS = 80000;
const MIN_SLIDE_SIDEBAR_WIDTH = 136;
const MAX_SLIDE_SIDEBAR_WIDTH = 320;

const clampNumber = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

const getInitialProjectSiteSize = (project) =>
  clampNumber(project?.sitesize ?? project?.site_size ?? project?.siteSize, 0.25, 5, 1);

const downsampleRows = (rows, maxRows) => {
  if (!Array.isArray(rows)) return [];
  if (!Number.isFinite(maxRows) || maxRows <= 0 || rows.length <= maxRows) return rows;

  const step = Math.ceil(rows.length / maxRows);
  const sampled = [];
  for (let i = 0; i < rows.length && sampled.length < maxRows; i += step) {
    sampled.push(rows[i]);
  }
  return sampled;
};

const toCoordinateKey = (latValue, lngValue) => {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)}|${lng.toFixed(6)}`;
};

const arePolygonsEqual = (a = [], b = []) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const pa = a[i];
    const pb = b[i];
    if (!pa || !pb || pa.id !== pb.id) return false;
    const pathA = Array.isArray(pa.path) ? pa.path : [];
    const pathB = Array.isArray(pb.path) ? pb.path : [];
    if (pathA.length !== pathB.length) return false;
    for (let j = 0; j < pathA.length; j += 1) {
      const aLat = Number(pathA[j]?.lat);
      const aLng = Number(pathA[j]?.lng);
      const bLat = Number(pathB[j]?.lat);
      const bLng = Number(pathB[j]?.lng);
      if (
        !Number.isFinite(aLat) ||
        !Number.isFinite(aLng) ||
        !Number.isFinite(bLat) ||
        !Number.isFinite(bLng)
      ) {
        return false;
      }
      if (Math.abs(aLat - bLat) > 1e-9 || Math.abs(aLng - bLng) > 1e-9) return false;
    }
  }
  return true;
};

const MultiViewPage = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarResizeRef = useRef(null);

  const sessionIds = useMemo(() => {
    return searchParams.get("session")?.split(",") || [];
  }, [searchParams]);

  const projectId =
    searchParams.get("project_id") || location.state?.project?.id;

  const passedState = location.state;
  const passedLocations = passedState?.locations;
  const passedNeighbors = passedState?.neighborData;
  const passedThresholds = passedState?.thresholds;
  const project = passedState?.project;
  const hasPassedLocations =
    Array.isArray(passedLocations) && passedLocations.length > 0;
  const hasPassedNeighbors =
    Array.isArray(passedNeighbors) && passedNeighbors.length > 0;

  // Filter/KPI that was active on the Unified Map view when the user
  // navigated here, so each map slide can preselect the same view.
  const initialMetric = passedState?.initialMetric || "rsrp";
  const initialDataFilters = passedState?.initialFilters;
  const initialTech = initialDataFilters?.technologies?.[0] || "All";
  const initialProvider = initialDataFilters?.providers?.[0] || "All";
  const initialBand = initialDataFilters?.bands?.[0] || "All";

  const shouldFetch = !hasPassedLocations;

  const { locations: fetchedLocations, loading: samplesLoading } =
    useNetworkSamples(
      sessionIds,
      shouldFetch,
      false,
      [],
      MAX_MULTIVIEW_PRIMARY_POINTS,
    );
  const { neighborData: fetchedNeighbors, loading: neighborsLoading } =
    useSessionNeighbors(
      sessionIds,
      shouldFetch,
      false,
      [],
      MAX_MULTIVIEW_NEIGHBOR_POINTS,
    );

  const { thresholds: hookThresholds } = useColorForLog();
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const locations = useMemo(
    () =>
      downsampleRows(
        hasPassedLocations ? passedLocations : fetchedLocations,
        MAX_MULTIVIEW_PRIMARY_POINTS,
      ),
    [hasPassedLocations, passedLocations, fetchedLocations],
  );
  const neighborData = useMemo(
    () =>
      downsampleRows(
        hasPassedNeighbors ? passedNeighbors : fetchedNeighbors,
        MAX_MULTIVIEW_NEIGHBOR_POINTS,
      ),
    [hasPassedNeighbors, passedNeighbors, fetchedNeighbors],
  );
  const thresholds = passedThresholds || hookThresholds;
  const [metchOnly, setMetchOnly] = useState(false);
  const [displayMode, setDisplayMode] = useState("logs"); // "logs" | "site"
  const [layoutDirection, setLayoutDirection] = useState("horizontal"); // "horizontal" | "vertical"
  const [ui, setUi] = useState({
    drawEnabled: false,
    shapeMode: null,
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
  });
  const [sharedPolygons, setSharedPolygons] = useState([]);
  const [slideSidebarWidth, setSlideSidebarWidth] = useState(176);
  const [logRadius, setLogRadius] = useState(10);
  const [siteSize, setSiteSize] = useState(() => getInitialProjectSiteSize(project));

  // --- Map State Management ---
  const [maps, setMaps] = useState([
    { id: 1, title: "Map 1", role: "primary", sitePredictionVersion: "original" },
    { id: 2, title: "Map 2", role: "secondary", sitePredictionVersion: "original" },
  ]);
  const [drawSourceMapId, setDrawSourceMapId] = useState(1);

  // Controls which map is displayed in the first slot
  const [activeStartIndex, setActiveStartIndex] = useState(0);
  const isSiteMode = String(displayMode || "logs").toLowerCase() === "site";

  const setLogRadiusValue = useCallback((nextValue) => {
    setLogRadius(Math.round(clampNumber(nextValue, 4, 40, logRadius)));
  }, [logRadius]);

  const adjustLogRadius = useCallback((direction) => {
    setLogRadiusValue(logRadius + direction);
  }, [logRadius, setLogRadiusValue]);

  const setSiteSizeValue = useCallback((nextValue) => {
    setSiteSize(clampNumber(nextValue, 0.25, 5, siteSize));
  }, [siteSize]);

  const adjustSiteSize = useCallback((direction) => {
    setSiteSizeValue(Number((siteSize + direction * 0.25).toFixed(2)));
  }, [siteSize, setSiteSizeValue]);

  const addMap = () => {
    const newId = maps.length > 0 ? Math.max(...maps.map((m) => m.id)) + 1 : 1;
    const role = newId % 2 === 0 ? "secondary" : "primary";
    const newMaps = [...maps, { id: newId, title: `Map ${newId}`, role, sitePredictionVersion: "original" }];
    setMaps(newMaps);
    if (newMaps.length > 2) {
      setActiveStartIndex(newMaps.length - 2); 
    }
  };

  const handleUnifiedNavigation = useCallback(() => {
    const locationsToPass =
      Array.isArray(passedLocations) && passedLocations.length > 0
        ? passedLocations
        : locations;
    const neighborsToPass =
      Array.isArray(passedNeighbors) && passedNeighbors.length > 0
        ? passedNeighbors
        : neighborData;

    navigate(`/unified-map?${searchParams.toString()}`, {
      state: {
        locations: locationsToPass,
        neighborData: neighborsToPass,
        thresholds,
        project,
        sessionIds,
      },
    });
  }, [
    locations,
    navigate,
    neighborData,
    passedLocations,
    passedNeighbors,
    project,
    searchParams,
    sessionIds,
    thresholds,
  ]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/dashboard");
  }, [navigate]);

  const startSidebarResize = useCallback((event) => {
    event.preventDefault();
    sidebarResizeRef.current = {
      startX: event.clientX,
      startWidth: slideSidebarWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [slideSidebarWidth]);

  const setMapRole = (id, role, e) => {
    if (e) e.stopPropagation();
    setMaps((prevMaps) =>
      prevMaps.map((mapInstance) => {
        if (mapInstance.id !== id) return mapInstance;
        return {
          ...mapInstance,
          role,
        };
      }),
    );
  };

  const setMapSitePredictionVersion = useCallback((id, version) => {
    const normalized =
      String(version || "original").toLowerCase() === "updated"
        ? "updated"
        : "original";
    setMaps((prevMaps) =>
      prevMaps.map((mapInstance) =>
        mapInstance.id === id
          ? { ...mapInstance, sitePredictionVersion: normalized }
          : mapInstance,
      ),
    );
  }, []);

  const removeMap = (id, e) => {
    if(e) e.stopPropagation(); 
    
    const newMaps = maps.filter((m) => m.id !== id);
    setMaps(newMaps);
    
    if (activeStartIndex >= newMaps.length) {
      setActiveStartIndex(Math.max(0, newMaps.length - 1));
    }
  };

  const visibleMaps = useMemo(() => {
    return maps.slice(activeStartIndex, activeStartIndex + 2);
  }, [maps, activeStartIndex]);

  useEffect(() => {
    const visibleIds = new Set(visibleMaps.map((m) => m.id));
    if (!drawSourceMapId || !visibleIds.has(drawSourceMapId)) {
      setDrawSourceMapId(visibleMaps[0]?.id ?? null);
    }
  }, [visibleMaps, drawSourceMapId]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const resize = sidebarResizeRef.current;
      if (!resize) return;

      const nextWidth = Math.min(
        MAX_SLIDE_SIDEBAR_WIDTH,
        Math.max(
          MIN_SLIDE_SIDEBAR_WIDTH,
          resize.startWidth + event.clientX - resize.startX,
        ),
      );
      setSlideSidebarWidth(nextWidth);
    };

    const stopResize = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
      stopResize();
    };
  }, []);

  const normalizedNeighbors = useMemo(() => {
    if (!Array.isArray(neighborData)) return [];
    return neighborData.filter((neighbor) => {
      const lat = Number(neighbor?.lat ?? neighbor?.latitude ?? neighbor?.Lat);
      const lng = Number(
        neighbor?.lng ?? neighbor?.longitude ?? neighbor?.Lng ?? neighbor?.lon,
      );
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
  }, [neighborData]);

  const metchData = useMemo(() => {
    if (!metchOnly) {
      return {
        locations,
        neighbors: normalizedNeighbors,
      };
    }

    const primaryCoordinateKeys = new Set(
      (locations || [])
        .map((loc) => toCoordinateKey(loc?.lat ?? loc?.latitude, loc?.lng ?? loc?.longitude ?? loc?.lon))
        .filter(Boolean),
    );
    const secondaryCoordinateKeys = new Set(
      normalizedNeighbors
        .map((neighbor) =>
          toCoordinateKey(
            neighbor?.lat ?? neighbor?.latitude ?? neighbor?.Lat,
            neighbor?.lng ?? neighbor?.longitude ?? neighbor?.Lng ?? neighbor?.lon,
          ),
        )
        .filter(Boolean),
    );

    const commonKeys = new Set();
    primaryCoordinateKeys.forEach((key) => {
      if (secondaryCoordinateKeys.has(key)) commonKeys.add(key);
    });

    return {
      locations: (locations || []).filter((loc) => {
        const key = toCoordinateKey(
          loc?.lat ?? loc?.latitude,
          loc?.lng ?? loc?.longitude ?? loc?.lon,
        );
        return key && commonKeys.has(key);
      }),
      neighbors: normalizedNeighbors.filter((neighbor) => {
        const key = toCoordinateKey(
          neighbor?.lat ?? neighbor?.latitude ?? neighbor?.Lat,
          neighbor?.lng ?? neighbor?.longitude ?? neighbor?.Lng ?? neighbor?.lon,
        );
        return key && commonKeys.has(key);
      }),
    };
  }, [locations, normalizedNeighbors, metchOnly]);

  const handleMapDrawingsChange = useCallback((drawings = []) => {
    const polygons = (Array.isArray(drawings) ? drawings : [])
      .map((d, idx) => {
        if (!d?.type || !d?.geometry) return null;
        let path = null;

        if (d.type === "polygon" && Array.isArray(d.geometry?.polygon)) {
          // Polygon: use path directly
          path = d.geometry.polygon
            .map((pt) => ({ lat: Number(pt?.lat), lng: Number(pt?.lng) }))
            .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));

        } else if (d.type === "rectangle" && d.geometry?.rectangle) {
          // Rectangle: convert 2-corner bounds to 4-point polygon path
          const { sw, ne } = d.geometry.rectangle;
          if (sw && ne) {
            path = [
              { lat: Number(sw.lat), lng: Number(sw.lng) }, // bottom-left
              { lat: Number(sw.lat), lng: Number(ne.lng) }, // bottom-right
              { lat: Number(ne.lat), lng: Number(ne.lng) }, // top-right
              { lat: Number(ne.lat), lng: Number(sw.lng) }, // top-left
            ].filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
          }

        } else if (d.type === "circle" && d.geometry?.circle) {
          // Circle: approximate as 32-point polygon
          const { center, radius } = d.geometry.circle;
          if (center && Number.isFinite(radius) && radius > 0) {
            const numPoints = 32;
            path = Array.from({ length: numPoints }, (_, i) => {
              const angle = (i / numPoints) * 2 * Math.PI;
              const lat = center.lat + (radius / 111320) * Math.cos(angle);
              const lng = center.lng + (radius / (111320 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
              return { lat: Number(lat), lng: Number(lng) };
            }).filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
          }
        }

        if (!path || path.length < 3) return null;
        return {
          id: `shared-${d.id ?? idx}`,
          path,
          bbox: d?.geometry?.bounds || null,
        };
      })
      .filter(Boolean);

    // Use only the most recent drawn shape as the active spatial filter.
    const latestPolygon = polygons.length > 0 ? [polygons[polygons.length - 1]] : [];
    setSharedPolygons((prev) => (arePolygonsEqual(prev, latestPolygon) ? prev : latestPolygon));
  }, []);

  const handleDrawingUiChange = useCallback((nextUi) => {
    setUi((prev) => ({ ...prev, ...(nextUi || {}) }));
  }, []);

  const isLoading =
    (shouldFetch && (samplesLoading || neighborsLoading)) || !isLoaded;

  if (isLoading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="h-screen bg-gray-100 overflow-hidden flex flex-col">
      <div className="h-12 flex-shrink-0 border-b border-slate-200 bg-white px-3 flex items-center justify-between">
        <div className="min-w-0 text-sm font-semibold text-slate-700 truncate">
          {project?.project_name || project?.name || "Multi Map"}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-600">
            <span className="font-semibold">Log Size</span>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center text-slate-500 hover:bg-slate-100"
              title="Decrease log size"
              onClick={() => adjustLogRadius(-1)}
            >
              <Minus size={13} />
            </button>
            <input
              type="number"
              min={4}
              max={40}
              step={1}
              value={logRadius}
              onChange={(event) => setLogRadiusValue(event.target.value)}
              className="h-6 w-11 border border-slate-200 bg-white px-1 text-center text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400"
              title="Log Size"
            />
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center text-slate-500 hover:bg-slate-100"
              title="Increase log size"
              onClick={() => adjustLogRadius(1)}
            >
              <Plus size={13} />
            </button>
          </div>
          <DrawingControlsPanel position="relative" onUIChange={handleDrawingUiChange} ui={ui} />
        </div>
      </div>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        
        {/* --- Sidebar (PPT Style) --- */}
        <div
          className="relative bg-white border-r flex flex-col shadow-lg z-10 flex-shrink-0"
          style={{ width: slideSidebarWidth }}
        >
          <div className="p-2 border-b bg-gray-50 space-y-2">
            <div className="flex items-center justify-between gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Back"
                onClick={handleBack}
              >
                <ArrowLeft size={16} />
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Analytics"
                  >
                    <BarChart3 size={16} />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl bg-slate-50">
                  <MultiAnalytics
                    locations={metchData.locations}
                    sessionIds={sessionIds}
                    projectId={projectId}
                  />
                </DialogContent>
              </Dialog>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={
                  layoutDirection === "vertical"
                    ? "Switch to side-by-side layout"
                    : "Switch to stacked layout"
                }
                onClick={() =>
                  setLayoutDirection((current) =>
                    current === "vertical" ? "horizontal" : "vertical",
                  )
                }
              >
                {layoutDirection === "vertical" ? (
                  <Rows2 size={16} />
                ) : (
                  <Columns2 size={16} />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-700"
                title="Add View"
                onClick={addMap}
              >
                <Plus size={16} />
              </Button>
            </div>

            <div className="flex items-center gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDisplayMode("logs")}
                className={`flex-1 rounded px-2 py-1 ${
                  displayMode === "logs"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                Logs
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode("site")}
                className={`flex-1 rounded px-2 py-1 ${
                  displayMode === "site"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                Site
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <MapIcon size={14} className="flex-shrink-0" />
                <span className="truncate">Slides ({maps.length})</span>
              </h2>
              <button
                type="button"
                onClick={handleUnifiedNavigation}
                className="flex-shrink-0 rounded px-1.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50"
              >
                Unified
              </button>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-gray-600">
              <input
                type="checkbox"
                checked={metchOnly}
                onChange={(e) => setMetchOnly(e.target.checked)}
              />
              Matched only
            </label>

          </div>
          
          <ScrollArea className="flex-grow">
            <div className="p-1.5 space-y-1.5">
              {maps.map((mapInstance, index) => {
                const isActive = index >= activeStartIndex && index < activeStartIndex + 2;
                const isPrimary = index === activeStartIndex;

                return (
                  <Card
                    key={mapInstance.id}
                    onClick={() => setActiveStartIndex(index)}
                    className={`
                      p-2 cursor-pointer transition-all hover:bg-slate-50 relative group
                      ${isActive ? "border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500" : "border-gray-200"}
                    `}
                  >
                    <div className="flex justify-between items-start gap-1 mb-1.5">
                       <span className={`min-w-0 truncate text-xs font-medium ${isActive ? "text-blue-700" : "text-gray-700"}`}>
                         {mapInstance.title}
                       </span>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            mapInstance.role === "secondary"
                              ? "bg-purple-100 text-purple-700"
                              : mapInstance.role === "all"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-green-100 text-green-700"
                          }`}
                        >
                          {mapInstance.role === "secondary"
                            ? "Secondary"
                            : mapInstance.role === "all"
                              ? "All"
                              : "Primary"}
                        </span>
                        <span className="text-[9px] text-gray-400 font-mono bg-gray-100 px-1 rounded">
                          #{index + 1}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-[9px] text-gray-500">
                        {isActive ? (isPrimary ? "ON - Left" : "ON - Right") : "OFF"}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-semibold text-slate-500">
                          {isSiteMode ? `Site ${siteSize}` : `Log ${logRadius}`}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => removeMap(mapInstance.id, e)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>

                    {isSiteMode && (
                      <div
                        className="mt-1.5 flex items-center gap-1 border border-slate-200 bg-white px-1 py-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-slate-600">
                          Site Size
                        </span>
                        <button
                          type="button"
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-slate-500 hover:bg-slate-100"
                          title="Decrease site size"
                          onClick={() => adjustSiteSize(-1)}
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min={0.25}
                          max={5}
                          step={0.25}
                          value={siteSize}
                          onChange={(event) => setSiteSizeValue(event.target.value)}
                          className="h-5 w-10 border border-slate-200 bg-white px-1 text-center text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-400"
                          title="Site Size"
                        />
                        <button
                          type="button"
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-slate-500 hover:bg-slate-100"
                          title="Increase site size"
                          onClick={() => adjustSiteSize(1)}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
          <div
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400/30"
            title="Resize slides"
            onMouseDown={startSidebarResize}
          />
        </div>

        {/* --- Main Grid Area --- */}
        <div className="flex-grow bg-slate-100 relative min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 relative">
            <div
              className={`h-full grid gap-0 ${
                visibleMaps.length === 1
                  ? "grid-cols-1"
                  : layoutDirection === "vertical"
                    ? "grid-cols-1 grid-rows-2"
                    : "grid-cols-2"
              }`}
            >
              {visibleMaps.length > 0 ? (
                visibleMaps.map((mapInstance) => (
                  <MapChild
                    key={mapInstance.id}
                    id={mapInstance.id}
                    title={mapInstance.title}
                    projectId={projectId}
                    allLocations={metchData.locations}
                    allNeighbors={metchData.neighbors}
                    mapRole={mapInstance.role}
                    thresholds={thresholds}
                    project={project}
                    initialMetric={initialMetric}
                    initialTech={initialTech}
                    initialProvider={initialProvider}
                    initialBand={initialBand}
                    logRadius={logRadius}
                    onLogRadiusChange={setLogRadius}
                    siteSize={siteSize}
                    onSiteSizeChange={setSiteSize}
                    onRemove={(id) => removeMap(id)}
                    onRoleChange={(id, role) => setMapRole(id, role)}
                    displayMode={displayMode}
                    sitePredictionVersion={mapInstance.sitePredictionVersion || "original"}
                    onSitePredictionVersionChange={setMapSitePredictionVersion}
                    sharedPolygons={sharedPolygons}
                    drawEnabled={Boolean(ui.drawEnabled) && mapInstance.id === drawSourceMapId}
                    drawShapeMode={ui.shapeMode || "polygon"}
                    drawClearSignal={ui.drawClearSignal || 0}
                    onDrawingComplete={() => {}}
                    onDrawingsChange={handleMapDrawingsChange}
                    onDrawingUiChange={handleDrawingUiChange}
                    onActivateForDrawing={(mapId) => setDrawSourceMapId(mapId)}
                  />
                ))
              ) : (
                <div
                  className={`${layoutDirection === "vertical" ? "row-span-2" : "col-span-2"} flex items-center justify-center text-gray-400 flex-col gap-2 border-2 border-dashed border-gray-300 rounded-lg m-4`}
                >
                  <MapIcon size={48} className="opacity-20" />
                  <p>No maps active. Click "Add View" to start.</p>
                </div>
              )}
            </div>
            
             {maps.length > activeStartIndex + 2 && (
               <button 
                 onClick={() => setActiveStartIndex(prev => Math.min(maps.length - 1, prev + 1))}
                 className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/80 p-1 rounded-l shadow-md hover:bg-white z-20"
               >
                 <ChevronRight size={24} />
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiViewPage;
