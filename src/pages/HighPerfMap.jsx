import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { toast } from "react-toastify";
import MapSearchBox from "@/components/map/MapSearchBox";
import { Save, X, Download } from "lucide-react";

import { adminApi, mapViewApi, settingApi } from "@/api/apiEndpoints";

import MapHeader from "@/components/map/layout/MapHeader";
import SessionDetailPanel from "@/components/map/layout/SessionDetail";
import AllLogsPanelToggle from "@/components/map/layout/AllLogsPanelToggle";
import { useNavigate } from "react-router-dom";

import SessionsLayer from "@/components/map/overlays/SessionsLayer";
import LogCirclesLayer from "@/components/map/layers/LogCirclesLayer";
import ProjectPolygonsLayer from "@/components/map/overlays/ProjectPolygonsLayer";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import DrawingControlsPanel from "@/components/map/layout/DrawingControlsPanel";


import MapLegend from "@/components/map/MapLegend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { loadSavedViewport, saveViewport } from "@/utils/viewport";
import { parseWKTToCoordinates } from "@/utils/wkt";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import { normalizeBandName, normalizeProviderName, normalizeTechName } from "@/utils/colorUtils";
import { COLOR_SCHEMES } from "@/utils/metrics";

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };
const MAP_CONTAINER_STYLE = { height: "calc(100vh - 64px)", width: "100%" };

const toYmdLocal = (d) => {
  if (!(d instanceof Date)) return "";
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const extractLogsFromResponse = (response) => {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.Data)) return response.Data;
  if (Array.isArray(response.logs)) return response.logs;
  if (Array.isArray(response.result)) return response.result;
  if (Array.isArray(response.Result)) return response.Result;
  return [];
};

const extractAppSummary = (response) => {
  if (!response) return null;
  return response.app_summary || response.appSummary || response.App_Summary || null;
};

const mergeAppSummaries = (summary1, summary2) => {
  if (!summary1 && !summary2) return null;
  if (!summary1) return summary2;
  if (!summary2) return summary1;
  
  const merged = { ...summary1 };
  
  Object.keys(summary2).forEach(appName => {
    if (merged[appName]) {
      const s1 = merged[appName];
      const s2 = summary2[appName];
      const totalCount = (s1.SampleCount || 0) + (s2.SampleCount || 0);
      
      merged[appName] = {
        appName: s1.appName || appName,
        SampleCount: totalCount,
        avgRsrp: totalCount > 0 
          ? ((s1.avgRsrp * (s1.SampleCount || 0)) + (s2.avgRsrp * (s2.SampleCount || 0))) / totalCount 
          : 0,
        avgRsrq: totalCount > 0 
          ? ((s1.avgRsrq * (s1.SampleCount || 0)) + (s2.avgRsrq * (s2.SampleCount || 0))) / totalCount 
          : 0,
        avgSinr: totalCount > 0 
          ? ((s1.avgSinr * (s1.SampleCount || 0)) + (s2.avgSinr * (s2.SampleCount || 0))) / totalCount 
          : 0,
        avgMos: totalCount > 0 
          ? ((s1.avgMos * (s1.SampleCount || 0)) + (s2.avgMos * (s2.SampleCount || 0))) / totalCount 
          : 0,
        avgDl: totalCount > 0 
          ? ((s1.avgDl * (s1.SampleCount || 0)) + (s2.avgDl * (s2.SampleCount || 0))) / totalCount 
          : 0,
        avgUl: totalCount > 0 
          ? ((s1.avgUl * (s1.SampleCount || 0)) + (s2.avgUl * (s2.SampleCount || 0))) / totalCount 
          : 0,
        durationSeconds: (s1.durationSeconds || 0) + (s2.durationSeconds || 0),
      };
    } else {
      merged[appName] = { ...summary2[appName] };
    }
  });
  
  return merged;
};

const getMetricValue = (log, metric) => {
  if (!log || !metric) return null;
  const metricKey = metric.toLowerCase();
  switch (metricKey) {
    case 'rsrp': return parseFloat(log.rsrp ?? log.RSRP ?? log.Rsrp);
    case 'rsrq': return parseFloat(log.rsrq ?? log.RSRQ ?? log.Rsrq);
    case 'sinr': return parseFloat(log.sinr ?? log.SINR ?? log.Sinr);
    case 'dl_thpt':
    case 'dl_tpt':
    case 'dl_throughput': return parseFloat(log.dl_tpt ?? log.dl_thpt ?? log.dlTpt ?? log.dl_throughput ?? log.DL_Tpt);
    case 'ul_thpt':
    case 'ul_tpt':
    case 'ul_throughput': return parseFloat(log.ul_tpt ?? log.ul_thpt ?? log.ulTpt ?? log.ul_throughput ?? log.UL_Tpt);
    case 'mos': return parseFloat(log.mos ?? log.MOS ?? log.Mos);
    case 'lte_bler':
    case 'bler': return parseFloat(log.lte_bler ?? log.bler ?? log.BLER);
    default: return parseFloat(log[metricKey] ?? log[metric]);
  }
};

