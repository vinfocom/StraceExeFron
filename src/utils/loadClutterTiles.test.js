import test from "node:test";
import assert from "node:assert/strict";
import { loadClutterTiles } from "./loadClutterTiles.js";
import { buildClutterFeatureCollection } from "./clutterGeometry.js";

const row = (tile, building) => ({
  clutterTileId: tile,
  buildingPolygonId: building,
  buildingPolygonName: `Building ${building}`,
  clutterPolygonWkt: "POLYGON((77 28,78 28,78 29,77 28))",
});

test("loads every page by intersection offset and merges buildings across page boundaries", async () => {
  const offsets = [];
  const progress = [];
  const tiles = await loadClutterTiles(async ({ offset }) => {
    offsets.push(offset);
    return offset === 0
      ? { status: 1, data: [row(1, 1), row(1, 2)], hasMore: true, nextOffset: 2 }
      : { data: { status: 1, data: [row(1, 3), row(2, 4)], hasMore: false } };
  }, { onProgress: (update) => progress.push(update) });
  assert.deepEqual(offsets, [0, 2]);
  assert.deepEqual(progress.map(({ pageNumber, loadedMatches, hasMore, tiles: visible }) => ({
    pageNumber,
    loadedMatches,
    hasMore,
    tileCount: visible.length,
  })), [
    { pageNumber: 1, loadedMatches: 2, hasMore: true, tileCount: 1 },
    { pageNumber: 2, loadedMatches: 4, hasMore: false, tileCount: 2 },
  ]);
  assert.equal(tiles.length, 2);
  const result = buildClutterFeatureCollection(tiles);
  assert.equal(result.featureCollection.features.length, 2);
  assert.deepEqual(result.featureCollection.features[0].properties.buildingPolygonIds, ["1", "2", "3"]);
});

test("does not treat an explicitly complete full page as truncated", async () => {
  let requests = 0;
  await loadClutterTiles(async () => {
    requests++;
    return { status: 1, data: [row(1, 1)], limit: 1, hasMore: false };
  });
  assert.equal(requests, 1);
});

test("preserves building arrays returned by the deduplicated backend response", async () => {
  const tiles = await loadClutterTiles(async () => ({
    status: 1,
    data: [{ ...row(1, 1), buildingPolygonIds: [1, 2], buildingPolygonNames: ["One", "Two"] }],
    hasMore: false,
  }));
  assert.deepEqual(tiles[0].buildingPolygonIds, ["1", "2"]);
  assert.deepEqual(tiles[0].buildingPolygonNames, ["One", "Two", "Building 1"]);
});

test("rejects invalid pages and non-advancing pagination instead of silently losing tiles", async () => {
  for (const page of [
    { status: 0, message: "Request failed" },
    { status: 1, data: null },
    { status: 1, data: [], hasMore: true },
    { status: 1, data: [row(1, 1)], hasMore: true, nextOffset: 0 },
  ]) await assert.rejects(loadClutterTiles(async () => page));
});

test("cancelling a project change prevents another page request", async () => {
  const controller = new AbortController();
  let requests = 0;
  await assert.rejects(loadClutterTiles(async () => {
    requests++;
    controller.abort();
    return { status: 1, data: [row(1, 1)], hasMore: true, nextOffset: 1 };
  }, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(requests, 1);
});
