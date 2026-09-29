import test from "node:test";
import assert from "node:assert/strict";
import { runPciDistributionRequest } from "./pciDistributionRequest.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test("a stale PCI response cannot replace data for the newer scope", async () => {
  const first = deferred();
  const second = deferred();
  let currentId = 1;
  const values = [];
  const firstRequest = runPciDistributionRequest({
    sessionIds: ["8142"],
    load: () => first.promise,
    isCurrent: () => currentId === 1,
    onData: (value) => values.push(value),
  });
  currentId = 2;
  const secondRequest = runPciDistributionRequest({
    sessionIds: ["8143"],
    load: () => second.promise,
    isCurrent: () => currentId === 2,
    onData: (value) => values.push(value),
  });
  second.resolve({ success: true, primary_yes: { pci: 2 } });
  await secondRequest;
  first.resolve({ success: true, primary_yes: { pci: 1 } });
  await firstRequest;

  assert.deepEqual(values, [{ pci: 2 }]);
});

test("scope cancellation is silent and forwards the consumer signal", async () => {
  const controller = new AbortController();
  const errors = [];
  let receivedSignal;
  const request = runPciDistributionRequest({
    sessionIds: ["8142"],
    signal: controller.signal,
    load: (_ids, signal) => {
      receivedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("Request cancelled");
          error.isCancelled = true;
          reject(error);
        }, { once: true });
      });
    },
    isCurrent: () => true,
    onError: (error) => errors.push(error),
  });
  controller.abort();
  await request;

  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(errors, []);
});

test("real PCI failures remain visible through the error callback", async () => {
  const failure = new Error("server failure");
  const errors = [];
  await runPciDistributionRequest({
    sessionIds: ["8142"],
    load: async () => { throw failure; },
    isCurrent: () => true,
    onError: (error) => errors.push(error),
  });

  assert.deepEqual(errors, [failure]);
});
