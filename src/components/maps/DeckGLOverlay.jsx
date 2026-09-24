// src/components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PathLayer, ScatterplotLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import { getMetricConfig, getMetricValueFromLog } from '@/utils/metrics';
import { sampleLogIndices } from '@/utils/logSpatialSampling';
import { useDeckLayerRegistry } from '@/components/maps/deckLayerRegistry.jsx';

const pickFirstNonEmpty = (obj, keys = []) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const getNeighborRenderLimit = (total) => {
  if (total > 100000) return 10000;
  if (total > 50000) return 14000;
  return 20000;
};

const getImageRenderLimit = (total) => {
  if (total > 20000) return 2000;
  return 4000;
};

const VIEWPORT_PADDING_RATIO = 0.18;
const LOG_SAMPLE_CELL_PIXELS = 16;

const parseColorToRGB = (colorStr) => {
  if (!colorStr || typeof colorStr !== 'string') return [128, 128, 128, 200];

  if (colorStr.startsWith('hsl')) {
    const values = colorStr.match(/\d+/g);
    if (values && values.length >= 3) {
      const h = parseInt(values[0]) / 360;
      const s = parseInt(values[1]) / 100;
      const l = parseInt(values[2]) / 100;

      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 200];
    }
  }

  // 2. Handle Hex
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorStr);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1], 16),
      parseInt(hexMatch[2], 16),
      parseInt(hexMatch[3], 16),
      200
    ];
  }

  return [128, 128, 128, 200]; // Fallback Gray
};

const withAlpha = (color, alpha) => {
  if (!Array.isArray(color)) return [128, 128, 128, alpha];
  return [color[0] ?? 128, color[1] ?? 128, color[2] ?? 128, alpha];
};

const getLegendAlpha = (source, activeAlpha, dimmedAlpha = 55) =>
  source?._legendDimmed ? dimmedAlpha : activeAlpha;


const metersToLatDeg = 1 / 111320;

const getDrawingPath = (drawing) => {
  const geometry = drawing?.geometry;
  if (!geometry) return [];

  if (geometry.type === 'polyline') {
    return (geometry.path || []).map((point) => [Number(point.lng), Number(point.lat)]);
  }
  if (geometry.type === 'polygon') {
    return (geometry.polygon || []).map((point) => [Number(point.lng), Number(point.lat)]);
  }
  if (geometry.type === 'rectangle') {
    const sw = geometry.rectangle?.sw;
    const ne = geometry.rectangle?.ne;
    if (!sw || !ne) return [];
    return [
      [Number(sw.lng), Number(sw.lat)],
      [Number(ne.lng), Number(sw.lat)],
      [Number(ne.lng), Number(ne.lat)],
      [Number(sw.lng), Number(ne.lat)],
      [Number(sw.lng), Number(sw.lat)],
    ];
  }
  if (geometry.type === 'circle') {
    const center = geometry.circle?.center;
    const radius = Number(geometry.circle?.radius);
    if (!center || !Number.isFinite(radius) || radius <= 0) return [];
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    const latDelta = radius / 111320;
    const lngDelta = radius / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    return Array.from({ length: 65 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return [lng + Math.cos(angle) * lngDelta, lat + Math.sin(angle) * latDelta];
    });
  }
  return [];
};

