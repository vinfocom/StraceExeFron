// src/components/map/overlays/SessionsLayer.jsx
import React, { useEffect, useRef } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { ADVANCED_MARKER_CLUSTER_RENDERER, createAdvancedMarker, createDotMarkerContent } from "@/lib/advancedMarkers";

// Fast imperative sessions markers
export default function SessionsLayer({ map, sessions, onClick, cluster = true }) {
  const clustererRef = useRef(null);
  const markersRef = useRef([]);
  // Keep the latest handler without making it an effect dependency, so a new
  // callback identity never tears down and rebuilds every marker.
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!map) return;

    const clearMarker = (marker) => {
      if (!marker) return;
      if (typeof marker.setMap === "function") {
        marker.setMap(null);
        return;
      }
      if ("map" in marker) {
        marker.map = null;
      }
    };

    // Cleanup old markers/clusterer
    clustererRef.current?.clearMarkers?.();
    markersRef.current.forEach((marker) => {
      if (marker.__sessionClickHandler) {
        marker.removeEventListener("gmp-click", marker.__sessionClickHandler);
      }
      clearMarker(marker);
    });
    markersRef.current = [];

    const markers = (sessions || [])
      .map((s) => {
        const lat = parseFloat(s.start_lat);
        const lng = parseFloat(s.start_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const position = { lat, lng };
        const title = `Session ${s.id}`;
        const marker = createAdvancedMarker({
          map: cluster ? null : map,
          position,
          title,
          clickable: true,
          content: createDotMarkerContent(),
        });
        if (!marker) return null;
        const handleClick = () => onClickRef.current?.(s);
        marker.addEventListener("gmp-click", handleClick);
        marker.__sessionClickHandler = handleClick;
        return marker;
      })
      .filter(Boolean);

    markersRef.current = markers;

    if (cluster) {
      clustererRef.current = new MarkerClusterer({
        markers,
        map,
        algorithmOptions: { maxZoom: 19 },
        renderer: ADVANCED_MARKER_CLUSTER_RENDERER,
        onClusterClick: null,
      });
    }

    return () => {
      clustererRef.current?.clearMarkers?.();
      markersRef.current.forEach((marker) => {
        if (marker.__sessionClickHandler) {
          marker.removeEventListener("gmp-click", marker.__sessionClickHandler);
        }
        clearMarker(marker);
      });
      markersRef.current = [];
    };
  }, [map, sessions, cluster]);

  return null;
}
