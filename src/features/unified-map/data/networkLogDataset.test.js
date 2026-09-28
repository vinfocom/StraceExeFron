import test from "node:test";
import assert from "node:assert/strict";
import {
  beginNetworkLogSnapshot,
  createCompleteNetworkLogSnapshot,
  createNetworkLogCacheSnapshot,
  fetchCompleteNetworkLogDataset,
  getVisibleNetworkLogSnapshot,
  isCompleteNetworkLogCacheEntry,
} from "./networkLogDataset.js";

const page = (rows, totalCount) => ({ data: rows, ...(totalCount === undefined ? {} : { total_count: totalCount }) });

test("intermediate pages update progress but do not publish rows", async () => {
  let releaseSecondPage;
  let secondPageRequested;
  const secondPageStarted = new Promise((resolve) => { secondPageRequested = resolve; });
  const pendingSecondPage = new Promise((resolve) => { releaseSecondPage = resolve; });
  const published = [];
  const progress = [];
  const request = fetchCompleteNetworkLogDataset({
    pageSize: 2,
    fetchPage: async (pageNumber) => {
      if (pageNumber === 1) return page([{ id: 1 }, { id: 2 }], 3);
      secondPageRequested();
      return pendingSecondPage;
    },
    parseRow: (row) => row,
    onProgress: (value) => progress.push(value),
  }).then((dataset) => {
    published.push(dataset.rows);
    return dataset;
  });

  await secondPageStarted;
  assert.deepEqual(published, []);
  assert.deepEqual(progress.at(-1), { received: 2, total: 3, page: 1, totalPages: 2, percent: 66 });
  releaseSecondPage(page([{ id: 3 }], 3));
  const result = await request;
  assert.deepEqual(result.rows.map((row) => row.id), [1, 2, 3]);
  assert.equal(result.complete, true);
  assert.equal(published.length, 1);
});

test("an unknown total stays indeterminate and publishes only after the short final page", async () => {
  const progress = [];
  const result = await fetchCompleteNetworkLogDataset({
    pageSize: 2,
    fetchPage: async (pageNumber) => pageNumber === 1
      ? page([{ id: "a" }, { id: "b" }])
      : page([{ id: "c" }]),
    parseRow: (row) => row,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(progress[0].total, null);
  assert.equal(progress[0].percent, null);
  assert.deepEqual(result.rows.map((row) => row.id), ["a", "b", "c"]);
  assert.equal(result.complete, true);
});

test("changing selection hides the prior completed snapshot while the new one loads", () => {
  const completeA = createCompleteNetworkLogSnapshot({ rows: [{ id: "A" }], identity: "A", revision: 4, outcome: "complete" });
  const updatingA = beginNetworkLogSnapshot(completeA, "A", 5);
  assert.deepEqual(updatingA.rows, completeA.rows);
  assert.equal(updatingA.complete, true);
  assert.equal(updatingA.loading, true);

  const loadingB = beginNetworkLogSnapshot(completeA, "B", 5);
  assert.deepEqual(loadingB.rows, []);
  assert.equal(loadingB.loading, true);
  assert.deepEqual(getVisibleNetworkLogSnapshot(completeA, "B", true).rows, []);
  assert.equal(getVisibleNetworkLogSnapshot(loadingB, "B", true).identity, "B");
});

test("cancellation between pages rejects without publishing a partial result", async () => {
  const controller = new AbortController();
  const published = [];
  const request = fetchCompleteNetworkLogDataset({
    pageSize: 2,
    signal: controller.signal,
    fetchPage: async (pageNumber) => pageNumber === 1
      ? page([{ id: 1 }, { id: 2 }], 3)
      : page([{ id: 3 }], 3),
    parseRow: (row) => row,
    onProgress: ({ page: pageNumber }) => { if (pageNumber === 1) controller.abort(); },
  }).then((result) => published.push(result.rows));
  await assert.rejects(request, { name: "AbortError" });
  assert.deepEqual(published, []);
});

test("page failures and page limits reject without returning accumulated rows", async () => {
  await assert.rejects(fetchCompleteNetworkLogDataset({
    pageSize: 1,
    fetchPage: async (pageNumber) => {
      if (pageNumber === 1) return page([{ id: 1 }]);
      throw new Error("page two failed");
    },
    parseRow: (row) => row,
  }), /page two failed/);

  await assert.rejects(fetchCompleteNetworkLogDataset({
    pageSize: 1,
    maxPages: 1,
    fetchPage: async () => page([{ id: 1 }]),
    parseRow: (row) => row,
  }), { name: "IncompleteNetworkLogDatasetError", code: "page-limit" });
});

test("only complete schema-three cache entries are accepted", () => {
  const cacheEntry = {
    cacheSchemaVersion: 3,
    outcome: "complete",
    complete: true,
    locations: [{ id: "cached" }],
    appSummary: { opened: 2 },
  };
  assert.equal(isCompleteNetworkLogCacheEntry(cacheEntry), true);
  const cacheHit = createNetworkLogCacheSnapshot(cacheEntry, "selection-A", 9);
  assert.deepEqual(cacheHit.snapshot, {
    rows: cacheEntry.locations,
    identity: "selection-A",
    revision: 9,
    complete: true,
    loading: false,
    outcome: "complete",
    error: null,
  });
  assert.deepEqual(cacheHit.appSummary, { opened: 2 });
  assert.equal(createNetworkLogCacheSnapshot({ ...cacheEntry, complete: false }, "selection-A", 10), null);
  assert.equal(isCompleteNetworkLogCacheEntry({ cacheSchemaVersion: 2, outcome: "complete", complete: true, locations: [] }), false);
  assert.equal(isCompleteNetworkLogCacheEntry({ cacheSchemaVersion: 3, outcome: "capped", complete: false, locations: [{ id: 1 }] }), false);
  assert.equal(isCompleteNetworkLogCacheEntry({ cacheSchemaVersion: 3, outcome: "partial", complete: false, locations: [{ id: 1 }] }), false);
});
