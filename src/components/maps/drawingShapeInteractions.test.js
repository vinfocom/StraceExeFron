import test from "node:test";
import assert from "node:assert/strict";
import {
  getDrawingHoverTarget,
  getPolygonDrawingHitData,
  getPolylineDrawingHitData,
  handleShapeOverlayRightClick,
  isCompletedDeletableDrawing,
  removeDrawingEntryById,
  removeShapeById,
} from "./drawingShapeInteractions.js";

const polygonPath = [[0, 0], [1, 0], [1, 1], [0, 0]];

test("hover hit data supports polygons, rectangles, circles, and polylines only when completed", () => {
  const drawings = [
    { id: "polygon-a", type: "polygon", path: polygonPath },
    { id: "rectangle-a", type: "rectangle", path: polygonPath },
    { id: "circle-a", type: "circle", path: polygonPath },
    { id: "line-a", type: "polyline", path: [[0, 0], [1, 1]] },
    { id: "active-polygon", type: "polygon", path: polygonPath },
    { id: "saved-boundary", type: "site", path: polygonPath },
  ];

  assert.deepEqual(
    getPolygonDrawingHitData(drawings).map(({ id }) => id),
    ["polygon-a", "rectangle-a", "circle-a"],
  );
  assert.deepEqual(getPolygonDrawingHitData(drawings)[0].polygon, polygonPath.slice(0, -1));
  assert.deepEqual(getPolylineDrawingHitData(drawings).map(({ id }) => id), ["line-a"]);
  assert.equal(isCompletedDeletableDrawing(drawings[4]), false);
  assert.equal(isCompletedDeletableDrawing(drawings[5]), false);
});

test("hover target appears for a supported shape and clears for hover-out or active previews", () => {
  assert.deepEqual(
    getDrawingHoverTarget({ object: { id: "line-a", type: "polyline" }, x: 40, y: 60 }),
    { id: "line-a", x: 40, y: 60 },
  );
  assert.equal(getDrawingHoverTarget({ object: { id: "active-circle", type: "circle" }, x: 1, y: 2 }), null);
  assert.equal(getDrawingHoverTarget(null), null);
});

test("deleting by id cleans up only the target and preserves sibling shape listeners and drawings", () => {
  const first = { id: "shape-a", listeners: ["listener-a"] };
  const second = { id: "shape-b", listeners: ["listener-b"] };
  const cleaned = [];
  const removal = removeShapeById([first, second], "shape-a", (shape) => cleaned.push(shape));

  assert.equal(removal.target, first);
  assert.deepEqual(removal.remaining, [second]);
  assert.deepEqual(cleaned, [first]);
  assert.deepEqual(second.listeners, ["listener-b"]);
  assert.deepEqual(removeDrawingEntryById([
    { id: "shape-a" },
    { id: "shape-b" },
  ], "shape-a"), [{ id: "shape-b" }]);
});

test("a completed offset-route polygon remains targetable and deletes through the same shape path", () => {
  const routeDrawing = {
    id: "route-polygon",
    type: "polygon",
    path: polygonPath,
    analysisLogs: [{ id: "log-1" }],
    suppressVertexMarkers: true,
    suppressGridAnalysis: true,
  };
  const nativeRouteShape = { ...routeDrawing, overlay: { setMap() {} } };
  let removed;
  const rightClickEvent = { domEvent: { preventDefault() {}, stopPropagation() {} } };

  assert.equal(isCompletedDeletableDrawing(routeDrawing), true);
  assert.equal(getPolygonDrawingHitData([routeDrawing])[0].id, routeDrawing.id);
  assert.equal(
    handleShapeOverlayRightClick(rightClickEvent, nativeRouteShape, (shape) => { removed = shape; }),
    true,
  );
  assert.equal(removed, nativeRouteShape);
});

test("right-click deletes without hover, and only a shape hit suppresses the browser menu", () => {
  let prevented = 0;
  let stopped = 0;
  let removed = null;
  const shape = { id: "line-a", type: "polyline" };
  const event = {
    domEvent: {
      preventDefault: () => { prevented += 1; },
      stopPropagation: () => { stopped += 1; },
    },
  };

  handleShapeOverlayRightClick(event, shape, (target) => { removed = target; });
  assert.equal(removed, shape);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  assert.equal(handleShapeOverlayRightClick(event, null, () => assert.fail("empty map must not delete")), false);
  assert.equal(prevented, 1);
});
