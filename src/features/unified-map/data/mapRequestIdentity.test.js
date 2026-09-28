import test from "node:test";
import assert from "node:assert/strict";
import { getPolygonRequestIdentity } from "./mapRequestIdentity.js";
import { createRequestGeneration } from "./requestGeneration.js";

const mvc = (items) => ({ getLength: () => items.length, getAt: (index) => items[index] });

test("flat paths, nested rings, path arrays, and MVCArray paths share canonical geometry", () => {
  const points = [{ lat: 28, lng: 77 }, { lat: 29, lng: 78 }, { lat: 30, lng: 79 }];
  const expected = getPolygonRequestIdentity([{ id: 5, paths: points }]);
  assert.deepEqual(getPolygonRequestIdentity([{ id: 5, paths: [points] }]), expected);
  assert.deepEqual(getPolygonRequestIdentity([{ id: 5, path: points }]), expected);
  assert.deepEqual(getPolygonRequestIdentity([{ id: 5, paths: mvc([mvc(points)]) }]), expected);
  assert.deepEqual(getPolygonRequestIdentity([{ id: 5, getPath: () => mvc(points) }]), expected);
});

test("Google coordinate accessors and numeric coordinate pairs are normalized", () => {
  const point = (lat, lng) => ({ lat: () => lat, lng: () => lng });
  assert.deepEqual(
    getPolygonRequestIdentity([{ path: [point(28, 77), [78, 29], { lat: "30", lng: "79" }] }])[0].path,
    [[28, 77], [29, 78], [30, 79]],
  );
});

test("flat numeric coordinate pairs are not mistaken for a nested ring", () => {
  assert.deepEqual(
    getPolygonRequestIdentity([{ path: [[77, 28], [78, 29], [79, 30]] }])[0].path,
    [[28, 77], [29, 78], [30, 79]],
  );
});

test("changed geometry with a stable polygon id changes request identity", () => {
  const first = getPolygonRequestIdentity([{ id: "boundary", paths: [[{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]] }]);
  const changed = getPolygonRequestIdentity([{ id: "boundary", paths: [[{ lat: 0, lng: 0 }, { lat: 2, lng: 2 }]] }]);
  assert.notDeepEqual(first, changed);
  const requests = createRequestGeneration();
  const firstRequest = requests.begin(JSON.stringify(first));
  const updatedRequest = requests.begin(JSON.stringify(changed));
  assert.equal(requests.isCurrent(firstRequest), false);
  assert.equal(requests.isCurrent(updatedRequest), true);
});

test("malformed polygon paths safely produce an empty path", () => {
  assert.deepEqual(getPolygonRequestIdentity([{ id: 1, getPath() { throw new Error("broken"); } }]), [{ id: 1, path: [] }]);
});
