import test from "node:test";
import assert from "node:assert/strict";
import { assertCategorizedLayerEntries, registerMapLayerGroup, sortMapLayerEntries } from "./mapLayerPolicy.js";

const layer = (id) => ({ id });

test("map layers follow the shared bottom-to-top category order", () => {
  const actual = sortMapLayerEntries([
    { category: "drawings", layer: layer("draw-outline") },
    { category: "sites", layer: layer("site-markers") },
    { category: "events", layer: layer("subsessions"), order: 30 },
    { category: "predictions", layer: layer("prediction-grid") },
    { category: "logs", layer: layer("primary-logs") },
    { category: "background", layer: layer("clutter") },
  ]).map(({ layer: current }) => current.id);

  assert.deepEqual(actual, ["clutter", "primary-logs", "prediction-grid", "site-markers", "subsessions", "draw-outline"]);
});

test("same-category layers use explicit order, then stable layer id", () => {
  const actual = sortMapLayerEntries([
    { category: "events", layer: layer("z-event"), order: 10 },
    { category: "events", layer: layer("b-event"), order: 0 },
    { category: "events", layer: layer("a-event"), order: 0 },
  ]).map(({ layer: current }) => current.id);

  assert.deepEqual(actual, ["a-event", "b-event", "z-event"]);
});

test("missing categories and duplicate ids are reported in development validation", () => {
  const warnings = [];
  const valid = assertCategorizedLayerEntries([
    { category: "logs", layer: layer("same-id") },
    { category: "unknown", layer: layer("same-id") },
    { layer: layer("") },
  ], { warn: (message) => warnings.push(message) });

  assert.equal(valid, false);
  assert.equal(warnings.length, 4);
});

test("registration cleanup is owner-scoped and stale cleanup cannot remove a replacement", () => {
  const groups = new Map();
  const firstCleanup = registerMapLayerGroup(groups, "map-a/subsession", "events", [layer("subsession-a")]);
  const otherCleanup = registerMapLayerGroup(groups, "map-b/subsession", "events", [layer("subsession-b")]);
  const replacementCleanup = registerMapLayerGroup(groups, "map-a/subsession", "events", [layer("subsession-a-v2")]);

  firstCleanup();
  assert.equal(groups.get("map-a/subsession").layers[0].id, "subsession-a-v2");
  otherCleanup();
  assert.equal(groups.has("map-a/subsession"), true);
  assert.equal(groups.has("map-b/subsession"), false);
  replacementCleanup();
  assert.equal(groups.size, 0);
});
