export const DELETABLE_DRAWING_TYPES = new Set([
  "polygon",
  "rectangle",
  "circle",
  "polyline",
]);

export const isCompletedDeletableDrawing = (drawing) => Boolean(
  drawing?.id !== null &&
  drawing?.id !== undefined &&
  DELETABLE_DRAWING_TYPES.has(drawing.type) &&
  !String(drawing.id).startsWith("active-"),
);

export const getDrawingHoverTarget = (info) => {
  const drawing = info?.object;
  if (!isCompletedDeletableDrawing(drawing)) return null;
  return { id: drawing.id, x: info.x, y: info.y };
};

export const getNativeDrawingHoverTarget = (id, event, bounds) => {
  const pointer = event?.domEvent || event;
  if (id == null || !bounds || !Number.isFinite(pointer?.clientX) || !Number.isFinite(pointer?.clientY)) {
    return null;
  }
  return { id, x: pointer.clientX - bounds.left, y: pointer.clientY - bounds.top };
};

export const getDrawingBoundaryHoverTarget = (id, pointer, paths, tolerance = 12) => {
  if (id == null || !Number.isFinite(pointer?.x) || !Number.isFinite(pointer?.y)) return null;
  let closest = null;
  let closestDistanceSquared = tolerance * tolerance;

  for (const path of paths || []) {
    if (!Array.isArray(path) || path.length < 2) continue;
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1];
      const end = path[index];
      if (![start?.x, start?.y, end?.x, end?.y].every(Number.isFinite)) continue;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / lengthSquared,
      ));
      const x = start.x + ratio * dx;
      const y = start.y + ratio * dy;
      const distanceSquared = (pointer.x - x) ** 2 + (pointer.y - y) ** 2;
      if (distanceSquared <= closestDistanceSquared) {
        closestDistanceSquared = distanceSquared;
        closest = { id, x, y, boundaryAnchored: true };
      }
    }
  }
  return closest;
};

export const getClosestDrawingBoundaryHoverTarget = (pointer, drawings, tolerance = 12) => {
  let closest = null;
  let closestDistanceSquared = tolerance * tolerance;
  // The most recently drawn shape wins when two boundaries are equally close.
  for (let index = (drawings?.length || 0) - 1; index >= 0; index -= 1) {
    const drawing = drawings[index];
    const target = getDrawingBoundaryHoverTarget(drawing.id, pointer, drawing.paths, tolerance);
    if (!target) continue;
    const distanceSquared = (pointer.x - target.x) ** 2 + (pointer.y - target.y) ** 2;
    if (distanceSquared < closestDistanceSquared || !closest) {
      closest = target;
      closestDistanceSquared = distanceSquared;
    }
  }
  return closest;
};

export const getDrawingPath = (drawing) => {
  const geometry = drawing?.geometry;
  if (!geometry) return [];

  if (geometry.type === "polyline") {
    return (geometry.path || []).map((point) => [Number(point.lng), Number(point.lat)]);
  }
  if (geometry.type === "polygon") {
    const path = (geometry.polygon || []).map((point) => [Number(point.lng), Number(point.lat)]);
    if (path.length < 3 || String(drawing?.id).startsWith("active-")) return path;
    const first = path[0];
    const last = path[path.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? path : [...path, first];
  }
  if (geometry.type === "rectangle") {
    const sw = geometry.rectangle?.sw;
    const ne = geometry.rectangle?.ne;
    if (!sw || !ne) return [];
    return [
      [Number(sw.lng), Number(sw.lat)],
      [Number(ne.lng), Number(sw.lat)],
      [Number(ne.lng), Number(ne.lat)],
      [Number(sw.lng), Number(ne.lat)],
      [Number(sw.lng), Number(sw.lat)],
    ];
  }
  if (geometry.type === "circle") {
    const center = geometry.circle?.center;
    const radius = Number(geometry.circle?.radius);
    if (!center || !Number.isFinite(radius) || radius <= 0) return [];
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    const latDelta = radius / 111320;
    const lngDelta = radius / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    return Array.from({ length: 65 }, (_, index) => {
      if (index === 64) return [lng + lngDelta, lat];
      const angle = (index / 64) * Math.PI * 2;
      return [lng + Math.cos(angle) * lngDelta, lat + Math.sin(angle) * latDelta];
    });
  }
  return [];
};

export const setCompletedDrawingInteractions = (shapes, isDrawingActive) => {
  (shapes || []).forEach((shape) => {
    shape.overlay?.setOptions?.({
      clickable: !isDrawingActive,
      draggable: !isDrawingActive,
      editable: false,
    });
    [...(shape.vertexMarkers || []), ...(shape.midpointMarkers || [])].forEach(({ marker }) => {
      if (marker) marker.style.pointerEvents = isDrawingActive ? "none" : "";
    });
  });
};

export const getPolygonDrawingHitData = (drawingData) => (drawingData || [])
  .filter((drawing) => isCompletedDeletableDrawing(drawing) && drawing.type !== "polyline")
  .map((drawing) => {
    const first = drawing.path[0];
    const last = drawing.path[drawing.path.length - 1];
    const isClosed = first?.[0] === last?.[0] && first?.[1] === last?.[1];
    return { ...drawing, polygon: isClosed ? drawing.path.slice(0, -1) : drawing.path };
  })
  .filter((drawing) => drawing.polygon.length >= 3);

export const getPolylineDrawingHitData = (drawingData) => (drawingData || [])
  .filter((drawing) => isCompletedDeletableDrawing(drawing) && drawing.type === "polyline")
  .filter((drawing) => drawing.path.length >= 2);

export const removeShapeById = (shapes, id, cleanupShape) => {
  const current = Array.isArray(shapes) ? shapes : [];
  const target = current.find((shape) => String(shape?.id) === String(id));
  if (!target) return { target: null, remaining: current };
  cleanupShape?.(target);
  return { target, remaining: current.filter((shape) => shape !== target) };
};

export const removeDrawingEntryById = (drawings, id) => (Array.isArray(drawings) ? drawings : [])
  .filter((drawing) => String(drawing?.id) !== String(id));

export const handleShapeOverlayRightClick = (event, shape, removeShape) => {
  if (!shape) return false;
  event?.domEvent?.preventDefault?.();
  event?.domEvent?.stopPropagation?.();
  removeShape?.(shape);
  return true;
};
