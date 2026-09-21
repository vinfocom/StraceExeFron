import assert from "node:assert/strict";
import test from "node:test";
import { getMapTooltipPosition } from "./mapTooltipPosition.js";

const bounds = { width: 800, height: 600, tooltipWidth: 256, tooltipHeight: 220 };

test("places the tooltip below and right of the cursor when it fits", () => {
  assert.deepEqual(getMapTooltipPosition({ ...bounds, x: 100, y: 100 }), { left: 112, top: 112 });
});

test("flips independently at the right and bottom edges", () => {
  assert.deepEqual(getMapTooltipPosition({ ...bounds, x: 780, y: 100 }), { left: 512, top: 112 });
  assert.deepEqual(getMapTooltipPosition({ ...bounds, x: 100, y: 580 }), { left: 112, top: 348 });
  assert.deepEqual(getMapTooltipPosition({ ...bounds, x: 780, y: 580 }), { left: 512, top: 348 });
});

test("clamps a tooltip constrained to a small map inside its padding", () => {
  assert.deepEqual(getMapTooltipPosition({
    x: 110, y: 85, width: 220, height: 170, tooltipWidth: 204, tooltipHeight: 154,
  }), { left: 8, top: 8 });
});

test("keeps measured tooltips inside the map across cursor positions", () => {
  for (const x of [0, 8, 200, 400, 600, 792, 800]) {
    for (const y of [0, 8, 200, 400, 592, 600]) {
      const { left, top } = getMapTooltipPosition({ ...bounds, x, y });
      assert.ok(left >= 8 && left + bounds.tooltipWidth <= bounds.width - 8);
      assert.ok(top >= 8 && top + bounds.tooltipHeight <= bounds.height - 8);
    }
  }
});
