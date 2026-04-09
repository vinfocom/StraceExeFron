// src/pages/PredictionMap.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { GoogleMap, useJsApiLoader, Circle, Polygon } from "@react-google-maps/api";
import { toast } from "react-toastify";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import { mapViewApi } from "@/api/apiEndpoints";
import Spinner from "@/components/common/Spinner";
import PredictionDetailsPanel from "@/components/prediction/PredictionDetailsPanel";
import PredictionHeader from "@/components/prediction/PredictionHeader";
import PredictionSide from "@/components/prediction/PredictionSide";
import { useSearchParams } from "react-router-dom";
import { Filter } from "lucide-react";

// ================== CONFIG ==================
const MAP_CONTAINER_STYLE = { height: "calc(100vh - 64px)", width: "100%" };
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };
const MAX_RENDER_POINTS = 10000;
const MAX_RENDER_POLYGONS = 2000;
const DEBOUNCE_DELAY = 100;

const MAP_STYLES = {
  clean: [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
  ],
};

// ================== UTILITY FUNCTIONS ==================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

function calculateRadius(zoom) {
  if (zoom <= 8) return 40;
  if (zoom <= 10) return 20;
  if (zoom <= 12) return 10;
  if (zoom <= 14) return 6;
  if (zoom <= 16) return 4;
  if (zoom <= 18) return 3;
  return 2;
}

function parseWKTToPolygons(wkt) {
  if (!wkt?.trim()) return [];
  
  try {
    const cleaned = wkt.trim();
    const isPolygon = cleaned.startsWith("POLYGON((");
    const isMultiPolygon = cleaned.startsWith("MULTIPOLYGON(((");
    
    if (!isPolygon && !isMultiPolygon) return [];
    
    const coordsMatches = cleaned.matchAll(/\(\(([\d\s,.-]+)\)\)/g);
    const polygons = [];
    
    for (const match of coordsMatches) {
      const coords = match[1];
      const points = coords.split(',').reduce((acc, coord) => {
        const [lng, lat] = coord.trim().split(/\s+/);
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
          acc.push({ lat: parsedLat, lng: parsedLng });
        }
        return acc;
      }, []);
      
      if (points.length >= 3) {
        polygons.push({ paths: [points] });
      }
    }
    
    return polygons;
  } catch (error) {
    console.error("WKT parsing error:", error);
    return [];
  }
}

function computeBbox(points) {
  if (!points?.length) return null;
  
  let north = -90, south = 90, east = -180, west = 180;
  
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.lat > north) north = pt.lat;
    if (pt.lat < south) south = pt.lat;
    if (pt.lng > east) east = pt.lng;
    if (pt.lng < west) west = pt.lng;
  }
  
  return { north, south, east, west };
}

const isPointInViewport = (point, viewport) => {
  return viewport && 
    point.lat >= viewport.south && 
    point.lat <= viewport.north &&
    point.lon >= viewport.west && 
    point.lon <= viewport.east;
};

