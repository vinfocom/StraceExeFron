import { getClutterTilesPayload } from "./clutterTilesResponse.js";

export const CLUTTER_PAGE_SIZE = 5000;

// The API pages building/tile intersections, not unique rendered tiles.
const snapshotTiles = (tiles) => [...tiles.values()].map((tile) => ({
  ...tile,
  buildingPolygonIds: [...tile.buildingPolygonIds],
  buildingPolygonNames: [...tile.buildingPolygonNames],
}));

export const loadClutterTiles = async (fetchPage, { signal, onProgress } = {}) => {
  const tiles = new Map();
  let offset = 0;
  let pageNumber = 0;
  while (true) {
    signal?.throwIfAborted();
    const payload = getClutterTilesPayload(await fetchPage({ limit: CLUTTER_PAGE_SIZE, offset }));
    signal?.throwIfAborted();
    if (Number(payload?.status ?? payload?.Status) !== 1) {
      throw new Error(payload?.message ?? payload?.Message ?? "The clutter tiles request failed.");
    }
    const rows = payload?.data ?? payload?.Data;
    if (!Array.isArray(rows)) throw new Error("The clutter tiles response has an invalid data field.");
    for (const row of rows) {
      // Preserve inconsistent geometries so the renderer can report them.
      const key = JSON.stringify([row.clutterTileId ?? null, row.clutterPolygonWkt]);
      let tile = tiles.get(key);
      if (!tile) {
        tile = {
          ...row,
          buildingPolygonIds: new Set((row.buildingPolygonIds || []).map(String)),
          buildingPolygonNames: new Set((row.buildingPolygonNames || []).map(String)),
        };
        tiles.set(key, tile);
      }
      if (row.buildingPolygonId != null) tile.buildingPolygonIds.add(String(row.buildingPolygonId));
      if (row.buildingPolygonName) tile.buildingPolygonNames.add(String(row.buildingPolygonName));
    }
    const explicitHasMore = payload.hasMore ?? payload.HasMore;
    const pageLimit = Number(payload.limit ?? payload.Limit) || CLUTTER_PAGE_SIZE;
    const hasMore = typeof explicitHasMore === "boolean"
      ? explicitHasMore
      : rows.length >= pageLimit;
    pageNumber += 1;
    onProgress?.({
      tiles: snapshotTiles(tiles),
      hasMore,
      pageNumber,
      loadedMatches: offset + rows.length,
    });
    if (!hasMore) break;
    const nextOffset = Number(payload.nextOffset ?? payload.NextOffset ?? offset + rows.length);
    if (!rows.length || !Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw new Error("Clutter loading stopped because the next page did not advance.");
    }
    offset = nextOffset;
  }
  return snapshotTiles(tiles);
};
