export const normalizeElevationProfile = (profile) => {
  if (!Array.isArray(profile)) return [];
  return profile
    .map((point) => ({
      distance: Number(point?.distance),
      elevation: Number(point?.elevation),
      lat: point?.lat !== null && point?.lat !== undefined && Number.isFinite(Number(point.lat))
        ? Number(point.lat)
        : null,
      lng: point?.lng !== null && point?.lng !== undefined && Number.isFinite(Number(point.lng))
        ? Number(point.lng)
        : null,
    }))
    .filter((point) => Number.isFinite(point.distance) && Number.isFinite(point.elevation));
};

export const getElevationSampleCoordinates = (location) => {
  const read = (key) => {
    const value = location?.[key];
    const coordinate = Number(typeof value === "function" ? value.call(location) : value);
    return Number.isFinite(coordinate) ? coordinate : null;
  };
  return { lat: read("lat"), lng: read("lng") };
};

export const findNearestElevationSample = (profile, distance) => {
  if (!Array.isArray(profile) || profile.length === 0 || !Number.isFinite(distance)) return -1;
  let nearestIndex = -1;
  let nearestDelta = Infinity;
  profile.forEach((point, index) => {
    const sampleDistance = Number(point?.distance);
    const elevation = Number(point?.elevation);
    if (!Number.isFinite(sampleDistance) || !Number.isFinite(elevation)) return;
    const delta = Math.abs(sampleDistance - distance);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearestIndex = index;
    }
  });
  return nearestIndex;
};

export const isTerrainHoverTargetCurrent = (target, drawing) => Boolean(
  target && drawing &&
  String(target.drawingId) === String(drawing.id) &&
  target.geometryRevision === drawing.geometryRevision &&
  target.profileRevision === drawing.profileRevision
);
