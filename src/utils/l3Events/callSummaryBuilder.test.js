import test from "node:test";
import assert from "node:assert/strict";

import { buildCallSummary } from "./callSummaryBuilder.js";
import { parseEventCSV } from "./eventParser.js";
import { mergeTimeline } from "./timelineBuilder.js";

function event({
  seconds,
  category = "Call",
  type = "event",
  eventKey,
  rawMessage = "",
  title = eventKey || "Event",
  summary = rawMessage,
  ...extra
}) {
  return {
    id: `${eventKey || title}-${seconds}-${Math.random()}`,
    timestamp: seconds === null ? null : new Date(Date.UTC(1970, 0, 1, 0, 0, seconds)),
    category,
    type,
    eventKey,
    rawMessage,
    title,
    summary,
    ...extra,
  };
}

test("classifies a stable completed outgoing call using a real connection indicator", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing MO call" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.connected, 1);
  assert.equal(summary.averageSetupTime, 2000);
  assert.equal(summary.calls[0].setupTimeMs, 2000);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Completed");
  assert.equal(summary.calls[0].talkTimeMs, 8000);
});

test("does not treat capability-only CALL_ACTIVE as connection", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "applyLocalCallCapabilities callType=2" }),
    event({ seconds: 4, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 4, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);

  assert.equal(summary.notConnected, 1);
  assert.equal(summary.calls[0].status, "Not Connected");
  assert.equal(summary.calls[0].setupTimeMs, 0);
  assert.equal(summary.calls[0].durationMs, 0);
});

test("classifies busy and rejected outcomes", () => {
  const busy = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 4, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 4, eventKey: "CALL_DISCONNECTED", rawMessage: "busy release" }),
  ]);
  const rejected = buildCallSummary([
    event({ seconds: 0, eventKey: "CallState", rawMessage: "incoming ringing" }),
    event({ seconds: 3, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=16" }),
    event({ seconds: 3, eventKey: "CALL_DISCONNECTED", rawMessage: "rejected" }),
  ]);

  assert.equal(busy.busy, 1);
  assert.equal(busy.notConnected, 1);
  assert.equal(busy.calls[0].status, "Not Connected");
  assert.equal(busy.calls[0].detailedStatus, "Busy");
  assert.equal(rejected.rejected, 1);
  assert.equal(rejected.notConnected, 1);
  assert.equal(rejected.calls[0].status, "Not Connected");
  assert.equal(rejected.calls[0].detailedStatus, "Rejected");
});

test("classifies dropped calls from abnormal connected disconnects", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 18, category: "Handover", rawMessage: "Handover Command", title: "Handover Command" }),
    event({ seconds: 20, category: "Handover", rawMessage: "handover failure on target cell", title: "Handover Failure" }),
    event({ seconds: 22, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 22, eventKey: "CALL_DISCONNECTED", rawMessage: "dropped" }),
  ]);

  assert.equal(summary.dropped, 1);
  assert.equal(summary.calls[0].status, "Dropped");
  assert.equal(summary.calls[0].detailedStatus, "Handover Failure");
  assert.equal(summary.calls[0].handoverAttempts.length, 1);
  assert.equal(summary.calls[0].failedHandovers.length, 1);
});

test("classifies compact handoverfailure cause as handover failure", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 20, eventKey: "CALL_DISCONNECTED", rawMessage: "CALL_DISCONNECTED | cause handoverfailuire | dropped" }),
  ]);

  assert.equal(summary.dropped, 1);
  assert.equal(summary.calls[0].detailedStatus, "Handover Failure");
  assert.equal(summary.calls[0].failedHandovers.length, 1);
});

test("classifies incoming answered call", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CallState", rawMessage: "Ringing incoming" }),
    event({ seconds: 4, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 19, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 19, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.calls[0].direction, "Incoming");
  assert.equal(summary.calls[0].setupTimeMs, 4000);
});

test("captures duplicate active and missing disconnect warnings", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 3, eventKey: "CALL_ACTIVE", rawMessage: "active duplicate" }),
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.dropped, 0);
  assert.equal(summary.ongoing, 1);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Ongoing");
  assert.match(summary.calls[0].warnings.join(" | "), /Duplicate ACTIVE events/);
  assert.match(summary.calls[0].warnings.join(" | "), /No disconnect event/);
});

