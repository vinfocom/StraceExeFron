const readCoordinate = (coordinate) => {
  const read = (value) => {
    try { return typeof value === "function" ? value.call(coordinate) : value; }
    catch { return Number.NaN; }
  };
  if (Array.isArray(coordinate)) return [Number(coordinate[1]), Number(coordinate[0])];
  return [Number(read(coordinate?.lat)), Number(read(coordinate?.lng ?? coordinate?.lon))];
};

const materialize = (source) => {
  if (Array.isArray(source)) return source;
  if (source && typeof source.getLength === "function" && typeof source.getAt === "function") {
    try { return Array.from({ length: source.getLength() }, (_, index) => source.getAt(index)); }
    catch { return []; }
  }
  return [];
};

const readPath = (polygon) => {
  let source = polygon?.paths ?? polygon?.path;
  if (source == null) {
    try { source = polygon?.getPath?.() ?? polygon?.getPaths?.(); } catch { return []; }
  }
  const points = materialize(source);
  // Polygon paths can be a flat point array, nested rings, or a Google MVCArray
  // of rings. The map filter uses the first ring, so identity follows that ring.
  const first = points[0];
  const nested = (Array.isArray(first) && (first.length === 0 || Array.isArray(first[0]) || (first[0] && typeof first[0] === "object")))
    || (first && typeof first.getAt === "function");
  return nested ? materialize(first) : points;
};

export const getPolygonRequestIdentity = (polygons = []) => {
  if (!Array.isArray(polygons)) return [];
  return polygons.map((polygon) => ({
    id: polygon?.id ?? polygon?.polygon_id ?? polygon?.polygonId ?? null,
    path: readPath(polygon).map(readCoordinate).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
  }));
};
