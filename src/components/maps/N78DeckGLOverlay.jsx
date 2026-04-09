// src/components/maps/N78DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PolygonLayer } from '@deck.gl/layers';
import { 
  getLogColor, 
  normalizeProviderName, 
  normalizeTechName, 
  normalizeBandName,
  COLOR_SCHEMES,
  getProviderColor,
  getTechnologyColor,
  getBandColor
} from '@/utils/colorUtils';

// Generate square polygon coordinates around a point
// Reduced default size from 20 to 12 meters
const getSquarePolygon = (lat, lng, sizeMeters = 12) => {
  const earthRadius = 6378137;
  const dLat = (sizeMeters / earthRadius) * (180 / Math.PI);
  const dLng = (sizeMeters / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
  
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
};

// Convert hex color to RGBA array
const hexToRgba = (hex, alpha = 255) => {
  if (!hex || typeof hex !== 'string') return [156, 163, 175, alpha];
  
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return [156, 163, 175, alpha];
  
  let r, g, b;
  
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }
  
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [156, 163, 175, alpha];
  
  return [r, g, b, alpha];
};

// Fallback color function when no thresholds (for RSRP metric)
const getFallbackRsrpColor = (value, opacity = 200) => {
  if (value == null || isNaN(value)) return [156, 163, 175, opacity]; // Gray
  if (value >= -80) return [16, 185, 129, opacity];   // Green - Excellent
  if (value >= -90) return [52, 211, 153, opacity];   // Light Green - Good
  if (value >= -100) return [251, 191, 36, opacity];  // Yellow - Fair
  if (value >= -110) return [249, 115, 22, opacity];  // Orange - Poor
  return [239, 68, 68, opacity];                       // Red - Very Poor
};

// Get color from thresholds (same logic as primary logs)
const getColorFromThresholds = (value, thresholds, opacity = 200) => {
  if (value == null || isNaN(value)) return [156, 163, 175, opacity];
  
  if (!thresholds?.length) {
    return getFallbackRsrpColor(value, opacity);
  }
  
  const sorted = [...thresholds]
    .filter(t => t.min != null && t.max != null)
    .sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
  
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const min = parseFloat(t.min);
    const max = parseFloat(t.max);
    const isLast = i === sorted.length - 1;
    
    if (value >= min && (isLast ? value <= max : value < max)) {
      return hexToRgba(t.color, opacity);
    }
  }
  
  // Out of range - use first or last color
  if (sorted.length > 0) {
    if (value < parseFloat(sorted[0].min)) {
      return hexToRgba(sorted[0].color, opacity);
    }
    if (value > parseFloat(sorted[sorted.length - 1].max)) {
      return hexToRgba(sorted[sorted.length - 1].color, opacity);
    }
  }
  
  return getFallbackRsrpColor(value, opacity);
};

// Get color by category (provider, technology, band) using colorUtils
const getColorByCategory = (data, colorBy, opacity = 200) => {
  const defaultColor = [168, 166, 162, opacity]; // #a8a6a2
  
  if (!colorBy || !data) return defaultColor;
  
  let value = null;
  let hexColor = null;
  
  const mode = String(colorBy).toLowerCase();
  
  if (mode.includes('provider') || mode.includes('operator')) {
    // Use provider from N78 data
    value = data.provider || data.Provider || data.operator;
    if (value) {
      const normalized = normalizeProviderName(value);
      hexColor = COLOR_SCHEMES.provider[normalized] || getProviderColor(value);
    }
  } else if (mode.includes('tech') || mode.includes('network') || mode.includes('rat')) {
    // Use primary network type
    value = data.network || data.networkType || data.technology || data.primary_network;
    if (value) {
      const normalized = normalizeTechName(value, data.primaryBand || data.neighborBand);
      hexColor = COLOR_SCHEMES.technology[normalized] || getTechnologyColor(value);
    }
  } else if (mode.includes('band')) {
    // Use neighbor band (n78) or primary band
    value = data.neighborBand || data.primaryBand || data.band;
    if (value) {
      const normalized = normalizeBandName(value);
      hexColor = COLOR_SCHEMES.band[normalized] || COLOR_SCHEMES.band[value] || getBandColor(value);
    }
  }
  
  if (hexColor) {
    return hexToRgba(hexColor, opacity);
  }
  
  return defaultColor;
};