test("ignores stale connection-looking rows after disconnect", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 3, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 3, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
    event({ seconds: 4, eventKey: "CALL_ACTIVE", rawMessage: "active after end should be ignored" }),
  ]);

  assert.equal(summary.notConnected, 1);
  assert.equal(summary.calls[0].status, "Not Connected");
  assert.equal(summary.calls[0].setupTimeMs, 0);
});

test("classifies ims, radio, and handover failures from l3 hints", () => {
  const ims = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, category: "IMS", type: "l3", rawMessage: "IMS registration failed 403", title: "IMS Failure" }),
    event({ seconds: 2, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=9" }),
    event({ seconds: 2, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);
  const radio = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 4, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 10, category: "LTE-RRC", type: "l3", rawMessage: "radio link failure followed by RRC release", title: "RLF" }),
    event({ seconds: 11, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 11, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);

  assert.equal(ims.calls[0].status, "Not Connected");
  assert.equal(ims.calls[0].detailedStatus, "IMS Failure");
  assert.equal(radio.calls[0].status, "Dropped");
  assert.equal(radio.calls[0].detailedStatus, "Radio Failure");
});

test("derives the six-call sample pattern from correlation rules", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 1" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 8, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 8, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 20, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 2" }),
    event({ seconds: 21, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 26, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 26, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 40, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 3" }),
    event({ seconds: 41, eventKey: "CALL_ACTIVE", rawMessage: "applyLocalCallCapabilities callType=2" }),
    event({ seconds: 45, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 45, eventKey: "CALL_DISCONNECTED", rawMessage: "released before connection" }),

    event({ seconds: 60, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 4" }),
    event({ seconds: 61, eventKey: "CALL_ACTIVE", rawMessage: "applyRemoteCallCapabilities callType=2" }),
    event({ seconds: 66, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 66, eventKey: "CALL_DISCONNECTED", rawMessage: "released before connection" }),

    event({ seconds: 80, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 5" }),
    event({ seconds: 81, type: "l3", category: "IMS", title: "SIP INVITE", rawMessage: "SIP INVITE" }),
    event({ seconds: 82, type: "l3", category: "IMS", title: "SIP 200 OK", rawMessage: "SIP 200 OK for INVITE" }),
    event({ seconds: 83, type: "l3", category: "IMS", title: "SIP ACK", rawMessage: "SIP ACK" }),
    event({ seconds: 88, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 88, eventKey: "CALL_DISCONNECTED", rawMessage: "dropped" }),

    event({ seconds: 100, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 6" }),
    event({ seconds: 101, eventKey: "CALL_ACTIVE", rawMessage: "callType=3 voice profile established" }),
    event({ seconds: 108, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 108, eventKey: "CALL_DISCONNECTED", rawMessage: "dropped" }),
  ]);

  assert.equal(summary.totalCalls, 6);
  assert.equal(summary.connected, 4);
  assert.equal(summary.dropped, 0);
  assert.equal(summary.notConnected, 2);
  assert.deepEqual(summary.calls.map((call) => call.status), [
    "Connected",
    "Connected",
    "Not Connected",
    "Not Connected",
    "Connected",
    "Connected",
  ]);
});

test("keeps cause=4 sessions as not connected even if late callType=3 appears", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "applyLocalCallCapabilities callType=2" }),
    event({ seconds: 10, eventKey: "CALL_CAPS_REMOTE", rawMessage: "applyRemoteCallCapabilities callType=3", title: "CALL_CAPS_REMOTE" }),
    event({ seconds: 11, eventKey: "CallState", rawMessage: "Idle (ended)" }),
    event({ seconds: 11, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 11, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);

  assert.equal(summary.notConnected, 1);
  assert.equal(summary.connected, 0);
  assert.equal(summary.calls[0].status, "Not Connected");
});

test("uses ImsPhoneConnection disconnect cause rows attached just after the end marker", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
    event({
      seconds: 11,
      eventKey: "CALL_DISCONNECT_NONZERO_CAUSE",
      rawMessage: "07-30 12:20:59.523  4799  4799 D ImsPhoneConnection: getDisconnectCause: cause=3",
    }),
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.dropped, 0);
  assert.equal(summary.calls[0].causeCode, 3);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].disconnectReason, "Call ended locally by the user or device.");
});

test("does not use cause=3 as connection proof", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, eventKey: "CALL_DIALING", rawMessage: "dialing" }),
    event({ seconds: 2, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 20, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
    event({ seconds: 20, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
  ]);

  assert.equal(summary.connected, 0);
  assert.equal(summary.notConnected, 1);
  assert.equal(summary.calls[0].status, "Not Connected");
  assert.equal(summary.calls[0].setupTimeMs, 0);
});

