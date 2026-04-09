// components/maps/DeckGLHeatmapOverlay.jsx
import React, { useEffect, useRef, useMemo } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';

const DeckGLHeatmapOverlay = ({
  map,
  locations,
  getWeight,
  intensity = 1,
  radiusPixels = 30,
  colorRange,
  threshold = 0.05,
}) => {
  const overlayRef = useRef(null);
  const isValidMapInstance = (m) => {
    if (!m || !window.google?.maps) return false;
    if (typeof m.getDiv !== 'function') return false;
    return Boolean(m.getDiv());
  };

  // Default color range (blue -> green -> yellow -> red)
  const defaultColorRange = [
    [65, 182, 196],
    [127, 205, 187],
    [199, 233, 180],
    [237, 248, 177],
    [255, 255, 204],
    [255, 237, 160],
    [254, 217, 118],
    [254, 178, 76],
    [253, 141, 60],
    [252, 78, 42],
    [227, 26, 28],
    [189, 0, 38],
  ];

  useEffect(() => {
    if (!isValidMapInstance(map)) return;

    const overlay = new GoogleMapsOverlay({ interleaved: true });
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  // Process data
  const heatmapData = useMemo(() => {
    if (!locations?.length) return [];
    
    return locations.map((loc, idx) => ({
      position: [loc.lng, loc.lat],
      weight: getWeight ? getWeight(loc) : 1,
    }));
  }, [locations, getWeight]);

  // Update layer
  useEffect(() => {
    if (!overlayRef.current) return;

    if (!heatmapData.length) {
      overlayRef.current.setProps({ layers: [] });
      return;
    }

    const layer = new HeatmapLayer({
      id: 'heatmap-layer',
      data: heatmapData,
      getPosition: d => d.position,
      getWeight: d => d.weight,
      aggregation: 'SUM',
      radiusPixels,
      intensity,
      threshold,
      colorRange: colorRange || defaultColorRange,
    });

    overlayRef.current.setProps({ layers: [layer] });
  }, [heatmapData, intensity, radiusPixels, colorRange, threshold]);

  return null;
};

export default React.memo(DeckGLHeatmapOverlay);
