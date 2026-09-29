import test from "node:test";
import assert from "node:assert/strict";
import {
  findNearestElevationSample,
  getElevationSampleCoordinates,
  isTerrainHoverTargetCurrent,
  normalizeElevationProfile,
} from "./terrainElevationProfile.js";

test("nearest profile lookup includes both endpoints", () => {
  const profile = [
    { distance: 0, elevation: 10 },
    { distance: 100, elevation: 20 },
    { distance: 300, elevation: 30 },
  ];
  assert.equal(findNearestElevationSample(profile, -20), 0);
  assert.equal(findNearestElevationSample(profile, 300), 2);
  assert.equal(findNearestElevationSample(profile, 1000), 2);
});

test("nearest profile lookup uses actual uneven horizontal spacing", () => {
  const profile = [
    { distance: 0, elevation: 1000 },
    { distance: 10, elevation: 0 },
    { distance: 100, elevation: 1000 },
  ];
  assert.equal(findNearestElevationSample(profile, 65), 2);
  assert.equal(findNearestElevationSample(profile, 8), 1);
});

test("analytics normalization preserves serializable sample coordinates", () => {
  assert.deepEqual(normalizeElevationProfile([
    { distance: "0", elevation: "12", lat: "37.5", lng: "-122.2" },
    { distance: 20, elevation: 18, lat: 37.6, lng: -122.1 },
    { distance: "invalid", elevation: 4, lat: 1, lng: 2 },
  ]), [
    { distance: 0, elevation: 12, lat: 37.5, lng: -122.2 },
    { distance: 20, elevation: 18, lat: 37.6, lng: -122.1 },
  ]);
});

test("Google elevation locations preserve the first sample coordinates", () => {
  const firstLocation = {
    lat: () => 37.5,
    lng: () => -122.2,
  };
  assert.deepEqual(getElevationSampleCoordinates(firstLocation), {
    lat: 37.5,
    lng: -122.2,
  });
  assert.deepEqual(getElevationSampleCoordinates({ lat: NaN, lng: undefined }), {
    lat: null,
    lng: null,
  });
});

test("hover target becomes stale when its drawing or profile revision changes", () => {
  const drawing = { id: "line-1", geometryRevision: 2, profileRevision: 4 };
  const target = { drawingId: "line-1", geometryRevision: 2, profileRevision: 4 };
  assert.equal(isTerrainHoverTargetCurrent(target, drawing), true);
  assert.equal(isTerrainHoverTargetCurrent(target, { ...drawing, id: "line-2" }), false);
  assert.equal(isTerrainHoverTargetCurrent(target, { ...drawing, geometryRevision: 3 }), false);
  assert.equal(isTerrainHoverTargetCurrent(target, { ...drawing, profileRevision: 5 }), false);
  assert.equal(isTerrainHoverTargetCurrent(target, null), false);
});