test("remote normal cause=2 completes an established call", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Dial" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "genuine active state" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECTED", rawMessage: "remote release" }),
  ]);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Completed");
  assert.equal(summary.calls[0].causeCode, 2);
});

test("generic RRC reconfiguration complete does not prove handover success", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Dial" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 5, category: "Handover", type: "l3", title: "Handover Command", rawMessage: "Handover Command" }),
    event({ seconds: 6, category: "LTE-RRC", type: "l3", title: "RRC Reconfiguration Complete", rawMessage: "RRC Reconfiguration Complete" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "normal disconnect" }),
  ]);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Completed");
  assert.equal(summary.calls[0].handoverAttempts.length, 1);
  assert.equal(summary.calls[0].successfulHandovers.length, 0);
  assert.equal(summary.calls[0].failedHandovers.length, 0);
});

test("call summary counts a handover only when the serving-cell transition is decoded", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Dial" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 2, category: "NR-RRC", type: "l3", title: "Serving Cell", rawMessage: "Serving PCI=62 Serving NR-ARFCN=640000" }),
    event({ seconds: 3, category: "NR-RRC", type: "l3", title: "NR Measurement Report", rawMessage: "NR Measurement Report Neighbor PCI=61 Target NR-ARFCN=640000" }),
    event({ seconds: 4, category: "NR-RRC", type: "l3", title: "NR RRC Reconfiguration", rawMessage: "NR RRC Reconfiguration reconfigurationWithSync Target PCI=61" }),
    event({ seconds: 5, category: "NR-RRC", type: "l3", title: "NR RRC Reconfiguration Complete", rawMessage: "NR RRC Reconfiguration Complete" }),
    event({ seconds: 6, category: "NR-RRC", type: "l3", title: "Serving Cell", rawMessage: "Serving PCI=61 Serving NR-ARFCN=640000" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "normal disconnect" }),
  ]);

  assert.equal(summary.calls[0].successfulHandovers.length, 1);
});

test("generic RRC Release after an established call is normal cleanup", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Dial" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 8, category: "LTE-RRC", type: "l3", title: "RRC Release", rawMessage: "RRC Release" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Completed");
});

test("SIP INVITE, 200 OK, ACK and BYE prove a completed call", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Dial" }),
    event({ seconds: 1, category: "IMS", type: "l3", title: "SIP INVITE", rawMessage: "SIP INVITE" }),
    event({ seconds: 2, category: "IMS", type: "l3", title: "SIP 200 OK", rawMessage: "SIP 200 OK for INVITE" }),
    event({ seconds: 3, category: "IMS", type: "l3", title: "SIP ACK", rawMessage: "SIP ACK" }),
    event({ seconds: 8, category: "IMS", type: "l3", title: "SIP BYE", rawMessage: "SIP BYE" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Completed");
  assert.match(summary.calls[0].connectedEvidence[0].label, /200 OK.*ACK/);
});

test("SIP 486 before establishment is not connected and busy", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Dial" }),
    event({ seconds: 1, category: "IMS", type: "l3", title: "SIP INVITE", rawMessage: "SIP INVITE" }),
    event({ seconds: 3, category: "IMS", type: "l3", title: "SIP 486", rawMessage: "SIP 486 Busy Here" }),
    event({ seconds: 4, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);
  assert.equal(summary.calls[0].status, "Not Connected");
  assert.equal(summary.calls[0].detailedStatus, "Busy");
});

test("derives setup time when the session starts from dialing without a dial-initiated row", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIALING", rawMessage: "dialing" }),
    event({ seconds: 3, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].setupTimeMs, 3000);
});

