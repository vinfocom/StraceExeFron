import test from "node:test";
import assert from "node:assert/strict";
import { getClutterTilesPayload } from "./clutterTilesResponse.js";

test("keeps the API envelope when its data field is the tile array", () => {
  const payload = { status: 1, matchedCount: 1, data: [{ clutterTileId: 501 }] };

  assert.equal(getClutterTilesPayload(payload), payload);
});

test("unwraps an Axios response while preserving the API envelope", () => {
  const payload = { status: 1, matchedCount: 1, data: [{ clutterTileId: 501 }] };

  assert.equal(getClutterTilesPayload({ status: 200, data: payload }), payload);
});

test("leaves missing or invalid response bodies available for validation", () => {
  assert.equal(getClutterTilesPayload(null), null);
  assert.deepEqual(getClutterTilesPayload({ status: 1, data: "invalid" }), {
    status: 1,
    data: "invalid",
  });
});
