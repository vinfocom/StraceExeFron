import test from "node:test";
import assert from "node:assert/strict";
import {
  CELL_MEASUREMENT_METRICS,
  getVisibleCellMeasurements,
  isCellMeasurementRow,
  parseCellMeasurements,
} from "./cellMeasurementParser.js";

const row = (id, metric, text, extra = {}) => ({
  Id: id,
  SourceCategory: "CELL_MEAS",
  EventKey: metric,
  RawMessage: text,
  TimestampLabel: "19:03:05.032",
  Latitude: 12.5,
  Longitude: 77.5,
  SessionId: "session-1",
  SourceFile: "radio.csv",
  ...extra,
});

test("parses pre/post transitions, single values, zero, negatives, and decimals", () => {
  const measurements = parseCellMeasurements([
    row("a", "rsrp", "-89 -> -88"),
    row("b", "rsrp", "(new) -89"),
    row("c", "rssnr", "0 -> 2"),
    row("d", "rsrp", "-89.5 -> -88.25"),
  ]);
  assert.deepEqual(measurements.map(({ preValue, postValue, preStatus, postStatus }) => [preValue, postValue, preStatus, postStatus]), [
    [-89, -88, "valid", "valid"],
    [null, -89, "missing", "valid"],
    [0, 2, "valid", "valid"],
    [-89.5, -88.25, "valid", "valid"],
  ]);
  assert.equal(measurements[0].unit, "dBm");
  assert.equal(measurements[0].timestampLabel, "19:03:05.032");
});

test("marks unavailable sentinels, invalid values, and unsupported complex payloads", () => {
  const [sentinel, invalid, unsupported] = parseCellMeasurements([
    row("sentinel", "ssRsrp", "2147483647 -> -104"),
    row("invalid", "rsrp", "not-a-measurement"),
    row("capacity", "LINK_CAPACITY_EST", "100 -> 200"),
  ]);
  assert.equal(sentinel.preStatus, "unavailable");
  assert.equal(sentinel.preValue, null);
  assert.equal(sentinel.postValue, -104);
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.postValue, null);
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.metricKey, null);
  assert.equal(unsupported.preValue, null);
  assert.equal(unsupported.postValue, null);
});

test("keeps provisional rank annotations and explicit metric identities", () => {
  const [rankChange, rankOnly, lte, nrSs, nrCsi, rssnr] = parseCellMeasurements([
    row("rank-change", "LTE_MIMO_Rank", "4 -> 3 [provisional]"),
    row("rank-only", "LTE_MIMO_Rank", "rank=4 [provisional]"),
    row("lte", "rsrp", "-89 -> -88"),
    row("ss", "ssRsrp", "-105 -> -104"),
    row("csi", "csiRsrp", "-110 -> -109"),
    row("snr", "rssnr", "0 -> 2"),
  ]);
  assert.equal(rankChange.status, "provisional");
  assert.equal(rankChange.preValue, 4);
  assert.equal(rankChange.postValue, 3);
  assert.equal(rankOnly.status, "provisional");
  assert.equal(rankOnly.preValue, null);
  assert.equal(rankOnly.postValue, 4);
  assert.equal(lte.metricKey, "lte_rsrp");
  assert.equal(nrSs.metricKey, "nr_ss_rsrp");
  assert.equal(nrCsi.metricKey, "nr_csi_rsrp");
  assert.equal(rssnr.unit, "dB");
  assert.equal(CELL_MEASUREMENT_METRICS.find(({ key }) => key === "lte_rssnr").unitVerified, true);
});

test("recognizes original category aliases and preserves identity, GPS, and source evidence", () => {
  const valid = row("source-7", "rsrp", "-90 -> -89", {
    sourceCategory: undefined,
    category: undefined,
    metadata: { category: "CELL_MEAS", rawMessage: "-90 -> -89", eventKey: "rsrp" },
  });
  const noGps = row("source-8", "rsrp", "-91 -> -90", { Latitude: "", Longitude: 77.5 });
  const [measurement, missingGps] = parseCellMeasurements([valid, noGps]);
  assert.equal(isCellMeasurementRow(valid), true);
  assert.equal(measurement.id, "source-7");
  assert.equal(measurement.sessionId, "session-1");
  assert.equal(measurement.gpsValid, true);
  assert.equal(measurement.latitude, 12.5);
  assert.equal(measurement.longitude, 77.5);
  assert.equal(measurement.sourceFile, "radio.csv");
  assert.equal(measurement.originalText, "-90 -> -89");
  assert.equal(missingGps.gpsValid, false);
  assert.equal(missingGps.latitude, null);
  assert.equal(missingGps.longitude, 77.5);
  assert.equal(parseCellMeasurements([row("x", "rsrp", "-90 -> -89", { SourceCategory: "Radio", category: "Event" })]).length, 0);
});

test("playback limits overlay points and dataset switches reject stale measurements", () => {
  const measurements = parseCellMeasurements([
    row("row-1", "rsrp", "-90 -> -89"),
    row("row-2", "rsrp", "-91 -> -90"),
  ]);
  const points = [{ id: "row-1", sourceRowId: "row-1" }, { id: "row-2", sourceRowId: "row-2" }];
  assert.deepEqual(getVisibleCellMeasurements(measurements, points, {
    currentIndex: 0, datasetKey: "upload-a", sourceDatasetKey: "upload-a",
  }).map(({ sourceRowId }) => sourceRowId), ["row-1"]);
  assert.equal(getVisibleCellMeasurements(measurements, points, {
    currentIndex: 0, showAllPoints: true, datasetKey: "upload-a", sourceDatasetKey: "upload-a",
  }).length, 2);
  assert.deepEqual(getVisibleCellMeasurements(measurements, points, {
    currentIndex: 1, datasetKey: "upload-b", sourceDatasetKey: "upload-a",
  }), []);
});
