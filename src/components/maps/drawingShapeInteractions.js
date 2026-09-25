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
