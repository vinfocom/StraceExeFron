const MAX_LONGITUDE = 180;
const MAX_LATITUDE = 90;
const MAX_WKT_LENGTH = 256 * 1024;
const MAX_COORDINATES_PER_GEOMETRY = 10000;

const closeRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, [...first]];
  }
  return ring;
};

const normalizeRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const coordinates = [];

  for (const coordinate of ring) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(longitude) > MAX_LONGITUDE ||
      Math.abs(latitude) > MAX_LATITUDE
    ) {
      return null;
    }
    coordinates.push([longitude, latitude]);
  }

  const closed = closeRing(coordinates);
  if (!closed || new Set(closed.slice(0, -1).map((point) => point.join(","))).size < 3) {
    return null;
  }

  let twiceArea = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const [longitude, latitude] = closed[index];
    const [nextLongitude, nextLatitude] = closed[index + 1];
    twiceArea += longitude * nextLatitude - nextLongitude * latitude;
  }
  return Math.abs(twiceArea) > 1e-14 ? closed : null;
};

const parseNestedCoordinates = (body) => {
  let cursor = 0;
  let coordinateCount = 0;

  const skipWhitespace = () => {
    while (/\s/.test(body[cursor] || "")) cursor += 1;
  };

  const parseGroup = (depth = 0) => {
    if (depth > 2) throw new Error("Geometry nesting is too deep");
    skipWhitespace();
    if (body[cursor] !== "(") throw new Error("Expected coordinate group");
    cursor += 1;
    const entries = [];

    while (cursor < body.length) {
      skipWhitespace();
      if (body[cursor] === "(") {
        entries.push(parseGroup(depth + 1));
      } else if (body[cursor] === ")") {
        cursor += 1;
        return entries;
      } else {
        const start = cursor;
        while (cursor < body.length && body[cursor] !== "," && body[cursor] !== ")") {
          cursor += 1;
        }
        const ordinates = body
          .slice(start, cursor)
          .trim()
          .split(/\s+/)
          .map(Number);
        coordinateCount += 1;
        if (coordinateCount > MAX_COORDINATES_PER_GEOMETRY) {
          throw new Error("Geometry has too many coordinates");
        }
        if (ordinates.length < 2 || ordinates.slice(0, 2).some((value) => !Number.isFinite(value))) {
          throw new Error("Invalid coordinate");
        }
        entries.push(ordinates.slice(0, 2));
      }

      skipWhitespace();
      if (body[cursor] === ",") {
        cursor += 1;
        continue;
      }
      if (body[cursor] === ")") {
        cursor += 1;
        return entries;
      }
      throw new Error("Invalid WKT separators");
    }

    throw new Error("Unclosed coordinate group");
  };

  const result = parseGroup();
  skipWhitespace();
  if (cursor !== body.length) throw new Error("Unexpected text after geometry");
  return result;
};

/** Convert Polygon or MultiPolygon WKT (EPSG:4326) into GeoJSON coordinates. */
export const parseClutterWkt = (wkt) => {
  if (typeof wkt !== "string" || !wkt.trim()) return null;

  const text = wkt.trim();
  if (text.length > MAX_WKT_LENGTH) return null;
  const match = text.match(/^(?:SRID=(\d+);\s*)?(POLYGON|MULTIPOLYGON)\s*(?:ZM?\s*)?/i);
  if (!match) return null;
  if (match[1] && Number(match[1]) !== 4326) return null;

  const geometryType = match[2].toUpperCase();
  const body = text.slice(match[0].length).trim();
  if (!body || /^EMPTY$/i.test(body)) return null;

  try {
    const nested = parseNestedCoordinates(body);
    const rawPolygons = geometryType === "POLYGON" ? [nested] : nested;
    if (!Array.isArray(rawPolygons) || rawPolygons.length === 0) return null;

    const polygons = rawPolygons.map((rings) => {
      if (!Array.isArray(rings) || rings.length === 0) return null;
      const normalizedRings = rings.map(normalizeRing);
      return normalizedRings.every(Boolean) ? normalizedRings : null;
    });
    if (polygons.some((polygon) => !polygon)) return null;

    if (geometryType === "POLYGON") {
      return { type: "Polygon", coordinates: polygons[0] };
    }
    return { type: "MultiPolygon", coordinates: polygons };
  } catch {
    return null;
  }
};

