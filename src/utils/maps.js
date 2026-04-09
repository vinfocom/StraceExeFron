// src/utils/maps.js

// Local date formatter (avoid UTC off-by-one)
export const toYmdLocal = (d) => {
  if (!(d instanceof Date)) return "";
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

export const metersPerPixel = (zoom, lat) => {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
};

const computeDenseCellBounds = (points, cellSizeMeters = 800) => {
  if (!points?.length) return null;
  const n = points.length;
  if (n < 10) return null;

  let minLat = Infinity, minLng = Infinity, avgLat = 0;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    avgLat += p.lat;
  }
  avgLat /= n;

  const latDegPerM = 1 / 111320;
  const lonDegPerM = 1 / (111320 * Math.cos((avgLat * Math.PI) / 180) || 1);

  const cellLatDeg = cellSizeMeters * latDegPerM;
  const cellLngDeg = cellSizeMeters * lonDegPerM;
  if (!Number.isFinite(cellLatDeg) || !Number.isFinite(cellLngDeg)) return null;

  const cells = new Map();
  for (const p of points) {
    const iLat = Math.floor((p.lat - minLat) / cellLatDeg);
    const iLng = Math.floor((p.lng - minLng) / cellLngDeg);
    const key = `${iLat}:${iLng}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }

  let densest = null;
  for (const arr of cells.values()) {
    if (!densest || arr.length > densest.length) densest = arr;
  }
  if (!densest || densest.length < Math.max(5, Math.ceil(n * 0.05))) return null;

  const bounds = new window.google.maps.LatLngBounds();
  let hasValid = false;
  for (const p of densest) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      bounds.extend({ lat: p.lat, lng: p.lng });
      hasValid = true;
    }
  }
  return hasValid ? bounds : null;
};

const computePercentileBounds = (points, percentile = 0.8) => {
  if (!points?.length) return null;
  const n = points.length;
  if (n === 1) {
    const p = points[0];
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: p.lat, lng: p.lng });
    return bounds;
  }
  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b);
  const q = (1 - percentile) / 2;
  const lowerIdx = Math.max(0, Math.floor(q * (n - 1)));
  const upperIdx = Math.min(n - 1, Math.ceil((1 - q) * (n - 1)));
  const latMin = lats[lowerIdx], latMax = lats[upperIdx];
  const lngMin = lngs[lowerIdx], lngMax = lngs[upperIdx];
  if (!Number.isFinite(latMin) || !Number.isFinite(latMax) || !Number.isFinite(lngMin) || !Number.isFinite(lngMax)) return null;
  if (latMin === latMax || lngMin === lngMax) return null;

  const bounds = new window.google.maps.LatLngBounds();
  bounds.extend({ lat: latMin, lng: lngMin });
  bounds.extend({ lat: latMax, lng: lngMax });
  return bounds;
};

export const fitMapToMostlyLogs = (map, points) => {
  if (!map || !Array.isArray(points) || points.length === 0) return;
  const denseBounds = computeDenseCellBounds(points, 800);
  if (denseBounds) return void map.fitBounds(denseBounds);
  const percentileBounds = computePercentileBounds(points, 0.8);
  if (percentileBounds) return void map.fitBounds(percentileBounds);
  const allBounds = new window.google.maps.LatLngBounds();
  let hasValid = false;
  for (const p of points) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      allBounds.extend({ lat: p.lat, lng: p.lng });
      hasValid = true;
    }
  }
  if (hasValid) map.fitBounds(allBounds);
};