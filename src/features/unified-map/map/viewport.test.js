import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMapBounds } from "./viewport.js";

const bounds = (south, west, north, east) => ({
  getNorthEast: () => ({ lat: () => north, lng: () => east }),
  getSouthWest: () => ({ lat: () => south, lng: () => west }),
});

test("viewport bounds add padding and clamp to valid coordinates", () => {
  assert.deepEqual(normalizeMapBounds(bounds(89.9, 179.9, 90, 180)), {
    north: 90,
    south: 89.882,
    east: 180,
    west: 179.882,
  });
});

test("invalid or unavailable Google bounds are ignored", () => {
  assert.equal(normalizeMapBounds(null), null);
  assert.equal(normalizeMapBounds(bounds(Number.NaN, 0, 10, 10)), null);
});
