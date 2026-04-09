import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import { Trash2, Map as MapIcon, ChevronRight } from "lucide-react";


import { useNetworkSamples } from "@/hooks/useNetworkSamples";
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import useColorForLog from "@/hooks/useColorForLog";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";

import MapChild from "../components/multiMap/MapChild";
import Spinner from "../components/common/Spinner";
import Header from "@/components/multiMap/Header";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

const MAX_MULTIVIEW_PRIMARY_POINTS = 120000;
const MAX_MULTIVIEW_NEIGHBOR_POINTS = 80000;

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
  const [ui, setUi] = useState({
    drawEnabled: false,
    shapeMode: null,
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
  });
  const [sharedPolygons, setSharedPolygons] = useState([]);

  // --- Map State Management ---
  const [maps, setMaps] = useState([
    { id: 1, title: "Map 1", role: "primary", sitePredictionVersion: "original" },
    { id: 2, title: "Map 2", role: "secondary", sitePredictionVersion: "original" },
  ]);
  const [drawSourceMapId, setDrawSourceMapId] = useState(1);

  // Controls which map is displayed in the first slot
  const [activeStartIndex, setActiveStartIndex] = useState(0);

  const addMap = () => {
    const newId = maps.length > 0 ? Math.max(...maps.map((m) => m.id)) + 1 : 1;
    const role = newId % 2 === 0 ? "secondary" : "primary";
    const newMaps = [...maps, { id: newId, title: `Map ${newId}`, role, sitePredictionVersion: "original" }];
    setMaps(newMaps);
    if (newMaps.length > 2) {
      setActiveStartIndex(newMaps.length - 2); 
    }
  };

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
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <Header 
        project={project} 
        projectId={projectId}
        sessionIds={sessionIds} // Pass sessionIds here
        addMap={addMap} 
        locations={metchData.locations}
        rawLocations={locations}
        neighborData={metchData.neighbors}
        rawNeighborData={neighborData}
        thresholds={thresholds}
        metchOnly={metchOnly}
        onMetchOnlyChange={setMetchOnly}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        ui={ui}
        onUIChange={handleDrawingUiChange}
      />

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-grow overflow-hidden">
        
        {/* --- Sidebar (PPT Style) --- */}
        <div className="w-64 bg-white border-r flex flex-col shadow-lg z-10 flex-shrink-0">
          <div className="p-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <MapIcon size={16} />
              Map Slides ({maps.length})
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Select a map to view it and the next one.
            </p>
          </div>
          
          <ScrollArea className="flex-grow">
            <div className="p-2 space-y-2">
              {maps.map((mapInstance, index) => {
                const isActive = index >= activeStartIndex && index < activeStartIndex + 2;
                const isPrimary = index === activeStartIndex;

                return (
                  <Card
                    key={mapInstance.id}
                    onClick={() => setActiveStartIndex(index)}
                    className={`
                      p-3 cursor-pointer transition-all hover:bg-slate-50 relative group
                      ${isActive ? "border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500" : "border-gray-200"}
                    `}
                  >
                    <div className="flex justify-between items-center mb-2">
                       <span className={`text-sm font-medium ${isActive ? "text-blue-700" : "text-gray-700"}`}>
                         {mapInstance.title}
                       </span>
                      <div className="flex items-center gap-1.5">
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
                        <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 rounded">
                          #{index + 1}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[10px] text-gray-500">
                        {isActive ? (isPrimary ? "View (Left)" : "View (Right)") : "Hidden"}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => removeMap(mapInstance.id, e)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* --- Main Grid Area --- */}
        <div className="flex-grow p-2 bg-slate-100 relative">
          <div 
            className={`h-full grid gap-2 ${
              visibleMaps.length === 1 ? "grid-cols-1" : "grid-cols-2"
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
              <div className="col-span-2 flex items-center justify-center text-gray-400 flex-col gap-2 border-2 border-dashed border-gray-300 rounded-lg m-4">
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
  );
};

export default MultiViewPage;
