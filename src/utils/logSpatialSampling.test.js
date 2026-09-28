import test from "node:test";
import assert from "node:assert/strict";
import { sampleLogIndices } from "./logSpatialSampling.js";

test("row caps retain the selected point and significant event indexes", () => {
  const coordinates = new Float64Array(Array.from({ length: 10 }, (_, index) => [77 + index / 1000, 28]).flat());
  const indexes = sampleLogIndices({
    coordinates,
    totalLogs: 10,
    selectedIndex: 9,
    preserveIndexes: [7],
    maxRows: 3,
  });

  assert.deepEqual([...indexes], [0, 7, 9]);
});

test("sampling ignores preserved indexes outside the visible coordinate set", () => {
  const coordinates = new Float64Array([77, 28, 77.01, 28.01]);
  const indexes = sampleLogIndices({
    coordinates,
    totalLogs: 2,
    preserveIndexes: [20],
    maxRows: 1,
  });

  assert.equal(indexes.length, 1);
  assert.ok(indexes[0] === 0 || indexes[0] === 1);
});