test("session builder does not create extra sessions from duplicate states or causes", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 1" }),
    event({ seconds: 1, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing duplicate should be ignored" }),
    event({ seconds: 2, eventKey: "CallState", rawMessage: "Dialing" }),
    event({ seconds: 3, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 8, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
    event({ seconds: 11, eventKey: "CallState", rawMessage: "Idle" }),

    event({ seconds: 20, eventKey: "CallState", rawMessage: "Ringing incoming" }),
    event({ seconds: 21, eventKey: "CallState", rawMessage: "Ringing incoming duplicate" }),
    event({ seconds: 22, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 30, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 30, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 40, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 3" }),
    event({ seconds: 42, eventKey: "CALL_ACTIVE", rawMessage: "applyLocalCallCapabilities callType=2" }),
    event({ seconds: 50, eventKey: "CallState", rawMessage: "Idle" }),
  ]);

  assert.equal(summary.totalCalls, 3);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[1].status, "Connected");
  assert.equal(summary.calls[2].status, "Not Connected");
  assert.equal(summary.connected, 2);
  assert.equal(summary.notConnected, 1);
});

test("ignores stale buffered call framework rows before the first real dial attempt", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_ACTIVE", rawMessage: "08-07 09:40:00.000 old ImsPhoneConnection active", isStale: true }),
    event({ seconds: 1, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "08-07 09:40:01.000 cause=2 old call", isStale: true }),
    event({ seconds: 2, eventKey: "CALL_DISCONNECTED", rawMessage: "08-07 09:40:02.000 old disconnect", isStale: true }),
    event({ seconds: 10, eventKey: "CALL_DIAL_INITIATED", rawMessage: "new outgoing call" }),
    event({ seconds: 12, eventKey: "CALL_ACTIVE", rawMessage: "precise call state active" }),
    event({ seconds: 30, eventKey: "CALL_DISCONNECTED", rawMessage: "normal disconnect" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.connected, 1);
  assert.equal(summary.calls[0].startTime.getTime(), Date.UTC(1970, 0, 1, 0, 0, 10));
});

test("alerting followed by disconnect is not connected without answer evidence", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "dial" }),
    event({ seconds: 1, type: "l3", category: "IMS", title: "SIP INVITE", rawMessage: "SIP INVITE" }),
    event({ seconds: 2, type: "l3", category: "IMS", title: "SIP 180 Ringing", rawMessage: "SIP 180 Ringing" }),
    event({ seconds: 5, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect before answer" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.notConnected, 1);
  assert.equal(summary.calls[0].callSetupTimeMs, null);
  assert.equal(summary.calls[0].connectedDurationMs, null);
});

test("recovered RRC issue is exposed but does not force a dropped final result", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "dial" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "precise call state active" }),
    event({ seconds: 6, type: "l3", category: "LTE-RRC", title: "RRC Reestablishment Request", rawMessage: "RRC Reestablishment Request cause rlf" }),
    event({ seconds: 7, type: "l3", category: "LTE-RRC", title: "RRC Reestablishment Reject", rawMessage: "RRC Reestablishment Reject" }),
    event({ seconds: 8, type: "l3", category: "LTE-RRC", title: "RRC Reconfiguration Complete", rawMessage: "RRC Reconfiguration Complete recovery" }),
    event({ seconds: 20, eventKey: "CALL_DISCONNECTED", rawMessage: "normal disconnect" }),
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.dropped, 0);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].radioIssueDetected, true);
  assert.equal(summary.calls[0].radioRecovered, true);
  assert.ok(summary.calls[0].rrcRecoveryEvents.length >= 2);
});