// Enhanced point-in-polygon with debugging
const isPointInPolygon = (point, polygon) => {
  const path = polygon?.paths?.[0];
  if (!path || !path.length) {
    return false;
  }
  
  // Point coordinates (using .lon for longitude)
  const px = point.lon;
  const py = point.lat;
  
  let inside = false;
  const len = path.length;
  
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const xi = path[i].lng;
    const yi = path[i].lat;
    const xj = path[j].lng;
    const yj = path[j].lat;
    
    const intersect = ((yi > py) !== (yj > py)) &&
                     (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
};

// ================== OPTIMIZED LAYERS ==================
const CirclesLayer = memo(({ points, getColor, radius }) => {
 
  
  return (
    <>
      {points.map((p, idx) => (
        <Circle
          key={`circle-${p.id || idx}`}
          center={{ lat: p.lat, lng: p.lon }}
          radius={radius}
          options={{
            fillColor: getColor(p.prm),
            strokeWeight: 0,
            fillOpacity: 0.75,
            clickable: false,
            visible: true,
          }}
        />
      ))}
    </>
  );
});

CirclesLayer.displayName = 'CirclesLayer';

const PolygonsLayer = memo(({ polygons }) => {
 
  
  return (
    <>
      {polygons.map((poly, idx) => (
        <Polygon
          key={`poly-${poly.uid || idx}`}
          paths={poly.paths[0]}
          options={{
            fillColor: "#4285F4",
            fillOpacity: 0.15,
            strokeColor: "#2563eb",
            strokeWeight: 2,
            strokeOpacity: 0.9,
            clickable: false,
            visible: true,
          }}
        />
      ))}
    </>
  );
});

PolygonsLayer.displayName = 'PolygonsLayer';

// ================== MAIN COMPONENT ==================
export default function PredictionMapPage() {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(8);
  const [metric, setMetric] = useState("rsrp");
  const [predictionData, setPredictionData] = useState(null);
  const [polygons, setPolygons] = useState([]);
  const [showPolys, setShowPolys] = useState(false);
  const [onlyInside, setOnlyInside] = useState(false);
  const [uiToggles, setUiToggles] = useState({ basemapStyle: "roadmap" });
  const [viewport, setViewport] = useState(null);
  const [zoom, setZoom] = useState(12);
  const [isSideOpen, setIsSideOpen] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  const mapRef = useRef(null);
  const listenersRef = useRef([]);

  const sessionParam = useMemo(() => {
  const sessionId = searchParams.get("sessionId") ?? searchParams.get("session") ?? "";
 
  return sessionId;
}, [searchParams]);

const projectParam = useMemo(()=>{
  const project = searchParams.get("project_id");
 
  setProjectId(project);
  return project;
}, [searchParams])

  const { dataList, colorSetting } = useMemo(() => {
    return {
      dataList: predictionData?.dataList || [],
      colorSetting: predictionData?.colorSetting || []
    };
  }, [predictionData]);

  const getColor = useMemo(() => {
    const scale = colorSetting
      .map(c => ({ min: +c.min, max: +c.max, color: c.color }))
      .filter(c => !isNaN(c.min) && !isNaN(c.max))
      .sort((a, b) => a.min - b.min);
    
    const cache = new Map();
    
    return (value) => {
      if (cache.has(value)) return cache.get(value);
      
      const match = scale.find(s => value >= s.min && value <= s.max);
      const color = match?.color || "#999";
      
      cache.set(value, color);
      if (cache.size > 100) cache.clear();
      
      return color;
    };
  }, [colorSetting]);

  const circleRadius = useMemo(() => {
    const radius = calculateRadius(zoom);
   
    return radius;
  }, [zoom]);

  const fetchPredictionData = useCallback(async () => {
    if (!projectId) {
      toast.info("Please enter a Project ID");
      return;
    }
    
    setLoading(true);
    try {
      const res = await mapViewApi.getPredictionLog({
        projectId,
        metric: String(metric).toUpperCase(),
      });
      
      if (res?.Status === 1 && res?.Data) {
        setPredictionData(res.Data);
        toast.success("Prediction data loaded");
      } else {
        toast.error(res?.Message || "No data available");
      }
    } catch (error) {
      console.error("Prediction fetch error:", error);
      toast.error(error.message || "Failed to load prediction data");
    } finally {
      setLoading(false);
    }
  }, [projectId, metric]);

  const fetchPolygons = useCallback(async () => {
    if (!projectId) return;
    
    try {
      const res = await mapViewApi.getProjectPolygons(projectId);
      const items = Array.isArray(res) ? res : (Array.isArray(res?.Data) ? res.Data : []);
      
      if (items.length === 0) {
        setPolygons([]);
        return;
      }
      
      const parsed = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const polygonData = parseWKTToPolygons(item.wkt);
        
        for (let k = 0; k < polygonData.length; k++) {
          const p = polygonData[k];
          parsed.push({
            id: item.id,
            name: item.name,
            uid: `${item.id}-${k}`,
            paths: p.paths,
            bbox: computeBbox(p.paths[0]),
          });
        }
      }
      
      setPolygons(parsed);
      
      if (parsed.length > 0 && mapRef.current && window.google) {
        setTimeout(() => {
          const bounds = new window.google.maps.LatLngBounds();
          parsed.slice(0, 50).forEach(poly => {
            poly.paths[0]?.slice(0, 10).forEach(point => {
              bounds.extend(new window.google.maps.LatLng(point.lat, point.lng));
            });
          });
          mapRef.current.fitBounds(bounds);
        }, 300);
        
        toast.success(`${parsed.length} polygon(s) loaded`);
      }
    } catch (error) {
      console.error("Polygon fetch error:", error);
      toast.error("Failed to load polygons");
    }
  }, [projectId]);

  const reloadData = useCallback(() => {
    fetchPredictionData();
    fetchPolygons();
  }, [fetchPredictionData, fetchPolygons]);

 useEffect(() => {
  if (!projectId) return;
  setPredictionData(null);
  setPolygons([]);
  reloadData();
}, [projectId, metric, reloadData]); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedSetViewport = useMemo(
    () => debounce((vp) => {
      setViewport(vp);
    }, DEBOUNCE_DELAY),
    []
  );

  const throttledSetZoom = useMemo(
    () => throttle((z) => {
      setZoom(z);
    }, 50),
    []
  );

  const handleMapLoad = useCallback((map) => {
    mapRef.current = map;
    
    const updateViewport = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      
      debouncedSetViewport({
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng(),
      });
    };
    
    const updateZoom = () => {
      const currentZoom = map.getZoom();
      throttledSetZoom(currentZoom);
    };
    
    const zoomListener = map.addListener("zoom_changed", updateZoom);
    const idleListener = map.addListener("idle", updateViewport);
    
    listenersRef.current.push(zoomListener, idleListener);
    
    updateViewport();
    updateZoom();
  }, [debouncedSetViewport, throttledSetZoom]);

  useEffect(() => {
    return () => {
      listenersRef.current.forEach(listener => {
        if (listener && listener.remove) listener.remove();
      });
    };
  }, []);

  // Enhanced visible points calculation with detailed debugging
  const visiblePoints = useMemo(() => {
    if (!viewport || !dataList.length) {
    
      return [];
    }
    
    const startTime = performance.now();
    
    // Step 1: Filter by viewport
    let points = [];
    for (let i = 0; i < dataList.length; i++) {
      if (isPointInViewport(dataList[i], viewport)) {
        points.push(dataList[i]);
      }
    }
    
    
    
    // Step 2: Filter by polygon if needed
    if (onlyInside && showPolys && polygons.length > 0) {
   
      
      const filtered = [];
      let debugCount = 0;
      
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        let foundInside = false;
        
        for (let j = 0; j < polygons.length; j++) {
          if (isPointInPolygon(point, polygons[j])) {
            filtered.push(point);
            foundInside = true;
            debugCount++;
            break; // Point is inside this polygon, no need to check others
          }
        }
        
        // Debug first few points
       
      }
      
    
      
      points = filtered;
    }
    
    const result = points.slice(0, MAX_RENDER_POINTS);
    
    const endTime = performance.now();
   
    return result;
  }, [viewport, dataList, onlyInside, showPolys, polygons]);

  const visiblePolygons = useMemo(() => {
    if (!showPolys || !polygons.length) return [];
    
    if (viewport) {
      const visible = polygons.filter(poly => {
        if (!poly.bbox) return true;
        return !(poly.bbox.west > viewport.east || 
                 poly.bbox.east < viewport.west || 
                 poly.bbox.south > viewport.north || 
                 poly.bbox.north < viewport.south);
      });
      return visible.slice(0, MAX_RENDER_POLYGONS);
    }
    
    return polygons.slice(0, MAX_RENDER_POLYGONS);
  }, [showPolys, polygons, viewport]);

  const mapOptions = useMemo(() => {
    const styleKey = uiToggles.basemapStyle || "roadmap";
    return {
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: true,
      gestureHandling: "greedy",
      mapTypeId: ["roadmap", "satellite", "terrain", "hybrid"].includes(styleKey) 
        ? styleKey 
        : "roadmap",
      styles: MAP_STYLES[styleKey] || null,
      tilt: 0,
      clickableIcons: false,
    };
  }, [uiToggles.basemapStyle]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <p className="text-red-500 text-lg">Error loading maps</p>
          <p className="text-sm text-gray-400 mt-2">{loadError.message}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <PredictionHeader
        projectId={projectId}
        setProjectId={setProjectId}
        metric={metric}
        setMetric={setMetric}
        reloadData={reloadData}
        showPolys={showPolys}
        setShowPolys={setShowPolys}
        onlyInside={onlyInside}
        setOnlyInside={setOnlyInside}
        loading={loading}
        ui={uiToggles}
        onUIChange={setUiToggles}
        showDetailsPanel={showDetailsPanel}
        onToggleDetailsPanel={() => setShowDetailsPanel(!showDetailsPanel)}
      />

      <div className="px-4 pt-2">
        <button
          onClick={() => setIsSideOpen(!isSideOpen)}
          className="flex gap-2 items-center bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md px-3 py-2 shadow-lg transition-colors"
        >
          <Filter className="h-4 w-4" />
          {isSideOpen ? "Close" : "Open"} Controls
        </button>
      </div>

      <div className="flex-grow flex p-4 gap-4 overflow-hidden">
        <div className="flex-grow rounded-lg border border-gray-700 shadow-2xl overflow-hidden relative bg-white">
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={DEFAULT_CENTER}
            zoom={12}
            onLoad={handleMapLoad}
            options={mapOptions}
          >
            {showPolys && visiblePolygons.length > 0 && (
              <PolygonsLayer polygons={visiblePolygons} />
            )}
            
            {visiblePoints.length > 0 && (
              <CirclesLayer 
                points={visiblePoints} 
                getColor={getColor} 
                radius={circleRadius} 
              />
            )}
          </GoogleMap>
          
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70 z-10">
              <Spinner />
            </div>
          )}
          
          <div className="absolute bottom-4 left-4 bg-gray-800/95 rounded-lg px-4 py-3 text-xs shadow-xl border border-gray-600 max-w-xs">
            <div className="font-semibold text-gray-200 mb-2">Map Statistics</div>
            <div className="space-y-1">
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Zoom:</span>
                <span className="font-medium text-white">{zoom}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Radius:</span>
                <span className="font-medium text-blue-400">{circleRadius}m</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Total Points:</span>
                <span className="font-medium text-white">{dataList.length}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Visible:</span>
                <span className="font-medium text-white">{visiblePoints.length}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Polygons:</span>
                <span className="font-medium text-white">
                  {showPolys ? `${visiblePolygons.length}/${polygons.length}` : "Hidden"}
                </span>
              </div>
              {onlyInside && showPolys && (
                <div className="text-green-400 text-xs mt-2 pt-2 border-t border-gray-600 flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  <span>Filtering: Inside only</span>
                </div>
              )}
              {!onlyInside && (
                <div className="text-blue-400 text-xs mt-2 pt-2 border-t border-gray-600">
                  Mode: Showing all points
                </div>
              )}
            </div>
          </div>
        </div>
        
        {showDetailsPanel && (
          <div className="w-full lg:w-1/3 flex-shrink-0 overflow-hidden">
            <PredictionDetailsPanel
              predictionData={predictionData}
              metric={metric}
              loading={loading}
              onClose={() => setShowDetailsPanel(false)}
            />
          </div>
        )}
      </div>

      <PredictionSide
        open={isSideOpen}
        onOpenChange={setIsSideOpen}
        loading={loading}
        ui={uiToggles}
        onUIChange={setUiToggles}
        metric={metric}
        setMetric={setMetric}
        projectId={projectId}
        setProjectId={setProjectId}
        reloadData={reloadData}
        showPolys={showPolys}
        setShowPolys={setShowPolys}
        onlyInside={onlyInside}
        setOnlyInside={setOnlyInside}
        sessionId={sessionParam}
        
      />
    </div>
  );
}