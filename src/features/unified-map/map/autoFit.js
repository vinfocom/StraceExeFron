export const resolveAutoFitAction = (state, {
  identity,
  revision = 0,
  hasCoordinates,
  complete,
  secondaryRevision = 0,
  secondaryReady = false,
  explicitFit = false,
}) => {
  if (state.identity !== identity) {
    Object.assign(state, { identity, revision, initialFit: false, finalFit: false, secondaryFitRevision: null, userNavigated: false, pending: null });
  }
  if (explicitFit) Object.assign(state, { initialFit: false, finalFit: false, secondaryFitRevision: null, userNavigated: false, pending: null });
  if (!hasCoordinates || state.pending) return "none";
  if (!state.initialFit) return state.userNavigated ? "none" : "initial";
  if (state.revision !== revision) {
    if (complete && !state.userNavigated) return "revision";
  }
  if (complete && !state.finalFit && !state.userNavigated) return "final";
  if (secondaryReady && secondaryRevision !== state.secondaryFitRevision && !state.userNavigated) return "secondary";
  return "none";
};

export const confirmAutoFit = (state, { identity, revision, secondaryRevision, action }) => {
  if (state.identity !== identity || state.pending?.action !== action || state.pending?.revision !== revision) return false;
  state.pending = null;
  state.revision = revision;
  state.initialFit = true;
  if (action === "final" || action === "revision") state.finalFit = true;
  if (action === "initial") state.finalFit = Boolean(state.pendingComplete);
  if (secondaryRevision != null) state.secondaryFitRevision = secondaryRevision;
  return true;
};

export const isMapReadyForFit = (map, { width, height }) => {
  if (!map || width <= 0 || height <= 0 || typeof map.fitBounds !== "function") return false;
  try {
    return Boolean(map.getProjection?.());
  } catch {
    return false;
  }
};

export const shouldShowInitialMapSpinner = ({ isLoading, hasRows, hasMounted }) =>
  Boolean(isLoading && !hasRows && !hasMounted);

export const getMapCoordinate = (point) => {
  const rawLat = point?.lat ?? point?.latitude ?? point?.Lat ?? point?.Latitude ?? point?.LAT;
  const rawLng = point?.lng ?? point?.longitude ?? point?.lon ?? point?.Lng ?? point?.Longitude ?? point?.LNG;
  if (rawLat == null || rawLng == null || String(rawLat).trim() === "" || String(rawLng).trim() === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
};

export const getValidMapCoordinates = (points) => (Array.isArray(points) ? points : [])
  .map(getMapCoordinate).filter(Boolean);
