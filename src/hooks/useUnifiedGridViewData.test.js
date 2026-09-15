import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Resolve the app's Vite alias without a browser or additional test dependencies.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./useUnifiedGridViewData.js", import.meta.url))],
  alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
});
const hookModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url), hookModule, hookModule.exports,
);
const { useUnifiedGridViewDataPair } = hookModule.exports;

function calculate(options) {
  let result;
  function Probe() {
    result = useUnifiedGridViewDataPair({ enabled: true, ...options });
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return result;
}

const rows = [-100, -80, -30].map((rsrp, index) => ({
  lat: 28.6, lng: 77.2, rsrp, pci: index, provider: "Airtel", technology: "LTE",
}));

test("equivalent display/filter arrays share their grid result", () => {
  const { displayData, filteredData } = calculate({
    displayLocations: rows, filteredLocations: [...rows],
  });
  assert.equal(displayData, filteredData);
  assert.equal(displayData.summary.totalSamples, 3);
});

test("different filtered rows retain independent counts and averages", () => {
  const { displayData, filteredData } = calculate({
    displayLocations: rows, filteredLocations: [rows[0]],
  });
  assert.notEqual(displayData, filteredData);
  assert.equal(displayData.summary.totalSamples, 3);
  assert.equal(filteredData.summary.totalSamples, 1);
  assert.equal(filteredData.summary.selectedMetricAverage, -100);
});

test("row order is preserved for tied dominant categories", () => {
  const tiedRows = [{ ...rows[0], pci: 10 }, { ...rows[0], pci: 20 }];
  const { displayData, filteredData } = calculate({
    displayLocations: tiedRows, filteredLocations: [...tiedRows].reverse(),
  });
  assert.notEqual(displayData, filteredData);
  assert.equal(displayData.gridLocations[0].dominant_pci, 10);
  assert.equal(filteredData.gridLocations[0].dominant_pci, 20);
});

test("hidden filtered grids do not read their log coordinates", () => {
  const unreadable = { get lat() { throw new Error("Unneeded grid processed"); } };
  const { displayData, filteredData } = calculate({
    displayLocations: rows, filteredLocations: [unreadable], filteredEnabled: false,
  });
  assert.equal(displayData.summary.totalSamples, 3);
  assert.equal(filteredData.summary.totalSamples, 0);
});

test("disabled grid mode does not aggregate either input", () => {
  const unreadable = { get lat() { throw new Error("Disabled grid processed"); } };
  const result = calculate({ enabled: false, displayLocations: [unreadable], filteredLocations: [unreadable] });
  assert.equal(result.displayData.summary.totalSamples, 0);
  assert.equal(result.filteredData.summary.totalSamples, 0);
});

for (const [aggregationMethod, expected] of [
  ["mean", -70], ["avg", -70], ["median", -80], ["min", -100], ["max", -30],
  [" ", -70], ["unknown", -80],
]) {
  test(`${aggregationMethod} retains cell values and full metric statistics`, () => {
    const { displayData } = calculate({ displayLocations: rows, aggregationMethod });
    const cell = displayData.gridLocations[0];
    assert.equal(cell.rsrp, expected);
    assert.deepEqual(cell.metric_stats.rsrp, { avg: -70, mean: -70, median: -80, min: -100, max: -30 });
  });
}
