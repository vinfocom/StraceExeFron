import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle } from "@react-google-maps/api";
import { toast } from "react-toastify";
import { mapViewApi } from "@/api/apiEndpoints";
// 1. Import the color generator
import { generateColorFromHash } from "@/utils/colorUtils";

// Local date formatter to avoid UTC off-by-one
const toYmdLocal = (d) => {
  if (!(d instanceof Date)) return "";
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

// Metric mapping
const resolveMetricConfig = (key) => {
  const map = {
    rsrp: { field: "rsrp", thresholdKey: "rsrp" },
    rsrq: { field: "rsrq", thresholdKey: "rsrq" },
    sinr: { field: "sinr", thresholdKey: "sinr" },
    "dl-throughput": { field: "dl_tpt", thresholdKey: "dl_thpt" },
    "ul-throughput": { field: "ul_tpt", thresholdKey: "ul_thpt" },
    mos: { field: "mos", thresholdKey: "mos" },
    "lte-bler": { field: "bler", thresholdKey: "lte_bler" },
    pci: { field: "pci", thresholdKey: "pci" },
    num_cells: { field: "num_cells", thresholdKey: "num_cells" },
    level: { field: "level", thresholdKey: "level" },
    jitter: { field: "jitter", thresholdKey: "jitter" },
    latency: { field: "latency", thresholdKey: "latency" },
    packet_loss: { field: "packet_loss", thresholdKey: "packet_loss" },
    tac: { field: "tac", thresholdKey: "tac" },
  };
  return map[key?.toLowerCase()] || map.rsrp;
};

// 2. Update logic to use Hash for TAC
const getColorForMetric = (metric, value, thresholds) => {
  const normalizedMetric = metric?.toLowerCase();

  // Special handling for TAC to match MapLegend's dynamic coloring
  if (normalizedMetric === "tac") {
    // If value is missing, return default, otherwise generate hash color
    return value !== undefined && value !== null 
      ? generateColorFromHash(String(value)) 
      : "#808080";
  }

  // Standard logic for other metrics (RSRP, SINR, etc.)
  const { thresholdKey } = resolveMetricConfig(metric);
  const metricThresholds = thresholds[thresholdKey] || [];
  const numValue = parseFloat(value);
  if (!Number.isFinite(numValue) || metricThresholds.length === 0) return "#808080";
  const match = metricThresholds.find((t) => numValue >= t.min && numValue <= t.max);
  return match ? match.color : "#808080";
};

// Dense zoom helpers (same logic as before)
const computeDenseCellBounds = (points, cellSizeMeters = 800) => {
  if (!points?.length) return null;
  const n = points.length;
  if (n < 10) return null;

  let minLat = Infinity, minLon = Infinity, avgLat = 0;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    avgLat += p.lat;
  }
  avgLat /= n;

  const latDegPerM = 1 / 111320;
  const lonDegPerM = 1 / (111320 * Math.cos((avgLat * Math.PI) / 180) || 1);

  const cellLatDeg = cellSizeMeters * latDegPerM;
  const cellLonDeg = cellSizeMeters * lonDegPerM;
  if (!Number.isFinite(cellLatDeg) || !Number.isFinite(cellLonDeg)) return null;

  const cells = new Map();
  for (const p of points) {
    const iLat = Math.floor((p.lat - minLat) / cellLatDeg);
    const iLon = Math.floor((p.lon - minLon) / cellLonDeg);
    const key = `${iLat}:${iLon}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }

  let densest = null;
  for (const arr of cells.values()) {
    if (!densest || arr.length > densest.length) densest = arr;
  }
  if (!densest || densest.length < Math.max(5, Math.ceil(n * 0.05))) return null;

  const bounds = new window.google.maps.LatLngBounds();
  let hasValid = false;
  for (const p of densest) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      bounds.extend({ lat: p.lat, lng: p.lon });
      hasValid = true;
    }
  }
  return hasValid ? bounds : null;
};

const computePercentileBounds = (points, percentile = 0.8) => {
  if (!points?.length) return null;
  const n = points.length;
  if (n === 1) {
    const p = points[0];
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: p.lat, lng: p.lon });
    return bounds;
  }
  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lons = points.map((p) => p.lon).sort((a, b) => a - b);
  const q = (1 - percentile) / 2;
  const lowerIdx = Math.max(0, Math.floor(q * (n - 1)));
  const upperIdx = Math.min(n - 1, Math.ceil((1 - q) * (n - 1)));
  const latMin = lats[lowerIdx], latMax = lats[upperIdx];
  const lonMin = lons[lowerIdx], lonMax = lons[upperIdx];
  if (
    !Number.isFinite(latMin) || !Number.isFinite(latMax) ||
    !Number.isFinite(lonMin) || !Number.isFinite(lonMax) ||
    latMin === latMax || lonMin === lonMax
  ) return null;

  const bounds = new window.google.maps.LatLngBounds();
  bounds.extend({ lat: latMin, lng: lonMin });
  bounds.extend({ lat: latMax, lng: lonMax });
  return bounds;
};

const fitMapToMostlyLogs = (map, points) => {
  if (!map || !Array.isArray(points) || points.length === 0) return;
  const denseBounds = computeDenseCellBounds(points, 800);
  if (denseBounds) return void map.fitBounds(denseBounds);
  const percentileBounds = computePercentileBounds(points, 0.8);
  if (percentileBounds) return void map.fitBounds(percentileBounds);
  const allBounds = new window.google.maps.LatLngBounds();
  let hasValid = false;
  for (const p of points) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      allBounds.extend({ lat: p.lat, lng: p.lon });
      hasValid = true;
    }
  }
  if (hasValid) map.fitBounds(allBounds);
};

// meters-per-pixel at given zoom and latitude
const metersPerPixel = (zoom, lat) => {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
};

const LogLayer = ({
  map,
  filters,
  selectedMetric,
  thresholds,
  onLogsLoaded,
  setIsLoading,
  showCircles = true,
  showHeatmap = false,
  visibleBounds = null,
}) => {
  const [logs, setLogs] = useState([]);
  const heatmapRef = useRef(null);

  useEffect(() => {
    if (!filters || !map) return;

    const fetchAndDrawLogs = async () => {
      setIsLoading(true);
      try {
        const apiParams = {
          StartDate: toYmdLocal(filters.startDate),
          EndDate: toYmdLocal(filters.endDate),
        };
        if (filters.provider && filters.provider !== "ALL") apiParams.Provider = filters.provider;
        if (filters.technology && filters.technology !== "ALL") apiParams.Technology = filters.technology;
        if (filters.band && filters.band !== "ALL") apiParams.Band = filters.band;

        const fetched = await mapViewApi.getLogsByDateRange(apiParams);
        if (!Array.isArray(fetched) || fetched.length === 0) {
          toast.warn("No logs found for the selected filters.");
          setLogs([]);
          onLogsLoaded?.([]);
          // make sure to clear heatmap if it's on
          if (heatmapRef.current) heatmapRef.current.setMap(null);
          return;
        }

        setLogs(fetched);
        onLogsLoaded?.(fetched);

        const points = [];
        for (const log of fetched) {
          const lat = parseFloat(log.lat);
          const lon = parseFloat(log.lon);
          if (!isNaN(lat) && !isNaN(lon)) points.push({ lat, lon });
        }
        fitMapToMostlyLogs(map, points);

        toast.info(`Loaded ${fetched.length} logs.`);
      } catch (error) {
        toast.error(`Failed to fetch logs: ${error?.message || "Unknown error"}`);
        setLogs([]);
        onLogsLoaded?.([]);
        if (heatmapRef.current) heatmapRef.current.setMap(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndDrawLogs();

    return () => {
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
        heatmapRef.current = null;
      }
    };
  }, [filters, map, setIsLoading, onLogsLoaded]);

  // Prepare data
  const { field } = resolveMetricConfig(selectedMetric);

  const processedLogs = useMemo(() => {
    return (logs || [])
      .map((l, index) => {
        const lat = parseFloat(l.lat);
        const lon = parseFloat(l.lon);
        const val = parseFloat(l?.[field]);
        return {
          id: l.id ?? `log-${index}`,
          lat: Number.isFinite(lat) ? lat : null,
          lon: Number.isFinite(lon) ? lon : null,
          value: Number.isFinite(val) ? val : undefined,
        };
      })
      .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
  }, [logs, field]);

  // Filter to visible bounds if requested
  const visibleLogs = useMemo(() => {
    if (!visibleBounds) return processedLogs;
    const { north, south, east, west } = visibleBounds;
    const crossesAntimeridian = east < west;
    return processedLogs.filter((p) => {
      const latOk = p.lat <= north && p.lat >= south;
      let lonOk = false;
      if (crossesAntimeridian) {
        lonOk = p.lon >= west || p.lon <= east;
      } else {
        lonOk = p.lon <= east && p.lon >= west;
      }
      return latOk && lonOk;
    });
  }, [processedLogs, visibleBounds]);

  // Dynamic circle radius based on zoom (constant ~10px on screen)
  const circleRadiusMeters = useMemo(() => {
    if (!map) return 10;
    const center = map.getCenter?.();
    const zoom = map.getZoom?.();
    if (!center || !Number.isFinite(zoom)) return 10;
    const mpp = metersPerPixel(zoom, center.lat());
    return mpp * 10; // ~10px radius
  }, [map, visibleBounds]); // recalc on idle via visibleBounds change

  // Heatmap handling
  useEffect(() => {
    if (!map) return;
    if (!showHeatmap) {
      if (heatmapRef.current) heatmapRef.current.setMap(null);
      return;
    }

    // Lazy create heatmap layer
    const g = window.google;
    if (!g?.maps?.visualization) return;

    const points = processedLogs.map((p) => new g.maps.LatLng(p.lat, p.lon));
    if (!heatmapRef.current) {
      heatmapRef.current = new g.maps.visualization.HeatmapLayer({
        data: points,
        radius: 24,
      });
      heatmapRef.current.setMap(map);
    } else {
      heatmapRef.current.setData(points);
      heatmapRef.current.setMap(map);
    }

    return () => {
      if (heatmapRef.current) heatmapRef.current.setMap(null);
    };
  }, [showHeatmap, processedLogs, map]);

  if (!showCircles && !showHeatmap) return null;

  return (
    <>
      {showCircles &&
        visibleLogs.map((log) => (
          <Circle
            key={log.id}
            center={{ lat: log.lat, lng: log.lon }}
            radius={circleRadiusMeters}
            options={{
              strokeColor: getColorForMetric(selectedMetric, log.value, thresholds),
              fillColor: getColorForMetric(selectedMetric, log.value, thresholds),
              fillOpacity: 0.8,
              strokeWeight: 1,
            }}
          />
        ))}
    </>
  );
};

export default LogLayer;