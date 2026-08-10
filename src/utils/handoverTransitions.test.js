import test from "node:test";
import assert from "node:assert/strict";

import { buildHandoverTransitions } from "./handoverTransitions.js";

const baseTime = Date.parse("2026-08-09T10:00:00Z");

const row = (id, pci, offsetSeconds, extra = {}) => ({
  id,
  session_id: 7,
  timestamp: new Date(baseTime + offsetSeconds * 1000).toISOString(),
  lat: 28.6 + id / 100000,
  lng: 77.2 + id / 100000,
  technology: "LTE",
  band: "3",
  earfcn: "1300",
  pci,
  cell_id: `cell-${pci}`,
  primary_cell_info_1: "mRegistered=YES",
  ...extra,
});

test("creates one inferred handover after the target PCI persists", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0),
    row(2, 101, 1),
    row(3, 205, 2),
    row(4, 205, 3),
  ]);

  assert.equal(result.pciTransitions.length, 1);
  assert.equal(result.pciTransitions[0].from, "101");
  assert.equal(result.pciTransitions[0].to, "205");
  assert.equal(result.pciTransitions[0].classification, "inferred_handover");
  assert.equal(result.pciTransitions[0].mobilityCategory, "intra-frequency");
});

test("rejects a one-sample PCI fluctuation", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0),
    row(2, 101, 1),
    row(3, 205, 2),
    row(4, 101, 3),
    row(5, 101, 4),
  ]);

  assert.equal(result.pciTransitions.length, 0);
});

test("does not substitute Cell ID when PCI is missing", () => {
  const result = buildHandoverTransitions([
    row(1, "", 0, { cell_id: "cell-a" }),
    row(2, "", 1, { cell_id: "cell-b" }),
  ]);

  assert.equal(result.pciTransitions.length, 0);
});

test("does not connect serving cells across a long logging gap", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0),
    row(2, 101, 1),
    row(3, 205, 300),
    row(4, 205, 301),
  ]);

  assert.equal(result.pciTransitions.length, 0);
});

test("detects an inter-frequency cell change even when PCI is reused", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { cell_id: "a", earfcn: "1300" }),
    row(2, 101, 1, { cell_id: "a", earfcn: "1300" }),
    row(3, 101, 2, { cell_id: "b", earfcn: "1650" }),
    row(4, 101, 3, { cell_id: "b", earfcn: "1650" }),
  ]);

  assert.equal(result.pciTransitions.length, 1);
  assert.equal(result.pciTransitions[0].samePciCellChange, true);
  assert.equal(result.pciTransitions[0].mobilityCategory, "inter-frequency");
});

test("uses secondary logs only as corroborating target-neighbor evidence", () => {
  const logs = [
    row(1, 101, 0),
    row(2, 101, 1),
    row(3, 205, 2),
    row(4, 205, 3),
  ];
  const neighborLogs = [{
    sessionId: 7,
    timestamp: new Date(baseTime + 1500).toISOString(),
    primaryPci: 101,
    neighbourPci: 205,
    neighbourRsrp: -91,
  }];

  const result = buildHandoverTransitions(logs, { neighborLogs });

  assert.equal(result.pciTransitions.length, 1);
  assert.equal(result.pciTransitions[0].targetSeenAsNeighbor, true);
  assert.equal(result.pciTransitions[0].targetNeighborRsrp, -91);
});

test("marks an explicit successful event as confirmed", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0),
    row(2, 101, 1),
    row(3, 205, 2, { event_name: "Handover Success" }),
  ]);

  assert.equal(result.pciTransitions.length, 1);
  assert.equal(result.pciTransitions[0].classification, "confirmed_handover");
  assert.equal(result.pciTransitions[0].confidence, "high");
});

test("keeps sessions isolated", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { session_id: 7 }),
    row(2, 101, 1, { session_id: 7 }),
    row(3, 205, 2, { session_id: 8 }),
    row(4, 205, 3, { session_id: 8 }),
  ]);

  assert.equal(result.pciTransitions.length, 0);
});

