const readCoordinate = (coordinate) => {
  const read = (value) => (typeof value === "function" ? value.call(coordinate) : value);
  return [Number(read(coordinate?.lat)), Number(read(coordinate?.lng ?? coordinate?.lon))];
};

const readPath = (polygon) => {
  const source = polygon?.paths?.[0] ?? polygon?.paths ?? polygon?.path ?? polygon?.getPath?.();
  if (Array.isArray(source)) return source;
  if (source && typeof source.getLength === "function" && typeof source.getAt === "function") {
    return Array.from({ length: source.getLength() }, (_, index) => source.getAt(index));
  }
  return [];
};

export const getPolygonRequestIdentity = (polygons = []) => {
  if (!Array.isArray(polygons)) return [];
  return polygons.map((polygon) => ({
    id: polygon?.id ?? polygon?.polygon_id ?? polygon?.polygonId ?? null,
    path: readPath(polygon).map(readCoordinate),
  }));
};
