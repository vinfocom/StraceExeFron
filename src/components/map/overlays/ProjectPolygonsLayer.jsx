// src/components/map/overlays/ProjectPolygonsLayer.jsx
import React from "react";
import { PolygonF } from "@react-google-maps/api";

export default function ProjectPolygonsLayer({ polygons = [], onClick }) {
  return (
    <>
      {polygons.map((poly) =>
        poly.rings.map((ring, idx) => (
          <PolygonF
            key={`${poly.id}-${idx}`}
            paths={ring}
            options={{
              strokeColor: "#2563eb",
              strokeOpacity: 0.8,
              strokeWeight: 1.5,
              fillColor: "#3b82f6",
              fillOpacity: 0.08,
              clickable: true,
            }}
            onClick={() => onClick?.(poly)}
          />
        ))
      )}
    </>
  );
}