export const normalizeMapBounds = (bounds, paddingRatio = 0.18) => {
  if (!bounds) return null;
  const northEast = bounds.getNorthEast?.();
  const southWest = bounds.getSouthWest?.();
  const north = Number(northEast?.lat?.());
  const east = Number(northEast?.lng?.());
  const south = Number(southWest?.lat?.());
  const west = Number(southWest?.lng?.());
  if (![north, east, south, west].every(Number.isFinite)) return null;

  const latPadding = Math.max(0.0005, Math.abs(north - south) * paddingRatio);
  const lngPadding = Math.max(0.0005, Math.abs(east - west) * paddingRatio);
  return {
    north: Math.min(90, north + latPadding),
    south: Math.max(-90, south - latPadding),
    east: Math.min(180, east + lngPadding),
    west: Math.max(-180, west - lngPadding),
  };
};
