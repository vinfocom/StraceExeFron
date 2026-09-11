import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTechName, getTechnologyColor, COLOR_SCHEMES } from "./colorUtils.js";

test("5G modes stay distinct with and without NR bands", () => {
  const cases = [
    ["NR (5G SA)", "5G SA"],
    ["NR (5G NSA)", "5G NSA"],
    ["5g_sa", "5G SA"],
    ["5g-nsa", "5G NSA"],
    ["NRSA", "5G SA"],
    ["NR_NSA", "5G NSA"],
    ["5G SA (NR)", "5G SA"],
    ["Standalone", "5G SA"],
    ["Non-Standalone", "5G NSA"],
    ["EN-DC", "5G NSA"],
    ["LTE ANCHOR NSA", "4G(LTE-ANCHOR NSA)"],
    ["5G", "5G"],
    ["NR", "5G"],
  ];
  for (const [raw, expected] of cases) {
    for (const band of [null, "n78"]) {
      assert.equal(normalizeTechName(raw, band), expected, `${raw}, ${band}`);
      assert.equal(normalizeTechName(expected, band), expected);
    }
  }
});

test("band-only 5G does not invent an SA or NSA mode", () => {
  assert.equal(normalizeTechName(null, "n78"), "5G");
  assert.equal(normalizeTechName(null), "Unknown");
  assert.equal(normalizeTechName("LTE", "B3"), "4G");
  assert.equal(normalizeTechName("WCDMA"), "3G");
  assert.equal(normalizeTechName("GSM"), "2G");
});

test("SA and NSA use configured technology colors", () => {
  assert.equal(getTechnologyColor("NR (5G SA)"), COLOR_SCHEMES.technology["5G SA"]);
  assert.equal(getTechnologyColor("NR (5G NSA)"), COLOR_SCHEMES.technology["5G NSA"]);
});
