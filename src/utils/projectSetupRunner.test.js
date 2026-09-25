import test from "node:test";
import assert from "node:assert/strict";
import { followProjectSetupJob, ProjectSetupUnavailableError } from "./projectSetupRunner.js";

const fast = { pollMs: 0, sleep: async () => {} };
const scripted = (...replies) => {
  const queue = [...replies];
  return async () => {
    const next = queue.shift();
    if (next instanceof Error || (next && next.__reject)) throw next.__reject ?? next;
    return next;
  };
};

test("follows the job until it completes and reports every status", async () => {
  const api = {
    start: async () => ({ job_id: "j1", status: "processing", progress: 0 }),
    status: scripted(
      { status: "processing", progress: 30 },
      { status: "processing", progress: 70 },
      { status: "completed", progress: 100, stages: [{ key: "setup", state: "done" }] },
    ),
  };
  const seen = [];
  const final = await followProjectSetupJob(api, { project_id: 1 }, (s) => seen.push(s.progress), fast);
  assert.equal(final.status, "completed");
  assert.deepEqual(seen, [0, 30, 70, 100]);
});

test("signals 'unavailable' when the job cannot start, so the caller can fall back", async () => {
  let polled = false;
  const api = {
    start: async () => {
      throw new Error("Request failed with status code 404");
    },
    status: async () => {
      polled = true;
    },
  };
  await assert.rejects(followProjectSetupJob(api, { project_id: 1 }, null, fast), ProjectSetupUnavailableError);
  assert.equal(polled, false);
});

test("a start reply without a job id also counts as unavailable", async () => {
  const api = { start: async () => ({ status: "processing" }), status: async () => ({}) };
  await assert.rejects(followProjectSetupJob(api, {}, null, fast), ProjectSetupUnavailableError);
});

test("stops with a clear error when the server no longer knows the job", async () => {
  const api = {
    start: async () => ({ job_id: "j2" }),
    status: async () => {
      throw { response: { status: 404 }, message: "not found" };
    },
  };
  await assert.rejects(followProjectSetupJob(api, {}, null, fast), /lost/i);
});

test("tolerates a few failed polls but not endless ones", async () => {
  const flaky = {
    start: async () => ({ job_id: "j3" }),
    status: scripted(new Error("network"), new Error("network"), { status: "completed", progress: 100 }),
  };
  assert.equal((await followProjectSetupJob(flaky, {}, null, fast)).status, "completed");

  const dead = {
    start: async () => ({ job_id: "j4" }),
    status: async () => {
      throw new Error("network");
    },
  };
  await assert.rejects(followProjectSetupJob(dead, {}, null, { ...fast, maxPollFailures: 3 }), /Lost contact/);
});

test("a failed job is returned, not thrown, so the caller can show per-stage results", async () => {
  const api = {
    start: async () => ({ job_id: "j5" }),
    status: async () => ({ status: "failed", error: "boom", stages: [{ key: "setup", state: "failed" }] }),
  };
  const final = await followProjectSetupJob(api, {}, null, fast);
  assert.equal(final.status, "failed");
  assert.equal(final.stages[0].state, "failed");
});
