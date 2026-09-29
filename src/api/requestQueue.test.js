import test from "node:test";
import assert from "node:assert/strict";
import {
  canDeduplicateRequest,
  createRequestCancelledError,
  dedupeRequest,
  RequestQueue,
} from "./requestQueue.js";

const isCancellation = (error) => error?.isCancelled === true;

test("consumer-owned signals are excluded from shared request deduplication", () => {
  const controller = new AbortController();
  assert.equal(canDeduplicateRequest(true, undefined), true);
  assert.equal(canDeduplicateRequest(true, controller.signal), false);
  assert.equal(canDeduplicateRequest(false, undefined), false);
});

test("clearing the request queue rejects queued promises with a cancellation error", async () => {
  const queue = new RequestQueue(1);
  let releaseActive;
  const active = queue.add(() => new Promise((resolve) => { releaseActive = resolve; }));
  const queued = queue.add(async () => "must not run");
  queue.clear();

  await assert.rejects(queued, isCancellation);
  releaseActive("done");
  assert.equal(await active, "done");
});

test("aborting an active or queued request settles that consumer", async () => {
  const queue = new RequestQueue(1);
  const activeController = new AbortController();
  let releaseActive;
  const active = queue.add(
    () => new Promise((resolve) => { releaseActive = resolve; }),
    0,
    { signal: activeController.signal },
  );
  const queuedController = new AbortController();
  const queued = queue.add(async () => "must not run", 0, { signal: queuedController.signal });

  activeController.abort();
  queuedController.abort();
  await assert.rejects(active, isCancellation);
  await assert.rejects(queued, isCancellation);
  releaseActive("late completion");
});

test("an old cancelled request cannot remove a newer request with the same key", async () => {
  const requests = new Map();
  let cancelOld;
  let finishNew;
  const oldRequest = dedupeRequest(requests, "same", () =>
    new Promise((_resolve, reject) => { cancelOld = reject; }),
  );
  await Promise.resolve();
  requests.delete("same");
  const newRequest = dedupeRequest(requests, "same", () =>
    new Promise((resolve) => { finishNew = resolve; }),
  );
  await Promise.resolve();

  cancelOld(createRequestCancelledError());
  await assert.rejects(oldRequest, isCancellation);
  assert.equal(requests.get("same"), newRequest);
  finishNew("new result");
  assert.equal(await newRequest, "new result");
  assert.equal(requests.has("same"), false);
});

test("aborting a queued consumer does not affect a separate consumer of the same resource", async () => {
  const queue = new RequestQueue(1);
  let releaseFirst;
  const blocker = queue.add(() => new Promise((resolve) => { releaseFirst = resolve; }));
  const firstController = new AbortController();
  const secondController = new AbortController();
  let secondRan = false;
  const first = queue.add(async () => "first", 0, { signal: firstController.signal });
  const second = queue.add(async () => { secondRan = true; return "second"; }, 0, { signal: secondController.signal });

  firstController.abort();
  await assert.rejects(first, isCancellation);
  releaseFirst("blocker");
  assert.equal(await blocker, "blocker");
  assert.equal(await second, "second");
  assert.equal(secondRan, true);
});
