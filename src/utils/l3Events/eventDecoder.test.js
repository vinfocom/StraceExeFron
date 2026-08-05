import test from "node:test";
import assert from "node:assert/strict";

import { decodeEventItem } from "./eventDecoder.js";

test("extracts cell count change from event rows", () => {
  const decoded = decodeEventItem({
    category: "CONFIG",
    eventName: "CellInfo.count",
    value: "2 -> 5",
    raw: {},
  });

  assert.deepEqual(
    decoded.details.filter((detail) => /Cell Count/.test(detail.label)),
    [
      { label: "Previous Cell Count", value: "2" },
      { label: "New Cell Count", value: "5" },
    ],
  );
});

test("extracts pci handover values from event rows", () => {
  const decoded = decodeEventItem({
    category: "HANDOVER",
    eventName: "PCI Handover",
    value: "229 -> 120",
    raw: {},
  });

  assert.deepEqual(
    decoded.details.filter((detail) => /PCI/.test(detail.label)),
    [
      { label: "Previous PCI", value: "229" },
      { label: "New PCI", value: "120" },
    ],
  );
});

test("extracts rsrp and rsrq switch values with units from event rows", () => {
  const rsrp = decodeEventItem({
    category: "HANDOVER",
    eventName: "RSRP Switch",
    value: "-108 -> -96",
    raw: {},
  });
  const rsrq = decodeEventItem({
    category: "HANDOVER",
    eventName: "RSRQ Switch",
    value: "-15 -> -10",
    raw: {},
  });

  assert.deepEqual(
    rsrp.details.filter((detail) => /RSRP/.test(detail.label)),
    [
      { label: "Previous RSRP", value: "-108 dBm" },
      { label: "New RSRP", value: "-96 dBm" },
    ],
  );
  assert.deepEqual(
    rsrq.details.filter((detail) => /RSRQ/.test(detail.label)),
    [
      { label: "Previous RSRQ", value: "-15 dB" },
      { label: "New RSRQ", value: "-10 dB" },
    ],
  );
});
