import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaybackPoints,
  buildBackendDetailModel,
  createBackendL3Loader,
  getCompletenessNotice,
  getFiniteRsrpValue,
  shouldEnableMapShortcuts,
  shouldKeepExcelViewMounted,
  shouldResetMapNavigation,
  sortTimelineChronologically,
} from "./backendDetailModel.js";

test("summary excludes rows; detail tabs share one later request", async () => {
  const requests = [];
  const response = { summaryVersion: 1, rows: [{ id: "l3-1" }] };
  const compact = { summaryVersion: 1, totalRows: 1, rows: [] };
  const load = createBackendL3Loader(async scope => { requests.push(scope); return scope.includeRows ? response : compact; });
  const scope = { uploadId: 42, take: 50000 };
  const initial = load(scope);
  assert.equal(load({ ...scope }), initial, "effect replay shares the pending request");
  assert.equal(await initial, compact);
  assert.deepEqual(requests, [{ ...scope, includeRows: false }]);
  const detail = load({ ...scope, includeRows: true });
  assert.equal(load({ ...scope, includeRows: true }), detail, "detail tabs share the pending request");
  for (const tab of ["excel", "analyzer", "map", "excel"]) {
    assert.equal(await load({ ...scope, includeRows: true }), response, `${tab} reuses details`);
  }
  assert.equal(await load(scope), compact, "returning to summary keeps its result");
  assert.deepEqual(requests, [{ ...scope, includeRows: false }, { ...scope, includeRows: true }]);
  await load({ ...scope, uploadId: 43 });
  assert.equal(requests.length, 3, "another upload gets its own data");
  assert.equal(requests[2].uploadId, 43);
});

test("detail failure can retry without discarding the successful summary", async () => {
  let details = 0;
  const summary = { rows: [], totalRows: 1 };
  const load = createBackendL3Loader(async scope => {
    if (!scope.includeRows) return summary;
    if (++details === 1) throw new Error("temporary error");
    return { rows: [{ id: "l3-1" }] };
  });
  const scope = { uploadId: 42 };
  const initial = load(scope);
  await initial;
  await assert.rejects(load({ ...scope, includeRows: true }), /temporary error/);
  assert.equal(load(scope), initial);
  assert.equal((await load({ ...scope, includeRows: true })).rows.length, 1);
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

test("filtered playback indexes are contiguous and retain original row identity and index", () => {
  const timeline = [
    { id: "bad-gps-0", lat: null, lng: 10 },
    { id: "source-row-1", lat: 11, lng: 10 },
    { id: "bad-gps-2", lat: 91, lng: 10 },
    { id: "source-row-3", lat: 12, lng: 10 },
  ];
  const points = buildPlaybackPoints(timeline, (row, originalIndex) => (
    Number.isFinite(row.lat) && row.lat >= -90 && row.lat <= 90
      ? { id: row.id, sourceRowId: row.id, originalIndex }
      : null
  ));
  assert.deepEqual(points.map(({ index, playbackIndex, originalIndex, id, sourceRowId }) => [index, playbackIndex, originalIndex, id, sourceRowId]), [
    [0, 0, 1, "source-row-1", "source-row-1"],
    [1, 1, 3, "source-row-3", "source-row-3"],
  ]);
});

test("missing or blank RSRP values remain unknown instead of becoming zero", () => {
  for (const value of [null, undefined, "", "   ", Infinity, "not-a-number"]) {
    assert.equal(getFiniteRsrpValue(value), null);
  }
  assert.equal(getFiniteRsrpValue("-103.5"), -103.5);
  assert.equal(getFiniteRsrpValue(0), 0);
});

test("interleaved rows are sorted by timestamp with stable ties and missing times last", () => {
  const rows = [
    { id: "diagnostic-late", timestamp: new Date("2026-09-01T12:00:02Z"), sessionId: 1 },
    { id: "network-early", timestamp: new Date("2026-09-01T12:00:01Z"), sessionId: 2 },
    { id: "diagnostic-tie", timestamp: new Date("2026-09-01T12:00:01Z"), sessionId: 1 },
    { id: "unknown-a", timestamp: null, sessionId: 1 },
    { id: "unknown-b", timestamp: null, sessionId: 2 },
  ];
  const sorted = sortTimelineChronologically(rows);
  assert.deepEqual(sorted.map(({ id }) => id), [
    "network-early", "diagnostic-tie", "diagnostic-late", "unknown-a", "unknown-b",
  ]);
  assert.deepEqual(sorted.map(({ sessionId }) => sessionId), [2, 1, 1, 1, 2]);
  assert.deepEqual(sorted.map(({ originalTimelineIndex }) => originalTimelineIndex), [1, 2, 0, 3, 4]);
});

test("map navigation resets only when the dataset identity changes", () => {
  assert.equal(shouldResetMapNavigation("upload-42", "upload-42"), false);
  assert.equal(shouldResetMapNavigation("upload-42", "upload-43"), true);
});

test("hidden maps do not register global playback shortcuts", () => {
  assert.equal(shouldEnableMapShortcuts(false), false);
  assert.equal(shouldEnableMapShortcuts(true), true);
});

test("loaded Excel view remains mounted across tab changes and remounts for a new dataset", () => {
  assert.equal(shouldKeepExcelViewMounted(true), true);
  assert.equal(shouldKeepExcelViewMounted(false), false);
  assert.equal(shouldResetMapNavigation("sessions-1,2", "sessions-1,2"), false);
  assert.equal(shouldResetMapNavigation("sessions-1,2", "sessions-3"), true);
});

test("row-cap metadata reports incomplete or potentially capped datasets", () => {
  assert.match(getCompletenessNotice(100, 50000, 130), /loaded 100 of 130 rows/);
  assert.match(getCompletenessNotice(50000, 50000), /may be incomplete/);
  assert.equal(getCompletenessNotice(50000, 50000, 50000), "");
  assert.equal(getCompletenessNotice(100, 50000, 100), "");
});
