import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const createWorkerHarness = () => {
  const replies = [];
  const self = { postMessage: (message) => replies.push(message) };
  const source = readFileSync(new URL("../features/unified-map/processing/predictionGridViewport.worker.js", import.meta.url), "utf8");
  vm.runInNewContext(source, { self, Number, Math, Array, String, Error });
  return { self, replies };
};

test("prediction worker retains normalized data and rejects mismatched dataset revisions", () => {
  const { self, replies } = createWorkerHarness();
  self.onmessage({ data: {
    type: "dataset",
    datasetRevision: 4,
    rows: [{ id: "old", lat: 28, lng: 77, cellSizeMeters: 100 }],
  } });
  assert.equal(replies[0].type, "dataset-ready");
  assert.equal(replies[0].datasetRevision, 4);

  self.onmessage({ data: {
    type: "viewport", requestId: 1, datasetRevision: 4,
    bounds: { south: 27, west: 76, north: 29, east: 78 }, maxRows: 10,
  } });
  assert.equal(replies[1].rows.length, 1);
  assert.equal(replies[1].rows[0].id, "old");

  self.onmessage({ data: {
    type: "dataset", datasetRevision: 5,
    rows: [{ id: "new", lat: 40, lng: 100, cellSizeMeters: 100 }],
  } });
  const replyCountBeforeStaleViewport = replies.length;
  self.onmessage({ data: {
    type: "viewport", requestId: 2, datasetRevision: 4,
    bounds: null, maxRows: 10,
  } });
  assert.equal(replies.length, replyCountBeforeStaleViewport);

  self.onmessage({ data: {
    type: "viewport", requestId: 3, datasetRevision: 5,
    bounds: null, maxRows: 10,
  } });
  const latest = replies.at(-1);
  assert.equal(latest.datasetRevision, 5);
  assert.equal(latest.rows[0].id, "new");
});
