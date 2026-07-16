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
}) {
  return {
    id: `${eventKey || title}-${seconds}-${Math.random()}`,
    timestamp: seconds === null ? null : new Date(Date.UTC(1970, 0, 1, 0, 0, seconds)),
    category,
    type,
    eventKey,
    rawMessage,
    title,
    summary: rawMessage,
  };
}

test("classifies a stable connected outgoing call", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing MO call" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.equal(summary.connected, 1);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[0].talkTimeMs, 8000);
});

test("classifies an early disconnect after ACTIVE as setup failure", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 1, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 1, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=43" }),
    event({ seconds: 1, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);

  assert.equal(summary.dropped, 1);
  assert.equal(summary.setupFailures, 1);
  assert.equal(summary.calls[0].status, "Dropped");
  assert.equal(summary.calls[0].detailedStatus, "Call Setup Failure");
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
    event({ seconds: 20, category: "Handover", rawMessage: "handover start", title: "Handover Start" }),
    event({ seconds: 22, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=27" }),
    event({ seconds: 22, eventKey: "CALL_DISCONNECTED", rawMessage: "dropped" }),
  ]);

  assert.equal(summary.dropped, 1);
  assert.equal(summary.calls[0].status, "Dropped");
});

test("classifies incoming answered call", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CallState", rawMessage: "Ringing incoming" }),
    event({ seconds: 4, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 19, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 19, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
  ]);

  assert.equal(summary.connected, 1);
  assert.equal(summary.calls[0].direction, "Incoming");
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

test("handles malformed logs without throwing", () => {
  const summary = buildCallSummary([
    null,
    event({ seconds: null, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    { category: "Call", eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=9", type: "event" },
    event({ seconds: 5, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);

  assert.equal(summary.totalCalls, 1);
  assert.ok(Array.isArray(summary.calls[0].warnings));
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
    event({ seconds: 11, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=14" }),
    event({ seconds: 11, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);
  const handover = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing" }),
    event({ seconds: 4, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 8, category: "Handover", type: "event", rawMessage: "handover failure on target cell", title: "Handover Failure" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECTED", rawMessage: "disconnect" }),
  ]);

  assert.equal(ims.calls[0].status, "Not Connected");
  assert.equal(ims.calls[0].detailedStatus, "IMS Failure");
  assert.equal(radio.calls[0].status, "Dropped");
  assert.equal(radio.calls[0].detailedStatus, "Radio Failure");
  assert.equal(handover.calls[0].status, "Connected");
  assert.equal(handover.calls[0].detailedStatus, "Connected");
});

test("keeps the requested 4-call aggregate behaviour", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 1" }),
    event({ seconds: 2, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 20, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 2" }),
    event({ seconds: 22, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 32, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 32, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 40, eventKey: "CallState", rawMessage: "incoming ringing" }),
    event({ seconds: 42, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 54, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=0" }),
    event({ seconds: 54, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 60, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 4" }),
    event({ seconds: 61, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 61, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=14" }),
    event({ seconds: 61, eventKey: "CALL_DISCONNECTED", rawMessage: "drop" }),
  ]);

  assert.equal(summary.totalCalls, 4);
  assert.equal(summary.connected, 3);
  assert.equal(summary.dropped, 1);
  assert.equal(summary.notConnected, 0);
});

test("session builder does not create extra sessions from duplicate states or causes", () => {
  const summary = buildCallSummary([
    event({ seconds: 0, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 1" }),
    event({ seconds: 1, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing duplicate should be ignored" }),
    event({ seconds: 2, eventKey: "CallState", rawMessage: "Dialing" }),
    event({ seconds: 3, eventKey: "CallState", rawMessage: "Offhook" }),
    event({ seconds: 4, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 5, eventKey: "CALL_ACTIVE", rawMessage: "duplicate active" }),
    event({ seconds: 8, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=2" }),
    event({ seconds: 9, eventKey: "CALL_DISCONNECT_NONZERO_CAUSE", rawMessage: "cause=3" }),
    event({ seconds: 10, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),
    event({ seconds: 11, eventKey: "CallState", rawMessage: "Idle" }),

    event({ seconds: 20, eventKey: "CallState", rawMessage: "Ringing incoming" }),
    event({ seconds: 21, eventKey: "CallState", rawMessage: "Ringing incoming duplicate" }),
    event({ seconds: 22, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 30, eventKey: "CALL_DISCONNECTED", rawMessage: "ended" }),

    event({ seconds: 40, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 3" }),
    event({ seconds: 42, eventKey: "CALL_ACTIVE", rawMessage: "active" }),
    event({ seconds: 50, eventKey: "CallState", rawMessage: "Idle" }),

    event({ seconds: 60, eventKey: "CALL_DIAL_INITIATED", rawMessage: "Outgoing 4" }),
    event({ seconds: 61, eventKey: "CallState", rawMessage: "Dialing" }),
    event({ seconds: 65, eventKey: "CALL_DISCONNECTED", rawMessage: "failed before active" }),
  ]);

  assert.equal(summary.totalCalls, 4);
  assert.equal(summary.calls[0].status, "Connected");
  assert.equal(summary.calls[1].status, "Connected");
  assert.equal(summary.calls[2].status, "Connected");
  assert.equal(summary.calls[3].status, "Not Connected");
  assert.equal(summary.connected, 3);
  assert.equal(summary.dropped, 0);
  assert.equal(summary.notConnected, 1);
});
