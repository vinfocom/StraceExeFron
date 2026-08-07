export const LOG_SAMPLE_FIRST_THRESHOLD = 50000;
export const LOG_SAMPLE_SECOND_THRESHOLD = 100000;

// Sampling is intentionally shallow: large drive-test sets still keep their
// shape and colour distribution instead of collapsing into aggregate markers.
export const getLogSamplingStride = (totalLogs) => {
  if (totalLogs > LOG_SAMPLE_SECOND_THRESHOLD) return 3;
  if (totalLogs > LOG_SAMPLE_FIRST_THRESHOLD) return 2;
  return 1;
};

const isInsideBounds = (lng, lat, bounds) => {
  if (!bounds) return true;
  const crossesAntimeridian = bounds.east < bounds.west;
  const longitudeMatches = crossesAntimeridian
    ? lng >= bounds.west || lng <= bounds.east
    : lng >= bounds.west && lng <= bounds.east;

  return lat >= bounds.south && lat <= bounds.north && longitudeMatches;
};

const getSpatialBucketKey = (lng, lat, zoom, cellPixels) => {
  const scale = 256 * (2 ** zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLatitude = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale;
  return `${Math.floor(x / cellPixels)}|${Math.floor(y / cellPixels)}`;
};

/**
 * Returns source indexes for valid, visible logs. Once a dataset crosses a
 * threshold, only nearby logs share a skip counter. Sparse/isolated logs are
 * therefore never lost and dense ranges retain proportionally more markers.
 */
export const sampleLogIndices = ({
  coordinates,
  totalLogs,
  bounds = null,
  zoom = 12,
  cellPixels = 16,
  selectedIndex = -1,
  maxRows = null,
}) => {
  const stride = getLogSamplingStride(totalLogs);
  const safeZoom = Number.isFinite(zoom) ? Math.max(0, Math.min(24, zoom)) : 12;
  const bucketCounts = stride > 1 ? new Map() : null;
  const result = [];
  const coordinateCount = Math.floor((coordinates?.length || 0) / 2);

  for (let index = 0; index < coordinateCount; index += 1) {
    const lng = coordinates[index * 2];
    const lat = coordinates[index * 2 + 1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !isInsideBounds(lng, lat, bounds)) continue;

    let keep = true;
    if (stride > 1 && index !== selectedIndex) {
      const bucketKey = getSpatialBucketKey(lng, lat, safeZoom, cellPixels);
      const bucketCount = bucketCounts.get(bucketKey) || 0;
      keep = bucketCount % stride === 0;
      bucketCounts.set(bucketKey, bucketCount + 1);
    }

    if (keep) result.push(index);
  }

  if (Number.isFinite(maxRows) && maxRows > 0 && result.length > maxRows) {
    const limitStride = Math.ceil(result.length / maxRows);
    return Uint32Array.from(result.filter((_, index) => index % limitStride === 0).slice(0, maxRows));
  }

  return Uint32Array.from(result);
};