const getTileIdentity = (row, index) => {
  const tileId = String(row?.clutterTileId ?? "").trim();
  if (tileId) return `tile:${tileId}`;
  const wkt = typeof row?.clutterPolygonWkt === "string" ? row.clutterPolygonWkt.trim() : "";
  return wkt ? `wkt:${wkt}` : `missing:${index}`;
};

/** Build a render-safe GeoJSON collection, merging repeated tile/building intersections. */
export const buildClutterFeatureCollection = (rows) => {
  const tilesById = new Map();
  const invalidTileIds = new Set();
  const conflictingGeometryIds = new Set();
  const geometryCache = new Map();

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const identity = getTileIdentity(row, index);
    const wkt = row?.clutterPolygonWkt;
    if (!geometryCache.has(wkt)) geometryCache.set(wkt, parseClutterWkt(wkt));
    const geometry = geometryCache.get(wkt);
    if (!geometry) {
      invalidTileIds.add(identity);
      continue;
    }

    invalidTileIds.delete(identity);
    const existing = tilesById.get(identity);
    if (existing) {
      if (existing.geometry !== geometry && JSON.stringify(existing.geometry) !== JSON.stringify(geometry)) {
        conflictingGeometryIds.add(identity);
      }
      if (row?.buildingPolygonId != null) {
        existing.properties.buildingPolygonIds.add(String(row.buildingPolygonId));
      }
      if (row?.buildingPolygonName) {
        existing.properties.buildingPolygonNames.add(String(row.buildingPolygonName));
      }
      for (const id of row?.buildingPolygonIds || []) existing.properties.buildingPolygonIds.add(String(id));
      for (const name of row?.buildingPolygonNames || []) existing.properties.buildingPolygonNames.add(String(name));
      continue;
    }

    tilesById.set(identity, {
      geometry,
      properties: {
        clutterTileId: row?.clutterTileId ?? null,
        gridId: row?.gridId ?? null,
        clutterClass: normalizeClutterClass(row?.clutterClass, row?.landCoverClass),
        landCoverClass: row?.landCoverClass ?? null,
        resolutionM: row?.resolutionM ?? null,
        buildingPolygonIds: new Set(
          [...(row?.buildingPolygonIds || []).map(String), ...(row?.buildingPolygonId == null ? [] : [String(row.buildingPolygonId)])],
        ),
        buildingPolygonNames: new Set(
          [...(row?.buildingPolygonNames || []).map(String), ...(row?.buildingPolygonName ? [String(row.buildingPolygonName)] : [])],
        ),
      },
    });
  }

  const features = [...tilesById.entries()].map(([id, tile]) => ({
    type: "Feature",
    id,
    geometry: tile.geometry,
    properties: {
      ...tile.properties,
      buildingPolygonIds: [...tile.properties.buildingPolygonIds],
      buildingPolygonNames: [...tile.properties.buildingPolygonNames],
    },
  }));

  const classCounts = new Map();
  for (const feature of features) {
    const name = String(feature.properties.clutterClass || "Unknown");
    classCounts.set(name, (classCounts.get(name) || 0) + 1);
  }

  return {
    featureCollection: { type: "FeatureCollection", features },
    classCounts: [...classCounts.entries()].sort(
      (left, right) => getClutterClassOrder(left[0]) - getClutterClassOrder(right[0]),
    ),
    invalidGeometryCount: [...invalidTileIds].filter((id) => !tilesById.has(id)).length,
    conflictingGeometryCount: conflictingGeometryIds.size,
  };
};
import { getClutterClassOrder, normalizeClutterClass } from "./clutterClasses.js";
