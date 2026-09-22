
const apiKey =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY) ||
  '';
const mapId =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_GOOGLE_MAPS_MAP_ID) ||
  '5e49cd40d6e8c2f7f896f084';

export const GOOGLE_MAP_ID = mapId;

export const GOOGLE_MAPS_LOADER_OPTIONS = {
  id: 'google-map-script',
  googleMapsApiKey: apiKey,
  libraries: ['places', 'geometry', 'elevation', 'visualization', 'marker'],
  mapIds: [mapId],
  version: 'weekly',
};

export const getGoogleMapsConfigError = () => {
  if (apiKey.trim()) return null;
  return 'Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY in a Vite env file such as StraceExeFron/.env.local and restart the dev server.';
};

export const getGoogleMapsErrorMessage = (error) => {
  const configError = getGoogleMapsConfigError();
  if (configError) return configError;

  const baseMessage =
    error?.message?.trim() || 'Google Maps failed to initialize.';

  return `${baseMessage} Check that the API key is valid, Maps JavaScript API is enabled, billing is active, and this app origin is allowed by the key restrictions.`;
};
