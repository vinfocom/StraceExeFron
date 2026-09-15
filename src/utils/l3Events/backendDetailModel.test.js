import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendDetailModel, createBackendL3Loader } from "./backendDetailModel.js";

test("initial load includes rows and every tab reuses the stored response", async () => {
  const requests = [];
  const response = { summaryVersion: 1, rows: [{ id: "l3-1" }] };
  const load = createBackendL3Loader(async scope => { requests.push(scope); return response; });
  const scope = { uploadId: 42, take: 50000 };
  const initial = load(scope);
  assert.equal(load({ ...scope }), initial, "effect replay shares the pending request");
  assert.equal(await initial, response);
  for (const tab of ["excel", "analyzer", "map", "summary", "excel"]) {
    assert.equal(await load(scope), response, `${tab} reuses initial response`);
  }
  assert.deepEqual(requests, [{ ...scope, includeRows: true }]);
  await load({ ...scope, uploadId: 43 });
  assert.equal(requests.length, 2, "another upload gets its own data");
  assert.equal(requests[1].uploadId, 43);
});

test("failed initial requests can be retried without caching the error", async () => {
  let requests = 0;
  const load = createBackendL3Loader(async () => {
    if (++requests === 1) throw new Error("scope exceeds row limit");
    return { rows: [] };
  });
  await assert.rejects(load({ uploadId: 42 }), /row limit/);
  assert.deepEqual(await load({ uploadId: 42 }), { rows: [] });
  assert.equal(requests, 2);
});

test("Excel, Map and Analyzer retain rows from the same loaded timeline", () => {
  const timeline = [
    { id: "l3-1", type: "l3", title: "NR RRC Reconfiguration", sourceCategory: "NR RRC", rawMessage: "NR RRCReconfiguration xact=1", timestamp: new Date("2026-09-15T15:57:51.608Z"), latitude: 28.61, longitude: 77.21 },
    { id: "l3-2", type: "l3", title: "NR RRC Reconfiguration Complete", sourceCategory: "NR RRC", rawMessage: "NR RRCReconfigComplete xact=1", timestamp: new Date("2026-09-15T15:57:51.617Z"), latitude: 28.62, longitude: 77.22 },
    { id: "event-1", type: "event", title: "ssRsrp", sourceCategory: "Radio", rawMessage: "-100 -> -90", timestamp: new Date("2026-09-15T15:57:52Z"), latitude: null, longitude: null },
  ];
  const model = buildBackendDetailModel(timeline);
  const expectedIds = timeline.map(row => row.id).sort();
  assert.deepEqual(model.signalingRows.map(row => row.id).sort(), expectedIds);
  assert.deepEqual([...new Set(model.analysis.procedures.flatMap(procedure => procedure.items.map(row => row.id)))].sort(), expectedIds);
  assert.ok(model.analysis.stats.totalProcedures > 0);
  // Map consumes the exact Excel rows, retaining coordinates and unlocated rows.
  assert.deepEqual(model.signalingRows.map(row => [row.latitude, row.longitude]), [[28.61, 77.21], [28.62, 77.22], [null, null]]);
  assert.deepEqual(timeline.map(row => row.id).sort(), expectedIds);
});

test("empty details produce a valid shared model", () => {
  const model = buildBackendDetailModel([]);
  assert.deepEqual(model.signalingRows, []);
  assert.deepEqual(model.analysis.procedures, []);
  assert.equal(model.analysis.stats.totalProcedures, 0);
});
