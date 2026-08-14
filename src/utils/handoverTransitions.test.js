import test from "node:test";
import assert from "node:assert/strict";

import { buildHandoverTransitions, evaluateL3HandoverTimeline } from "./handoverTransitions.js";

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

test("creates one handover candidate after the target PCI persists without L3 correlation", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { nodeb_id: "1001" }),
    row(2, 101, 1, { nodeb_id: "1001" }),
    row(3, 205, 2, { nodeb_id: "2002" }),
    row(4, 205, 3, { nodeb_id: "2002" }),
  ]);

  assert.equal(result.pciTransitions.length, 1);
  assert.equal(result.pciTransitions[0].from, "101");
  assert.equal(result.pciTransitions[0].to, "205");
  assert.equal(result.pciTransitions[0].classification, "handover_candidate");
  assert.equal(result.pciTransitions[0].mobilityCategory, "intra-frequency");
  assert.equal(result.pciTransitions[0].fromNodebId, "1001");
  assert.equal(result.pciTransitions[0].toNodebId, "2002");
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

test("detects a persistent technology handover when PCI is unavailable", () => {
  const result = buildHandoverTransitions([
    row(1, "", 0, { technology: "LTE", band: "3", cell_id: "" }),
    row(2, "", 1, { technology: "LTE", band: "3", cell_id: "" }),
    row(3, "", 2, { technology: "NR", band: "n78", cell_id: "" }),
    row(4, "", 3, { technology: "NR", band: "n78", cell_id: "" }),
  ]);

  assert.equal(result.technologyTransitions.length, 1);
  assert.equal(result.technologyTransitions[0].from, "4G");
  assert.equal(result.technologyTransitions[0].to, "5G");
  assert.equal(result.technologyTransitions[0].mobilityCategory, "inter-rat");
  assert.equal(result.pciTransitions.length, 0);
});

test("detects and normalizes a persistent band handover when PCI is unavailable", () => {
  const result = buildHandoverTransitions([
    row(1, "", 0, { band: "3", earfcn: "", cell_id: "" }),
    row(2, "", 1, { band: "B3", earfcn: "", cell_id: "" }),
    row(3, "", 2, { band: "7", earfcn: "", cell_id: "" }),
    row(4, "", 3, { band: "Band 7", earfcn: "", cell_id: "" }),
  ]);

  assert.equal(result.bandTransitions.length, 1);
  assert.equal(result.bandTransitions[0].from, "B3");
  assert.equal(result.bandTransitions[0].to, "B7");
  assert.equal(result.pciTransitions.length, 0);
});

test("rejects one-sample technology and band fluctuations", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { technology: "LTE", band: "3" }),
    row(2, 101, 1, { technology: "LTE", band: "3" }),
    row(3, 205, 2, { technology: "NR", band: "n78" }),
    row(4, 101, 3, { technology: "LTE", band: "3" }),
    row(5, 101, 4, { technology: "LTE", band: "3" }),
  ]);

  assert.equal(result.technologyTransitions.length, 0);
  assert.equal(result.bandTransitions.length, 0);
  assert.equal(result.pciTransitions.length, 0);
});

test("validates technology persistence independently from PCI changes", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { technology: "LTE", band: "3" }),
    row(2, 102, 1, { technology: "LTE", band: "3" }),
    row(3, 201, 2, { technology: "NR", band: "n78" }),
    row(4, 202, 3, { technology: "NR", band: "n78" }),
  ]);

  assert.equal(result.technologyTransitions.length, 1);
  assert.equal(result.technologyTransitions[0].from, "4G");
  assert.equal(result.technologyTransitions[0].to, "5G");
});

test("validates band persistence independently from PCI changes", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { band: "3", earfcn: "1300" }),
    row(2, 102, 1, { band: "B3", earfcn: "1300" }),
    row(3, 201, 2, { band: "7", earfcn: "2850" }),
    row(4, 202, 3, { band: "Band 7", earfcn: "2850" }),
  ]);

  assert.equal(result.bandTransitions.length, 1);
  assert.equal(result.bandTransitions[0].from, "B3");
  assert.equal(result.bandTransitions[0].to, "B7");
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

