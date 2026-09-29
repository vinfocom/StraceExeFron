import test from "node:test";
import assert from "node:assert/strict";
import {
  areMapSessionIdsEqual,
  createSessionSaveCoordinator,
  getMapSessionIdentity,
  normalizeMapSessionIds,
} from "./sessionUpdates.js";

test("session IDs normalize consistently and retain supported formats and order", () => {
  assert.deepEqual(normalizeMapSessionIds(" 001 ;custom-A|001, 8142 "), [
    "001",
    "custom-A",
    "8142",
  ]);
  assert.equal(getMapSessionIdentity(["001", "custom-A", "8142"]), "001,custom-A,8142");
  assert.equal(areMapSessionIdsEqual(["001", "custom-A"], "001; custom-A"), true);
  assert.equal(areMapSessionIdsEqual(["001", "custom-A"], ["custom-A", "001"]), false);
});

test("saving identical session IDs skips persistence and commit", async () => {
  let saves = 0;
  let commits = 0;
  const save = createSessionSaveCoordinator({
    getAppliedIds: () => ["8142"],
    persist: async () => { saves += 1; },
    commit: () => { commits += 1; },
  });

  assert.equal(await save("8142"), true);
  assert.equal(saves, 0);
  assert.equal(commits, 0);
});

test("changed session saves deduplicate repeated clicks and commit only after persistence", async () => {
  let resolvePersist;
  let saves = 0;
  let committed = null;
  const save = createSessionSaveCoordinator({
    getAppliedIds: () => ["8142"],
    persist: () => {
      saves += 1;
      return new Promise((resolve) => { resolvePersist = resolve; });
    },
    commit: (ids) => { committed = ids; },
  });

  const first = save(["8143"]);
  const repeated = save(["8143"]);
  assert.equal(first, repeated);
  assert.equal(saves, 1);
  assert.equal(committed, null);
  resolvePersist();
  assert.equal(await first, true);
  assert.deepEqual(committed, ["8143"]);
});

test("failed project persistence leaves applied IDs unchanged and allows retry", async () => {
  let calls = 0;
  let applied = ["8142"];
  const save = createSessionSaveCoordinator({
    getAppliedIds: () => applied,
    persist: async () => {
      calls += 1;
      if (calls === 1) throw new Error("save failed");
    },
    commit: (ids) => { applied = ids; },
  });

  await assert.rejects(save(["8143"]), /save failed/);
  assert.deepEqual(applied, ["8142"]);
  assert.equal(await save(["8143"]), true);
  assert.deepEqual(applied, ["8143"]);
  assert.equal(calls, 2);
});
