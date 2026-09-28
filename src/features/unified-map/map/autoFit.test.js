import test from "node:test";
import assert from "node:assert/strict";
import { getValidMapCoordinates, resolveAutoFitAction, shouldShowInitialMapSpinner } from "./autoFit.js";

test("progressive chunks fit once, then fit final bounds once on completion", () => {
  const state = { identity: null, initialFit: false, finalFit: false, userNavigated: false };
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: false }), "initial");
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: false }), "none");
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: true }), "final");
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: true }), "none");
});

test("late completion respects user navigation while dataset switches get a fresh fit", () => {
  const state = { identity: null, initialFit: false, finalFit: false, userNavigated: false };
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: false }), "initial");
  state.userNavigated = true;
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: true }), "none");
  assert.equal(resolveAutoFitAction(state, { identity: "B", hasCoordinates: true, complete: true }), "initial");
});

test("explicit reset can fit again after navigation", () => {
  const state = { identity: "A", initialFit: true, finalFit: true, userNavigated: true };
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: true, explicitFit: true }), "initial");
});

test("data errors after initial loading leave the map surface mounted", () => {
  assert.equal(shouldShowInitialMapSpinner({ isLoading: true, hasRows: false, hasMounted: false }), true);
  assert.equal(shouldShowInitialMapSpinner({ isLoading: true, hasRows: false, hasMounted: true }), false);
  assert.equal(shouldShowInitialMapSpinner({ isLoading: false, hasRows: true, hasMounted: false }), false);
});

test("fit bounds retain every valid coordinate and discard malformed rows", () => {
  const points = Array.from({ length: 1000 }, (_, index) => ({ lat: 10 + index / 1000, lng: 20 + index / 1000 }));
  points.push({ lat: 91, lng: 30 }, { lat: "bad", lng: 31 });
  const coordinates = getValidMapCoordinates(points);
  assert.equal(coordinates.length, 1000);
  assert.deepEqual(coordinates.at(-1), { lat: 10.999, lng: 20.999 });
});
