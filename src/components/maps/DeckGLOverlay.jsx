// src/components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PathLayer, ScatterplotLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import { getMetricConfig, getMetricValueFromLog } from '@/utils/metrics';
import { sampleLogIndices } from '@/utils/logSpatialSampling';
import { useDeckLayerRegistry } from '@/components/maps/deckLayerRegistry.jsx';
import { assertCategorizedLayerEntries, categorizeMapLayer, getMapLayerMetadata, sortMapLayerEntries } from '@/components/maps/mapLayerPolicy.js';
import { getDrawingHoverTarget, getPolygonDrawingHitData, getPolylineDrawingHitData } from '@/components/maps/drawingShapeInteractions.js';

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
    const path = (geometry.polygon || []).map((point) => [Number(point.lng), Number(point.lat)]);
    if (path.length < 3 || String(drawing?.id).startsWith('active-')) return path;
    const first = path[0];
    const last = path[path.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? path : [...path, first];
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

const getPredictionRenderLimit = (total) => {
  if (total > 300000) return 30000;
  if (total > 100000) return 50000;
  if (total > 50000) return 75000;
  return 100000;
};

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
  onDrawingHover,
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
  onPrimaryTooltipClick,
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
  interactionsDisabled = false,
  autoHighlight = true,
  primaryRenderLimit = null,
  gridCells = [],
  showGrid = false,
  gridOpacity = 0.72,
  onGridHover,
  gridMinPixelSize = 5,
  drawingShapes = [],
  drawingOpacity = 0.8,
  nativeOutlinePaths = [],
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
        // Composite with Google's vector renderer so map DOM tooltips stay
        // above the WebGL log canvas.
        interleaved: true,
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
    if (!info?.object) {
      onPrimaryTooltipClick?.(null);
      return;
    }
    onClick?.(info.object.index, info.object.source ?? info.object);
    onPrimaryTooltipClick?.({ ...info, object: info.object.source ?? info.object });
  }, [onClick, onPrimaryTooltipClick]);

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

  const handleDrawingHover = useCallback((info) => {
    onDrawingHover?.(getDrawingHoverTarget(info));
  }, [onDrawingHover]);

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
  const drawingPolygonHitData = useMemo(
    () => getPolygonDrawingHitData(drawingData),
    [drawingData],
  );
  const drawingPolylineHitData = useMemo(
    () => getPolylineDrawingHitData(drawingData),
    [drawingData],
  );

  const nativeOutlineData = useMemo(() => (nativeOutlinePaths || [])
    .map((outline, index) => {
      const path = (outline.path || []).map((point) => [Number(point.lng), Number(point.lat)]);
      if (path.length < 3 || !path.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))) return null;
      const first = path[0];
      const last = path[path.length - 1];
      return {
        id: String(outline.id ?? outline.uid ?? `project-boundary-${index}`),
        path: first[0] === last[0] && first[1] === last[1] ? path : [...path, first],
        color: outline.fillColor || '#2563eb',
      };
    })
    .filter(Boolean), [nativeOutlinePaths]);

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
    const addLayer = (category, layer, order = 0) => layers.push(categorizeMapLayer(layer, category, order));

    if (showGrid && gridData.length > 0) {
      addLayer('predictions', new PolygonLayer({
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

    if (![...registeredGroups.values()].some((group) => group.category === 'predictions' && group.layers.length) && predictionRenderData.length > 0) {
      addLayer('predictions', new PolygonLayer({
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

    if (![...registeredGroups.values()].some((group) => group.category === 'sites' && group.layers.length) && siteRenderData.length > 0) {
      addLayer('sites', new ScatterplotLayer({
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
      addLayer('logs', new PolygonLayer({
        id: 'neighbor-logs-layer',
        data: neighborData,
        getPolygon: d => d.polygon,
        getFillColor: d => d.computedColor, // ✅ Use pre-computed color
        getLineColor: d => [d.computedColor[0], d.computedColor[1], d.computedColor[2], 220],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        filled: true,
        stroked: true,
        extruded: Number(map?.getTilt?.()) > 0,
        getElevation: Number(map?.getTilt?.()) > 0 ? 5 : 0,
        opacity: neighborOpacity,
        pickable,
        autoHighlight,
        onClick: handleNeighborClick,
      }));
    }

    if (showPrimaryLogs && primaryData.length > 0) {
      addLayer('logs', new ScatterplotLayer({
        id: 'primary-logs-layer',
        data: primaryData,
        getPosition: d => d.position,
        getFillColor: d => d.computedColor,
        getLineColor: [255, 255, 255, 70],
        getLineWidth: 0,
        lineWidthMinPixels: 0,
        stroked: true,
        getRadius: radius,
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
          getRadius: [radius],
        },
      }));

      const selectedLog = primaryData.find((log) => log.index === selectedIndex);
      if (selectedLog) {
        addLayer('logs', new ScatterplotLayer({
          id: 'primary-log-selection-halo',
          data: [selectedLog],
          getPosition: (log) => log.position,
          getRadius: Math.max(radius * 1.7, radius + 4),
          radiusUnits: 'pixels',
          radiusMinPixels: radiusMinPixels + 3,
          radiusMaxPixels: radiusMaxPixels + 6,
          filled: false,
          stroked: true,
          getLineColor: [250, 204, 21, 245],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 2,
          pickable: false,
          parameters: { depthTest: false },
        }), 10);
      }

      if (showNumCells) {
        addLayer('logs', new TextLayer({
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
        addLayer('logs', new TextLayer({
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
      addLayer('logs', new TextLayer({
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
      }), 5);
    }

    // User drawings must be in the same DeckGL stack as the logs. Native
    // Google Maps zIndex cannot move a shape above this WebGL canvas.
    if (drawingData.length > 0) {
      addLayer('drawings', new PathLayer({
        id: 'user-drawings-line-layer',
        data: drawingData,
        getPath: (drawing) => drawing.path,
        getColor: (drawing) => {
          const alpha = Math.round(255 * Math.max(0, Math.min(1, Number(drawingOpacity) || 0)));
          return drawing.type === 'polyline'
            ? [234, 88, 12, alpha]
            : [37, 99, 235, alpha];
        },
        getWidth: 2,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        rounded: true,
        pickable: false,
        parameters: { depthTest: false },
      }));

    }

    if (drawingPolygonHitData.length > 0) {
      // The shared drawings category paints above map data; this transparent
      // hit surface sits below the visible drawing outlines.
      addLayer('drawings', new PolygonLayer({
        id: 'user-drawing-polygon-hit-layer',
        data: drawingPolygonHitData,
        getPolygon: (drawing) => drawing.polygon,
        getFillColor: [0, 0, 0, 0],
        getLineColor: [0, 0, 0, 0],
        filled: true,
        stroked: false,
        opacity: 0,
        pickable: Boolean(pickable && !interactionsDisabled),
        onHover: handleDrawingHover,
      }), -100);
    }

    if (drawingPolylineHitData.length > 0) {
      addLayer('drawings', new PathLayer({
        id: 'user-drawing-polyline-hit-layer',
        data: drawingPolylineHitData,
        getPath: (drawing) => drawing.path,
        getColor: [0, 0, 0, 0],
        getWidth: 14,
        widthUnits: 'pixels',
        widthMinPixels: 14,
        rounded: true,
        opacity: 0,
        pickable: Boolean(pickable && !interactionsDisabled),
        onHover: handleDrawingHover,
      }), -101);
    }

    if (nativeOutlineData.length > 0) {
      addLayer('drawings', new PathLayer({
        id: 'project-boundary-outline-layer',
        data: nativeOutlineData,
        getPath: (outline) => outline.path,
        getColor: (outline) => {
          const rgb = parseColorToRGB(outline.color);
          return [rgb[0], rgb[1], rgb[2], Math.round(255 * Math.max(0, Math.min(1, Number(drawingOpacity) || 0)))];
        },
        getWidth: 2,
        widthUnits: 'pixels',
        widthMinPixels: 1,
        rounded: true,
        pickable: false,
      }));
    }

    const registeredMetadata = new Map();
    registeredGroups.forEach((group) => {
      group.layers.forEach((layer) => {
        layers.push(layer);
        registeredMetadata.set(layer, { category: group.category, order: group.order });
      });
    });

    try {
      const entries = layers.map((layer) => ({
        layer,
        ...(registeredMetadata.get(layer) || getMapLayerMetadata(layer) || {}),
      }));
      if (import.meta.env?.DEV) assertCategorizedLayerEntries(entries);
      const orderedLayers = sortMapLayerEntries(entries).map(({ layer }) => {
        // Flat maps use painter ordering; tilted maps retain depth testing.
        const cloneProps = interactionsDisabled ? { pickable: false } : {};
        if (Number(map?.getTilt?.()) > 0) return Object.keys(cloneProps).length ? layer.clone(cloneProps) : layer;
        return layer.clone({
          ...cloneProps,
          parameters: { ...(layer.props.parameters || {}), depthTest: false },
        });
      });
      overlayRef.current.setProps({ layers: orderedLayers });
    } catch (e) {
      // Overlay can detach during map teardown; skip this update.
    }
  }, [map, primaryData, neighborData, gridData, imageLogData, metricLabelData, drawingData, drawingPolygonHitData, drawingPolylineHitData, drawingOpacity, nativeOutlineData, predictionRenderData, siteRenderData, registeredGroups, registryVersion, showPrimaryLogs, showNeighbors, showGrid, gridOpacity, handleGridHover, handleDrawingHover, showImageLogs, selectedIndex, radius, radiusMinPixels, radiusMaxPixels, opacity, neighborOpacity, showNumCells, showMetricLabels, getColor, getNeighborColor, handleImageLogClick, handlePrimaryHover, isValidMapInstance, pickable, autoHighlight, mapZoom, interactionsDisabled]);

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
