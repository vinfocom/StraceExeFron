import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./useSiteData.js", import.meta.url))],
  external: ["@/*"],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
});
const hookModule = { exports: {} };
const nativeRequire = createRequire(import.meta.url);
const testRequire = (specifier) => specifier.startsWith("@/")
  ? new Proxy({}, { get: () => () => undefined })
  : nativeRequire(specifier);
new Function("require", "module", "exports", bundle.outputFiles[0].text)(testRequire, hookModule, hookModule.exports);
const { processSitePredictionResponse } = hookModule.exports;

const row = (id, sector, cellId) => ({
  id, projectId: 341, site: "T87057", sector, cellId,
  lat: -12.4, lng: 32.2, azimuth: 120, band: "B3", provider: "MTN",
});

test("original paginated rows are normalized and returned without combined merging", () => {
  const result = processSitePredictionResponse({ rows: [row(1, "1", "1"), row(2, "1", "2")], complete: true }, "original", 30);
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].sector, "1");
});

test("combined rows use the same page envelope and preserve distinct cells", () => {
  const result = processSitePredictionResponse({ rows: [row(1, "1", "1"), row(2, "1", "2")], complete: true }, "combined", 30);
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 2);
});

test("incomplete pagination remains partial and empty payloads remain empty", () => {
  const partial = processSitePredictionResponse({ rows: [row(1, "1", "1")], complete: false }, "original", 30);
  assert.equal(partial.complete, false);
  assert.equal(partial.rows.length, 1);
  const empty = processSitePredictionResponse({ rows: [], complete: true }, "original", 30);
  assert.equal(empty.complete, true);
  assert.deepEqual(empty.rows, []);
});
