import test from "node:test";
import assert from "node:assert/strict";
import { startWorkerRequest } from "./workerRequest.js";

function createFakeWorker({ postMessage, terminate } = {}) {
  return {
    postMessage: postMessage || function (payload) { this.sent = payload; },
    terminate: terminate || function () { this.terminated = true; },
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
}

test("worker construction, dispatch, runtime, and malformed response failures reject and terminate", async () => {
  const constructionTask = startWorkerRequest(() => { throw new Error("constructor failed"); }, {}, "rsrp-1");
  await assert.rejects(constructionTask.promise, /constructor failed/);

  const dispatchTask = startWorkerRequest(() => createFakeWorker({
    postMessage() { throw new Error("dispatch failed"); },
  }), {}, "rsrp-2");
  await assert.rejects(dispatchTask.promise, /dispatch failed/);

  const runtimeWorker = createFakeWorker();
  const runtimeTask = startWorkerRequest(() => runtimeWorker, {}, "rsrp-3");
  runtimeWorker.onerror({ message: "runtime failed" });
  await assert.rejects(runtimeTask.promise, /runtime failed/);
  assert.equal(runtimeWorker.terminated, true);

  const malformedWorker = createFakeWorker();
  const malformedTask = startWorkerRequest(() => malformedWorker, {}, "rsrp-4");
  malformedWorker.onmessage({ data: { id: "rsrp-4", rows: [] } });
  await assert.rejects(malformedTask.promise, /invalid analysis response/);
  assert.equal(malformedWorker.terminated, true);
});

test("failed RSRP worker requests can be retried and stale replies are rejected", async () => {
  let attempts = 0;
  let firstWorker;
  const create = () => {
    attempts += 1;
    firstWorker = createFakeWorker();
    return firstWorker;
  };
  const first = startWorkerRequest(create, { id: "rsrp-5" }, "rsrp-5");
  assert.ok(firstWorker);
  assert.equal(attempts, 1);
  firstWorker.onmessage({ data: { id: "stale", analysis: {} } });
  await assert.rejects(first.promise, /stale or mismatched/);

  const retryWorker = createFakeWorker();
  const retry = startWorkerRequest(() => retryWorker, { id: "rsrp-5-retry" }, "rsrp-5-retry");
  retryWorker.onmessage({ data: { id: "rsrp-5-retry", analysis: { procedures: [] } } });
  assert.deepEqual(await retry.promise, { id: "rsrp-5-retry", analysis: { procedures: [] } });
});