const normalizeMetric = (metric) => {
  if (!metric) return "rsrp";
  const lower = metric.toLowerCase();
  if (["dl_tpt", "dl_throughput", "tpt_dl", "throughput_dl"].includes(lower)) return "dl_thpt";
  if (["ul_tpt", "ul_throughput", "tpt_ul", "throughput_ul"].includes(lower)) return "ul_thpt";
  return lower;
};

const getColorForMetricValue = (value, metric, thresholds) => {
  if (value === null || value === undefined || isNaN(value)) return '#9CA3AF';
  const metricKey = normalizeMetric(metric);
  const thresholdArray = thresholds[metricKey] || thresholds[metric] || [];
  if (!Array.isArray(thresholdArray) || thresholdArray.length === 0) return '#3B82F6';
  
  const sortedThresholds = [...thresholdArray].sort((a, b) => {
    const aMin = parseFloat(a.min ?? a.Min ?? -Infinity);
    const bMin = parseFloat(b.min ?? b.Min ?? -Infinity);
    return aMin - bMin;
  });
  
  for (let i = 0; i < sortedThresholds.length; i++) {
    const threshold = sortedThresholds[i];
    const min = parseFloat(threshold.min ?? threshold.Min ?? -Infinity);
    const max = parseFloat(threshold.max ?? threshold.Max ?? Infinity);
    const isLast = i === sortedThresholds.length - 1;
    if (value >= min && (isLast ? value <= max : value < max)) {
      return threshold.color || threshold.Color || '#3B82F6';
    }
  }
  
  if (sortedThresholds.length > 0) {
    if (value < parseFloat(sortedThresholds[0].min ?? sortedThresholds[0].Min ?? -Infinity)) {
      return sortedThresholds[0].color || sortedThresholds[0].Color || '#EF4444';
    }
    const last = sortedThresholds[sortedThresholds.length - 1];
    if (value > parseFloat(last.max ?? last.Max ?? Infinity)) {
      return last.color || last.Color || '#EF4444';
    }
    return sortedThresholds[0].color || sortedThresholds[0].Color || '#EF4444';
  }
  return '#9CA3AF';
};

const coordinatesToWktPolygon = (coords) => {
  if (!Array.isArray(coords) || coords.length < 3) return null;

  // Safe reader for different coordinate formats
  const read = (p) => ({
    lat: typeof p.lat === "function" ? p.lat() : p.lat,
    lng: typeof p.lng === "function" ? p.lng() : p.lng,
  });

  const points = coords.map(read);
  
  // ✅ FIX: Order must be 'LAT LNG' for your backend
  const pointsString = points.map((p) => `${p.lat} ${p.lng}`).join(", ");
  const firstPointString = `${points[0].lat} ${points[0].lng}`;
  
  return `POLYGON((${pointsString}, ${firstPointString}))`;
};

const MAP_STYLES = {
  default: null,
  clean: [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.stroke", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  ],
  night: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
  ],
};

const formatArea = (areaInMeters) => {
  if (!areaInMeters || areaInMeters < 1) return "N/A";
  if (areaInMeters > 1000000) return `${(areaInMeters / 1000000).toFixed(2)} km²`;
  return `${areaInMeters.toFixed(0)} m²`;
};

const fitMapToMostlyLogs = (map, points) => {
  if (!map || !Array.isArray(points) || points.length === 0) return;
  const bounds = new window.google.maps.LatLngBounds();
  const lats = points.map(p => p.lat).filter(Number.isFinite).sort((a, b) => a - b);
  const lons = points.map(p => p.lon).filter(Number.isFinite).sort((a, b) => a - b);
  
  if (lats.length > 0 && lons.length > 0) {
    const q = 0.1;
    const lowerIdx = Math.floor(q * (lats.length - 1));
    const upperIdx = Math.ceil((1 - q) * (lats.length - 1));
    
    bounds.extend({ lat: lats[lowerIdx], lng: lons[lowerIdx] });
    bounds.extend({ lat: lats[upperIdx], lng: lons[upperIdx] });
    map.fitBounds(bounds);
  }
};

