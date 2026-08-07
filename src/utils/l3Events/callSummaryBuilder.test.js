import test from "node:test";
import assert from "node:assert/strict";

import { buildCallSummary } from "./callSummaryBuilder.js";

function event({
  seconds,
  category = "Call",
  type = "event",
  eventKey,
  rawMessage = "",
  title = eventKey || "Event",
  summary = rawMessage,
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
    event({ seconds: 20, category: "Handover", rawMessage: "handover failure on target cell", title: "Handover Failure" }),
    event({ seconds: 22, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 22, eventKey: "CALL_DISCONNECTED", rawMessage: "dropped" }),
  ]);

  assert.equal(summary.dropped, 1);
  assert.equal(summary.calls[0].status, "Dropped");
  assert.equal(summary.calls[0].detailedStatus, "Handover Failure");
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

  assert.equal(summary.dropped, 1);
  assert.equal(summary.ongoing, 1);
  assert.equal(summary.calls[0].status, "Dropped");
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
  assert.equal(summary.connected, 2);
  assert.equal(summary.dropped, 2);
  assert.equal(summary.notConnected, 2);
  assert.deepEqual(summary.calls.map((call) => call.status), [
    "Connected",
    "Connected",
    "Not Connected",
    "Not Connected",
    "Dropped",
    "Dropped",
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
    event({ seconds: 5, category: "IMS", type: "l3", rawMessage: "SIP 404 unrelated stale response", title: "IMS Status" }),
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
  assert.equal(summary.calls[0].disconnectReason, "Normal call release after a completed call.");
});

test("treats cause=3 as completed for this device profile when the call ran normally", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, eventKey: "CALL_DIALING", rawMessage: "dialing" }),
    event({ seconds: 2, eventKey: "CALL_ALERTING", rawMessage: "alerting" }),
    event({ seconds: 20, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
    event({ seconds: 20, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].detailedStatus, "Completed");
  assert.equal(summary.calls[0].setupTimeMs, 2000);
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
