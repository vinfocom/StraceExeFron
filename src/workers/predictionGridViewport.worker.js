const toFinite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toCell = (row) => {
  const bounds = row?.bounds || row?.cell_bounds;
  if (bounds) {
    const south = toFinite(bounds.south ?? bounds.minLat);
    const west = toFinite(bounds.west ?? bounds.minLng);
    const north = toFinite(bounds.north ?? bounds.maxLat);
    const east = toFinite(bounds.east ?? bounds.maxLng);
    if ([south, west, north, east].every(Number.isFinite)) {
      return { ...row, bounds: { south, west, north, east } };
    }
  }

  const lat = toFinite(row?.lat ?? row?.latitude);
  const lng = toFinite(row?.lng ?? row?.longitude ?? row?.lon);
  const size = Math.max(1, Number(row?.cellSizeMeters ?? row?.sizeMeters ?? 25));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const latDelta = size / 111320;
  const lngDelta = size / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return {
    ...row,
    bounds: { south: lat - latDelta, west: lng - lngDelta, north: lat + latDelta, east: lng + lngDelta },
  };
};

self.onmessage = ({ data }) => {
  const { requestId, rows = [], bounds, maxRows } = data || {};
  try {
    const visible = rows.map(toCell).filter(Boolean).filter((row) => {
      if (!bounds) return true;
      const b = row.bounds;
      return b.north >= bounds.south && b.south <= bounds.north && b.east >= bounds.west && b.west <= bounds.east;
    });
    const limit = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : visible.length;
    const step = Math.max(1, Math.ceil(visible.length / limit));
    self.postMessage({ requestId, rows: visible.filter((_, index) => index % step === 0).slice(0, limit) });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