export default function HighPerfMap() {
  const navigate = useNavigate();
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const [map, setMap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [thresholds, setThresholds] = useState({});
  const [allSessions, setAllSessions] = useState([]);
  const [projectPolygons, setProjectPolygons] = useState([]);
  const [activeFilters, setActiveFilters] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState("rsrp");
  const [selectedSessionData, setSelectedSessionData] = useState(null);
  
  const [rawLogs, setRawLogs] = useState([]);
  const [neighbourLogs, setNeighbourLogs] = useState([]);
  const [displayedLogs, setDisplayedLogs] = useState([]);
  const [displayedNeighbourLogs, setDisplayedNeighbourLogs] = useState([]);
  
  const [colorBy, setColorBy] = useState(null);
  const [ui, setUi] = useState({
    showSessions: true,
    clusterSessions: true,
    showLogsCircles: false,
    showHeatmap: false,
    renderVisibleLogsOnly: true,
    basemapStyle: "clean",
    showPolygons: false,
    selectedProjectId: null,
    drawEnabled: false,
    shapeMode: "polygon",
    drawPixelateRect: false,
    drawCellSizeMeters: 1,
    drawClearSignal: 0,
    showNeighbours: true,
    colorizeCells: true,
  });

  const [analysis, setAnalysis] = useState(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [polygonName, setPolygonName] = useState("");
  const [showCoverageHoleOnly, setShowCoverageHoleOnly] = useState(false);
  const [visibleBounds, setVisibleBounds] = useState(null);
  const idleListenerRef = useRef(null);
  const idleTimerRef = useRef(null);
  const allSessionsRef = useRef([]);
  const [appSummary, setAppSummary] = useState(null);
  const [neighbourAppSummary, setNeighbourAppSummary] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [legendFilter, setLegendFilter] = useState(null);

  const combinedDisplayedLogs = useMemo(() => {
    const processLogs = (logs, isNeighbour) => {
      return logs.map(log => {
        const metricValue = getMetricValue(log, selectedMetric);
        const color = getColorForMetricValue(metricValue, selectedMetric, thresholds);
        
        return {
          ...log,
          isNeighbour,
          source: isNeighbour ? 'neighbour' : 'main',
          metricValue,
          color,
        };
      });
    };
    
    const mainLogsProcessed = processLogs(displayedLogs, false);
    const neighbourLogsProcessed = processLogs(displayedNeighbourLogs, true);
    
    if (ui.showNeighbours) {
      return [...mainLogsProcessed, ...neighbourLogsProcessed];
    }
    
    return mainLogsProcessed;
  }, [displayedLogs, displayedNeighbourLogs, ui.showNeighbours, selectedMetric, thresholds]);

  const mapVisibleLogs = useMemo(() => {
    if (!legendFilter) return combinedDisplayedLogs;

    return combinedDisplayedLogs.filter(log => {
      if (legendFilter.type === 'metric') {
        const val = log.metricValue;
        return Number.isFinite(val) && val >= legendFilter.min && val < legendFilter.max;
      }

      if (legendFilter.type === 'pci') {
        const val = log.pci || log.Pci || log.PCI;
        return Math.floor(val) === legendFilter.value;
      }

      if (legendFilter.type === 'category') {
        const scheme = COLOR_SCHEMES[legendFilter.key];
        let key = "Unknown";

        if (legendFilter.key === 'provider') {
          key = normalizeProviderName(log.provider || log.Provider || log.carrier) || "Unknown";
        } else if (legendFilter.key === 'technology') {
          key = normalizeTechName(
            log.network || log.Network || log.technology || log.networkType, 
            log.band || log.Band || log.neighbourBand || log.neighborBand
          );
        } else if (legendFilter.key === 'band') {
          const b = String(
            log.neighbourBand || 
            log.neighborBand || 
            log.neighbour_band || 
            log.band || 
            log.Band || 
            ""
          ).trim();
          key = (b === "-1" || b === "") ? "Unknown" : (scheme?.[b] ? b : "Unknown");
        }

        return key === legendFilter.value;
      }

      return true;
    });
  }, [combinedDisplayedLogs, legendFilter]);

  const combinedAppSummary = useMemo(() => {
    if (ui.showNeighbours) {
      return mergeAppSummaries(appSummary, neighbourAppSummary);
    }
    return appSummary;
  }, [appSummary, neighbourAppSummary, ui.showNeighbours]);

  const availableFilterOptions = useMemo(() => {
    const allLogs = [...rawLogs, ...neighbourLogs];
    if (!allLogs || allLogs.length === 0) {
      return { providers: [], technologies: [], bands: [] };
    }
    
    const providerSet = new Set();
    const techSet = new Set();
    const bandSet = new Set();
    
    allLogs.forEach(log => {
      const provider = normalizeProviderName(log.provider || log.Provider || log.carrier);
      if (provider && provider !== "Unknown") providerSet.add(provider);
      const tech = normalizeTechName(
        log.network || log.Network || log.technology, 
        log.band || log.Band
      );
      if (tech && tech !== "Unknown") techSet.add(tech);
      const band = String(normalizeBandName(log.band || log.Band || "")).trim();
      if (band && band !== "-1" && band !== "" && band !== "undefined") bandSet.add(band);
    });
    
    return {
      providers: Array.from(providerSet).sort().map(name => ({ id: name, name })),
      technologies: Array.from(techSet).sort().map(name => ({ id: name, name })),
      bands: Array.from(bandSet).sort((a, b) => parseInt(a) - parseInt(b)).map(name => ({ id: name, name })),
    };
  }, [rawLogs, neighbourLogs]);

  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const res = await settingApi.getThresholdSettings();
        if (res?.Data) {
          const d = res.Data;
          setThresholds({
            rsrp: JSON.parse(d.rsrp_json || "[]"),
            rsrq: JSON.parse(d.rsrq_json || "[]"),
            sinr: JSON.parse(d.sinr_json || "[]"),
            dl_thpt: JSON.parse(d.dl_tpt_json || d.dl_thpt_json || "[]"),
            ul_thpt: JSON.parse(d.ul_thpt_json || d.ul_tpt_json || "[]"),
            mos: JSON.parse(d.mos_json || "[]"),
            lte_bler: JSON.parse(d.lte_bler_json || "[]"),
            coveragehole: parseFloat(d.coveragehole_json) || -110,
          });
        }
      } catch (err) {
        toast.error("Could not load color thresholds.");
      }
    };
    fetchThresholds();
  }, []);

  const fetchAllSessions = useCallback(async (mapInstance) => {
    setIsLoading(true);
    try {
      const data = await adminApi.getSessions();
      const valid = (data?.Data || []).filter(
        (s) => Number.isFinite(parseFloat(s.start_lat)) && Number.isFinite(parseFloat(s.start_lon))
      );
      setAllSessions(valid);
      allSessionsRef.current = valid;

      // Auto-fit to session locations if no saved viewport exists
      const currentMap = mapInstance;
      if (currentMap && valid.length > 0 && !loadSavedViewport()) {
        const bounds = new window.google.maps.LatLngBounds();
        valid.forEach((s) => bounds.extend({ lat: parseFloat(s.start_lat), lng: parseFloat(s.start_lon) }));
        currentMap.fitBounds(bounds, 80);
      }
    } catch (e) {
      toast.error(`Failed to fetch sessions: ${e?.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!activeFilters) fetchAllSessions(map);
  }, [isLoaded, activeFilters, fetchAllSessions, map]);

  const fetchLogsFromApi = useCallback(async (dateFilters) => {
    setLogsLoading(true);
    try {
      const startDateStr = toYmdLocal(dateFilters.startDate);
      const endDateStr = toYmdLocal(dateFilters.endDate);
      const mainApiParams = {
        StartDate: startDateStr,
        EndDate: endDateStr,
        StartTime: dateFilters.startTime || "00:00:00",
        EndTime: dateFilters.endTime || "23:59:59",
      };
      if (dateFilters.provider && dateFilters.provider !== "ALL") mainApiParams.Provider = dateFilters.provider;
      if (dateFilters.technology && dateFilters.technology !== "ALL") mainApiParams.Technology = dateFilters.technology;
      if (dateFilters.band && dateFilters.band !== "ALL") mainApiParams.Band = dateFilters.band;

      const neighbourApiParams = { StartDate: startDateStr, EndDate: endDateStr };

      const [mainResponse, neighbourResponse] = await Promise.all([
        mapViewApi.getLogsByDateRange(mainApiParams).catch(err => {
          toast.error(`Main logs error: ${err.message}`);
          return null;
        }),
        mapViewApi.getLogsByneighbour(neighbourApiParams).catch(() => null)
      ]);

      let fetchedMainLogs = [], mainAppSummaryData = null;
      if (mainResponse) {
        fetchedMainLogs = extractLogsFromResponse(mainResponse);
        mainAppSummaryData = extractAppSummary(mainResponse);
      }

      let fetchedNeighbourLogs = [], neighbourAppSummaryData = null;
      if (neighbourResponse) {
        fetchedNeighbourLogs = extractLogsFromResponse(neighbourResponse);
        neighbourAppSummaryData = extractAppSummary(neighbourResponse);
      }

      const totalLogs = fetchedMainLogs.length + fetchedNeighbourLogs.length;
      if (totalLogs === 0) {
        toast.warn("No logs found for the selected date range.");
        setRawLogs([]); setNeighbourLogs([]); setDisplayedLogs([]); setDisplayedNeighbourLogs([]);
        setAppSummary(null); setNeighbourAppSummary(null);
        return { mainLogs: [], neighbourLogs: [] };
      }

      setRawLogs(fetchedMainLogs);
      setNeighbourLogs(fetchedNeighbourLogs);
      setDisplayedLogs(fetchedMainLogs);
      setDisplayedNeighbourLogs(fetchedNeighbourLogs);
      setAppSummary(mainAppSummaryData);
      setNeighbourAppSummary(neighbourAppSummaryData);

      if (map) {
        const allPoints = [
          ...fetchedMainLogs.map(log => ({ 
            lat: parseFloat(log.lat || log.Lat || log.latitude), 
            lon: parseFloat(log.lon || log.Lon || log.lng || log.longitude) 
          })),
          ...fetchedNeighbourLogs.map(log => ({ 
            lat: parseFloat(log.lat || log.Lat || log.latitude), 
            lon: parseFloat(log.lon || log.Lon || log.lng || log.longitude) 
          }))
        ].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        if (allPoints.length > 0) fitMapToMostlyLogs(map, allPoints);
      }

      toast.success(`Loaded ${fetchedMainLogs.length} main + ${fetchedNeighbourLogs.length} neighbour logs`);
      return { mainLogs: fetchedMainLogs, neighbourLogs: fetchedNeighbourLogs };
    } catch (error) {
      setRawLogs([]); setNeighbourLogs([]); setDisplayedLogs([]); setDisplayedNeighbourLogs([]);
      setAppSummary(null); setNeighbourAppSummary(null);
      return { mainLogs: [], neighbourLogs: [] };
    } finally {
      setLogsLoading(false);
    }
  }, [map]);

  const applyLocalFilters = useCallback((logs, filters) => {
    if (!logs || logs.length === 0) return [];
    let filtered = [...logs];
    if (filters.provider && filters.provider !== "ALL") {
      filtered = filtered.filter(log => 
        normalizeProviderName(log.provider || log.Provider || log.carrier ) === filters.provider
      );
    }
    if (filters.technology && filters.technology !== "ALL") {
      filtered = filtered.filter(log => 
        normalizeTechName(log.network || log.Network || log.technology, log.band || log.Band) === filters.technology
      );
    }
    if (filters.band && filters.band !== "ALL") {
      filtered = filtered.filter(log => String(log.band || log.Band || "").trim() === filters.band);
    }
    if (filters.coverageHoleOnly) {
      const threshold = thresholds.coveragehole || -110;
      filtered = filtered.filter(log => {
        const rsrp = parseFloat(log.rsrp);
        return Number.isFinite(rsrp) && rsrp < threshold;
      });
    }
    return filtered;
  }, [thresholds]);

  const handleFetchLogsForPolygon = useCallback(() => {
    if (!analysis || !analysis.geometry) {
      toast.error("Please draw a shape first.");
      return;
    }
    if (analysis.intersectingSessions && analysis.intersectingSessions.length > 0) {
      const sessionIds = analysis.intersectingSessions.map(s => s.id).join(",");
      toast.info(`Navigating to view logs for ${analysis.intersectingSessions.length} sessions...`);
      navigate(`/debug-map?sessionId=${sessionIds}`);
      return;
    }
    if (activeFilters) {
      toast.info("Fetching logs for selected area...");
      fetchLogsFromApi(activeFilters);
    } else {
      toast.info("Please select a Date Range or Provider to fetch logs.");
      setIsSearchOpen(true);
    }
  }, [analysis, activeFilters, fetchLogsFromApi, navigate]);

  const handleApplyFilters = useCallback(async (filters) => {
    const dateChanged = !activeFilters || 
      toYmdLocal(filters.startDate) !== toYmdLocal(activeFilters.startDate) || 
      toYmdLocal(filters.endDate) !== toYmdLocal(activeFilters.endDate);
    const timeChanged = !activeFilters || filters.startTime !== activeFilters.startTime || filters.endTime !== activeFilters.endTime;
    const apiFiltersChanged = dateChanged || timeChanged || filters.provider !== activeFilters?.provider || filters.technology !== activeFilters?.technology || filters.band !== activeFilters?.band;

    setActiveFilters(filters);
    setSelectedMetric(String(filters.measureIn || "rsrp").toLowerCase());
    setSelectedSessionData(null);
    setAnalysis(null);
    setUi(u => ({ ...u, showLogsCircles: true, showSessions: false }));
    setShowCoverageHoleOnly(filters.coverageHoleOnly || false);
    setColorBy(filters.colorBy || null);
    setLegendFilter(null);

    let mainLogsToFilter = rawLogs;
    let neighbourLogsToFilter = neighbourLogs;
    
    if (apiFiltersChanged) {
      const result = await fetchLogsFromApi(filters);
      mainLogsToFilter = result.mainLogs;
      neighbourLogsToFilter = result.neighbourLogs;
    }
    
    const filteredMainLogs = applyLocalFilters(mainLogsToFilter, filters);
    const filteredNeighbourLogs = applyLocalFilters(neighbourLogsToFilter, filters);
    setDisplayedLogs(filteredMainLogs);
    setDisplayedNeighbourLogs(filteredNeighbourLogs);
  }, [activeFilters, rawLogs, neighbourLogs, fetchLogsFromApi, applyLocalFilters]);

  const handleClearFilters = useCallback(() => {
    setActiveFilters(null);
    setSelectedSessionData(null);
    setRawLogs([]); setNeighbourLogs([]); setDisplayedLogs([]); setDisplayedNeighbourLogs([]);
    setAnalysis(null); setColorBy(null);
    setAppSummary(null); setNeighbourAppSummary(null);
    setLegendFilter(null);
    setUi((u) => ({ ...u, showHeatmap: false, drawEnabled: false, timeFilterEnabled: false, showLogsCircles: false, showSessions: true }));
    fetchAllSessions();
  }, [fetchAllSessions]);

  const handleUIChange = (partial) => setUi((prev) => ({ ...prev, ...partial }));

  const handleSessionMarkerClick = async (session) => {
    const clickedSessionId =
      session?.id ??
      session?.session_id ??
      session?.SessionId ??
      session?.sessionId ??
      null;

    if (!clickedSessionId) {
      toast.error("Invalid session payload. Missing session id.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await mapViewApi.getNetworkLog({
        session_ids: String(clickedSessionId),
        page: 1,
        limit: 10000,
      });
      const logs = extractLogsFromResponse(response);
      setSelectedSessionData({ session, logs });
      if (logs.length === 0) toast.warn(`No logs found for session ${clickedSessionId}`);
    } catch (e) {
      toast.error(
        `Failed to fetch logs for session ${clickedSessionId}: ${e?.message || "Unknown error"}`,
      );
      setSelectedSessionData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadPolygons = async () => {
      if (!ui.showPolygons || !ui.selectedProjectId) {
        setProjectPolygons([]);
        return;
      }
      setIsLoading(true);
      try {
        const rows = await mapViewApi.getProjectPolygons({ projectId: ui.selectedProjectId });
        const parsed = (rows || []).map((r) => ({ id: r.id, name: r.name, rings: parseWKTToCoordinates(r.wkt) }));
        setProjectPolygons(parsed);
      } catch (err) {
        toast.error("Failed to load project polygons");
      } finally {
        setIsLoading(false);
      }
    };
    loadPolygons();
  }, [ui.showPolygons, ui.selectedProjectId]);

  const onMapLoad = useCallback((m) => {
    setMap(m);
    const saved = loadSavedViewport();
    if (saved) {
      m.setCenter({ lat: saved.lat, lng: saved.lng });
      m.setZoom(saved.zoom);
    } else {
      // No saved viewport: fit to already-loaded sessions (handles case where
      // sessions API returns before the Google Maps instance is ready)
      const sessions = allSessionsRef.current;
      if (sessions.length > 0 && window.google?.maps) {
        const bounds = new window.google.maps.LatLngBounds();
        sessions.forEach((s) => bounds.extend({ lat: parseFloat(s.start_lat), lng: parseFloat(s.start_lon) }));
        m.fitBounds(bounds, 80);
      }
    }
    idleListenerRef.current = m.addListener("idle", () => {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        saveViewport(m);
        const b = m.getBounds?.();
        if (b) {
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          const latBuffer = (ne.lat() - sw.lat())*0.5;
          const lngBuffer = (ne.lng()-sw.lng())*0.5; 
          setVisibleBounds({ north: ne.lat()+latBuffer, east: ne.lng()+lngBuffer, south: sw.lat()-latBuffer, west: sw.lng()-lngBuffer });
        }
      }, 120);
    });
  }, []);

  const onMapUnmount = useCallback(() => {
    try {
      if (idleListenerRef.current) window.google?.maps?.event?.removeListener?.(idleListenerRef.current);
    } catch {}
    idleListenerRef.current = null;
    setMap(null);
  }, []);

  const handleDownloadStatsCsv = useCallback(() => {
    if (!analysis || !analysis.stats) {
      toast.error("No polygon stats available. Draw a shape first.");
      return;
    }
    const csvRows = [
      ["Metric", "Value"],
      ["Shape Type", analysis.type || "N/A"],
      ["Total Logs Inside", analysis.count || 0],
      ["Selected Metric", selectedMetric.toUpperCase()],
      ["Mean", analysis.stats.mean?.toFixed(2) || "N/A"],
      ["Median", analysis.stats.median?.toFixed(2) || "N/A"],
      ["Min", analysis.stats.min?.toFixed(2) || "N/A"],
      ["Max", analysis.stats.max?.toFixed(2) || "N/A"],
    ];
    if (analysis.grid) {
      csvRows.push(["Grid Cells", analysis.grid.cells], ["Cell Size (meters)", analysis.grid.cellSizeMeters]);
    }
    const csvContent = csvRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `polygon_stats_${selectedMetric}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Stats CSV downloaded!");
  }, [analysis, selectedMetric]);

  const handleDownloadRawCsv = useCallback(() => {
    if (!analysis || !analysis.logs || !analysis.logs.length) {
      toast.error("No logs inside polygon. Draw a shape with data first.");
      return;
    }
    const logsInside = analysis.logs;
    const headers = [
      "latitude", "longitude", selectedMetric, "rsrp", "rsrq", "sinr", 
      "dl_throughput", "ul_throughput", "mos", 
      "timestamp", "carrier", "technology", "band", "pci",
      "isNeighbour"
    ];
    const csvRows = [
      headers.join(","),
      ...logsInside.map((log) => {
        return headers.map((h) => {
          let val = "";
          if (h === "latitude") val = log.lat ?? log.latitude ?? "";
          else if (h === "longitude") val = log.lng ?? log.lon ?? log.longitude ?? "";
          else if (h === "dl_throughput") val = log.dl_tpt ?? log.dl_thpt ?? "";
          else if (h === "ul_throughput") val = log.ul_tpt ?? log.ul_thpt ?? "";
          else if (h === "carrier") val = log.provider ?? log.Provider ?? "";
          else if (h === "technology") val = log.network ?? log.Network ?? "";
          else if (h === "isNeighbour") val = log.isNeighbour ? "Yes" : "No";
          else val = log[h] ?? "";
          return typeof val === "string" && val.includes(",") ? `"${val}"` : val;
        }).join(",");
      }),
    ];
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `polygon_raw_logs_${selectedMetric}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${logsInside.length} logs`);
  }, [analysis, selectedMetric]);

  const handleSavePolygon = async () => {
    if (!analysis || !analysis.geometry) {
      toast.warn("No analysis data or geometry found to save.");
      return;
    }
    if (!polygonName.trim()) {
      toast.warn("Please provide a name for the polygon.");
      return;
    }
    let wktString = null;
    const geometry = analysis.geometry;
    if (geometry.type === "polygon" && geometry.polygon) {
      wktString = coordinatesToWktPolygon(geometry.polygon);
    } else if (geometry.type === "rectangle" && geometry.rectangle) {
      const { ne, sw } = geometry.rectangle;
const rectCoords = [
      { lat: ne.lat, lng: sw.lng },
      { lat: ne.lat, lng: ne.lng },
      { lat: sw.lat, lng: ne.lng },
      { lat: sw.lat, lng: sw.lng }
    ];
          wktString = coordinatesToWktPolygon(rectCoords);
    } else if (geometry.type === "circle" && geometry.circle) {
      const { center, radius } = geometry.circle;
      const circleCoords = [];
      const numPoints = 32;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const latOffset = (radius / 111111) * Math.cos(angle);
        const lngOffset = (radius / (111111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
        const lat = Math.max(-90, Math.min(90, center.lat + latOffset));
      const lng = center.lng + lngOffset;
      
      circleCoords.push({ lat, lng });
      }
      wktString = coordinatesToWktPolygon(circleCoords);
    }
    if (!wktString) {
      toast.error("Could not convert the drawn shape to WKT format.");
      return;
    }
    const payload = {
      Name: polygonName,
      WKT: wktString,
      SessionIds: Array.isArray(analysis.session) ? analysis.session : [],
      Area: Number.isFinite(Number(analysis.area)) ? Number(analysis.area) : null,
    };
    setIsLoading(true);
    try {
      const response = await mapViewApi.savePolygon(payload);
      if (response && response.Status === 1) {
        toast.success(`Polygon "${polygonName}" saved successfully!`);
        setIsSaveDialogOpen(false);
        setPolygonName("");
      } else {
        toast.error(response?.Message || "Failed to save polygon.");
      }
    } catch (error) {
      toast.error(`Error saving polygon: ${error.message || "An unknown error occurred."}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAnalysis = useCallback(() => {
    setAnalysis(null);
    setUi(prev => ({ ...prev, drawClearSignal: (prev.drawClearSignal || 0) + 1 }));
  }, []);

  const mapOptions = useMemo(() => {
    const standardMapTypes = ["roadmap", "satellite", "hybrid", "terrain"];
    const styleKey = ui.basemapStyle || "roadmap";
    const options = { disableDefaultUI: false, zoomControl: true, gestureHandling: "greedy" };
    if (standardMapTypes.includes(styleKey)) {
      options.mapId = MAP_ID;
      options.mapTypeId = styleKey;
    } else if (MAP_STYLES[styleKey]) {
      options.mapTypeId = "roadmap";
      options.styles = MAP_STYLES[styleKey];
    } else {
      options.mapId = MAP_ID;
      options.mapTypeId = "roadmap";
    }
    return options;
  }, [ui.basemapStyle]);

  if (loadError) return <div className="flex items-center justify-center h-screen text-red-600">Error loading Google Maps.</div>;
  if (!isLoaded) return <div className="flex items-center justify-center h-screen text-gray-600">Loading map...</div>;

  return (
    <div className="h-screen w-full flex flex-col bg-white">
      <MapHeader
        ui={ui}
        onUIChange={handleUIChange}
        hasLogs={!!activeFilters && combinedDisplayedLogs.length > 0}
        polygonStats={analysis}
        onDownloadStatsCsv={handleDownloadStatsCsv}
        onDownloadRawCsv={handleDownloadRawCsv}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        initialFilters={activeFilters}
        isSearchOpen={isSearchOpen}
        onSearchToggle={() => setIsSearchOpen((prev) => !prev)}
        thresholds={thresholds}
        logs={combinedDisplayedLogs}
        availableFilterOptions={availableFilterOptions}
        rawLogsCount={rawLogs.length}
        neighbourLogsCount={neighbourLogs.length}
        isLoading={logsLoading}
        onFetchLogs={handleFetchLogsForPolygon}
        selectedMetric={selectedMetric}
      />

      <div className="relative flex-1">
        
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={DEFAULT_CENTER}
          zoom={13}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          options={mapOptions}
        >
          {isSearchOpen && <MapSearchBox />}

          {!activeFilters && ui.showSessions && (
            <SessionsLayer
              map={map}
              sessions={allSessions}
              onClick={handleSessionMarkerClick}
              cluster={ui.clusterSessions}
            />
          )}

          {activeFilters && combinedDisplayedLogs.length > 0 && (
            <LogCirclesLayer
              map={map}
              logs={mapVisibleLogs}
              selectedMetric={selectedMetric}
              thresholds={thresholds}
              showCircles={ui.showLogsCircles && !(ui.drawPixelateRect && analysis)}
              showHeatmap={ui.showHeatmap}
              visibleBounds={ui.renderVisibleLogsOnly ? visibleBounds : null}
              setAppSummary={setAppSummary}
              renderVisibleOnly={ui.renderVisibleLogsOnly}
              canvasRadiusPx={(zoom) => Math.max(3, Math.min(7, Math.floor(zoom / 2)))}
              maxDraw={80000}
              colorBy={colorBy}
              showNeighbours={ui.showNeighbours}
            />
          )}

          {ui.showPolygons && (
            <ProjectPolygonsLayer
              polygons={projectPolygons}
              onClick={(poly) => toast.info(poly.name || `Region ${poly.id}`)}
            />
          )}

          {map && (
  <DrawingToolsLayer
    map={map}
    enabled={ui.drawEnabled}
    logs={mapVisibleLogs}
    selectedMetric={selectedMetric}
    thresholds={thresholds}
    sessions={allSessions}
    pixelateRect={ui.drawPixelateRect}
    shapeMode={ui.shapeMode} 
    onUIChange={handleUIChange}
    cellSizeMeters={ui.drawCellSizeMeters || 100}
    onSummary={setAnalysis}
    clearSignal={ui.drawClearSignal || 0}
    maxCells={1500}
    onDrawingsChange={() => {}}
    colorizeCells={ui.colorizeCells}
  />
)}
        </GoogleMap>

        {activeFilters && (ui.showLogsCircles || ui.showHeatmap) && (
          <MapLegend
            thresholds={thresholds}
            selectedMetric={selectedMetric}
            colorBy={colorBy}
            logs={combinedDisplayedLogs}
            activeFilter={legendFilter}
            onFilterChange={setLegendFilter}
          />
        )}

        {analysis && (
          <div className="absolute bottom-4 left-4 z-30 bg-white rounded-lg shadow-lg w-[260px] border border-gray-200">
            <div className="flex items-center justify-between px-3 py-2 bg-blue-600 rounded-t-lg">
              <h3 className="font-semibold text-white text-sm">
                Polygon Analysis
              </h3>
              <button onClick={handleClearAnalysis} className="text-white/80 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 text-xs space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-gray-500">Shape:</span>
                <span className="font-medium text-gray-800 capitalize">{analysis.type}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Area:</span>
                <span className="font-medium text-gray-800">{formatArea(analysis.area)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Logs Inside:</span>
                <span className="font-bold text-blue-600">{analysis.count || 0}</span>
              </div>

              {analysis.stats?.count > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide">
                    {selectedMetric} Statistics
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-bold text-blue-600">
                        {analysis.stats.mean?.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-gray-500">Average</div>
                    </div>
                    <div className="bg-green-50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-bold text-green-600">
                        {analysis.stats.median?.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-gray-500">Median</div>
                    </div>
                    <div className="bg-orange-50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-bold text-orange-500">
                        {analysis.stats.min?.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-gray-500">Min</div>
                    </div>
                    <div className="bg-red-50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-bold text-red-500">
                        {analysis.stats.max?.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-gray-500">Max</div>
                    </div>
                  </div>
                </div>
              )}

              {!activeFilters && analysis.intersectingSessions?.length > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Sessions:</span>
                  <span className="font-bold text-purple-600">{analysis.intersectingSessions.length}</span>
                </div>
              )}
            </div>

            <div className="px-3 py-2.5 border-t border-gray-200 bg-gray-50 rounded-b-lg space-y-2">
              <Button
                size="sm"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 h-auto"
                onClick={handleFetchLogsForPolygon}
              >
                {analysis.intersectingSessions?.length > 0 && !activeFilters
                  ? `View ${analysis.intersectingSessions.length} Sessions`
                  : 'Fetch Logs for Area'}
              </Button>
              
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs py-1.5 h-auto"
                  onClick={() => setIsSaveDialogOpen(true)}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2.5 py-1.5 h-auto"
                  onClick={handleDownloadStatsCsv}
                  title="Download Stats"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2.5 py-1.5 h-auto"
                  onClick={handleDownloadRawCsv}
                  title="Download Raw Data"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <SessionDetailPanel
          sessionData={selectedSessionData}
          isLoading={isLoading}
          thresholds={thresholds}
          selectedMetric={selectedMetric}
          onClose={() => setSelectedSessionData(null)}
        />

        <AllLogsPanelToggle
          logs={combinedDisplayedLogs}
          thresholds={thresholds}
          selectedMetric={selectedMetric}
          appSummary={combinedAppSummary}
          isLoading={logsLoading}
          startDate={activeFilters?.startDate}
          endDate={activeFilters?.endDate}
          mainLogsCount={displayedLogs.length}
          neighbourLogsCount={displayedNeighbourLogs.length}
          showNeighbours={ui.showNeighbours}
        />

        {(isLoading || logsLoading) && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl p-6 flex items-center gap-4 border border-gray-200">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
              <span className="text-lg font-medium text-gray-700">Loading...</span>
            </div>
          </div>
        )}

        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
          <DialogContent className="sm:max-w-[425px] bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-800">Polygon Analysis</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right text-gray-700">
                  Name
                </Label>
                <Input
                  id="name"
                  value={polygonName}
                  onChange={(e) => setPolygonName(e.target.value)}
                  className="col-span-3 bg-white border-gray-300 text-gray-800"
                  placeholder="e.g., Sector 15 Coverage Gap"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsSaveDialogOpen(false)}
                className="border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSavePolygon} 
                disabled={!polygonName.trim() || isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? "Saving..." : "Save Polygon"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
