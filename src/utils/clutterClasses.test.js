import test from "node:test";
import assert from "node:assert/strict";
import {
  CLUTTER_CLASS_DEFINITIONS,
  getClutterClassColor,
  normalizeClutterClass,
} from "./clutterClasses.js";

test("preserves the six final clutter classes", () => {
  for (const { name, color } of CLUTTER_CLASS_DEFINITIONS) {
    assert.equal(normalizeClutterClass(name), name);
    assert.deepEqual(getClutterClassColor(name), color);
  }
});

test("maps legacy geometry labels into final clutter classes", () => {
  assert.equal(normalizeClutterClass("building"), "Urban");
  assert.equal(normalizeClutterClass("highway"), "Urban");
  assert.equal(normalizeClutterClass("green"), "Vegetation");
  assert.equal(normalizeClutterClass("bare land"), "Rural/Open");
  assert.equal(normalizeClutterClass("dense_urban"), "Dense Urban");
});

test("uses land cover only when a clutter class is absent", () => {
  assert.equal(normalizeClutterClass(null, "forest"), "Vegetation");
  assert.equal(normalizeClutterClass("urban", "water"), "Urban");
  assert.equal(normalizeClutterClass(null, null), "Unclassified");
});
