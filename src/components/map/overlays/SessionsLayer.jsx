// src/components/map/overlays/SessionsLayer.jsx
import React, { useEffect, useRef } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

// Fast imperative sessions markers
export default function SessionsLayer({ map, sessions, onClick, cluster = true }) {
  const clustererRef = useRef(null);
  const markersRef = useRef([]);

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

    const bindMarkerClick = (marker, session) => {
      if (!marker) return;
      if (typeof marker.addListener === "function") {
        marker.addListener("click", () => onClick?.(session));
        return;
      }
      if (typeof marker.addEventListener === "function") {
        marker.addEventListener("gmp-click", () => onClick?.(session));
      }
    };

    // Cleanup old markers/clusterer
    clustererRef.current?.clearMarkers?.();
    markersRef.current.forEach(clearMarker);
    markersRef.current = [];

    const AdvancedMarkerElement =
      window.google?.maps?.marker?.AdvancedMarkerElement || null;
    const mapId = typeof map.get === "function" ? map.get("mapId") : null;
    const canUseAdvancedMarkers = Boolean(AdvancedMarkerElement && mapId);

    const markers = (sessions || [])
      .map((s) => {
        const lat = parseFloat(s.start_lat);
        const lng = parseFloat(s.start_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const position = { lat, lng };
        const title = `Session ${s.id}`;
        let marker = null;
        if (canUseAdvancedMarkers) {
          try {
            marker = new AdvancedMarkerElement({
              ...(cluster ? {} : { map }),
              position,
              title,
            });
          } catch {
            marker = null;
          }
        }

        if (!marker) {
          marker = new window.google.maps.Marker({
            ...(cluster ? {} : { map }),
            position,
            title,
            optimized: true,
          });
        }

        bindMarkerClick(marker, s);
        return marker;
      })
      .filter(Boolean);

    markersRef.current = markers;

    if (cluster) {
      clustererRef.current = new MarkerClusterer({ markers, map });
    }

    return () => {
      clustererRef.current?.clearMarkers?.();
      markersRef.current.forEach(clearMarker);
      markersRef.current = [];
    };
  }, [map, sessions, onClick, cluster]);

  return null;
}
