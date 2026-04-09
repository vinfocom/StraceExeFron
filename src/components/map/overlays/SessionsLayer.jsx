// src/components/map/overlays/SessionsLayer.jsx
import React, { useEffect, useRef } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

// Fast imperative sessions markers
export default function SessionsLayer({ map, sessions, onClick, cluster = true }) {
  const clustererRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!map) return;

    // Cleanup old markers/clusterer
    clustererRef.current?.clearMarkers?.();
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const markers = (sessions || [])
      .map((s) => {
        const lat = parseFloat(s.start_lat);
        const lng = parseFloat(s.start_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const marker = new window.google.maps.Marker({
          position: { lat, lng },
          title: `Session ${s.id}`,
          optimized: true,
        });
        marker.addListener("click", () => onClick?.(s));
        return marker;
      })
      .filter(Boolean);

    markersRef.current = markers;

    if (cluster) {
      clustererRef.current = new MarkerClusterer({ markers, map });
    } else {
      markers.forEach((m) => m.setMap(map));
    }

    return () => {
      clustererRef.current?.clearMarkers?.();
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, [map, sessions, onClick, cluster]);

  return null;
}