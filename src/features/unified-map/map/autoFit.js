export const resolveAutoFitAction = (state, {
  identity,
  revision = 0,
  hasCoordinates,
  complete,
  explicitFit = false,
}) => {
  if (state.identity !== identity) {
    Object.assign(state, { identity, revision, initialFit: false, finalFit: false, userNavigated: false });
  }
  if (explicitFit) Object.assign(state, { initialFit: false, finalFit: false, userNavigated: false });
  if (!hasCoordinates) return "none";
  if (!state.initialFit) {
    state.initialFit = true;
    state.finalFit = Boolean(complete);
    return "initial";
  }
  if (state.revision !== revision) {
    state.revision = revision;
    if (complete && !state.userNavigated) return "revision";
  }
  if (complete && !state.finalFit && !state.userNavigated) {
    state.finalFit = true;
    return "final";
  }
  return "none";
};

export const shouldShowInitialMapSpinner = ({ isLoading, hasRows, hasMounted }) =>
  Boolean(isLoading && !hasRows && !hasMounted);

export const getValidMapCoordinates = (points) => (Array.isArray(points) ? points : [])
  .map((point) => ({
    lat: Number(point?.lat ?? point?.latitude),
    lng: Number(point?.lng ?? point?.longitude ?? point?.lon),
  }))
  .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);
