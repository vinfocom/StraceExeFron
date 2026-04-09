import React, { useEffect, useRef } from "react";

// If you use MapLibre, switch imports to:
// import mapboxgl from "maplibre-gl";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";

// REQUIRED for Mapbox GL only
// mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const shapeModeToDrawMode = (shapeMode) => {
  // Base MapboxDraw supports polygon/point/line. Rectangle/circle need custom modes.
  if (shapeMode === "polygon") return "draw_polygon";
  if (shapeMode === "rectangle") {
    // Requires mapbox-gl-draw-rectangle-mode or similar
    console.warn("Rectangle mode requires an extra Draw mode plugin. Falling back to polygon.");
    return "draw_polygon";
  }
  if (shapeMode === "circle") {
    // Requires a circle mode plugin
    console.warn("Circle mode requires an extra Draw mode plugin. Falling back to polygon.");
    return "draw_polygon";
  }
  return "draw_polygon";
};

const toGeojsonPoints = (logs) => ({
  type: "FeatureCollection",
  features: (logs || []).map((r) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    properties: { ...r }, // Keep all fields for CSV download
  })),
});

// Aggregate helpers
const pickMeasureValue = (row, measureIn) => {
  const m = String(measureIn || "").toLowerCase();
  const candidates = {
    "rsrp": ["rsrp", "RSRP"],
    "rsrq": ["rsrq", "RSRQ"],
    "sinr": ["sinr", "SINR"],
    "ul-tpt": ["ul_tpt", "ulTpt", "uplink_tpt", "UL_TPT"],
    "dl-tpt": ["dl_tpt", "dlTpt", "downlink_tpt", "DL_TPT"],
    "lte-bler": ["lte_bler", "bler", "LTE_BLER"],
    "mos": ["mos", "MOS"],
  }[m] || [m];

  for (const key of candidates) {
    const v = row?.[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};

const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (s[base + 1] !== undefined) {
    return s[base] + rest * (s[base + 1] - s[base]);
  }
  return s[base];
};

const computePolygonStats = ({ polygon, logs, filters }) => {
  const fc = toGeojsonPoints(logs);
  const measure = filters?.measureIn || "rsrp";

  // Filter points inside polygon
  const inside = [];
  for (const f of fc.features) {
    if (turf.booleanPointInPolygon(f, polygon)) inside.push(f);
  }

  // Extract measure values
  const values = inside
    .map((f) => pickMeasureValue(f.properties, measure))
    .filter((v) => typeof v === "number" && Number.isFinite(v));

  // Basic stats
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const p50 = quantile(values, 0.5);
  const p90 = quantile(values, 0.9);
  const p95 = quantile(values, 0.95);

  // Counts by provider/technology
  const providers = {};
  const technologies = {};
  inside.forEach((f) => {
    const p = f.properties?.provider || "Unknown";
    const t = f.properties?.technology || "Unknown";
    providers[p] = (providers[p] || 0) + 1;
    technologies[t] = (technologies[t] || 0) + 1;
  });

  return {
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
    feature: polygon,                       // GeoJSON Polygon
    measure,                                // which metric was used
    areaSqM: turf.area(polygon),            // polygon area in m²
    counts: {
      totalLogs: inside.length,
      providers,
      technologies,
    },
    metrics: { avg, min, max, p50, p90, p95 },
    // Raw logs inside polygon (flattened props)
    selectedLogs: inside.map((f) => ({
      ...f.properties,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    })),
  };
};

export default function MapCanvas({ ui, filters, logs, onPolygonStats }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const drawRef = useRef(null);

  // Init map + draw once
  useEffect(() => {
    if (mapRef.current) return;

    // MapLibre usage (if you use MapLibre, uncomment the import and change here):
    // const map = new mapboxgl.Map({
    //   container: mapContainerRef.current,
    //   style: "https://demotiles.maplibre.org/style.json",
    //   center: [77.2, 28.65],
    //   zoom: 10,
    // });

    // Mapbox usage:
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [77.2, 28.65],
      zoom: 10,
    });

    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {}, // we'll set modes manually
      defaultMode: "simple_select",
    });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    // Draw events -> compute stats
    const handleDraw = (e) => {
      const { features } = e;
      if (!features || features.length === 0) return;

      // Use the last edited/created feature
      const feat = features[features.length - 1];

      if (feat.geometry?.type === "Polygon") {
        const poly = {
          type: "Feature",
          geometry: feat.geometry,
          properties: {},
        };
        const stats = computePolygonStats({
          polygon: poly,
          logs,
          filters,
        });
        onPolygonStats?.(stats);
      }
    };

    map.on("draw.create", handleDraw);
    map.on("draw.update", handleDraw);

    return () => {
      map.off("draw.create", handleDraw);
      map.off("draw.update", handleDraw);
      map.remove();
    };
  }, []); // init once

  // Add/update logs layer whenever logs change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = "logs-src";
    const layerId = "logs-layer";

    const data = toGeojsonPoints(logs);

    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(data);
    } else {
      map.on("load", () => {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: "geojson", data });
          map.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 4,
              "circle-color": "#1d4ed8",
              "circle-opacity": 0.6,
            },
          });
        }
      });

      // If map already loaded, add immediately
      if (map.isStyleLoaded()) {
        map.addSource(sourceId, { type: "geojson", data });
        map.addLayer({
          id: layerId,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-radius": 4,
            "circle-color": "#1d4ed8",
            "circle-opacity": 0.6,
          },
        });
      }
    }
  }, [logs]);

  // Toggle draw tool according to ui.drawEnabled + ui.shapeMode
  useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map || !draw) return;

    if (ui.drawEnabled) {
      // Switch draw mode based on selected shape
      const mode = shapeModeToDrawMode(ui.shapeMode);
      try {
        draw.changeMode(mode);
      } catch (e) {
        console.warn("Failed to change draw mode:", e);
        draw.changeMode("draw_polygon");
      }
    } else {
      // Back to selection mode
      try {
        draw.changeMode("simple_select");
      } catch {}
    }
  }, [ui.drawEnabled, ui.shapeMode]);

  // Clear drawings when signal increments
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if ((ui.drawClearSignal || 0) > 0) {
      draw.deleteAll();
      onPolygonStats?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.drawClearSignal]);

  // Basemap style switch (optional)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (ui.basemapStyle === "default") {
      map.setStyle("mapbox://styles/mapbox/streets-v12");
    } else if (ui.basemapStyle === "clean") {
      map.setStyle("mapbox://styles/mapbox/light-v11");
    } else if (ui.basemapStyle === "night") {
      map.setStyle("mapbox://styles/mapbox/dark-v11");
    }
  }, [ui.basemapStyle]);

  return (
    <div ref={mapContainerRef} className="absolute inset-0" />
  );
}