test("does not create handovers across a sudden timestamp jump", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0, { technology: "LTE", band: "3" }),
    row(2, 101, 1, { technology: "LTE", band: "3" }),
    row(3, 205, 8, { technology: "NR", band: "n78" }),
    row(4, 205, 9, { technology: "NR", band: "n78" }),
  ]);

  assert.equal(result.pciTransitions.length, 0);
  assert.equal(result.bandTransitions.length, 0);
  assert.equal(result.technologyTransitions.length, 0);
});

test("allows a handover when the source-to-target gap matches session cadence", () => {
  const result = buildHandoverTransitions([
    row(1, 101, 0),
    row(2, 101, 3),
    row(3, 205, 6),
    row(4, 205, 9),
  ]);

  assert.equal(result.pciTransitions.length, 1);
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

const l3 = (id, seconds, title, rawMessage, extra = {}) => ({
  id,
  timestamp: new Date(baseTime + seconds * 1000),
  type: "l3",
  category: "NR-RRC",
  title,
  rawMessage,
  ...extra,
});

test("confirms an NR intra-frequency handover only after the serving PCI changes", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3("serving-old", 0, "Serving Cell", "Serving PCI=62 Serving NR-ARFCN=640000"),
    l3("measurement", 1, "NR Measurement Report", "NR Measurement Report Neighbor PCI=61 Target NR-ARFCN=640000"),
    l3("reconfiguration", 2, "NR RRC Reconfiguration", "NR RRC Reconfiguration reconfigurationWithSync Target PCI=61 Target NR-ARFCN=640000"),
    l3("complete", 3, "NR RRC Reconfiguration Complete", "NR RRC Reconfiguration Complete"),
    l3("serving-new", 4, "Serving Cell", "Serving PCI=61 Serving NR-ARFCN=640000"),
  ]);

  const result = evaluation.byId.get("complete");
  assert.equal(result.classification, "confirmed_handover");
  assert.equal(result.label, "HANDOVER COMPLETE");
  assert.equal(result.handoverType, "NR Intra-Frequency Handover");
  assert.equal(evaluation.summary.confirmed, 1);
});

test("identifies an NR inter-frequency handover from decoded ARFCN change", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3("serving-old", 0, "Serving Cell", "Serving PCI=62 Serving NR-ARFCN=640000"),
    l3("measurement", 1, "NR Measurement Report", "NR Measurement Report Neighbor PCI=61 Target NR-ARFCN=650000"),
    l3("reconfiguration", 2, "NR RRC Reconfiguration", "NR RRC Reconfiguration reconfigurationWithSync Target PCI=61 Target NR-ARFCN=650000"),
    l3("complete", 3, "NR RRC Reconfiguration Complete", "NR RRC Reconfiguration Complete"),
    l3("serving-new", 4, "Serving Cell", "Serving PCI=61 Serving NR-ARFCN=650000"),
  ]);

  assert.equal(evaluation.byId.get("complete").handoverType, "NR Inter-Frequency Handover");
});

test("keeps reconfiguration complete when the decoded serving cell is unchanged", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3("serving-old", 0, "Serving Cell", "Serving PCI=62 Serving NR-ARFCN=640000"),
    l3("measurement", 1, "NR Measurement Report", "NR Measurement Report Neighbor PCI=61 Target NR-ARFCN=640000"),
    l3("reconfiguration", 2, "NR RRC Reconfiguration", "NR RRC Reconfiguration reconfigurationWithSync Target PCI=61"),
    l3("complete", 3, "NR RRC Reconfiguration Complete", "NR RRC Reconfiguration Complete"),
    l3("serving-same", 4, "Serving Cell", "Serving PCI=62 Serving NR-ARFCN=640000"),
  ]);

  assert.equal(evaluation.byId.get("complete").classification, "rrc_reconfiguration_complete");
  assert.equal(evaluation.byId.get("complete").label, "RRC RECONFIGURATION COMPLETE");
  assert.equal(evaluation.summary.reconfigurationCompletesNotHandover, 1);
});