test("synthetic Log_20260807_094502 golden count pattern is preserved", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 1" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 12, eventKey: "CALL_DISCONNECTED", rawMessage: "normal disconnect" }),

    event({ seconds: 30, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 2" }),
    event({ seconds: 32, type: "l3", category: "IMS", title: "SIP INVITE", rawMessage: "SIP INVITE" }),
    event({ seconds: 33, type: "l3", category: "IMS", title: "SIP 200 OK", rawMessage: "SIP 200 OK for INVITE" }),
    event({ seconds: 34, type: "l3", category: "IMS", title: "SIP ACK", rawMessage: "SIP ACK" }),
    event({ seconds: 45, eventKey: "CALL_DISCONNECTED", rawMessage: "normal disconnect" }),

    event({ seconds: 60, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 3" }),
    event({ seconds: 65, eventKey: "CALL_ALERTING", rawMessage: "alerting only" }),
    event({ seconds: 70, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect before answer" }),

    event({ seconds: 90, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 4" }),
    event({ seconds: 92, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 100, type: "l3", category: "LTE-RRC", title: "RLF", rawMessage: "radio link failure" }),
    event({ seconds: 101, eventKey: "CALL_DISCONNECTED", rawMessage: "dropped" }),
  ]);

  assert.equal(summary.totalCalls, 4);
  assert.equal(summary.connected, 2);
  assert.equal(summary.notConnected, 1);
  assert.equal(summary.dropped, 1);
});

test("time-only CSV rows detect stale embedded logcat timestamps", () => {
  const rows = parseEventCSV([
    "timestamp,category,event,detail,source,severity",
    "09:45:02.972,CONFIG,SERVICE_STATE_CHANGED,08-07 09:42:31.494 old buffered state,logcat-radio,INFO",
    "09:45:37.619,CALL,CALL_DIAL_INITIATED,08-07 09:45:37.616 dial initiated,logcat-radio,INFO",
  ].join("\n"));
  const timeline = mergeTimeline([], rows);

  assert.equal(timeline[0].isStale, true);
  assert.equal(timeline[1].isStale, false);
  assert.equal(timeline[1].timestamp.getUTCMilliseconds(), 616);
});

test("a generic buffered Ringing snapshot does not create a call", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "mPreciseCallState", rawMessage: "(new) Ringing" }),
    event({ seconds: 30, eventKey: "CALL_DIAL_INITIATED", rawMessage: "real outgoing dial" }),
    event({ seconds: 31, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 40, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.calls[0].dialTime.getTime(), Date.UTC(1970, 0, 1, 0, 0, 30));
});

test("terminal callback ordering distinguishes fixed-duration completion from unanswered timeout", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 1" }),
    event({ seconds: 1, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 96, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 96, eventKey: "CALL_DISCONNECTED", rawMessage: "modem call end" }),
    event({ seconds: 97, eventKey: "CallState", rawMessage: "Idle (ended)" }),

    event({ seconds: 110, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 2" }),
    event({ seconds: 111, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 205, eventKey: "CallState", rawMessage: "Idle (ended)" }),
    event({ seconds: 206, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 206, eventKey: "CALL_DISCONNECTED", rawMessage: "callback cleanup" }),
  ]);

  assert.deepEqual(summary.calls.map((call) => call.status), ["Connected", "Not Connected"]);
  assert.equal(summary.calls[0].connectionEstimated, true);
  assert.equal(summary.calls[0].callSetupTimeMs, 6000);
  assert.equal(summary.calls[0].connectedDurationMs, 90000);
  assert.equal(summary.calls[1].callSetupTimeMs, null);
});

test("CSTEST event signature stays 2 connected, 2 not connected and 2 dropped", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 1" }),
    event({ seconds: 1, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 96, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 96, eventKey: "CALL_DISCONNECTED", rawMessage: "modem end" }),
    event({ seconds: 97, eventKey: "CallState", rawMessage: "Idle (ended)" }),

    event({ seconds: 110, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 2" }),
    event({ seconds: 111, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 206, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 206, eventKey: "CALL_DISCONNECTED", rawMessage: "modem end" }),
    event({ seconds: 207, eventKey: "CallState", rawMessage: "Idle (ended)" }),

    event({ seconds: 220, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 3" }),
    event({ seconds: 221, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 240, eventKey: "CALL_CAPS_REMOTE", rawMessage: "applyRemoteCallCapabilities callType=3" }),
    event({ seconds: 251, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 251, eventKey: "CallState", rawMessage: "Idle (ended)" }),

    event({ seconds: 260, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 4" }),
    event({ seconds: 261, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 275, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=4" }),
    event({ seconds: 275, eventKey: "CallState", rawMessage: "Idle (ended)" }),

    event({ seconds: 290, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 5" }),
    event({ seconds: 291, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 300, eventKey: "CALL_ACTIVE", rawMessage: "applyLocalCallCapabilities callType=3" }),
    event({ seconds: 345, category: "Radio", rawMessage: "ENDC force disabled with scgfail" }),
    event({ seconds: 346, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 346, eventKey: "CallState", rawMessage: "Idle (ended)" }),

    event({ seconds: 360, eventKey: "CALL_DIAL_INITIATED", rawMessage: "call 6" }),
    event({ seconds: 361, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 383, eventKey: "CALL_ACTIVE", rawMessage: "applyLocalCallCapabilities callType=3" }),
    event({ seconds: 412, category: "Radio", rawMessage: "ENDC force disabled with scgfail" }),
    event({ seconds: 413, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 413, eventKey: "CallState", rawMessage: "Idle (ended)" }),
  ]);

  assert.equal(summary.totalCalls, 6);
  assert.equal(summary.connected, 2);
  assert.equal(summary.notConnected, 2);
  assert.equal(summary.dropped, 2);
  assert.deepEqual(summary.calls.map((call) => call.status), [
    "Connected",
    "Connected",
    "Not Connected",
    "Not Connected",
    "Dropped",
    "Dropped",
  ]);
});
