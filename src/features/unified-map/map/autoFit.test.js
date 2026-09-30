import test from "node:test";
import assert from "node:assert/strict";
import { confirmAutoFit, getValidMapCoordinates, isMapReadyForFit, resolveAutoFitAction, shouldShowInitialMapSpinner } from "./autoFit.js";

const request = (state, input) => {
  const action = resolveAutoFitAction(state, input);
  if (action !== "none") state.pending = { identity: input.identity, revision: input.revision ?? 0, action };
  state.pendingComplete = input.complete;
  return action;
};

const settle = (state, input, action, secondaryRevision = null) =>
  confirmAutoFit(state, { identity: input.identity, revision: input.revision ?? 0, action, secondaryRevision });

test("progressive chunks fit once, then fit final bounds once on completion", () => {
  const state = { identity: null, initialFit: false, finalFit: false, userNavigated: false };
  const initial = { identity: "A", hasCoordinates: true, complete: false };
  const complete = { ...initial, complete: true };
  assert.equal(request(state, initial), "initial");
  assert.equal(resolveAutoFitAction(state, initial), "none");
  assert.equal(settle(state, initial, "initial"), true);
  assert.equal(request(state, complete), "final");
  assert.equal(settle(state, complete, "final"), true);
  assert.equal(resolveAutoFitAction(state, complete), "none");
});

test("late completion respects user navigation while dataset switches get a fresh fit", () => {
  const state = { identity: null, initialFit: false, finalFit: false, userNavigated: false };
  assert.equal(request(state, { identity: "A", hasCoordinates: true, complete: false }), "initial");
  settle(state, { identity: "A" }, "initial");
  state.userNavigated = true;
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: true }), "none");
  assert.equal(resolveAutoFitAction(state, { identity: "B", hasCoordinates: true, complete: true }), "initial");
});

test("explicit reset can fit again after navigation", () => {
  const state = { identity: "A", initialFit: true, finalFit: true, userNavigated: true };
  assert.equal(resolveAutoFitAction(state, { identity: "A", hasCoordinates: true, complete: true, explicitFit: true }), "initial");
});

test("zero sized and unprojected maps defer a fit without consuming it", () => {
  const state = { identity: null };
  const input = { identity: "A", revision: 1, hasCoordinates: true, complete: true };
  const map = { getProjection: () => null, fitBounds() {} };
  assert.equal(isMapReadyForFit(map, { width: 0, height: 200 }), false);
  assert.equal(isMapReadyForFit(map, { width: 200, height: 200 }), false);
  assert.equal(resolveAutoFitAction(state, input), "initial");
  map.getProjection = () => ({});
  assert.equal(isMapReadyForFit(map, { width: 200, height: 200 }), true);
  assert.equal(request(state, input), "initial");
  state.pending = null; // fitBounds failed or no settled event arrived
  assert.equal(request(state, input), "initial");
  assert.equal(settle(state, input, "initial"), true);
  assert.equal(resolveAutoFitAction(state, input), "none");
});

test("obsolete pending fits cannot settle after a dataset switch", () => {
  const state = { identity: null };
  const a = { identity: "A", revision: 1, hasCoordinates: true, complete: true };
  const b = { ...a, identity: "B" };
  assert.equal(request(state, a), "initial");
  assert.equal(request(state, b), "initial");
  assert.equal(settle(state, a, "initial"), false);
  assert.equal(settle(state, b, "initial"), true);
});

test("late secondary rows fit once unless the user has navigated", () => {
  const state = { identity: null };
  const primary = { identity: "A", revision: 2, hasCoordinates: true, complete: true };
  assert.equal(request(state, primary), "initial");
  settle(state, primary, "initial");
  const secondary = { ...primary, secondaryReady: true, secondaryRevision: 4 };
  assert.equal(request(state, secondary), "secondary");
  settle(state, secondary, "secondary", 4);
  assert.equal(resolveAutoFitAction(state, secondary), "none");
  state.userNavigated = true;
  assert.equal(resolveAutoFitAction(state, { ...secondary, secondaryRevision: 5 }), "none");
});

test("user navigation before data arrives preserves the chosen viewport", () => {
  const state = { identity: null };
  const empty = { identity: "A", hasCoordinates: false, complete: false };
  const ready = { ...empty, hasCoordinates: true, complete: true };
  assert.equal(resolveAutoFitAction(state, empty), "none");
  state.userNavigated = true;
  assert.equal(resolveAutoFitAction(state, ready), "none");
  assert.equal(resolveAutoFitAction(state, { ...ready, explicitFit: true }), "initial");
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

test("blank coordinates are invalid while numeric zero remains valid", () => {
  assert.deepEqual(getValidMapCoordinates([
    { lat: null, lng: 12 }, { lat: " ", lng: 12 }, { lat: 5, lng: "" },
    { lat: 0, lng: "0" }, { lat: -91, lng: 0 }, { lat: 0, lng: 181 },
  ]), [{ lat: 0, lng: 0 }]);
});
