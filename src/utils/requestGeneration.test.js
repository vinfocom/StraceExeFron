import test from "node:test";
import assert from "node:assert/strict";
import { createRequestGeneration } from "../features/unified-map/data/requestGeneration.js";

test("a newer request owns the resource even if an older request resolves later", () => {
  const requests = createRequestGeneration();
  const requestA = requests.begin("A");
  const requestB = requests.begin("B");

  assert.equal(requestA.controller.signal.aborted, true);
  assert.equal(requests.isCurrent(requestA), false);
  assert.equal(requests.isCurrent(requestB), true);
});

test("A to B to A creates a new generation and rejects the first A", () => {
  const requests = createRequestGeneration();
  const firstA = requests.begin("A");
  const requestB = requests.begin("B");
  const secondA = requests.begin("A");

  assert.notEqual(firstA.generation, secondA.generation);
  assert.equal(requests.isCurrent(firstA), false);
  assert.equal(requests.isCurrent(requestB), false);
  assert.equal(requests.isCurrent(secondA), true);
});

test("invalidation aborts the active request and rejects its later completion", () => {
  const requests = createRequestGeneration();
  const request = requests.begin("project-A/session-1");

  requests.invalidate();

  assert.equal(request.controller.signal.aborted, true);
  assert.equal(requests.isCurrent(request), false);
  assert.equal(requests.getCurrent(), null);
});

test("identity mismatch rejects a request before the next effect starts", () => {
  const requests = createRequestGeneration();
  const request = requests.begin("project-A");

  assert.equal(requests.isCurrent(request, "project-B"), false);
});

test("an older cache lookup cannot replace data from a newer selection", async () => {
  const requests = createRequestGeneration();
  const cacheA = requests.begin("project-A/session-1");
  let resolveCacheA;
  const pendingCacheA = new Promise((resolve) => { resolveCacheA = resolve; });
  const committed = [];
  const requestB = requests.begin("project-B/session-2");
  committed.push("B");

  resolveCacheA("A");
  const staleCacheValue = await pendingCacheA;
  if (requests.isCurrent(cacheA)) committed.push(staleCacheValue);

  assert.deepEqual(committed, ["B"]);
  assert.equal(requests.isCurrent(requestB), true);
});

test("project identity changes even when session ids are unchanged", () => {
  const requests = createRequestGeneration();
  const projectA = requests.begin("project-A/session-7");
  const projectB = requests.begin("project-B/session-7");

  assert.equal(projectA.controller.signal.aborted, true);
  assert.equal(requests.isCurrent(projectA), false);
  assert.equal(requests.isCurrent(projectB), true);
});

test("disabling a resource aborts a page request and prevents its success path", async () => {
  const requests = createRequestGeneration();
  const pageTwo = requests.begin("enabled/project-A");
  requests.begin("disabled/project-A");
  let successCommitted = false;
  await Promise.resolve();
  if (requests.isCurrent(pageTwo)) successCommitted = true;

  assert.equal(pageTwo.controller.signal.aborted, true);
  assert.equal(successCommitted, false);
});

test("a stale worker result from an earlier dataset revision is rejected", () => {
  const requests = createRequestGeneration();
  const datasetA = requests.begin("prediction-grid:dataset-A");
  const datasetB = requests.begin("prediction-grid:dataset-B");
  const appliedRevisions = [];
  if (requests.isCurrent(datasetA)) appliedRevisions.push("dataset-A");
  if (requests.isCurrent(datasetB)) appliedRevisions.push("dataset-B");

  assert.deepEqual(appliedRevisions, ["dataset-B"]);
});
