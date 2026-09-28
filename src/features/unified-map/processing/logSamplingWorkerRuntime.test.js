import test from "node:test";
import assert from "node:assert/strict";
import { createLogSamplingWorkerRuntime } from "./logSamplingWorkerRuntime.js";

const fakeWorker = () => ({
  messages: [],
  postMessage(message) { this.messages.push(message); },
  terminate() { this.terminated = true; },
});
const job = (datasetRevision = 1, totalLogs = 2) => ({
  coordinates: new Float64Array([77, 28, 78, 29]),
  totalLogs,
  datasetRevision,
  options: { zoom: 12, preserveIndexes: [1] },
});
const reply = (worker, message, indexes = [0, 1]) => worker.onmessage({ data: {
  requestId: message.requestId,
  datasetRevision: message.datasetRevision,
  indexesBuffer: Uint32Array.from(indexes).buffer,
} });

test("worker construction failure uses bounded fallback for a small dataset", () => {
  const results = [];
  const statuses = [];
  const runtime = createLogSamplingWorkerRuntime({
    createWorker: () => { throw new Error("CSP blocked worker"); },
    onResult: (result) => results.push(result),
    onStatus: (status) => statuses.push(status.status),
  });
  runtime.request(job());
  assert.equal(results.length, 1);
  assert.equal(results[0].fallback, true);
  assert.ok(statuses.includes("fallback"));
  runtime.dispose();
});

test("runtime worker error respawns once and successful response recovers", () => {
  const workers = [];
  const results = [];
  const statuses = [];
  const runtime = createLogSamplingWorkerRuntime({
    createWorker: () => { const worker = fakeWorker(); workers.push(worker); return worker; },
    onResult: (result) => results.push(result),
    onStatus: (status) => statuses.push(status.status),
  });
  runtime.request(job());
  workers[0].onerror({ message: "crash", preventDefault() {} });
  assert.equal(workers.length, 2);
  reply(workers[1], workers[1].messages[0]);
  assert.equal(results.length, 1);
  assert.equal(results[0].fallback, false);
  assert.ok(statuses.includes("recovering"));
  assert.ok(statuses.includes("ready"));
  runtime.dispose();
});

test("retries are bounded and large datasets expose an explicit retry state", () => {
  const workers = [];
  const statuses = [];
  const runtime = createLogSamplingWorkerRuntime({
    createWorker: () => { const worker = fakeWorker(); workers.push(worker); return worker; },
    fallbackLimit: 1,
    onStatus: (status) => statuses.push(status),
  });
  runtime.request(job(1, 2));
  workers[0].onerror({ message: "first crash", preventDefault() {} });
  workers[1].onerror({ message: "second crash", preventDefault() {} });
  assert.equal(workers.length, 2);
  assert.equal(statuses.at(-1).status, "error");
  assert.equal(typeof statuses.at(-1).retry, "function");
  runtime.dispose();
});

test("stale dataset and request replies cannot replace current indexes", () => {
  const workers = [];
  const results = [];
  const runtime = createLogSamplingWorkerRuntime({
    createWorker: () => { const worker = fakeWorker(); workers.push(worker); return worker; },
    onResult: (result) => results.push(result),
  });
  runtime.request(job(1));
  const staleMessage = workers[0].messages[0];
  runtime.request(job(2));
  reply(workers[0], staleMessage);
  reply(workers[0], workers[0].messages[1]);
  assert.equal(results.length, 1);
  assert.equal(results[0].datasetRevision, 2);
  runtime.dispose();
});