const formatDrawingDistance = (meters, suffix = '') => (
  meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km${suffix}`
    : `${Math.round(meters)} m${suffix}`
);

const getDrawingMeasurement = (drawing) => {
  if (drawing?.type !== 'polyline') return null;
  const path = getDrawingPath(drawing);
  if (path.length < 2) return null;

  let totalMeters = 0;
  const segments = [];
  for (let index = 1; index < path.length; index += 1) {
    const [lngA, latA] = path[index - 1];
    const [lngB, latB] = path[index];
    const lat1 = (latA * Math.PI) / 180;
    const lat2 = (latB * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = ((lngB - lngA) * Math.PI) / 180;
    const haversine = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const distance = 6371008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    segments.push({ start: path[index - 1], end: path[index], distance });
    totalMeters += distance;
  }

  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return null;
  let remaining = totalMeters / 2;
  let position = path[0];
  for (const segment of segments) {
    if (remaining <= segment.distance) {
      const ratio = segment.distance > 0 ? remaining / segment.distance : 0.5;
      position = [
        segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
        segment.start[1] + (segment.end[1] - segment.start[1]) * ratio,
      ];
      break;
    }
    remaining -= segment.distance;
  }

  const sourceDistance = Number(drawing?.length);
  const baseDistance = Number.isFinite(sourceDistance) && sourceDistance > 0
    ? sourceDistance
    : totalMeters;
  const terrainDistance = Number(drawing?.terrainDistance);
  const hasTerrainDistance = drawing?.terrainMode === true
    && Number.isFinite(terrainDistance)
    && terrainDistance > 0;
  const displayedDistance = hasTerrainDistance ? terrainDistance : baseDistance;
  return {
    position,
    text: formatDrawingDistance(displayedDistance, hasTerrainDistance ? ' terrain' : ''),
  };
};

const getPredictionRenderLimit = (total) => {
  if (total > 300000) return 30000;
  if (total > 100000) return 50000;
  if (total > 50000) return 75000;
  return 100000;
};

const LAYER_ORDER = ['clutterTiles', 'grid', 'predictions', 'sites', 'sectors', 'insightMarkers', 'l3Events', 'neighborLogs', 'primaryLogs', 'drawings'];

const getSquarePolygon = (lat, lng, sizeMeters) => {
  const halfSize = sizeMeters / 2;
  const latDelta = halfSize * metersToLatDeg;
  // Adjust longitude delta based on latitude
  const lngDelta = (halfSize * metersToLatDeg) / Math.cos((lat * Math.PI) / 180);

  return [
    [lng - lngDelta, lat + latDelta], // Top Left
    [lng + lngDelta, lat + latDelta], // Top Right
    [lng + lngDelta, lat - latDelta], // Bottom Right
    [lng - lngDelta, lat - latDelta], // Bottom Left
    [lng - lngDelta, lat + latDelta]  // Close the loop
  ];
};

const downsample = (rows, maxRows) => {
  if (!Array.isArray(rows) || rows.length <= maxRows) return rows;
  const step = Math.ceil(rows.length / maxRows);
  return rows.filter((_, index) => index % step === 0).slice(0, maxRows);
};

const normalizeMapBounds = (bounds) => {
  if (!bounds) return null;
  const northEast = bounds.getNorthEast?.();
  const southWest = bounds.getSouthWest?.();
  const north = Number(northEast?.lat?.());
  const east = Number(northEast?.lng?.());
  const south = Number(southWest?.lat?.());
  const west = Number(southWest?.lng?.());
  if (![north, east, south, west].every(Number.isFinite)) return null;

  const latPadding = Math.max(0.0005, Math.abs(north - south) * VIEWPORT_PADDING_RATIO);
  const lngPadding = Math.max(0.0005, Math.abs(east - west) * VIEWPORT_PADDING_RATIO);

  return {
    north: Math.min(90, north + latPadding),
    south: Math.max(-90, south - latPadding),
    east: Math.min(180, east + lngPadding),
    west: Math.max(-180, west - lngPadding),
  };
};

const DeckGLOverlay = ({
  onHover,
  map,
  showNumCells = false,
  showMetricLabels = false,
  selectedMetric = 'rsrp',
  locations = [],
  imageLogs = [],
  getColor,
  radius = 8,
  opacity = 0.8,
  selectedIndex = null,
  onClick,
  radiusMinPixels = 2,
  radiusMaxPixels = 40,
  showPrimaryLogs = true,
  neighbors = [],
  getNeighborColor,
  neighborSquareSize = 12,
  neighborOpacity = 0.7,
  onNeighborClick,
  onImageLogClick,
  showImageLogs = true,
  showNeighbors = true,
  pickable = true,
  autoHighlight = true,
  primaryRenderLimit = null,
  gridCells = [],
  showGrid = false,
  gridOpacity = 0.72,
  onGridHover,
  gridMinPixelSize = 5,
  drawingShapes = [],
  siteData = [],
  predictionGridData = [],
}) => {
  const { groups: registeredGroups, version: registryVersion } = useDeckLayerRegistry();
  const overlayRef = useRef(null);
  const [mapZoom, setMapZoom] = useState(null);
  const [viewportBounds, setViewportBounds] = useState(null);
  const [sampledPrimaryIndexes, setSampledPrimaryIndexes] = useState(() => new Uint32Array());
  const samplingWorkerRef = useRef(null);
  const workerCoordinatesRef = useRef(null);
  const samplingRequestRef = useRef(0);
  const predictionWorkerRef = useRef(null);
  const predictionRequestRef = useRef(0);
  const [visiblePredictionRows, setVisiblePredictionRows] = useState([]);
  const isCleanedUpRef = useRef(false);
  const attachedMapRef = useRef(null);
  const idleListenerRef = useRef(null);
  const attachTimerRef = useRef(null);
  const isValidMapInstance = useCallback((m) => {
    if (!m || !window.google?.maps) return false;
    if (typeof m.getDiv !== 'function') return false;
    return Boolean(m.getDiv());
  }, []);

  const canAttachOverlay = useCallback((m) => {
    if (!isValidMapInstance(m)) return false;
    if (typeof m.addListener !== 'function') return false;
    try {
      if (typeof m.getProjection === 'function' && !m.getProjection()) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }, [isValidMapInstance]);

  useEffect(() => {
    if (!isValidMapInstance(map)) return;

    isCleanedUpRef.current = false;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({ 
        interleaved: false,
        // Keep WebGL memory bounded. preserveDrawingBuffer causes large persistent buffers.
        glOptions: { preserveDrawingBuffer: false }
      });
    }

    const clearPendingAttach = () => {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      idleListenerRef.current = null;
      if (attachTimerRef.current) {
        window.clearTimeout(attachTimerRef.current);
      }
      attachTimerRef.current = null;
    };

    const attachOverlay = () => {
      if (!overlayRef.current || isCleanedUpRef.current) return;
      if (attachedMapRef.current === map) return;
      if (!canAttachOverlay(map)) return;
      try {
        overlayRef.current.setMap(map);
        attachedMapRef.current = map;
        clearPendingAttach();
      } catch (err) {
        console.warn("Could not attach DeckGL to map instance:", err);
      }
    };

    attachOverlay();

    // Map may exist but still be mid-initialization; retry after first idle tick.
    if (attachedMapRef.current !== map && typeof map.addListener === 'function') {
      idleListenerRef.current = map.addListener('idle', attachOverlay);
      attachTimerRef.current = window.setTimeout(attachOverlay, 150);
    }

    return () => {
      clearPendingAttach();
      if (overlayRef.current) {
        try {
          overlayRef.current.setProps({ layers: [] });
          if (attachedMapRef.current === map) {
            overlayRef.current.setMap(null);
          }
        } catch (e) {
          // ignore detach errors during fast remount/unmount
        }
      }
      if (attachedMapRef.current === map) {
        attachedMapRef.current = null;
      }
    };
  }, [map, isValidMapInstance, canAttachOverlay]);

  const updateMapViewport = useCallback(() => {
    if (!isValidMapInstance(map)) return;
    setMapZoom(map.getZoom());
    setViewportBounds(normalizeMapBounds(map.getBounds?.()));
  }, [map, isValidMapInstance]);

  useEffect(() => {
    if (!isValidMapInstance(map) || typeof map.addListener !== 'function') return;
    updateMapViewport();
    const zoomListener = map.addListener('zoom_changed', updateMapViewport);
    const idleListener = map.addListener('idle', updateMapViewport);
    const dragListener = map.addListener('dragend', updateMapViewport);
    return () => {
      if (window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(zoomListener);
        window.google.maps.event.removeListener(idleListener);
        window.google.maps.event.removeListener(dragListener);
      }
    };
  }, [map, isValidMapInstance, updateMapViewport]);

  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined;

    const worker = new Worker(
      new URL('../../workers/logSpatialSampling.worker.js', import.meta.url),
      { type: 'module' },
    );
    samplingWorkerRef.current = worker;
    workerCoordinatesRef.current = null;

    worker.onmessage = ({ data }) => {
      if (data.requestId !== samplingRequestRef.current) return;
      if (data.error) {
        console.warn('[UnifiedMapView] Log sampling worker failed:', data.error);
        return;
      }
      setSampledPrimaryIndexes(new Uint32Array(data.indexesBuffer));
    };

    worker.onerror = (error) => {
      console.warn('[UnifiedMapView] Log sampling worker error:', error.message);
    };

    return () => {
      worker.terminate();
      if (samplingWorkerRef.current === worker) samplingWorkerRef.current = null;
    };
  }, []);

  const samplingCoordinates = useMemo(() => {
    const coordinates = new Float64Array(locations.length * 2);
    locations.forEach((loc, index) => {
      coordinates[index * 2] = Number(loc?.lng ?? loc?.longitude ?? loc?.lon ?? loc?.Lng);
      coordinates[index * 2 + 1] = Number(loc?.lat ?? loc?.latitude ?? loc?.Lat);
    });
    return coordinates;
  }, [locations]);

  useEffect(() => {
    const requestId = samplingRequestRef.current + 1;
    samplingRequestRef.current = requestId;

    if (!showPrimaryLogs || !locations?.length) {
      setSampledPrimaryIndexes(new Uint32Array());
      return;
    }

    const options = {
      requestId,
      totalLogs: locations.length,
      bounds: viewportBounds,
      zoom: mapZoom,
      cellPixels: LOG_SAMPLE_CELL_PIXELS,
      selectedIndex: Number.isInteger(selectedIndex) ? selectedIndex : -1,
      maxRows: Number.isFinite(primaryRenderLimit) ? primaryRenderLimit : null,
    };
    const worker = samplingWorkerRef.current;

    if (worker) {
      // Transfer coordinates once per dataset; viewport updates reuse the
      // worker's copy instead of rebuilding and transferring every log.
      if (workerCoordinatesRef.current !== samplingCoordinates) {
        const buffer = samplingCoordinates.slice().buffer;
        worker.postMessage({ ...options, coordinatesBuffer: buffer }, [buffer]);
        workerCoordinatesRef.current = samplingCoordinates;
      } else {
        worker.postMessage(options);
      }
      return;
    }

    // Older browsers without Worker support retain the same behavior.
    setSampledPrimaryIndexes(sampleLogIndices({ ...options, coordinates: samplingCoordinates }));
  }, [locations, samplingCoordinates, showPrimaryLogs, viewportBounds, mapZoom, selectedIndex, primaryRenderLimit]);

  const handlePrimaryClick = useCallback((info) => {
    if (!onClick || !info?.object) return;
    onClick(info.object.index, info.object.source ?? info.object);
  }, [onClick]);

  const handleNeighborClick = useCallback((info) => {
    if (!onNeighborClick || !info?.object) return;
    onNeighborClick(info.object.source ?? info.object);
  }, [onNeighborClick]);

  const handleImageLogClick = useCallback((info) => {
    if (!onImageLogClick || !info?.object) return;
    onImageLogClick(info.object.source ?? info.object);
  }, [onImageLogClick]);

  const handlePrimaryHover = useCallback((info) => {
    if (!onHover) return;
    if (info?.object?.source) {
      onHover({ ...info, object: info.object.source });
      return;
    }
    onHover(info);
  }, [onHover]);

  const handleGridHover = useCallback((info) => {
    if (!onGridHover) return;
    if (info?.object?.source) {
      onGridHover({ cell: info.object.source, x: info.x, y: info.y });
    } else {
      onGridHover(null);
    }
  }, [onGridHover]);

  const primaryData = useMemo(() => {
    if (!showPrimaryLogs || !locations?.length) return [];
    return Array.from(sampledPrimaryIndexes, (idx) => {
      const loc = locations[idx];
      if (!loc) return null;
      const position = [
        Number(loc.lng ?? loc.longitude ?? loc.lon ?? loc.Lng),
        Number(loc.lat ?? loc.latitude ?? loc.Lat),
      ];
      if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return null;
      return {
        index: idx,
        source: loc,
        position,
        computedColor: withAlpha(
          getColor ? parseColorToRGB(getColor(loc)) : [16, 185, 129, 200],
          getLegendAlpha(loc, 220),
        ),
      };
    })
      .filter(Boolean);
  }, [locations, showPrimaryLogs, getColor, sampledPrimaryIndexes]);

  const gridData = useMemo(() => {
    if (!showGrid || !gridCells?.length) return [];
    // Cells keep their real-world (e.g. 25m) size at close zoom. Once that size
    // would render under `gridMinPixelSize` on screen, we inflate the drawn
    // polygon (visual only — cell.bounds/aggregation/data stay untouched) so the
    // grid stays visible and clickable when zoomed out over a large project.
    const zoom = Number.isFinite(mapZoom) ? mapZoom : 14;
    return gridCells.map((cell, idx) => {
      const b = cell.bounds || {};
      const rgb = parseColorToRGB(cell.fillColor);
      // Populated cells solid, empty cells faint (mirrors previous RectangleF opacity).
      const alpha = cell.count > 0 ? getLegendAlpha(cell, 255, 55) : 60;

      const centerLat = (b.north + b.south) / 2;
      const centerLng = (b.east + b.west) / 2;
      const halfLatDeg = (b.north - b.south) / 2;
      const halfLngDeg = (b.east - b.west) / 2;

      const metersPerPixel =
        (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, zoom);
      const minHalfSizeMeters = (gridMinPixelSize / 2) * metersPerPixel;
      const minHalfLatDeg = minHalfSizeMeters * metersToLatDeg;
      const minHalfLngDeg = minHalfLatDeg / Math.cos((centerLat * Math.PI) / 180);

      const drawHalfLatDeg = Math.max(halfLatDeg, minHalfLatDeg);
      const drawHalfLngDeg = Math.max(halfLngDeg, minHalfLngDeg);
      const south = centerLat - drawHalfLatDeg;
      const north = centerLat + drawHalfLatDeg;
      const west = centerLng - drawHalfLngDeg;
      const east = centerLng + drawHalfLngDeg;

      return {
        index: idx,
        source: cell,
        polygon: [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
        fillColor: [rgb[0], rgb[1], rgb[2], alpha],
      };
    });
  }, [gridCells, showGrid, mapZoom, gridMinPixelSize]);

  const neighborData = useMemo(() => {
    if (!showNeighbors || !neighbors?.length) return [];
    const sampled = downsample(neighbors, getNeighborRenderLimit(neighbors.length));
    return sampled.map((n, idx) => ({
      index: idx,
      source: n,
      polygon: getSquarePolygon(n.lat, n.lng, neighborSquareSize),
      // ✅ Use new robust parser
      computedColor: withAlpha(
        getNeighborColor ? parseColorToRGB(getNeighborColor(n)) : [139, 92, 246, 180],
        getLegendAlpha(n, 190, 45),
      ),
    }));
  }, [neighbors, showNeighbors, neighborSquareSize, getNeighborColor]);

  const imageLogData = useMemo(() => {
    if (!showImageLogs || !imageLogs?.length) return [];

    const sampled = downsample(imageLogs, getImageRenderLimit(imageLogs.length));

    return sampled
      .map((log, idx) => {
        const lat = Number(log?.lat ?? log?.latitude ?? log?.Lat);
        const lng = Number(log?.lng ?? log?.longitude ?? log?.lon ?? log?.Lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return {
          index: idx,
          source: log,
          position: [lng, lat],
        };
      })
      .filter(Boolean);
  }, [imageLogs, showImageLogs]);

  const drawingData = useMemo(
    () => (drawingShapes || [])
      .map((drawing) => ({
        id: drawing?.id,
        type: drawing?.type,
        path: getDrawingPath(drawing),
      }))
      .filter((drawing) => drawing.path.length >= 2 && drawing.path.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))),
    [drawingShapes],
  );

  const drawingMeasurementData = useMemo(
    () => (drawingShapes || [])
      .map((drawing) => {
        const measurement = getDrawingMeasurement(drawing);
        return measurement
          ? { id: `${drawing?.id || drawing?.type || 'drawing'}-measurement`, ...measurement }
          : null;
      })
      .filter(Boolean),
    [drawingShapes],
  );

  const siteRenderData = useMemo(
    () => (siteData || []).map((site, index) => {
      const lat = Number(site?.lat ?? site?.latitude);
      const lng = Number(site?.lng ?? site?.longitude ?? site?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng)
        ? { index, source: site, position: [lng, lat] }
        : null;
    }).filter(Boolean),
    [siteData],
  );

  const predictionRenderData = useMemo(
    () => visiblePredictionRows.map((row, index) => {
      const bounds = row?.bounds;
      if (!bounds) return null;
      const rgb = parseColorToRGB(row?.fillColor || row?.color || '#8b5cf6');
      return {
        index,
        source: row,
        polygon: [
          [bounds.west, bounds.south],
          [bounds.east, bounds.south],
          [bounds.east, bounds.north],
          [bounds.west, bounds.north],
          [bounds.west, bounds.south],
        ],
        fillColor: [rgb[0], rgb[1], rgb[2], row?.fillOpacity ?? 140],
      };
    }).filter(Boolean),
    [visiblePredictionRows],
  );

  const metricLabelData = useMemo(() => {
    if (!showPrimaryLogs || !showMetricLabels || !primaryData.length) return [];
    const metricConfig = getMetricConfig(selectedMetric);
    const metricKey = String(metricConfig?.key || '').toLowerCase();

    return primaryData
      .map((d) => {
        let labelText = '';

        if (metricKey === 'nodebid') {
          labelText = pickFirstNonEmpty(d.source, [
            'nodebid',
            'nodeb_id',
            'node_b_id',
            'nodebId',
            'NodeBId',
            'NodeBID',
            'node_id',
            'nodeId',
            'eNodeB',
            'enodeb',
            'gNodeB',
            'gnodeb',
          ]);
          if (!labelText) return null;
        } else {
          const rawValue = getMetricValueFromLog(d.source, selectedMetric);
          if (!Number.isFinite(rawValue)) return null;

          if (metricKey === 'pci' || metricKey === 'tac') {
            labelText = `${Math.round(rawValue)}`;
          } else {
            labelText = `${rawValue.toFixed(1)}`;
          }
        }

        return {
          ...d,
          metricLabel: labelText,
        };
      })
      .filter(Boolean);
  }, [showPrimaryLogs, showMetricLabels, primaryData, selectedMetric]);

  useEffect(() => {
    if (!overlayRef.current || !isValidMapInstance(map)) return;
    if (attachedMapRef.current !== map) return;

    const layers = [];

    if (showGrid && gridData.length > 0) {
      layers.push(new PolygonLayer({
        id: 'grid-cells-layer',
        data: gridData,
        getPolygon: d => d.polygon,
        getFillColor: d => d.fillColor,
        getLineColor: [255, 255, 255, 0],
        getLineWidth: 0,
        lineWidthMinPixels: 0,
        filled: true,
        stroked: false,
        extruded: false,
        opacity: gridOpacity,
        pickable,
        autoHighlight,
        onHover: handleGridHover,
      }));
    }

    if (!registeredGroups.get('predictions')?.length && predictionRenderData.length > 0) {
      layers.push(new PolygonLayer({
        id: 'prediction-grid-layer',
        data: predictionRenderData,
        getPolygon: (row) => row.polygon,
        getFillColor: (row) => row.fillColor,
        getLineColor: [139, 92, 246, 170],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        filled: true,
        stroked: true,
        pickable: Boolean(pickable && Number(mapZoom) >= 13),
        autoHighlight,
        onHover: handlePrimaryHover,
      }));
    }

    if (!registeredGroups.get('sites')?.length && siteRenderData.length > 0) {
      layers.push(new ScatterplotLayer({
        id: 'sites-layer',
        data: siteRenderData,
        getPosition: (site) => site.position,
        getFillColor: [147, 51, 234, 230],
        getLineColor: [255, 255, 255, 255],
        getLineWidth: 1,
        stroked: true,
        getRadius: 7,
        radiusUnits: 'pixels',
        radiusMinPixels: 4,
        radiusMaxPixels: 14,
        pickable,
        autoHighlight,
        onHover: handlePrimaryHover,
      }));
    }

    if (showNeighbors && neighborData.length > 0) {
      layers.push(new PolygonLayer({
        id: 'neighbor-logs-layer',
        data: neighborData,
        getPolygon: d => d.polygon,
        getFillColor: d => d.computedColor, // ✅ Use pre-computed color
        getLineColor: d => [d.computedColor[0], d.computedColor[1], d.computedColor[2], 220],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        filled: true,
        stroked: true,
        extruded: true,
        getElevation: 5,
        opacity: neighborOpacity,
        pickable,
        autoHighlight,
        onClick: handleNeighborClick,
      }));
    }

    if (showPrimaryLogs && primaryData.length > 0) {
      layers.push(new ScatterplotLayer({
        id: 'primary-logs-layer',
        data: primaryData,
        getPosition: d => d.position,
        getFillColor: d => d.computedColor,
        getLineColor: [255, 255, 255, 70],
        getLineWidth: 0,
        lineWidthMinPixels: 0,
        stroked: true,
        getRadius: d => {
          return d.index === selectedIndex ? radius * 1.5 : radius;
        },
        radiusUnits: 'pixels',
        radiusMinPixels,
        radiusMaxPixels,
        opacity,
        pickable,
        autoHighlight,
        onHover: handlePrimaryHover,
        onClick: handlePrimaryClick,
        updateTriggers: {
          getFillColor: [getColor],
          getRadius: [selectedIndex, radius],
        },
      }));

      if (showNumCells) {
        layers.push(new TextLayer({
          id: 'primary-logs-text-layer',
          data: primaryData,
          getPosition: d => d.position,
          getText: d => d.source?.num_cells ? String(d.source.num_cells) : '',
          getSize: 14,
          getColor: [0, 0, 0, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          background: true,
          getBackgroundColor: [255, 255, 255, 200],
        }));
      }

      if (showMetricLabels && metricLabelData.length > 0) {
        layers.push(new TextLayer({
          id: 'primary-logs-metric-label-layer',
          data: metricLabelData,
          getPosition: d => d.position,
          getText: d => d.metricLabel,
          getSize: 12,
          getColor: [0, 0, 0, 255],
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          getPixelOffset: [10, 0],
          background: false,
          pickable: false,
        }));
      }

    }

    if (showImageLogs && imageLogData.length > 0) {
      layers.push(new TextLayer({
        id: 'image-log-icons-layer',
        data: imageLogData,
        getPosition: d => d.position,
        getText: () => '📷',
        getSize: 16,
        sizeUnits: 'pixels',
        getColor: [255, 255, 255, 255],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        background: true,
        getBackgroundColor: [17, 24, 39, 230],
        backgroundPadding: [6, 4],
        pickable,
        autoHighlight,
        onClick: handleImageLogClick,
      }));
    }

    // User drawings must be in the same DeckGL stack as the logs. Native
    // Google Maps zIndex cannot move a shape above this WebGL canvas.
    if (drawingData.length > 0) {
      const areaDrawings = drawingData.filter((drawing) => drawing.type !== 'polyline');
      if (areaDrawings.length > 0) {
        layers.push(new PolygonLayer({
          id: 'user-drawings-fill-layer',
          data: areaDrawings,
          getPolygon: (drawing) => drawing.path,
          getFillColor: [37, 99, 235, 35],
          getLineColor: [37, 99, 235, 255],
          getLineWidth: 3,
          lineWidthMinPixels: 2,
          filled: true,
          stroked: true,
          pickable: false,
          parameters: { depthTest: false },
        }));
      }

      layers.push(new PathLayer({
        id: 'user-drawings-line-layer',
        data: drawingData,
        getPath: (drawing) => drawing.path,
        getColor: (drawing) => drawing.type === 'polyline'
          ? [234, 88, 12, 255]
          : [37, 99, 235, 255],
        getWidth: 4,
        widthUnits: 'pixels',
        widthMinPixels: 3,
        rounded: true,
        pickable: false,
        parameters: { depthTest: false },
      }));

      if (drawingMeasurementData.length > 0) {
        layers.push(new TextLayer({
          id: 'user-drawings-measurement-label-layer',
          data: drawingMeasurementData,
          getPosition: (measurement) => measurement.position,
          getText: (measurement) => measurement.text,
          getSize: 13,
          sizeUnits: 'pixels',
          getColor: [15, 23, 42, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          background: true,
          getBackgroundColor: [255, 255, 255, 245],
          backgroundPadding: [6, 3],
          billboard: true,
          pickable: false,
          parameters: { depthTest: false },
        }));
      }
    }

    registeredGroups.forEach((groupLayers) => {
      layers.push(...groupLayers);
    });

    try {
      const layerPriority = new Map(LAYER_ORDER.map((name, index) => [name, index]));
      const warnedFallbackIds = new Set();
      const layerGroup = (id) => {
        const normalizedId = typeof id === 'string' ? id : '';
        if (normalizedId.startsWith('grid-') || normalizedId === 'grid-cells-layer') return 'grid';
        if (normalizedId.startsWith('project-clutter-')) return 'clutterTiles';
        if (normalizedId.startsWith('prediction-') || normalizedId.startsWith('lte-prediction-')) return 'predictions';
        if (normalizedId.startsWith('sites-') || normalizedId === 'sites-layer') return 'sites';
        if (normalizedId.startsWith('network-sector-') || normalizedId.startsWith('network-site-')) return 'sectors';
        if (normalizedId.startsWith('unified-map-insight-')) return 'insightMarkers';
        if (normalizedId.startsWith('l3-events-')) return 'l3Events';
        if (normalizedId.startsWith('neighbor-')) return 'neighborLogs';
        if (normalizedId.startsWith('primary-') || normalizedId === 'image-log-icons-layer') return 'primaryLogs';
        if (normalizedId.startsWith('user-drawings-')) return 'drawings';

        const warningKey = normalizedId || '<missing-id>';
        if (import.meta.env?.DEV && !warnedFallbackIds.has(warningKey)) {
          warnedFallbackIds.add(warningKey);
          console.warn(`[DeckGLOverlay] Unmapped layer id "${warningKey}"; defaulting to primaryLogs.`);
        }
        return 'primaryLogs';
      };

      layers.sort((a, b) =>
        (layerPriority.get(layerGroup(a?.id)) ?? 0) -
        (layerPriority.get(layerGroup(b?.id)) ?? 0),
      );
      overlayRef.current.setProps({ layers });
    } catch (e) {
      // Overlay can detach during map teardown; skip this update.
    }
  }, [map, primaryData, neighborData, gridData, imageLogData, metricLabelData, drawingData, drawingMeasurementData, predictionRenderData, siteRenderData, registeredGroups, registryVersion, showPrimaryLogs, showNeighbors, showGrid, gridOpacity, handleGridHover, showImageLogs, selectedIndex, radius, radiusMinPixels, radiusMaxPixels, opacity, neighborOpacity, showNumCells, showMetricLabels, getColor, getNeighborColor, handleImageLogClick, handlePrimaryHover, isValidMapInstance, pickable, autoHighlight, mapZoom]);

  useEffect(() => {
    return () => {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      idleListenerRef.current = null;
      if (attachTimerRef.current) {
        window.clearTimeout(attachTimerRef.current);
      }
      attachTimerRef.current = null;
      if (!overlayRef.current || isCleanedUpRef.current) return;
      try {
        overlayRef.current.setProps({ layers: [] });
        if (attachedMapRef.current) {
          overlayRef.current.setMap(null);
        }
        overlayRef.current.finalize();
      } catch (e) {
        // ignore cleanup errors
      }
      overlayRef.current = null;
      attachedMapRef.current = null;
      isCleanedUpRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined;
    const worker = new Worker(new URL('../../workers/predictionGridViewport.worker.js', import.meta.url), { type: 'module' });
    predictionWorkerRef.current = worker;
    worker.onmessage = ({ data }) => {
      if (data.requestId !== predictionRequestRef.current) return;
      if (data.error) {
        console.warn('[UnifiedMapView] Prediction grid worker failed:', data.error);
        return;
      }
      setVisiblePredictionRows(Array.isArray(data.rows) ? data.rows : []);
    };
    worker.onerror = (error) => console.warn('[UnifiedMapView] Prediction grid worker error:', error.message);
    return () => {
      worker.terminate();
      if (predictionWorkerRef.current === worker) predictionWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const requestId = predictionRequestRef.current + 1;
    predictionRequestRef.current = requestId;
    if (!predictionGridData?.length) {
      setVisiblePredictionRows([]);
      return;
    }
    const payload = {
      requestId,
      rows: predictionGridData,
      bounds: viewportBounds,
      zoom: mapZoom,
      maxRows: getPredictionRenderLimit(predictionGridData.length),
    };
    if (predictionWorkerRef.current) {
      predictionWorkerRef.current.postMessage(payload);
      return;
    }
    const visible = predictionGridData.filter((row) => {
      const lat = Number(row?.lat ?? row?.latitude);
      const lng = Number(row?.lng ?? row?.longitude ?? row?.lon);
      return !viewportBounds || (lat >= viewportBounds.south && lat <= viewportBounds.north && lng >= viewportBounds.west && lng <= viewportBounds.east);
    });
    setVisiblePredictionRows(visible.slice(0, getPredictionRenderLimit(visible.length)));
  }, [predictionGridData, viewportBounds, mapZoom]);

  return null;
};

export default React.memo(DeckGLOverlay);
