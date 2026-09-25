import React, { useEffect, useMemo } from "react";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { useGoogleMap } from "@react-google-maps/api";
import { useDeckLayerGroup } from "@/components/maps/deckLayerRegistry.jsx";
import {
  getInsightCoordinates,
  getInsightId,
  getInsightSeverity,
  getInsightSeverityColor,
} from "./insightUtils";

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

const InsightMarkers = ({
  insights = [],
  show = false,
  radius = 10,
  selectedInsightId = null,
}) => {
  const map = useGoogleMap();

  const markerRows = useMemo(
    () =>
      insights
        .map((insight, index) => {
          const position = getInsightCoordinates(insight);
          if (!position) return null;
          return {
            ...position,
            id: getInsightId(insight, index),
            severity: getInsightSeverity(insight),
          };
        })
        .filter(Boolean),
    [insights],
  );

  const severityPaths = useMemo(() => {
    const groups = new Map();
    // Connect each severity in the order its insights were returned.
    markerRows.forEach((marker) => {
      if (!groups.has(marker.severity)) groups.set(marker.severity, []);
      groups.get(marker.severity).push([marker.lng, marker.lat]);
    });
    return Array.from(groups, ([severity, path]) => ({ severity, path }))
      .filter(({ path }) => path.length > 1);
  }, [markerRows]);

  const connectionLayer = useMemo(
    () => new PathLayer({
      id: "unified-map-insight-severity-lines",
      data: severityPaths,
      getPath: (group) => group.path,
      getColor: (group) => hexToRgba(getInsightSeverityColor(group.severity), 225),
      getWidth: 2,
      widthUnits: "pixels",
      pickable: false,
      parameters: { depthTest: false },
    }),
    [severityPaths],
  );

  const selectedMarkers = useMemo(
    () => markerRows.filter((marker) => marker.id === selectedInsightId),
    [markerRows, selectedInsightId],
  );

  const markerLayer = useMemo(
    () => new ScatterplotLayer({
      id: "unified-map-insight-markers",
      data: markerRows,
      getPosition: (marker) => [marker.lng, marker.lat],
      getFillColor: (marker) => hexToRgba(getInsightSeverityColor(marker.severity), 225),
      getLineColor: [255, 255, 255, 235],
      getLineWidth: 1,
      getRadius: radius,
      radiusUnits: "pixels",
      radiusMinPixels: 4,
      radiusMaxPixels: 40,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      stroked: false,
      filled: true,
      pickable: false,
      parameters: { depthTest: false },
      updateTriggers: {
        getRadius: [radius],
        getFillColor: [markerRows],
      },
    }),
    [markerRows, radius],
  );

  const selectedMarkerLayer = useMemo(
    () => new ScatterplotLayer({
      id: "unified-map-selected-insight-marker",
      data: selectedMarkers,
      getPosition: (marker) => [marker.lng, marker.lat],
      getRadius: radius * 2,
      getFillColor: [255, 215, 0, 45],
      getLineColor: [255, 215, 0, 255],
      getLineWidth: 3,
      radiusUnits: "pixels",
      radiusMinPixels: 10,
      radiusMaxPixels: 48,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 3,
      stroked: true,
      filled: true,
      pickable: false,
      parameters: { depthTest: false },
      updateTriggers: { getRadius: [radius] },
    }),
    [selectedMarkers, radius],
  );

  useDeckLayerGroup(
    "events",
    show ? [connectionLayer, markerLayer, selectedMarkerLayer] : [],
    40,
  );

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

  useEffect(() => {
    if (!show || !map || selectedMarkers.length === 0) return;
    const [selected] = selectedMarkers;
    map.panTo({ lat: selected.lat, lng: selected.lng });
    map.setZoom(Math.max(map.getZoom?.() || 13, 16));
  }, [map, selectedMarkers, show]);

  return null;
};

export default InsightMarkers;
