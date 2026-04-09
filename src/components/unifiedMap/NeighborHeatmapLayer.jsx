// src/components/unifiedMap/NeighborHeatmapLayer.jsx
import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Rectangle, InfoWindow, useGoogleMap } from '@react-google-maps/api';

// Helper to get threshold value from array format
const getThresholdValue = (thresholdArray, index, defaultValue) => {
  if (!thresholdArray || !Array.isArray(thresholdArray) || thresholdArray.length === 0) {
    return defaultValue;
  }
  return thresholdArray[index] ?? defaultValue;
};

// Get color based on RSRP value and thresholds array
const getRSRPColor = (rsrp, thresholds = []) => {
  if (rsrp === null || rsrp === undefined) return '#9CA3AF';
  
  // thresholds array format: [excellent, good, fair, poor] e.g., [-80, -90, -100, -110]
  const excellent = getThresholdValue(thresholds, 0, -80);
  const good = getThresholdValue(thresholds, 1, -90);
  const fair = getThresholdValue(thresholds, 2, -100);
  const poor = getThresholdValue(thresholds, 3, -110);

  if (rsrp >= excellent) return '#10B981'; // Excellent - Green
  if (rsrp >= good) return '#34D399';      // Good - Light Green
  if (rsrp >= fair) return '#FBBF24';      // Fair - Yellow
  if (rsrp >= poor) return '#F97316';      // Poor - Orange
  return '#EF4444';                         // Very Poor - Red
};

const getRSRPQuality = (rsrp, thresholds = []) => {
  if (rsrp === null || rsrp === undefined) return 'Unknown';
  
  const excellent = getThresholdValue(thresholds, 0, -80);
  const good = getThresholdValue(thresholds, 1, -90);
  const fair = getThresholdValue(thresholds, 2, -100);
  const poor = getThresholdValue(thresholds, 3, -110);

  if (rsrp >= excellent) return 'Excellent';
  if (rsrp >= good) return 'Good';
  if (rsrp >= fair) return 'Fair';
  return 'Poor'; // If rsrp is below poor threshold
};

// Get color based on RSRQ value
const getRSRQColor = (rsrq, thresholds = []) => {
  if (rsrq === null || rsrq === undefined) return '#9CA3AF';
  
  const excellent = getThresholdValue(thresholds, 0, -10);
  const good = getThresholdValue(thresholds, 1, -15);
  const fair = getThresholdValue(thresholds, 2, -20);

  if (rsrq >= excellent) return '#10B981';
  if (rsrq >= good) return '#34D399';
  if (rsrq >= fair) return '#FBBF24';
  return '#EF4444';
};

// Get color based on SINR value
const getSINRColor = (sinr, thresholds = []) => {
  if (sinr === null || sinr === undefined) return '#9CA3AF';
  
  const excellent = getThresholdValue(thresholds, 0, 20);
  const good = getThresholdValue(thresholds, 1, 13);
  const fair = getThresholdValue(thresholds, 2, 0);

  if (sinr >= excellent) return '#10B981';
  if (sinr >= good) return '#34D399';
  if (sinr >= fair) return '#FBBF24';
  return '#EF4444';
};

// Get color based on selected metric
const getMetricColor = (value, metric, thresholds = {}) => {
  if (value === null || value === undefined) return '#9CA3AF';
  
  switch (metric) {
    case 'rsrp':
      return getRSRPColor(value, thresholds.rsrp);
    case 'rsrq':
      return getRSRQColor(value, thresholds.rsrq);
    case 'sinr':
      return getSINRColor(value, thresholds.sinr);
    default:
      return getRSRPColor(value, thresholds.rsrp);
  }
};

const PCI_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
  '#F43F5E', '#6366F1', '#14B8A6', '#F97316',
];

const getPCIColor = (pci) => {
  const index = Math.abs(parseInt(pci || 0)) % PCI_COLORS.length;
  return PCI_COLORS[index];
};

const getSquareBounds = (lat, lng, radiusMeters) => {
  const earthRadius = 6378137;
  const dLat = (radiusMeters / earthRadius) * (180 / Math.PI);
  const dLng = (radiusMeters / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lng + dLng,
    west: lng - dLng
  };
};

