import test from "node:test";
import assert from "node:assert/strict";

import { buildUnifiedSignalingRows } from "./signalingModel.js";

const at = (seconds) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));
const item = (id, seconds, title, rawMessage) => ({
  id,
  timestamp: at(seconds),
  type: "l3",
  category: "NR-RRC",
  sourceCategory: "NR-RRC",
  title,
  rawMessage,
});

test("Excel signaling rows do not label generic reconfiguration complete as handover", () => {
  const rows = buildUnifiedSignalingRows([
    item("complete", 0, "NR RRC Reconfiguration Complete", "NR RRC Reconfiguration Complete"),
  ]);

  assert.equal(rows[0].message, "RRC RECONFIGURATION COMPLETE");
  assert.equal(rows[0].handoverClassification, "rrc_reconfiguration_complete");
});

test("Excel signaling rows expose an unconfirmed mobility sequence as candidate", () => {
  const rows = buildUnifiedSignalingRows([
    item("serving", 0, "Serving Cell", "Serving PCI=62 Serving NR-ARFCN=640000"),
    item("measurement", 1, "NR Measurement Report", "NR Measurement Report Neighbor PCI=61"),
    item("reconfiguration", 2, "NR RRC Reconfiguration", "NR RRC Reconfiguration reconfigurationWithSync Target PCI=61"),
    item("complete", 3, "NR RRC Reconfiguration Complete", "NR RRC Reconfiguration Complete"),
  ]);

  const completion = rows.find((row) => row.id === "complete");
  assert.equal(completion.message, "HANDOVER CANDIDATE");
  assert.equal(completion.severity, "warning");
});

test("Excel signaling rows extract and normalize cause from raw messages", () => {
  const rows = buildUnifiedSignalingRows([
    item("failure", 0, "Disconnect", "CALL_DISCONNECTED | cause handoverfailure | dropped"),
    item("typo", 1, "Disconnect", "CALL_DISCONNECTED | cause handoverfailuire | dropped"),
    item("none", 1, "Info", "RRC Reconfiguration Complete"),
  ]);

  assert.equal(rows[0].cause, "Handover Failure");
  assert.equal(rows[1].cause, "Handover Failure");
  assert.equal(rows[2].cause, "-");
});
