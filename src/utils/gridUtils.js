

/**
 * Generate a grid of cells within a polygon boundary
 * @param {Array} polygonPaths - Array of {lat, lng} points defining the polygon
 * @param {number} cellSize - Size of each grid cell in meters
 * @returns {Array} Array of grid cells with bounds
 */
export const generateGridFromPolygon = (polygonPaths, cellSize = 50) => {
  if (!polygonPaths || polygonPaths.length < 3) return [];

  // Find bounding box
  const lats = polygonPaths.map(p => p.lat);
  const lngs = polygonPaths.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Convert cellSize from meters to degrees (approximate)
  // 1 degree latitude ≈ 111,000 meters
  // 1 degree longitude varies by latitude
  const avgLat = (minLat + maxLat) / 2;
  const latDelta = cellSize / 111000;
  const lngDelta = cellSize / (111000 * Math.cos(avgLat * Math.PI / 180));

  const cells = [];
  let cellId = 0;

  // Generate grid cells
  for (let lat = minLat; lat < maxLat; lat += latDelta) {
    for (let lng = minLng; lng < maxLng; lng += lngDelta) {
      const cellBounds = {
        north: lat + latDelta,
        south: lat,
        east: lng + lngDelta,
        west: lng,
      };

      const center = {
        lat: lat + latDelta / 2,
        lng: lng + lngDelta / 2,
      };

      // Check if cell center is inside polygon
      if (isPointInPolygon(center, { paths: [polygonPaths] })) {
        cells.push({
          id: cellId++,
          bounds: cellBounds,
          center,
          paths: [
            { lat: cellBounds.north, lng: cellBounds.west },
            { lat: cellBounds.north, lng: cellBounds.east },
            { lat: cellBounds.south, lng: cellBounds.east },
            { lat: cellBounds.south, lng: cellBounds.west },
          ],
        });
      }
    }
  }

  return cells;
};

/**
 * Check if a point is inside a polygon
 */
export const isPointInPolygon = (point, polygon) => {
  const path = polygon?.paths?.[0];
  if (!path?.length) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

/**
 * Check if a point is inside a grid cell
 */
export const isPointInCell = (point, cell) => {
  return (
    point.lat >= cell.bounds.south &&
    point.lat <= cell.bounds.north &&
    point.lng >= cell.bounds.west &&
    point.lng <= cell.bounds.east
  );
};

/**
 * Calculate median of an array
 */
export const calculateMedian = (values) => {
  if (!values?.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Aggregate logs into grid cells
 * @param {Array} logs - Array of log points
 * @param {Array} cells - Array of grid cells
 * @param {string} metric - Metric to aggregate (e.g., 'rsrp')
 * @returns {Array} Array of cell aggregations with median values
 */
export const aggregateLogsToGrid = (logs, cells, metric) => {
  return cells.map(cell => {
    // Find all logs inside this cell
    const logsInCell = logs.filter(log => isPointInCell(log, cell));

    if (logsInCell.length === 0) {
      return null;
    }

    // Extract metric values
    const values = logsInCell
      .map(log => parseFloat(log[metric]))
      .filter(v => !isNaN(v));

    if (values.length === 0) {
      return null;
    }

    // Calculate statistics
    const median = calculateMedian(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Get most common provider, band, technology
    const getMostCommon = (field) => {
      const counts = {};
      logsInCell.forEach(log => {
        const val = log[field] || 'Unknown';
        counts[val] = (counts[val] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
    };

    return {
      ...cell,
      lat: cell.center.lat,
      lng: cell.center.lng,
      [metric]: median,
      count: logsInCell.length,
      values: {
        median,
        min,
        max,
        avg,
      },
      // Categorical fields - use most common
      provider: getMostCommon('provider'),
      band: getMostCommon('band'),
      technology: getMostCommon('technology'),
      isGridCell: true, // Flag to identify grid cells
    };
  }).filter(Boolean); // Remove empty cells
};