const N78DeckGLOverlay = React.memo(({
  map,
  neighborData = [],
  sizeMeters = 12,        // Reduced default size
  opacity = 0.8,
  selectedMetric = 'rsrp',
  colorBy = null,          // NEW: Support for colorBy (provider, technology, band)
  thresholds = {},
  selectedIndex = null,
  onClick,
  visible = true,
}) => {
  const overlayRef = useRef(null);
  const isCleanedUpRef = useRef(false);
  const isValidMapInstance = useCallback((m) => {
    if (!m || !window.google?.maps) return false;
    if (typeof m.getDiv !== 'function') return false;
    return Boolean(m.getDiv());
  }, []);

  // Get the correct threshold key
  const getThresholdKey = useCallback((metric) => {
    const mapping = {
      rsrp: 'rsrp',
      rsrq: 'rsrq',
      sinr: 'sinr',
      dl_tpt: 'dl_thpt',
      ul_tpt: 'ul_thpt',
      mos: 'mos',
      neighborRsrp: 'rsrp',
      neighborRsrq: 'rsrq',
    };
    return mapping[metric] || metric;
  }, []);

  // Get current thresholds for the metric
  const currentThresholds = useMemo(() => {
    const key = getThresholdKey(selectedMetric);
    return thresholds[key] || [];
  }, [thresholds, selectedMetric, getThresholdKey]);

  // Check if using categorical coloring
  const useCategoricalColor = useMemo(() => {
    if (!colorBy) return false;
    const mode = String(colorBy).toLowerCase();
    return mode.includes('provider') || 
           mode.includes('operator') || 
           mode.includes('tech') || 
           mode.includes('network') ||
           mode.includes('band');
  }, [colorBy]);

  // Process neighbor data with square polygons
  const processedData = useMemo(() => {
    if (!neighborData?.length || !visible) return [];
    
    return neighborData
      .filter(n => {
        const lat = n.lat ?? n.latitude;
        const lng = n.lng ?? n.longitude ?? n.lon;
        return (
          typeof lat === 'number' && 
          typeof lng === 'number' &&
          !isNaN(lat) && 
          !isNaN(lng) &&
          lat >= -90 && lat <= 90 &&
          lng >= -180 && lng <= 180
        );
      })
      .map((n, index) => {
        const lat = n.lat ?? n.latitude;
        const lng = n.lng ?? n.longitude ?? n.lon;
        
        // Get the metric value based on selected metric
        let metricValue;
        if (selectedMetric === 'neighborRsrp' || selectedMetric === 'rsrp') {
          metricValue = n.neighborRsrp ?? n.rsrp;
        } else if (selectedMetric === 'neighborRsrq' || selectedMetric === 'rsrq') {
          metricValue = n.neighborRsrq ?? n.rsrq;
        } else if (selectedMetric === 'sinr') {
          metricValue = n.sinr ?? n.primary_sinr;
        } else if (selectedMetric === 'mos') {
          metricValue = n.mos;
        } else {
          metricValue = n[selectedMetric] ?? n.neighborRsrp;
        }
        
        return {
          ...n,
          index,
          lat,
          lng,
          polygon: getSquarePolygon(lat, lng, sizeMeters),
          metricValue,
          // Pre-compute normalized values for categorical coloring
          normalizedProvider: normalizeProviderName(n.provider),
          normalizedTech: normalizeTechName(n.network || n.networkType, n.neighborBand),
          normalizedBand: normalizeBandName(n.neighborBand || n.primaryBand),
        };
      });
  }, [neighborData, sizeMeters, visible, selectedMetric]);

  // Get color - supports both metric-based and categorical coloring
  const getColor = useCallback((d) => {
    const opacityValue = Math.round(opacity * 255);
    
    // Use categorical coloring if colorBy is set
    if (useCategoricalColor) {
      return getColorByCategory(d, colorBy, opacityValue);
    }
    
    // Otherwise use metric-based thresholds
    return getColorFromThresholds(d.metricValue, currentThresholds, opacityValue);
  }, [currentThresholds, opacity, colorBy, useCategoricalColor]);

  // Get line color (darker version of fill)
  const getLineColor = useCallback((d) => {
    const fillColor = getColor(d);
    return [
      Math.max(0, fillColor[0] - 50),
      Math.max(0, fillColor[1] - 50),
      Math.max(0, fillColor[2] - 50),
      255
    ];
  }, [getColor]);

  // Handle click
  const handleClick = useCallback((info) => {
    if (info.object && onClick) {
      onClick(info.object.index, info.object);
    }
  }, [onClick]);

  // Create and manage overlay
  useEffect(() => {
    if (!isValidMapInstance(map)) {
      return;
    }

    isCleanedUpRef.current = false;

    // Create overlay if doesn't exist
    if (!overlayRef.current) {
      try {
        overlayRef.current = new GoogleMapsOverlay({
          glOptions: { 
            preserveDrawingBuffer: true,
            antialias: true,
          },
        });
        overlayRef.current.setMap(map);
      } catch (error) {
        console.error('N78 DeckGL Overlay creation error:', error);
        return;
      }
    }

    // Update layers
    if (overlayRef.current && processedData.length > 0 && visible) {
      const layers = [
        new PolygonLayer({
          id: 'n78-neighbor-squares',
          data: processedData,
          getPolygon: d => d.polygon,
          getFillColor: getColor,
          getLineColor: getLineColor,
          getLineWidth: 0.5,              // Thinner lines
          lineWidthMinPixels: 0.5,        // Reduced min
          lineWidthMaxPixels: 1.5,        // Reduced max
          filled: true,
          stroked: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 150],
          onClick: handleClick,
          updateTriggers: {
            getFillColor: [selectedMetric, currentThresholds, opacity, colorBy],
            getLineColor: [selectedMetric, currentThresholds, colorBy],
          },
        }),
      ];

      try {
        overlayRef.current.setProps({ layers });
      } catch (error) {
        console.warn('N78 Layer update warning:', error);
      }
    } else if (overlayRef.current) {
      try {
        overlayRef.current.setProps({ layers: [] });
      } catch (error) {
        // Ignore
      }
    }

    return () => {
      // Cleanup handled in unmount effect
    };
  }, [map, processedData, getColor, getLineColor, handleClick, selectedMetric, currentThresholds, opacity, visible, colorBy, isValidMapInstance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current && !isCleanedUpRef.current) {
        try {
          overlayRef.current.setProps({ layers: [] });
          overlayRef.current.setMap(null);
          overlayRef.current.finalize();
        } catch (e) {
          // Ignore cleanup errors
        }
        overlayRef.current = null;
        isCleanedUpRef.current = true;
      }
    };
  }, []);

  return null;
});

N78DeckGLOverlay.displayName = 'N78DeckGLOverlay';

export default N78DeckGLOverlay;
