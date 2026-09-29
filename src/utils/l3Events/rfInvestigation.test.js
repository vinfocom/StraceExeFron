import test from "node:test";
import assert from "node:assert/strict";
import { getRfTimestamp, getRfWindow, matchRfMeasurement, normalizeRfTimestamp, prepareRfInvestigation, resolveRfHover, RF_MATCH_TOLERANCE_MS } from "./rfInvestigation.js";
import { getCompletenessNotice } from "./backendDetailModel.js";

test("keeps session and device/SIM identities isolated", () => {
  const { samples, messages } = prepareRfInvestigation({ datasetId: "ds-1", networkRows: [
    { id: "a", timestamp: "2025-01-01T00:00:00Z", session_id: 1, device_id: "sim-a", rsrp: -90 },
    { id: "b", timestamp: "2025-01-01T00:00:00Z", session_id: 2, device_id: "sim-b", rsrp: -80 },
  ], timeline: [{ id: "event", timestamp: "2025-01-01T00:00:00Z", session_id: 1, device_id: "sim-a" }] });
  assert.equal(matchRfMeasurement(messages[0], samples, { sessionIds: ["1", "2"] }).sample.rowId, "a");
  assert.equal(matchRfMeasurement({ ...messages[0], deviceId: "sim-b" }, samples, { sessionIds: ["1", "2"] }).status, "unmatched");
  assert.equal(matchRfMeasurement({ ...messages[0], sessionId: "2", deviceId: "sim-b" }, samples, { sessionIds: ["1", "2"] }).sample.rowId, "b");
});

test("preserves zero, missing and invalid values and metric source names", () => {
  const { samples } = prepareRfInvestigation({ networkRows: [{ id: 7, timestamp: "2025-01-01T00:00:00Z", lte_rsrp: 0, nr_rsrp: -105, rsrq: "bad", sinr: "", dl_thpt: 8, dl_thpt_unit: "Mbps" }] });
  assert.deepEqual(samples[0].metrics.map(({ technology, metric, value, sourceName }) => [technology, metric, value, sourceName]), [
    ["LTE", "RSRP", 0, "lte_rsrp"], ["NR", "RSRP", -105, "nr_rsrp"], ["Unknown", "Downlink throughput", 8, "dl_thpt"],
  ]);
  assert.equal(prepareRfInvestigation({ networkRows: [{ timestamp: "2025-01-01T00:00:00Z", rssi: -40 }] }).samples[0].metrics.length, 0);
});

test("normalizes full timestamps, rejects time-only values, and matches inclusive tolerance boundaries", () => {
  assert.equal(normalizeRfTimestamp("2025-01-01T00:00:00-05:00"), Date.parse("2025-01-01T05:00:00Z"));
  assert.equal(normalizeRfTimestamp("00:00:00"), null);
  assert.equal(getRfTimestamp({ timestamp: new Date("1970-01-01T00:00:01Z"), timestampLabel: "00:00:01" }), null);
  const { samples, messages } = prepareRfInvestigation({ datasetId: "ds", networkRows: [
    { id: "before-midnight", session_id: 5, timestamp: "2024-12-31T23:59:59.000Z", nr_rsrp: -99 },
  ], timeline: [{ id: "midnight", session_id: 5, timestamp: "2025-01-01T00:00:00.000Z" }] });
  const matched = matchRfMeasurement(messages[0], samples, { sessionIds: ["5"], toleranceMs: 1000 });
  assert.equal(matched.status, "nearby");
  assert.equal(matched.differenceMs, -1000);
  assert.equal(matchRfMeasurement(messages[0], samples, { sessionIds: ["5"], toleranceMs: 999 }).status, "unmatched");
  assert.equal(RF_MATCH_TOLERANCE_MS, 2000);
});

test("rejects equidistant samples as ambiguous and prevents implicit multi-session matches", () => {
  const { samples, messages } = prepareRfInvestigation({ networkRows: [
    { id: "1", timestamp: "2025-01-01T00:00:00Z", session_id: 1, rsrp: -90 },
    { id: "2", timestamp: "2025-01-01T00:00:02Z", session_id: 1, rsrp: -91 },
  ], timeline: [{ id: "e", timestamp: "2025-01-01T00:00:01Z", session_id: 1 }] });
  assert.equal(matchRfMeasurement(messages[0], samples, { sessionIds: ["1"] }).status, "ambiguous");
  assert.equal(matchRfMeasurement({ ...messages[0], sessionId: null }, samples, { sessionIds: ["1", "2"] }).status, "unmatched");
});

test("uses full call intervals plus margin and retains rows without GPS", () => {
  const { messages } = prepareRfInvestigation({ datasetId: "upload-2", timeline: [{ id: "no-gps", timestamp: "2025-01-01T00:00:00Z", rawMessage: "inspect me" }] });
  assert.equal(messages[0].latitude, null);
  assert.equal(messages[0].rawMessage, "inspect me");
  const window = getRfWindow({ startTime: new Date("2025-01-01T00:00:10Z"), endTime: new Date("2025-01-01T00:00:20Z") }, 5);
  assert.equal(window.startMs, Date.parse("2025-01-01T00:00:05Z"));
  assert.equal(window.endMs, Date.parse("2025-01-01T00:00:25Z"));
  assert.deepEqual(getRfWindow({ startTime: new Date("2025-01-01T00:00:10Z") }, 5), {
    startMs: Date.parse("2025-01-01T00:00:05Z"), endMs: Date.parse("2025-01-01T00:00:15Z"),
  });
});

test("shared hover resolves the nearby message, matching sample, and map position without inventing GPS", () => {
  const { samples, messages } = prepareRfInvestigation({ datasetId: "ds", networkRows: [
    { id: "sample", timestamp: "2025-01-01T00:00:00.500Z", session_id: 1, rsrp: -90, latitude: 0, longitude: 0 },
  ], timeline: [
    { id: "message", timestamp: "2025-01-01T00:00:00Z", session_id: 1, rawMessage: "original" },
  ] });
  const resolved = resolveRfHover(messages[0].timestampMs, messages, samples, { sessionIds: ["1"] });
  assert.equal(resolved.message.id, "message");
  assert.equal(resolved.match.sample.rowId, "sample");
  assert.deepEqual([resolved.mapPosition.latitude, resolved.mapPosition.longitude], [0, 0]);
  assert.equal(resolveRfHover(messages[0].timestampMs, messages, [], { sessionIds: ["1"] }).mapPosition, null);
});

test("incomplete dataset notices remain visible rather than being treated as complete", () => {
  assert.match(getCompletenessNotice(10, 50000, 20), /Partial data/);
  assert.match(getCompletenessNotice(10, 0, null), /^$/); // RF caller adds explicit unknown status when count metadata is absent.
});

