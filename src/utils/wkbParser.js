// Import Buffer first
import { Buffer } from 'buffer';

// Ensure Buffer is available globally
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
  globalThis.Buffer = globalThis.Buffer || Buffer;
}

// Now import wkx
import wkx from 'wkx';

/**
 * Parse WKB (Well-Known Binary) to WKT and GeoJSON
 * @param {string} wkbBase64 - Base64 encoded WKB string
 * @returns {Object} - { wkt, geometry, error }
 */
export function parseWKB(wkbBase64) {
  try {
    if (!wkbBase64) {
      return { wkt: null, geometry: null, error: 'No WKB data provided' };
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(wkbBase64, 'base64');
    
    // Parse WKB
    const geom = wkx.Geometry.parse(buffer);
    
    // Convert to WKT
    const wkt = geom.toWkt();
    
    // Convert to GeoJSON
    const geometry = geom.toGeoJSON();
    
    return { wkt, geometry, error: null };
  } catch (error) {
    console.error('WKB parsing error:', error);
    return { wkt: null, geometry: null, error: error.message };
  }
}

/**
 * Parse multiple polygons from WKB
 * @param {Array} polygonList - Array of polygon objects with 'region' field
 * @returns {Array} - Parsed polygons with wkt and geometry
 */
export function parsePolygonList(polygonList) {
  if (!Array.isArray(polygonList)) {
    console.error('parsePolygonList expects an array');
    return [];
  }

  return polygonList.map((p) => {
    const { wkt, geometry, error } = parseWKB(p.region);
    
    if (error) {
      console.warn(` Failed to parse polygon ${p.name}:`, error);
    } else {
      console.log(`✅ Parsed ${p.name}`);
    }
    
    return {
      value: p.id,
      label: p.name,
      geometry: geometry,
      wkt: wkt,
      geojson: geometry ? { 
        type: "Feature", 
        geometry: geometry,
        properties: { name: p.name, id: p.id }
      } : null,
      rawRegion: p.region,
      parseError: error
    };
  });
}

export default { parseWKB, parsePolygonList };