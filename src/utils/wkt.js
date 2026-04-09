
function toLatLng(pair) {
  const parts = pair.trim().split(/\s+/).map(Number);
  const val1 = parts[0];
  const val2 = parts[1];
  
  // Robust check for India region (Lat ~28, Lng ~77)
  if (Math.abs(val1) > 40 && Math.abs(val2) < 40) return { lat: val2, lng: val1 }; // Lng Lat
  if (Math.abs(val1) < 40 && Math.abs(val2) > 40) return { lat: val1, lng: val2 }; // Lat Lng
  return { lat: val2, lng: val1 }; // Default fallback
}


function parseToNested(wkt) {
  if (!wkt || typeof wkt !== "string") return [];

  const text = wkt.trim();
  const isMulti = /^MULTIPOLYGON/i.test(text);

  if (isMulti) {
    const inner = text
      .replace(/^MULTIPOLYGON\s*KATEX_INLINE_OPEN\s*/, "")
      .replace(/\s*KATEX_INLINE_CLOSE\s*$/, "");

    // separate polygons
    const polys = inner.match(/KATEX_INLINE_OPENKATEX_INLINE_OPEN[^()]+KATEX_INLINE_CLOSEKATEX_INLINE_CLOSE/g) || [];
    return polys.map((poly) => {
      const cleaned = poly.replace(/^KATEX_INLINE_OPENKATEX_INLINE_OPEN/, "").replace(/KATEX_INLINE_CLOSEKATEX_INLINE_CLOSE$/, "");
      const ringsRaw = cleaned.split(/KATEX_INLINE_CLOSE\s*,\s*KATEX_INLINE_OPEN/);
      return ringsRaw.map((ring) =>
        ring.split(",").map(toLatLng).filter(Boolean)
      );
    });
  }

  // handle simple polygon
  const inner = text
    .replace(/^POLYGON\s*KATEX_INLINE_OPEN\s*/, "")
    .replace(/\s*KATEX_INLINE_CLOSE\s*$/, "")
    .replace(/^KATEX_INLINE_OPEN/, "")
    .replace(/KATEX_INLINE_CLOSE$/, "");

  const ringsRaw = inner.split(/KATEX_INLINE_CLOSE\s*,\s*KATEX_INLINE_OPEN/);
  const rings = ringsRaw.map((ring) =>
    ring.split(",").map(toLatLng).filter(Boolean)
  );

  return [rings];
}

/**
 * Main export with backward‑compatible structure.
 *
 * @param {string} wkt - POLYGON or MULTIPOLYGON text
 * @returns {{ coordinates: {lat,lng}[], rawRings: any[] }}
 *
 * `coordinates`  – flat array for easy `.paths` use (outer ring of first polygon)
 * `rawRings`     – nested array [[outer],[holes], …] for future complex use
 */
export function parseWKTToCoordinates(wkt) {
  const nested = parseToNested(wkt);                     // full structure
  const coordinates = nested[0]?.[0] ?? [];              // backward compatible
  return { coordinates, rawRings: nested };
}

export default parseWKTToCoordinates;

// src/utils/wkt.js

export const parseWKTToPolygons = (wkt) => {
  if (!wkt?.trim()) return [];
  try {
    const match = wkt.trim().match(/POLYGON\s*\(\(([^)]+)\)\)/i);
    if (!match) return [];

    const points = match[1].split(",").reduce((acc, coord) => {
      const parts = coord.trim().split(/\s+/).map(parseFloat);
      const val1 = parts[0];
      const val2 = parts[1];
      
      let lat, lng;

      // Robust heuristic for India (Lng ~77, Lat ~28) and Taiwan (Lng ~121, Lat ~25)
      if (Math.abs(val1) > 40 && Math.abs(val2) < 40) {
        // Input is [Lng, Lat]
        lng = val1;
        lat = val2;
      } else if (Math.abs(val1) < 40 && Math.abs(val2) > 40) {
        // Input is [Lat, Lng]
        lat = val1;
        lng = val2;
      } else if (Math.abs(val1) > 90) {
        // Extra fallback for Longitude values > 90 (like Taiwan)
        lng = val1;
        lat = val2;
      } else {
        // Default fallback (assuming Lat Lng)
        lat = val1;
        lng = val2;
      }

      if (!isNaN(lat) && !isNaN(lng)) {
        acc.push({ lat, lng });
      }
      return acc;
    }, []);

    return points.length >= 3 ? [{ paths: [points] }] : [];
  } catch (err) {
    console.error("WKT Parsing Error:", err);
    return [];
  }
};


const computeBbox = (points) => {
  if (!points?.length) return null;
  return points.reduce(
    (bbox, pt) => ({
      north: Math.max(bbox.north, pt.lat),
      south: Math.min(bbox.south, pt.lat),
      east: Math.max(bbox.east, pt.lng),
      west: Math.min(bbox.west, pt.lng),
    }),
    { north: -90, south: 90, east: -180, west: 180 }
  );
};

export {  computeBbox };