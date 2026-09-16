import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildClutterFeatureCollection } from "../utils/clutterGeometry.js";

test("clutter worker returns deduplicated geometry and reports processing failures", () => {
  const replies = [];
  const self = { postMessage: (message) => replies.push(message) };
  const source = readFileSync(new URL("./clutterGeometry.worker.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/, "");
  vm.runInNewContext(source, { self, buildClutterFeatureCollection });
  const row = { clutterTileId: 1, clutterPolygonWkt: "POLYGON((77 28,78 28,78 29,77 28))" };
  self.onmessage({ data: [row, row] });
  assert.equal(replies[0].result.featureCollection.features.length, 1);
  assert.equal(replies[0].error, undefined);
  const brokenRow = { get clutterTileId() { throw new Error("bad row"); } };
  self.onmessage({ data: [brokenRow] });
  assert.match(replies[1].error, /could not be processed/);
});
