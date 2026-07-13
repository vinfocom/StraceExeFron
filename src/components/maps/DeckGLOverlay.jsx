// src/components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { ScatterplotLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import { getMetricConfig, getMetricValueFromLog } from '@/utils/metrics';

const pickFirstNonEmpty = (obj, keys = []) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const getPrimaryRenderLimit = (total) => {
  if (total > 120000) return 12000;
  if (total > 80000) return 15000;
  if (total > 50000) return 18000;
  return 30000;
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


const metersToLatDeg = 1 / 111320;

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
}) => {
  const overlayRef = useRef(null);
  const [mapZoom, setMapZoom] = useState(null);
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

  useEffect(() => {
    if (!isValidMapInstance(map) || typeof map.addListener !== 'function') return;
    setMapZoom(map.getZoom());
    const listener = map.addListener('zoom_changed', () => {
      setMapZoom(map.getZoom());
    });
    return () => {
      if (window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(listener);
      }
    };
  }, [map, isValidMapInstance]);

  const handlePrimaryClick = useCallback((info) => {
    if (!onClick || !info?.object) return;
    onClick(info.index, info.object.source ?? info.object);
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
    const renderLimit = Number.isFinite(primaryRenderLimit)
      ? primaryRenderLimit
      : getPrimaryRenderLimit(locations.length);
    const sampled = downsample(locations, renderLimit);
    return sampled.map((loc, idx) => ({
      index: idx,
      source: loc,
      position: [
        parseFloat(loc.lng ?? loc.longitude ?? loc.lon ?? loc.Lng ?? 0), 
        parseFloat(loc.lat ?? loc.latitude ?? loc.Lat ?? 0)
      ],
      computedColor: getColor ? parseColorToRGB(getColor(loc)) : [16, 185, 129, 200],
    }));
  }, [locations, showPrimaryLogs, getColor, primaryRenderLimit]);

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
      const alpha = cell.count > 0 ? 255 : 60;

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
      computedColor: getNeighborColor ? parseColorToRGB(getNeighborColor(n)) : [139, 92, 246, 180],
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
        getRadius: d => d.index === selectedIndex ? radius * 1.5 : radius,
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

    try {
      overlayRef.current.setProps({ layers });
    } catch (e) {
      // Overlay can detach during map teardown; skip this update.
    }
  }, [map, primaryData, neighborData, gridData, imageLogData, metricLabelData, showPrimaryLogs, showNeighbors, showGrid, gridOpacity, handleGridHover, showImageLogs, selectedIndex, radius, radiusMinPixels, radiusMaxPixels, opacity, neighborOpacity, showNumCells, showMetricLabels, getColor, getNeighborColor, handleImageLogClick, handlePrimaryHover, isValidMapInstance]);

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

  return null;
};

export default React.memo(DeckGLOverlay);
