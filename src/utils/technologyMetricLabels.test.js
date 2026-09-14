import test from "node:test";
import assert from "node:assert/strict";
import {
  getMetricLabelsForLocations,
  getTechnologyMetricOptions,
  getTechnologyMetricValue,
  getTechnologySignalRows,
  getTechnologyDisplayLog,
  getTechnologyChannelIdentity,
  is2GTechnology,
} from "./technologyMetricLabels.js";

test("2G signal rows hide RSRQ and preserve RxQual zero without a dB unit", () => {
  const rows = getTechnologySignalRows({ technology: "2G", rsrp: -85, rsrq: -12, sinr: 0 });
  assert.deepEqual(rows, [
    { key: "rsrp", label: "RxLev", value: -85, unit: "dBm" },
    { key: "sinr", label: "RxQual", value: 0, unit: "" },
  ]);
});

test("benchmark channel identities keep matching 2G BCCH and LTE PCI values separate", () => {
  const channels = [
    getTechnologyChannelIdentity({ technology: "2G", pci: 42 }),
    getTechnologyChannelIdentity({ technology: "LTE", pci: 42 }),
    getTechnologyChannelIdentity({ technology: "GSM", pci: 42 }),
  ];
  const counts = new Map();
  for (const channel of channels) counts.set(channel.key, (counts.get(channel.key) || 0) + 1);
  assert.deepEqual([...counts], [["BCCH:42", 2], ["PCI:42", 1]]);
  assert.deepEqual(getTechnologyChannelIdentity({ technology: "2G", pci: 0 }), {
    key: "BCCH:0", label: "BCCH", value: "0",
  });
  assert.equal(channels[0].label, "BCCH");
  assert.equal(channels[1].label, "PCI");
});

test("detail logs normalize 2G aliases without mutating original data or LTE records", () => {
  const source = { technology: "2G", rxlev: -87, rxqual: 0, rsrq: -11, earfcn: 975, pci: 975 };
  const display = getTechnologyDisplayLog(source);
  assert.equal(display.rsrp, -87);
  assert.equal(display.sinr, 0);
  assert.equal(display.rsrq, null);
  assert.equal(display.pci, 975);
  assert.equal(display.earfcn, 975);
  assert.equal(source.rsrq, -11);
  const lte = { technology: "LTE", pci: 42, rsrq: -10 };
  assert.equal(getTechnologyDisplayLog(lte), lte);
});

test("2G grids use BCCH for best PCI, including zero and high channel IDs", () => {
  for (const best_pci of [0, 975]) {
    const grid = { best_technology: "2G", is_grid_cell: true, best_pci };
    const display = getTechnologyDisplayLog(grid);
    assert.equal(display.pci, best_pci);
    assert.equal(display.earfcn, best_pci);
    assert.equal(display.best_pci, best_pci);
    assert.equal(getMetricLabelsForLocations([display]).pci, "BCCH");
  }
});

test("comparison technology selection changes labels and restores LTE RSRQ", () => {
  const locations = [{ technology: "2G" }, { technology: "LTE" }];
  const gsmLabels = getMetricLabelsForLocations(locations.filter((log) => log.technology === "2G"));
  const lteLabels = getMetricLabelsForLocations(locations.filter((log) => log.technology === "LTE"));
  assert.equal(gsmLabels.rsrq, "");
  assert.equal(gsmLabels.pci, "BCCH");
  assert.equal(lteLabels.rsrq, "RSRQ");
  assert.equal(lteLabels.pci, "PCI");
});

test("2G channel aliases resolve to one BCCH value, including zero and blank fallbacks", () => {
  for (const log of [
    { network: "GSM", bcch: 0, earfcn: 42, pci: 42 },
    { network: "GERAN", bcch: "", earfcn: "", pci: 0 },
  ]) {
    assert.equal(getTechnologyMetricValue(log, "pci"), 0);
    assert.equal(getTechnologyMetricValue(log, "earfcn"), 0);
  }
  assert.equal(getTechnologyMetricValue({ technology: "2G", rxqual: 0, sinr: 4 }, "sinr"), 0);
});

test("2G controls omit RSRQ and duplicate BCCH while LTE controls remain intact", () => {
  const options = ["rsrp", "rsrq", "sinr", "pci", "earfcn"].map((value) => ({ value, label: value.toUpperCase() }));
  assert.deepEqual(getTechnologyMetricOptions(options, "2G").map(({ label }) => label), ["RxLev", "RxQual", "BCCH"]);
  assert.equal(getTechnologyMetricOptions(options, "LTE"), options);
  assert.equal(getTechnologySignalRows({ technology: "LTE", rsrq: -10 }).length, 3);
});

test("technology aliases and mixed selections are handled consistently", () => {
  for (const alias of ["2g", "GSM", "GERAN", "GPRS", "EDGE"]) assert.ok(is2GTechnology(alias));
  assert.equal(getMetricLabelsForLocations([{ Technology: "GSM" }, { network_type: "2G" }]).pci, "BCCH");
  assert.equal(getMetricLabelsForLocations([{ technology: "2G" }, { technology: "LTE" }]).rsrq, "RSRQ");
});
