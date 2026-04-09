// src/utils/viewport.js
const VIEWPORT_KEY = "map_viewport_v2";

export const loadSavedViewport = () => {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) {
      return v;
    }
  } catch {}
  return null;
};

export const saveViewport = (map) => {
  try {
    const c = map.getCenter?.();
    const z = map.getZoom?.();
    if (!c || !Number.isFinite(z)) return;
    localStorage.setItem(
      VIEWPORT_KEY,
      JSON.stringify({ lat: c.lat(), lng: c.lng(), zoom: z })
    );
  } catch {}
};