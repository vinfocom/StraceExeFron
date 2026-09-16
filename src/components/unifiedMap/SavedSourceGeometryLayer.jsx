import { memo, useMemo } from "react";
import { Polygon, Polyline } from "@react-google-maps/api";

const LAYER_STYLES = Object.freeze({
  buildings: { stroke: "#111827", fill: "#111827", fillOpacity: 0.18, strokeWeight: 1, zIndex: 84 },
  roads: { stroke: "#64748b", fill: "#64748b", fillOpacity: 0.05, strokeWeight: 1.2, zIndex: 86 },
  highways: { stroke: "#d97706", fill: "#d97706", fillOpacity: 0.08, strokeWeight: 2.4, zIndex: 88 },
  railways: { stroke: "#7c3aed", fill: "#7c3aed", fillOpacity: 0.06, strokeWeight: 1.8, zIndex: 89 },
  water: { stroke: "#1d4ed8", fill: "#2563eb", fillOpacity: 0.28, strokeWeight: 1, zIndex: 82 },
  land_use: { stroke: "#16a34a", fill: "#22c55e", fillOpacity: 0.09, strokeWeight: 0.8, zIndex: 80 },
  land_cover: { stroke: "#65a30d", fill: "#84cc16", fillOpacity: 0.09, strokeWeight: 0.8, zIndex: 81 },
});

const toLatLng = (parts) => {
  const first = Number(parts?.[0]);
  const second = Number(parts?.[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  if (Math.abs(first) > 40 && Math.abs(second) < 40) return { lng: first, lat: second };
  if (Math.abs(first) < 40 && Math.abs(second) > 40) return { lng: second, lat: first };
  if (Math.abs(first) > 90) return { lng: first, lat: second };
  return { lng: first, lat: second };
};

const splitTopLevelGroups = (text) => {
  const groups = [];
  let depth = 0;
  let start = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && start != null) {
        groups.push(text.slice(start, index));
        start = null;
      }
    }
  }
  return groups;
};

const parseCoordinateList = (text) => text
  .split(",")
  .map((part) => toLatLng(part.trim().split(/\s+/)))
  .filter(Boolean);

const stripSrid = (wkt) => String(wkt || "").trim().replace(/^SRID=\d+;\s*/i, "");

const parseWktGeometry = (wkt) => {
  const text = stripSrid(wkt);
  const type = text.match(/^([A-Z]+)\s*/i)?.[1]?.toUpperCase();
  const body = text.slice(type?.length || 0).trim();
  if (!type || !body || /^EMPTY$/i.test(body)) return null;
  const inner = body.replace(/^\(/, "").replace(/\)$/, "");

  if (type === "LINESTRING") {
    const path = parseCoordinateList(inner);
    return path.length >= 2 ? { type: "line", paths: [path] } : null;
  }
  if (type === "MULTILINESTRING") {
    const paths = splitTopLevelGroups(inner).map(parseCoordinateList).filter((path) => path.length >= 2);
    return paths.length ? { type: "line", paths } : null;
  }
  if (type === "POLYGON") {
    const rings = splitTopLevelGroups(inner).map(parseCoordinateList).filter((ring) => ring.length >= 3);
    return rings.length ? { type: "polygon", polygons: [rings] } : null;
  }
  if (type === "MULTIPOLYGON") {
    const polygons = splitTopLevelGroups(inner)
      .map((polygonText) => splitTopLevelGroups(polygonText).map(parseCoordinateList).filter((ring) => ring.length >= 3))
      .filter((rings) => rings.length);
    return polygons.length ? { type: "polygon", polygons } : null;
  }
  return null;
};

const normalizeFeature = (row) => {
  const geometry = parseWktGeometry(row?.geometryWkt ?? row?.GeometryWkt);
  if (!geometry) return [];
  const layer = row?.layer ?? row?.Layer ?? "buildings";
  const id = row?.id ?? row?.Id ?? `${layer}-${row?.name ?? row?.Name ?? ""}`;
  const name = row?.name ?? row?.Name ?? layer;
  if (geometry.type === "line") {
    return geometry.paths.map((path, index) => ({ id: `${id}-line-${index}`, layer, name, type: "line", path }));
  }
  return geometry.polygons.map((rings, index) => ({ id: `${id}-poly-${index}`, layer, name, type: "polygon", rings }));
};

const SavedSourceGeometryLayer = ({
  features = [],
  visibleLayers = {},
}) => {
  const renderFeatures = useMemo(
    () => features.flatMap(normalizeFeature).filter((feature) => Boolean(visibleLayers[feature.layer])),
    [features, visibleLayers],
  );

  return (
    <>
      {renderFeatures.map((feature) => {
        const style = LAYER_STYLES[feature.layer] || LAYER_STYLES.buildings;
        if (feature.type === "line") {
          return (
            <Polyline
              key={feature.id}
              path={feature.path}
              options={{
                strokeColor: style.stroke,
                strokeOpacity: 0.95,
                strokeWeight: style.strokeWeight,
                clickable: false,
                zIndex: style.zIndex,
              }}
            />
          );
        }
        return (
          <Polygon
            key={feature.id}
            paths={feature.rings}
            options={{
              fillColor: style.fill,
              fillOpacity: style.fillOpacity,
              strokeColor: style.stroke,
              strokeOpacity: 0.9,
              strokeWeight: style.strokeWeight,
              clickable: false,
              zIndex: style.zIndex,
            }}
          />
        );
      })}
    </>
  );
};

export default memo(SavedSourceGeometryLayer);
