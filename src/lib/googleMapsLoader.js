
const apiKey =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY) ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  '';
const mapId =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_GOOGLE_MAPS_MAP_ID) ||
  '';

export const GOOGLE_MAPS_LOADER_OPTIONS = {
  id: 'google-map-script',
  googleMapsApiKey: apiKey,
  libraries: ['drawing', 'places', 'geometry', 'visualization'],
  ...(mapId ? { mapIds: [mapId] } : {}),
  version: 'weekly',
};
