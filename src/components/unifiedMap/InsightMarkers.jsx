import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useGoogleMap } from "@react-google-maps/api";
import {
  getInsightCoordinates,
  getInsightSeverity,
  getInsightSeverityColor,
} from "./insightUtils";

const BASE_RADIUS_BY_SEVERITY = {
  HIGH: 8,
  CRITICAL: 8,
  MEDIUM: 7,
  WARNING: 7,
  LOW: 6,
};

const hexToRgba = (hex, alpha = 230) => {
  const normalized = String(hex || "").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;

  if (!/^[0-9a-f]{6}$/i.test(value)) return [100, 116, 139, alpha];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha,
  ];
};

// The marker radius follows the map zoom: zooming out shrinks points and
// zooming in enlarges them, while staying within readable pixel limits.
const getDynamicRadius = (severity, zoom) => {
  const baseRadius = BASE_RADIUS_BY_SEVERITY[severity] || 6;
  const zoomScale = 1.18 ** (zoom - 13);
  return Math.max(2, Math.min(42, baseRadius * zoomScale));
};

const InsightMarkers = ({ insights = [], show = false }) => {
  const map = useGoogleMap();
  const overlayRef = useRef(null);
  const [zoom, setZoom] = useState(() => map?.getZoom?.() || 13);

  const markerRows = useMemo(
    () =>
      insights
        .map((insight, index) => {
          const position = getInsightCoordinates(insight);
          if (!position) return null;
          return {
            ...position,
            id: insight?.id ?? insight?.Id ?? `insight-${index}`,
            severity: getInsightSeverity(insight),
          };
        })
        .filter(Boolean),
    [insights],
  );

  useEffect(() => {
    if (!map) return undefined;

    const updateZoom = () => setZoom(map.getZoom?.() || 13);
    updateZoom();
    const listener = map.addListener("zoom_changed", updateZoom);
    return () => listener?.remove?.();
  }, [map]);

  useEffect(() => {
    if (!map) return undefined;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        interleaved: false,
        glOptions: { preserveDrawingBuffer: false },
      });
    }

    overlayRef.current.setMap(map);
    return () => {
      overlayRef.current?.setProps({ layers: [] });
      overlayRef.current?.setMap(null);
    };
  }, [map]);

  const markerLayer = useMemo(
    () => new ScatterplotLayer({
      id: "unified-map-insight-markers",
      data: markerRows,
      getPosition: (marker) => [marker.lng, marker.lat],
      getFillColor: (marker) => hexToRgba(getInsightSeverityColor(marker.severity), 225),
      getLineColor: [255, 255, 255, 235],
      getLineWidth: 1,
      getRadius: (marker) => getDynamicRadius(marker.severity, zoom),
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      stroked: true,
      filled: true,
      pickable: false,
      parameters: { depthTest: false },
      updateTriggers: {
        getRadius: [zoom],
        getFillColor: [markerRows],
      },
    }),
    [markerRows, zoom],
  );

  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: show ? [markerLayer] : [] });
  }, [markerLayer, show]);

  useEffect(() => {
    if (!show || !map || !window.google?.maps || markerRows.length === 0) return;

    if (markerRows.length === 1) {
      map.setCenter({ lat: markerRows[0].lat, lng: markerRows[0].lng });
      map.setZoom(Math.max(map.getZoom?.() || 13, 15));
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    markerRows.forEach((marker) => bounds.extend({ lat: marker.lat, lng: marker.lng }));
    map.fitBounds(bounds, 80);
  }, [map, markerRows, show]);

  return null;
};

export default InsightMarkers;