const NeighborHeatmapLayer = React.memo(({
  allNeighbors = [],
  showNeighbors = false,
  selectedMetric = 'rsrp',
  radius = 30,
  opacity = 0.7,
  useHeatmap = true,
  onNeighborClick,
  // Thresholds from parent (DEFAULT_THRESHOLDS format)
  thresholds = {
    rsrp: [],
    rsrq: [],
    sinr: [],
    dl_thpt: [],
    ul_thpt: [],
    mos: [],
    lte_bler: [],
  },
  debug = false,
}) => {
  const map = useGoogleMap();
  const heatmapRef = useRef(null);
  const isCleanedUpRef = useRef(false); // Tracks if the GM HeatmapLayer object has been cleaned up
  
  const [isVisualizationReady, setIsVisualizationReady] = useState(false);
  const [selectedNeighbor, setSelectedNeighbor] = useState(null);
  const [drawingStats, setDrawingStats] = useState({
    totalReceived: 0,
    validPoints: 0,
    drawnPoints: 0,
    isDrawing: false,
  });

  // Debug logger
  const logDebug = useCallback((message, data) => {
    if (debug) {
      console.log(`[NeighborHeatmapLayer] ${message}`, data);
    }
  }, [debug]);

  // Log on mount/update
  useEffect(() => {
    logDebug('Props received:', {
      showNeighbors,
      useHeatmap,
      totalNeighbors: allNeighbors?.length || 0,
      selectedMetric,
      radius,
      opacity,
      thresholds,
      hasMap: !!map,
      isVisualizationReady,
    });
  }, [showNeighbors, useHeatmap, allNeighbors?.length, selectedMetric, radius, opacity, thresholds, map, isVisualizationReady, logDebug]);

  // Check visualization library
  useEffect(() => {
    const checkVisualization = () => {
      if (window.google?.maps?.visualization) {
        setIsVisualizationReady(true);
        logDebug('Visualization library ready', true);
        return true;
      }
      return false;
    };

    if (checkVisualization()) return;

    const interval = setInterval(() => {
      if (checkVisualization()) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [logDebug]);

  // Process neighbors data
  const neighbors = useMemo(() => {
    logDebug('Processing neighbors:', {
      showNeighbors,
      rawDataLength: allNeighbors?.length || 0,
    });

    if (!showNeighbors || !allNeighbors?.length) {
      logDebug('No neighbors to process');
      // Update initial stats even if no data to process
      setDrawingStats(prev => ({
        ...prev,
        totalReceived: allNeighbors?.length || 0,
        validPoints: 0,
      }));
      return [];
    }

    const processed = allNeighbors
      .filter(n => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        const isValid = !isNaN(lat) && !isNaN(lng) && 
                        lat >= -90 && lat <= 90 && 
                        lng >= -180 && lng <= 180;
        
        if (!isValid && debug) {
          console.warn('[NeighborHeatmapLayer] Invalid coordinate:', { lat, lng, original: n });
        }
        
        return isValid;
      })
      .map((n) => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        
        // Handle both old and new data structure
        const primaryRsrp = n.primaryRsrp ?? n.primary_rsrp ?? n.rsrp;
        const primaryRsrq = n.primaryRsrq ?? n.primary_rsrq ?? n.rsrq;
        const primarySinr = n.primarySinr ?? n.primary_sinr ?? n.sinr;
        const neighbourRsrp = n.neighbourRsrp ?? n.neighbour_rsrp;
        const neighbourRsrq = n.neighbourRsrq ?? n.neighbour_rsrq;
        const pci = n.primaryPci ?? n.primary_pci ?? n.pci;
        const neighbourPci = n.neighbourPci ?? n.neighbour_pci;
        const band = n.primaryBand ?? n.primary_band ?? n.band;
        const neighbourBand = n.neighbourBand ?? n.neighbour_band;

        const rsrp = primaryRsrp !== null && primaryRsrp !== undefined 
          ? parseFloat(primaryRsrp) 
          : null;
        const rsrq = primaryRsrq !== null && primaryRsrq !== undefined
          ? parseFloat(primaryRsrq)
          : null;
        const sinr = primarySinr !== null && primarySinr !== undefined
          ? parseFloat(primarySinr)
          : null;

        // Get the metric value for coloring
        let metricValue = rsrp;
        if (selectedMetric === 'rsrq') metricValue = rsrq;
        if (selectedMetric === 'sinr') metricValue = sinr;
        
        return {
          ...n,
          lat,
          lng,
          // Primary cell metrics
          rsrp: isNaN(rsrp) ? null : rsrp,
          rsrq: isNaN(rsrq) ? null : rsrq,
          sinr: isNaN(sinr) ? null : sinr,
          pci,
          band,
          // Neighbour cell metrics
          neighbourRsrp: neighbourRsrp !== null ? parseFloat(neighbourRsrp) : null,
          neighbourRsrq: neighbourRsrq !== null ? parseFloat(neighbourRsrq) : null,
          neighbourPci,
          neighbourBand,
          // Colors based on thresholds and selected metric
          color: metricValue !== null 
            ? getMetricColor(metricValue, selectedMetric, thresholds) 
            : getPCIColor(pci),
          quality: rsrp !== null ? getRSRPQuality(rsrp, thresholds.rsrp) : null,
        };
      });

    logDebug('Processed neighbors:', {
      total: processed.length,
      sample: processed.slice(0, 3),
      withRsrp: processed.filter(n => n.rsrp !== null).length,
      withNeighbourData: processed.filter(n => n.neighbourRsrp !== null).length,
    });

    setDrawingStats(prev => ({
      ...prev,
      totalReceived: allNeighbors.length,
      validPoints: processed.length,
    }));

    return processed;
  }, [allNeighbors, showNeighbors, thresholds, selectedMetric, debug, logDebug]);

  const gradient = useMemo(() => [
    'rgba(0, 0, 0, 0)',
    'rgba(0, 255, 255, 0.3)',
    'rgba(0, 200, 255, 0.4)',
    'rgba(0, 150, 255, 0.5)',
    'rgba(0, 100, 255, 0.6)',
    'rgba(0, 50, 255, 0.65)',
    'rgba(50, 0, 255, 0.7)',
    'rgba(100, 0, 200, 0.75)',
    'rgba(150, 0, 150, 0.8)',
    'rgba(200, 0, 100, 0.85)',
    'rgba(255, 0, 50, 0.9)',
    'rgba(255, 0, 0, 1)',
  ], []);

  // Refactored cleanup function: only handles the Google Maps HeatmapLayer object
  const cleanupHeatmap = useCallback(() => {
    if (heatmapRef.current) {
      try {
        heatmapRef.current.setMap(null);
        heatmapRef.current.setData([]);
        logDebug('Heatmap Google Maps object cleaned up.');
      } catch (error) {
        console.warn('[NeighborHeatmapLayer] Heatmap cleanup warning:', error);
      }
      heatmapRef.current = null;
    }
    isCleanedUpRef.current = true; // Mark that the Google Maps HeatmapLayer object has been cleaned up
  }, [logDebug]);

  // Effect to manage drawingStats (drawnPoints, isDrawing) based on render mode
  useEffect(() => {
    if (!showNeighbors || neighbors.length === 0) {
      // If no neighbors or not shown, reset stats and cleanup heatmap
      setDrawingStats(prev => ({ ...prev, drawnPoints: 0, isDrawing: false }));
      cleanupHeatmap();
      return;
    }

    if (useHeatmap) {
      // For heatmap, the actual drawnPoints will be set by the heatmap creation effect
      // We set isDrawing to true here to indicate intent to draw a heatmap
      setDrawingStats(prev => ({
        ...prev,
        drawnPoints: 0, // Reset for now, heatmap effect will update with actual count
        isDrawing: true,
      }));
    } else {
      // For rectangles, all valid neighbors are drawn
      setDrawingStats(prev => ({
        ...prev,
        drawnPoints: neighbors.length,
        isDrawing: true,
      }));
      // If switching from heatmap to rectangles, ensure heatmap object is removed
      cleanupHeatmap();
    }
  }, [showNeighbors, useHeatmap, neighbors.length, cleanupHeatmap]);


  // Main heatmap creation/management effect
  useEffect(() => {
    isCleanedUpRef.current = false; // Reset the cleanup flag for this effect run

    // Conditions where heatmap should NOT be active
    if (!map || !isVisualizationReady || !useHeatmap || !showNeighbors || neighbors.length === 0) {
      // Clean up any existing heatmap object
      cleanupHeatmap();
      // No need to set drawingStats here; the other useEffect handles the general reset
      return;
    }

    // Create heatmap data with weights based on selected metric and thresholds
    const heatmapData = neighbors.map((n) => {
      let weight = 0.5;
      const value = n[selectedMetric];
      
      if (value !== null && value !== undefined && !isNaN(value)) {
        const metricThresholds = thresholds[selectedMetric] || [];
        
        if (selectedMetric === 'rsrp') {
          // RSRP: typically -140 to -40, higher is better
          // Use thresholds from settings if available, otherwise defaults
          const min = getThresholdValue(thresholds.rsrp, 3, -110);
          const max = getThresholdValue(thresholds.rsrp, 0, -80);
          weight = Math.max(0.1, Math.min(1, (value - min) / (max - min)));
        } else if (selectedMetric === 'rsrq') {
          // RSRQ: typically -20 to 0, higher is better
          const min = getThresholdValue(thresholds.rsrq, 2, -20);
          const max = getThresholdValue(thresholds.rsrq, 0, -10);
          weight = Math.max(0.1, Math.min(1, (value - min) / (max - min)));
        } else if (selectedMetric === 'sinr') {
          // SINR: typically -10 to 30, higher is better
          const min = getThresholdValue(thresholds.sinr, 2, 0);
          const max = getThresholdValue(thresholds.sinr, 0, 20);
          weight = Math.max(0.1, Math.min(1, (value - min) / (max - min)));
        }
      }

      return {
        location: new window.google.maps.LatLng(n.lat, n.lng),
        weight: weight,
      };
    });

    logDebug('Attempting to create heatmap with data:', {
      dataPoints: heatmapData.length,
      radius,
      opacity,
      selectedMetric,
      thresholdsUsed: thresholds[selectedMetric],
      sampleWeights: heatmapData.slice(0, 5).map(d => d.weight.toFixed(3)),
    });

    // Ensure any existing heatmap object is removed before creating a new one
    cleanupHeatmap();

    try {
      heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: heatmapData,
        map: map,
        radius: radius,
        opacity: opacity,
        dissipating: true,
        gradient: gradient,
        maxIntensity: 10,
      });
      isCleanedUpRef.current = false; // Heatmap object is now active

      // Update drawingStats with actual drawn count for heatmap
      setDrawingStats(prev => ({
        ...prev,
        drawnPoints: heatmapData.length,
        isDrawing: true,
      }));

      logDebug('[NeighborHeatmapLayer] ✅ Heatmap created successfully');

    } catch (error) {
      console.error('[NeighborHeatmapLayer] ❌ Heatmap creation error:', error);
      cleanupHeatmap(); // Clean up if creation failed
      // Reset drawing stats on heatmap creation failure
      setDrawingStats(prev => ({ ...prev, drawnPoints: 0, isDrawing: false }));
    }

    // Cleanup function for this specific heatmap effect
    return () => {
      if (!isCleanedUpRef.current) { // Only run if cleanupHeatmap hasn't been called manually yet
        logDebug('Heatmap effect cleanup return function running');
        cleanupHeatmap();
        // Reset drawing stats when this specific effect cleans up, e.g., component unmounts
        setDrawingStats(prev => ({ ...prev, isDrawing: false, drawnPoints: 0 }));
      }
    };
  }, [
    map, showNeighbors, neighbors, useHeatmap, isVisualizationReady,
    selectedMetric, radius, opacity, gradient, thresholds, cleanupHeatmap, logDebug
  ]);

  // Cleanup on unmount (redundant with the cleanup return functions, but good for explicit safety)
  useEffect(() => {
    return () => {
      logDebug('Component unmounting, cleaning up');
      cleanupHeatmap();
      // Ensure drawingStats are reset on full component unmount
      setDrawingStats(prev => ({ ...prev, isDrawing: false, drawnPoints: 0 }));
    };
  }, [cleanupHeatmap, logDebug]);

  // Update heatmap options dynamically (only if heatmap is active)
  useEffect(() => {
    if (heatmapRef.current && showNeighbors && useHeatmap) {
      try {
        heatmapRef.current.setOptions({
          radius: radius,
          opacity: opacity,
        });
        logDebug('Heatmap options updated:', { radius, opacity });
      } catch (e) {
        console.warn('[NeighborHeatmapLayer] Failed to update heatmap options:', e);
      }
    }
  }, [radius, opacity, showNeighbors, useHeatmap, logDebug]);

  const handleRectangleClick = useCallback((neighbor) => {
    logDebug('Rectangle clicked:', neighbor);
    setSelectedNeighbor(neighbor);
    onNeighborClick?.(neighbor);
  }, [onNeighborClick, logDebug]);

  // Clear selection when hidden
  useEffect(() => {
    if (!showNeighbors) {
      setSelectedNeighbor(null);
    }
  }, [showNeighbors]);

  if (!showNeighbors || neighbors.length === 0) {
    logDebug('Rendering null - no data to show');
    return null;
  }

  logDebug('Rendering elements:', {
    useHeatmap,
    rectangleCount: !useHeatmap ? neighbors.length : 0,
    hasSelectedNeighbor: !!selectedNeighbor,
  });

  return (
    <>
      {/* Debug overlay */}
      {debug && (
        <div 
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(0,0,0,0.85)',
            color: 'white',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '11px',
            zIndex: 9999,
            fontFamily: 'monospace',
            minWidth: '220px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #444', paddingBottom: '4px' }}>
            🔍 Neighbor Heatmap Debug
          </div>
          <div>Mode: <span style={{ color: '#4ade80' }}>{useHeatmap ? 'Heatmap' : 'Rectangles'}</span></div>
          <div>Total Received: <span style={{ color: '#60a5fa' }}>{drawingStats.totalReceived}</span></div>
          <div>Valid Points: <span style={{ color: '#60a5fa' }}>{drawingStats.validPoints}</span></div>
          <div>Drawn Points: <span style={{ color: '#60a5fa' }}>{drawingStats.drawnPoints}</span></div>
          <div>Is Drawing: {drawingStats.isDrawing ? '✅' : '❌'}</div>
          <div>Metric: <span style={{ color: '#fbbf24' }}>{selectedMetric}</span></div>
          <div style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '4px' }}>
            <div style={{ fontWeight: 'bold' }}>Thresholds ({selectedMetric}):</div>
            <div style={{ color: '#a78bfa' }}>
              {JSON.stringify(thresholds[selectedMetric] || 'default')}
            </div>
          </div>
        </div>
      )}

      {/* Rectangle mode */}
      {!useHeatmap && neighbors.map((n, idx) => {
        const bounds = getSquareBounds(n.lat, n.lng, n.isCollision ? 40 : 25);
        
        return (
          <Rectangle
            key={`neighbor-sq-${n.id || n.pci || idx}-${n.lat.toFixed(6)}-${n.lng.toFixed(6)}`}
            bounds={bounds}
            options={{
              fillColor: n.isCollision ? '#DC2626' : n.color,
              fillOpacity: n.isCollision ? 0.65 : 0.7,
              strokeColor: n.isCollision ? '#991B1B' : n.color,
              strokeWeight: n.isCollision ? 2.5 : 1.5,
              strokeOpacity: 0.9,
              clickable: true,
              zIndex: n.isCollision ? 300 : 200,
            }}
            onClick={() => handleRectangleClick(n)}
          />
        );
      })}

      {/* Info Window for selected neighbor */}
      {selectedNeighbor && (
        <InfoWindow
          position={{ lat: selectedNeighbor.lat, lng: selectedNeighbor.lng }}
          onCloseClick={() => setSelectedNeighbor(null)}
          options={{
            pixelOffset: new window.google.maps.Size(0, -15),
            maxWidth: 300,
            disableAutoPan: false,
          }}
        >
          <div className="p-2 min-w-[260px] font-sans">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span 
                  className="w-4 h-4 rounded-full shadow-sm border border-white/50"
                  style={{ backgroundColor: selectedNeighbor.color }}
                />
                <span className="font-bold text-gray-800 text-sm">
                  PCI: {selectedNeighbor.pci ?? 'N/A'}
                </span>
              </div>
              {selectedNeighbor.quality && (
                <span 
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: `${selectedNeighbor.color}20`,
                    color: selectedNeighbor.color,
                    border: `1px solid ${selectedNeighbor.color}40`
                  }}
                >
                  {selectedNeighbor.quality}
                </span>
              )}
            </div>
            
            {/* Primary Cell Info */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                📡 Primary Cell
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {selectedNeighbor.band && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Band</span>
                    <span className="font-semibold text-blue-600">{selectedNeighbor.band}</span>
                  </div>
                )}
                
                {selectedNeighbor.pci && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">PCI</span>
                    <span className="font-medium text-gray-700">{selectedNeighbor.pci}</span>
                  </div>
                )}
              </div>

              {selectedNeighbor.rsrp !== null && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-gray-500">RSRP</span>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getRSRPColor(selectedNeighbor.rsrp, thresholds.rsrp) }}
                    />
                    <span 
                      className="font-semibold"
                      style={{ color: getRSRPColor(selectedNeighbor.rsrp, thresholds.rsrp) }}
                    >
                      {selectedNeighbor.rsrp?.toFixed?.(1)} dBm
                    </span>
                  </div>
                </div>
              )}
              
              {selectedNeighbor.rsrq !== null && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-gray-500">RSRQ</span>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getRSRQColor(selectedNeighbor.rsrq, thresholds.rsrq) }}
                    />
                    <span className="font-medium text-gray-700">
                      {selectedNeighbor.rsrq?.toFixed?.(1)} dB
                    </span>
                  </div>
                </div>
              )}
              
              {selectedNeighbor.sinr !== null && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-gray-500">SINR</span>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getSINRColor(selectedNeighbor.sinr, thresholds.sinr) }}
                    />
                    <span className="font-medium text-gray-700">
                      {selectedNeighbor.sinr?.toFixed?.(1)} dB
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Neighbour Cell Info */}
            {(selectedNeighbor.neighbourRsrp !== null || selectedNeighbor.neighbourBand) && (
              <div className="space-y-1.5 mt-3 pt-2 border-t border-gray-100">
                <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">
                  📶 Neighbour Cell
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {selectedNeighbor.neighbourBand && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Band</span>
                      <span className="font-semibold text-purple-600">{selectedNeighbor.neighbourBand}</span>
                    </div>
                  )}

                  {selectedNeighbor.neighbourPci && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">PCI</span>
                      <span className="font-medium text-gray-700">{selectedNeighbor.neighbourPci}</span>
                    </div>
                  )}
                </div>
                
                {selectedNeighbor.neighbourRsrp !== null && (
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-gray-500">RSRP</span>
                    <div className="flex items-center gap-1.5">
                      <span 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getRSRPColor(selectedNeighbor.neighbourRsrp, thresholds.rsrp) }}
                      />
                      <span 
                        className="font-semibold"
                        style={{ color: getRSRPColor(selectedNeighbor.neighbourRsrp, thresholds.rsrp) }}
                      >
                        {selectedNeighbor.neighbourRsrp?.toFixed?.(1)} dBm
                      </span>
                    </div>
                  </div>
                )}
                
                {selectedNeighbor.neighbourRsrq !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">RSRQ</span>
                    <span className="font-medium text-gray-700">
                      {selectedNeighbor.neighbourRsrq?.toFixed?.(1)} dB
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Session Info */}
            {selectedNeighbor.sessionId && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                <span className="text-gray-500">Session ID</span>
                <span className="font-medium text-gray-700">{selectedNeighbor.sessionId}</span>
              </div>
            )}

            {/* Coordinates */}
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="text-[10px] text-gray-400 font-mono text-center">
                📍 {selectedNeighbor.lat.toFixed(6)}, {selectedNeighbor.lng.toFixed(6)}
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
});

NeighborHeatmapLayer.displayName = 'NeighborHeatmapLayer';

export default NeighborHeatmapLayer;