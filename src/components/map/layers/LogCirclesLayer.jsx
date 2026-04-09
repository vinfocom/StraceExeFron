import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { toast } from "react-toastify";
import { mapViewApi } from "@/api/apiEndpoints";
import CanvasPointsOverlay from "@/components/map/overlays/CanvasPointsOverlay";
import { resolveMetricConfig, getColorForMetric, getMetricValueFromLog } from "@/utils/metrics";
import { getLogColor,normalizeTechName } from "@/utils/colorUtils";

export default function LogCirclesLayer({
  map,
  logs = [],
  selectedMetric,
  thresholds,
  setAppSummary = () => {},
  showCircles = true,
  showHeatmap = false,
  visibleBounds = null,
  renderVisibleOnly = true,
  canvasRadiusPx = (zoom) => Math.max(3, Math.min(7, Math.floor(zoom / 2))),
  maxDraw = 100000,
  colorBy = null,
  showNeighbours = false,
}) {
  const [neighbours, setNeighbours] = useState([]);
  const heatmapRef = useRef(null);
  // const { field } = resolveMetricConfig(selectedMetric);

  const sessionIds = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return [...new Set(
      logs
        .map(item => item.session_id)
        .filter(id => id != null && id !== '')
    )];
  }, [logs]);




  const logsWithNeighbours = useMemo(() => {
    if (!showNeighbours || neighbours.length === 0) {
      return logs;
    }

    const neighbourCountMap = new Map();
    
    neighbours.forEach((neighbour) => {
      const logId = neighbour.log_id || neighbour.id || neighbour.session_id;
      if (logId) {
        neighbourCountMap.set(logId, (neighbourCountMap.get(logId) || 0) + 1);
      }
    });

    return logs.map((log) => ({
      ...log,
      neighbour_count: neighbourCountMap.get(log.id) || 
                       neighbourCountMap.get(log.session_id) || 0,
    }));
  }, [logs, neighbours, showNeighbours]);

  const getColorForLog = useCallback(
    (log, metricValue) => {
      if (colorBy === "provider") {
        const providerValue = log.provider || log.Provider;
        return getLogColor("provider", providerValue);
      }
      
      if (colorBy === "technology") {
        const techValue = log.network || log.Network;
        const bandRaw = log.band || log.Band;
        const normalizedTech = normalizeTechName(techValue, bandRaw);
        return getLogColor("technology", normalizedTech);
      }
      
      if (colorBy === "band") {
        const bandValue = log.band || log.Band;
        return getLogColor("band", bandValue);
      }

      return getColorForMetric(selectedMetric, metricValue, thresholds);
    },
    [colorBy, selectedMetric, thresholds]
  );

  const processed = useMemo(() => {
    return (logsWithNeighbours || [])
      .map((l, i) => {
        const lat = parseFloat(l.lat);
        const lng = parseFloat(l.lon ?? l.lng);
        // const val = parseFloat(l?.[field]);

        const val = getMetricValueFromLog(l, selectedMetric);
        return {
          id: l.id ?? `log-${i}`,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          value: Number.isFinite(val) ? val : undefined,
          raw: l,
        };
      })
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [logsWithNeighbours, selectedMetric]);

  const visibleProcessed = useMemo(() => {
    if (!renderVisibleOnly || !visibleBounds) return processed;
    const { north, south, east, west } = visibleBounds;
    const crossesAntimeridian = east < west;
    return processed.filter((p) => {
      const latOk = p.lat <= north && p.lat >= south;
      const lngOk = crossesAntimeridian
        ? p.lng >= west || p.lng <= east
        : p.lng <= east && p.lng >= west;
      return latOk && lngOk;
    });
  }, [processed, renderVisibleOnly, visibleBounds]);

  const pointsForCanvas = useMemo(() => {
    return visibleProcessed.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      color: getColorForLog(p.raw, p.value),
      isNeighbour: !!p.raw.isNeighbour, // Pass the neighbour flag to the canvas point
      label: "", 
    }));
  }, [visibleProcessed, getColorForLog, showNeighbours]);

  // In LogCirclesLayer.jsx
useEffect(() => {
  if (!logs || logs.length === 0) {
    setAppSummary(null);
    return;
  }

  const values = processed
    .map((p) => p.value)
    .filter((v) => Number.isFinite(v));

  if (values.length > 0) {
    values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const median = values[Math.floor(values.length / 2)];

    setAppSummary({
      count: processed.length,
      mean: mean.toFixed(2),
      median: median.toFixed(2),
      min: values[0].toFixed(2),
      max: values[values.length - 1].toFixed(2),
      metric: selectedMetric,
    });
  } else {
    setAppSummary({
      count: processed.length,
      mean: "N/A",
      median: "N/A",
      min: "N/A",
      max: "N/A",
      metric: selectedMetric,
    });
  }
}, [processed, selectedMetric, setAppSummary, logs]);
  useEffect(() => {
    if (!map || !showHeatmap) {
      if (heatmapRef.current) heatmapRef.current.setMap(null);
      return;
    }
    const g = window.google;
    if (!g?.maps?.visualization) return;

    const points = processed.map((p) => new g.maps.LatLng(p.lat, p.lng));
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
    return () => heatmapRef.current?.setMap(null);
  }, [showHeatmap, processed, map]);

  if (!showCircles && !showHeatmap) return null;

  return showCircles ? (
    <CanvasPointsOverlay
      map={map}
      points={pointsForCanvas}
      neigh={showNeighbours}
      getRadiusPx={canvasRadiusPx}
      maxDraw={maxDraw}
      padding={80}
      opacity={0.9}
      showLabels={showNeighbours}
      labelStyle={{
        font: "bold 11px Arial",
        color: "#000",
        strokeColor: "#fff",
        strokeWidth: 3,
      }}
    />
  ) : null;
}