import React, { useEffect, useRef, useCallback, memo } from "react";
import { toast } from "react-toastify";

// --- Helper Functions (Same as before, collapsed for brevity) ---
function toLatLng(item) {
  const lat = Number(item.lat ?? item.latitude ?? item.start_lat ?? item.Latitude ?? item.LAT);
  const lng = Number(item.lng ?? item.lon ?? item.longitude ?? item.start_lon ?? item.LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return new window.google.maps.LatLng(lat, lng);
}

function normalizeMetricKey(m) {
  if (!m) return "rsrp";
  const s = String(m).toLowerCase();
  const map = {
    "dl-throughput": "dl_thpt",
    "ul-throughput": "ul_thpt",
    "lte-bler": "lte_bler"
  };
  return map[s] || s;
}

const metricKeyMap = {
  rsrp: ["rsrp", "lte_rsrp", "rsrp_dbm"],
  rsrq: ["rsrq"],
  sinr: ["sinr"],
  dl_thpt: ["dl_thpt", "dl_throughput", "download_mbps"],
  ul_thpt: ["ul_thpt", "ul_throughput", "upload_mbps"],
  mos: ["mos", "voice_mos"],
  lte_bler: ["lte_bler", "bler"],
};

function getMetricValue(log, selectedMetric) {
  const key = normalizeMetricKey(selectedMetric);
  const candidates = metricKeyMap[key] || [key];
  for (const k of candidates) {
    const v = Number(log[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function computeStats(values) {
  if (!values.length) return { mean: null, median: null, max: null, min: null, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    mean: sum / values.length,
    median,
    max: sorted[sorted.length - 1],
    min: sorted[0],
    count: values.length
  };
}

function pickColorForValue(value, selectedMetric, thresholds) {
  const key = normalizeMetricKey(selectedMetric);
  const arr = thresholds?.[key];
  if (Array.isArray(arr) && arr.length) {
    const sorted = [...arr].sort((a, b) => {
      const aMin = parseFloat(a.min ?? a.from ?? -Infinity);
      const bMin = parseFloat(b.min ?? b.from ?? -Infinity);
      return aMin - bMin;
    });
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const min = parseFloat(t.min ?? t.from ?? -Infinity);
      const max = parseFloat(t.max ?? t.to ?? Infinity);
      const val = parseFloat(t.value);
      const isLast = i === sorted.length - 1;
      
      if (Number.isFinite(val)) {
        if (value <= val) return t.color || "#4ade80";
      } else if (value >= min && (isLast ? value <= max : value < max)) {
        return t.color || "#4ade80";
      }
    }
    
    // Fallbacks boundary
    if (value < parseFloat(sorted[0].min ?? sorted[0].from ?? -Infinity)) return sorted[0].color || "#4ade80";
    const last = sorted[sorted.length - 1];
    if (value > parseFloat(last.max ?? last.to ?? Infinity)) return last.color || "#4ade80";
  }
  return "#93c5fd";
}

function buildPolygonBounds(polygon) {
  const path = polygon.getPath()?.getArray?.() || [];
  const bounds = new window.google.maps.LatLngBounds();
  path.forEach((ll) => bounds.extend(ll));
  return bounds;
}

function filterItemsInside(type, overlay, items) {
  if (!items || !items.length) return [];
  const gm = window.google.maps;
  
  let bb = null;
  if (type === "rectangle" || type === "circle") bb = overlay.getBounds();
  else if (type === "polygon") bb = buildPolygonBounds(overlay);

  const pre = items.filter((item) => {
    const pt = toLatLng(item);
    return pt && (!bb || bb.contains(pt));
  });

  return pre.filter((item) => {
    const pt = toLatLng(item);
    if (!pt) return false;
    if (type === "rectangle") return overlay.getBounds().contains(pt);
    if (type === "polygon") return gm.geometry.poly.containsLocation(pt, overlay);
    if (type === "circle") {
      const d = gm.geometry.spherical.computeDistanceBetween(pt, overlay.getCenter());
      return Number.isFinite(d) && d <= overlay.getRadius();
    }
    return false;
  });
}

function pixelateShape(type, overlay, logs, selectedMetric, thresholds, cellSizeMeters, map, gridOverlays, colorizeCells) {
  const gm = window.google.maps;
  if (type === "polyline") return { cellsDrawn: 0, cellsWithLogs: 0, cellData: [] };
  const bounds = type === "polygon" ? buildPolygonBounds(overlay) : overlay.getBounds();
  if (!bounds) return { cellsDrawn: 0, cellsWithLogs: 0, cellData: [] };

  const metersPerDegLat = 111320;
  const centerLat = bounds.getCenter().lat();
  const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const stepLat = cellSizeMeters / metersPerDegLat;
  const stepLng = cellSizeMeters / (metersPerDegLng > 0 ? metersPerDegLng : metersPerDegLat);

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const south = sw.lat();
  const west = sw.lng();
  
  const rows = Math.ceil(Math.abs(ne.lat() - south) / stepLat);
  const cols = Math.ceil(Math.abs(ne.lng() - west) / stepLng);

  const preFilteredLogs = logs.map(l => ({ log: l, pt: toLatLng(l) })).filter(x => x.pt && bounds.contains(x.pt));
  
  let cellsDrawn = 0;
  let cellsWithLogs = 0;
  const cellData = [];

  for (let i = 0; i < rows; i++) {
    const lat = south + i * stepLat;
    for (let j = 0; j < cols; j++) {
      const lng = west + j * stepLng;
      const cellBounds = new gm.LatLngBounds(new gm.LatLng(lat, lng), new gm.LatLng(lat + stepLat, lng + stepLng));
      const cellCenter = cellBounds.getCenter();
      let isInside = false;

      if (type === "rectangle") isInside = overlay.getBounds().contains(cellCenter);
      else if (type === "polygon") isInside = gm.geometry.poly.containsLocation(cellCenter, overlay);
      else if (type === "circle") isInside = gm.geometry.spherical.computeDistanceBetween(cellCenter, overlay.getCenter()) <= overlay.getRadius();

      if (!isInside) continue;

      const inCell = preFilteredLogs.filter(x => cellBounds.contains(x.pt));
      let fillColor = "#808080";
      let fillOpacity = 0.1;
      let cellStats = null;

      if (inCell.length > 0) {
        cellsWithLogs++;
        const vals = inCell.map(x => getMetricValue(x.log, selectedMetric)).filter(Number.isFinite);
        if (vals.length > 0) {
          cellStats = computeStats(vals);
          fillColor = colorizeCells ? pickColorForValue(cellStats.mean, selectedMetric, thresholds) : "#9ca3af";
          fillOpacity = 0.6;
        } else { fillOpacity = 0.3; }
      }

      const rect = new gm.Rectangle({
        map,
        bounds: cellBounds,
        strokeWeight: 0.4,
        strokeColor: "#111827",
        fillOpacity,
        fillColor,
        clickable: false,
        zIndex: 50,
      });

      gridOverlays.push(rect);
      cellsDrawn++;
      cellData.push({ row: i, col: j, bounds: { south: lat, west: lng, north: lat + stepLat, east: lng + stepLng }, center: { lat: cellCenter.lat(), lng: cellCenter.lng() }, logsCount: inCell.length, stats: cellStats, color: fillColor });
    }
  }
  return { cellsDrawn, cellsWithLogs, cellData, gridRows: rows, gridCols: cols };
}

function serializeOverlay(type, overlay) {
  if (!overlay) return null;
  if (type === "polyline") {
    const path = overlay.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
    return { type, path };
  }
  const bounds = type === "polygon" ? buildPolygonBounds(overlay) : overlay.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const boundObj = { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() };

  if (type === "polygon") {
    const path = overlay.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
    return { type, polygon: path, bounds: boundObj };
  }
  if (type === "rectangle") return { type, rectangle: { sw: { lat: sw.lat(), lng: sw.lng() }, ne: { lat: ne.lat(), lng: ne.lng() } } };
  if (type === "circle") return { type, circle: { center: { lat: overlay.getCenter().lat(), lng: overlay.getCenter().lng() }, radius: overlay.getRadius() } };
  return { type };
}

function getPolylineDetails(polyline) {
  const gm = window.google.maps;
  const path = polyline.getPath();
  const len = gm.geometry.spherical.computeLength(path);
  const points = path.getArray();
  if (points.length < 2) return { length: 0, center: points[0] };

  let dist = 0;
  const targetDist = len / 2;
  let mid = points[0];

  for (let i = 0; i < points.length - 1; i++) {
    const segLen = gm.geometry.spherical.computeDistanceBetween(points[i], points[i+1]);
    if (dist + segLen >= targetDist) {
      const fraction = (targetDist - dist) / segLen;
      mid = gm.geometry.spherical.interpolate(points[i], points[i+1], fraction);
      break;
    }
    dist += segLen;
  }
  return { length: len, center: mid };
}

const clampOpacity = (value, fallback = 0.35) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
};

// --- Component Definition ---

function DrawingToolsLayerComponent({
  map,
  enabled,
  shapeMode, 
  showDrawingControl = false,
  logs,
  sessions,
  selectedMetric,
  thresholds,
  pixelateRect = false,
  cellSizeMeters = 100,
  onSummary,
  onDrawingsChange,
  clearSignal = 0,
  colorizeCells = true,
  polygonOpacity = 0.35,
  onUIChange, // ✅ NEW PROP: To reset state after drawing
}) {
  const managerRef = useRef(null);
  const shapesRef = useRef([]);
  const collectedDrawingRef = useRef([]);
  const lastClearSignalRef = useRef(clearSignal);
  const missingLibraryNotifiedRef = useRef(false);
  const callbacksRef = useRef({ onSummary, onDrawingsChange, onUIChange });
  const reAnalyzeShapeRef = useRef(null);
  const shapeModeRef = useRef(shapeMode);
  const resolvedPolygonOpacity = clampOpacity(polygonOpacity);

  useEffect(() => {
    callbacksRef.current = { onSummary, onDrawingsChange, onUIChange };
  }, [onSummary, onDrawingsChange, onUIChange]);
  useEffect(() => {
    shapeModeRef.current = shapeMode;
  }, [shapeMode]);

  const reAnalyzeShape = useCallback((shapeObj) => {
    const { type, overlay, id } = shapeObj;
    const gm = window.google.maps;
    if (shapeObj.gridOverlays?.length) {
      shapeObj.gridOverlays.forEach(rect => rect.setMap(null));
      shapeObj.gridOverlays = [];
    }

    const allLogs = logs || [];
    const geometry = serializeOverlay(type, overlay);
    let areaInMeters = 0;
    let lengthInMeters = 0;

    if (gm.geometry?.spherical) {
      if (type === "polygon") areaInMeters = gm.geometry.spherical.computeArea(overlay.getPath());
      else if (type === "rectangle") {
        const b = overlay.getBounds();
        const p = [b.getNorthEast(), new gm.LatLng(b.getNorthEast().lat(), b.getSouthWest().lng()), b.getSouthWest(), new gm.LatLng(b.getSouthWest().lat(), b.getNorthEast().lng())];
        areaInMeters = gm.geometry.spherical.computeArea(p);
      } else if (type === "circle") areaInMeters = Math.PI * Math.pow(overlay.getRadius(), 2);
      else if (type === "polyline") lengthInMeters = gm.geometry.spherical.computeLength(overlay.getPath());
    }

    const insideLogs = type === "polyline" ? [] : filterItemsInside(type, overlay, allLogs);
    const validValues = insideLogs.map(l => getMetricValue(l, selectedMetric)).filter(Number.isFinite);
    const stats = computeStats(validValues);
    
    const intersectingSessions = type === "polyline" ? [] : filterItemsInside(type, overlay, sessions || []);
    const uniqueSessionsMap = new Map();
    insideLogs.forEach(l => { if (l.session_id) uniqueSessionsMap.set(l.session_id, l.session_id); });
    const uniqueSessionsFromLogs = Array.from(uniqueSessionsMap.values());

    let gridInfo = null;
    if (pixelateRect && type !== "polyline") {
      const gridResult = pixelateShape(type, overlay, allLogs, selectedMetric, thresholds, cellSizeMeters, map, shapeObj.gridOverlays, colorizeCells);
      gridInfo = { cells: gridResult.cellsDrawn, cellsWithLogs: gridResult.cellsWithLogs, cellSizeMeters, totalGridArea: (cellSizeMeters ** 2) * gridResult.cellsWithLogs, gridRows: gridResult.gridRows, gridCols: gridResult.gridCols, cellData: gridResult.cellData };
    }

    const entry = {
      id, type, geometry, selectedMetric, stats, count: insideLogs.length,
      session: uniqueSessionsFromLogs, intersectingSessions, sessionCount: uniqueSessionsFromLogs.length,
      logs: insideLogs, grid: gridInfo, createdAt: shapeObj.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
      area: areaInMeters, areaInSqKm: (areaInMeters / 1e6).toFixed(4), length: lengthInMeters, lengthInKm: (lengthInMeters / 1000).toFixed(3),
    };

    const idx = collectedDrawingRef.current.findIndex(d => d.id === id);
    if (idx >= 0) collectedDrawingRef.current[idx] = entry;
    else collectedDrawingRef.current.push(entry);

    callbacksRef.current.onDrawingsChange?.([...collectedDrawingRef.current]);
    callbacksRef.current.onSummary?.(entry);
    return entry;
  }, [logs, sessions, selectedMetric, thresholds, pixelateRect, cellSizeMeters, map, colorizeCells]);
  useEffect(() => {
    reAnalyzeShapeRef.current = reAnalyzeShape;
  }, [reAnalyzeShape]);

  const registerCompletedShape = useCallback((type, overlay, drawingManager = null) => {
    if (!overlay) return;
    const shapeObj = {
      id: Date.now(),
      type,
      overlay,
      gridOverlays: [],
      createdAt: new Date().toISOString(),
    };
    shapesRef.current.push(shapeObj);
    const isMeasurementTool = type === "polyline";
    const entry = isMeasurementTool ? null : reAnalyzeShapeRef.current?.(shapeObj);
    const listeners = [];
    const update = () => reAnalyzeShapeRef.current?.(shapeObj);

    if (type === "polyline") {
      const updateDistanceLabel = () => {
        const { length, center } = getPolylineDetails(overlay);
        const text = length >= 1000 ? `${(length / 1000).toFixed(2)} km` : `${Math.round(length)} m`;
        if (!shapeObj.labelMarker) {
          shapeObj.labelMarker = new window.google.maps.Marker({
            map,
            position: center,
            icon: {
              url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
              scaledSize: new window.google.maps.Size(1, 1),
              anchor: new window.google.maps.Point(0, 0),
              labelOrigin: new window.google.maps.Point(0, -14),
            },
            label: {
              text,
              color: "#111827",
              fontWeight: "700",
              fontSize: "12px",
            },
            zIndex: 1000,
          });
        } else {
          shapeObj.labelMarker.setPosition(center);
          const lbl = shapeObj.labelMarker.getLabel();
          shapeObj.labelMarker.setLabel({ ...lbl, text });
        }
      };
      const path = overlay.getPath();
      ["set_at", "insert_at", "remove_at"].forEach((ev) =>
        listeners.push(window.google.maps.event.addListener(path, ev, updateDistanceLabel)),
      );
      updateDistanceLabel();
    } else if (type === "polygon") {
      const path = overlay.getPath();
      ["set_at", "insert_at", "remove_at"].forEach((ev) =>
        listeners.push(window.google.maps.event.addListener(path, ev, update)),
      );
    } else if (type === "rectangle") {
      listeners.push(window.google.maps.event.addListener(overlay, "bounds_changed", update));
    } else if (type === "circle") {
      ["radius_changed", "center_changed"].forEach((ev) =>
        listeners.push(window.google.maps.event.addListener(overlay, ev, update)),
      );
    }

    shapeObj.listeners = listeners;

    // For non-measurement tools, reAnalyzeShape already fires onDrawingsChange with
    // full data including logs, geometry, and stats.
    drawingManager?.setDrawingMode(null);
    callbacksRef.current.onUIChange?.({ drawEnabled: false, shapeMode: null });
    if (isMeasurementTool) {
      callbacksRef.current.onSummary?.(null);
      callbacksRef.current.onDrawingsChange?.([...collectedDrawingRef.current]);
    }

    if (type !== "polyline") {
      const sessionMsg =
        entry?.intersectingSessions?.length > 0
          ? ` Found ${entry.intersectingSessions.length} sessions.`
          : "";
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} drawn.${sessionMsg}`, {
        position: "bottom-right",
        autoClose: 3000,
      });
    } else {
      toast.success("Distance measured.", { position: "bottom-right", autoClose: 2000 });
    }
  }, [map]);


  // ✅ Initialize Manager with drawingControl: false
  useEffect(() => {
    if (!map) return;
    if (!window.google?.maps?.drawing) {
      if (enabled && !missingLibraryNotifiedRef.current) {
        missingLibraryNotifiedRef.current = true;
        toast.error("Google Drawing library is not loaded.");
      }
      return;
    }
    missingLibraryNotifiedRef.current = false;
    
    if (managerRef.current) {
      managerRef.current.setMap(null);
      managerRef.current = null;
    }

    if (!enabled) return;

    const dm = new window.google.maps.drawing.DrawingManager({
      drawingMode: null, // Start with nothing
      drawingControl: Boolean(showDrawingControl),
      drawingControlOptions: {
        position: window.google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          window.google.maps.drawing.OverlayType.POLYGON,
          window.google.maps.drawing.OverlayType.RECTANGLE,
          window.google.maps.drawing.OverlayType.CIRCLE,
          window.google.maps.drawing.OverlayType.POLYLINE,
        ],
      },
      polygonOptions: { clickable: true, editable: true, draggable: true, strokeWeight: 2, strokeColor: "#1d4ed8", strokeOpacity: resolvedPolygonOpacity, fillColor: "#1d4ed8", fillOpacity: resolvedPolygonOpacity },
      rectangleOptions: { clickable: true, editable: true, draggable: true, strokeWeight: 2, strokeColor: "#1d4ed8", strokeOpacity: resolvedPolygonOpacity, fillColor: "#1d4ed8", fillOpacity: resolvedPolygonOpacity },
      circleOptions: { clickable: true, editable: true, draggable: true, strokeWeight: 2, strokeColor: "#1d4ed8", strokeOpacity: resolvedPolygonOpacity, fillColor: "#1d4ed8", fillOpacity: resolvedPolygonOpacity },
      polylineOptions: { clickable: true, editable: true, draggable: true, strokeWeight: 3, strokeColor: "#ea580c" },
    });

    dm.setMap(map);
    dm.setDrawingMode(shapeModeRef.current);

    const handleComplete = (e) => {
      registerCompletedShape(e.type, e.overlay, dm);
    };

    const listener = window.google.maps.event.addListener(dm, "overlaycomplete", handleComplete);
    managerRef.current = dm;

    return () => {
      window.google.maps.event.removeListener(listener);
      managerRef.current?.setMap(null);
      managerRef.current = null;
    };
  }, [map, enabled, shapeMode, showDrawingControl, registerCompletedShape, resolvedPolygonOpacity]);

  useEffect(() => {
    shapesRef.current.forEach(({ type, overlay }) => {
      if (!overlay || type === "polyline") return;
      overlay.setOptions?.({
        strokeOpacity: resolvedPolygonOpacity,
        fillOpacity: resolvedPolygonOpacity,
      });
    });
  }, [resolvedPolygonOpacity]);

  // Keep DrawingManager mode in sync when tool or enabled state changes.
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.setDrawingMode(enabled ? shapeMode : null);
    }
  }, [map, enabled, shapeMode]);

  // Keep map and overlay cursor in sync with active drawing mode.
  useEffect(() => {
    if (!map || typeof map.getDiv !== "function") return;

    const isDrawingActive = Boolean(enabled && shapeMode);
    const mapDiv = map.getDiv();
    const originalDraggable = map.get("draggable");
    const originalDisableDoubleClickZoom = map.get("disableDoubleClickZoom");
    const originalMapCursor = mapDiv.style.cursor;
    const canvases = Array.from(mapDiv.querySelectorAll("canvas"));
    const originalCanvasCursors = canvases.map((canvas) => canvas.style.cursor);

    try {
      map.setOptions({
        draggable: isDrawingActive ? false : originalDraggable,
        disableDoubleClickZoom: isDrawingActive ? true : originalDisableDoubleClickZoom,
        draggableCursor: isDrawingActive ? "crosshair" : "",
        draggingCursor: isDrawingActive ? "crosshair" : "",
      });
    } catch {
      // Map can unmount while effects are flushing.
    }

    mapDiv.style.cursor = isDrawingActive ? "crosshair" : "";
    canvases.forEach((canvas) => {
      canvas.style.cursor = isDrawingActive ? "crosshair" : "";
    });

    return () => {
      try {
        map.setOptions({
          draggable: originalDraggable,
          disableDoubleClickZoom: originalDisableDoubleClickZoom,
          draggableCursor: "",
          draggingCursor: "",
        });
      } catch {
        // Ignore map teardown edge cases.
      }
      mapDiv.style.cursor = originalMapCursor;
      canvases.forEach((canvas, idx) => {
        canvas.style.cursor = originalCanvasCursors[idx] ?? "";
      });
    };
  }, [map, enabled, shapeMode]);

  // (Clear signal effect remains the same...)
  useEffect(() => {
    if (clearSignal === 0 || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    shapesRef.current.forEach(s => {
      s.listeners?.forEach(l => window.google.maps.event.removeListener(l));
      s.overlay?.setMap(null);
      s.gridOverlays?.forEach(r => r.setMap(null));
      s.labelMarker?.setMap(null);
    });
    shapesRef.current = [];
    collectedDrawingRef.current = [];
    callbacksRef.current.onDrawingsChange?.([]);
    callbacksRef.current.onSummary?.(null);
    toast.info("All drawings cleared", { position: "bottom-right", autoClose: 2000 });
  }, [clearSignal]);

  useEffect(() => {
    if (shapesRef.current.length > 0) {
      shapesRef.current.forEach(reAnalyzeShape);
    }
  }, [logs, sessions, selectedMetric, thresholds, pixelateRect, cellSizeMeters, colorizeCells, reAnalyzeShape]);

  return null;
}

export default memo(DrawingToolsLayerComponent);