test("marks a correlated sequence as a candidate when serving-cell confirmation is absent", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3("serving-old", 0, "Serving Cell", "Serving PCI=62 Serving NR-ARFCN=640000"),
    l3("measurement", 1, "NR Measurement Report", "NR Measurement Report Neighbor PCI=61 Target NR-ARFCN=650000"),
    l3("reconfiguration", 2, "NR RRC Reconfiguration", "NR RRC Reconfiguration reconfigurationWithSync Target PCI=61 Target NR-ARFCN=650000"),
    l3("complete", 3, "NR RRC Reconfiguration Complete", "NR RRC Reconfiguration Complete"),
  ]);

  assert.equal(evaluation.byId.get("complete").classification, "handover_candidate");
  assert.equal(evaluation.byId.get("complete").label, "HANDOVER CANDIDATE");
  assert.equal(evaluation.summary.candidates, 1);
});

test("classifies RRC recovery separately from handover", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3("recovery", 0, "RRC Reestablishment Request", "RRC Reestablishment Request cause rlf"),
    l3("complete", 1, "RRC Reconfiguration Complete", "RRC Reconfiguration Complete recovery"),
  ]);

  assert.equal(evaluation.byId.get("recovery").classification, "rrc_reestablishment_recovery");
  assert.equal(evaluation.byId.get("complete").label, "RRC REESTABLISHMENT / RECOVERY");
  assert.equal(evaluation.summary.confirmed, 0);
});

test("confirms handovers from the decoded NR SrvCell and nb PCI export format", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3("serving-old", 0, "NR_RRC_Serv_Cell_Info", "NR SrvCell PCI=62 NARFCN=528750"),
    l3("measurement", 1, "NR Measurement Report", "NR MeasReport id=3 NARFCN=528750(measId) PCell PCI62 -88.0dBm | nb PCI61 -80.0dBm"),
    l3("reconfiguration", 2, "NR RRC Reconfiguration", "NR Reconfig measCfg: +MO1→528750 +id1→MO1 -id3"),
    l3("complete", 3, "NR RRC Reconfiguration Complete", "NR RRCReconfigComplete xact=1"),
    l3("serving-new", 4, "NR_RRC_Serv_Cell_Info", "NR SrvCell PCI=61 NARFCN=528750"),
  ]);

  const result = evaluation.byId.get("complete");
  assert.equal(result.classification, "confirmed_handover");
  assert.equal(result.handoverType, "NR Intra-Frequency Handover");
  assert.equal(result.sourceCell.pci, "62");
  assert.equal(result.targetCell.pci, "61");
});

test("confirms LTE handover commands and reports source and target cells", () => {
  const evaluation = evaluateL3HandoverTimeline([
    l3(
      "command",
      0,
      "RRC Connection Reconfiguration : Handover Command",
      "RRCReconfig HANDOVER -> PCI3 EARFCN1421 | phyCellId : 351 | freq : 40940 | mobilityControlInfo : present (handover) | [handover target] PCI 3 EARFCN 1421",
      { category: "LTE-RRC", technology: "LTE" },
    ),
    l3(
      "complete",
      1,
      "RRC Connection Reconfiguration Complete",
      "RRC Connection Reconfiguration Complete | phyCellId : 3 | freq : 1421",
      { category: "LTE-RRC", technology: "LTE" },
    ),
  ]);

  const result = evaluation.byId.get("complete");
  assert.equal(result.classification, "confirmed_handover");
  assert.equal(result.handoverType, "LTE Inter-Frequency Handover");
  assert.equal(result.sourceCell.pci, "351");
  assert.equal(result.targetCell.pci, "3");
});
