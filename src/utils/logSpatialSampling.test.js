import test from 'node:test';
import assert from 'node:assert/strict';
import { getLogSamplingStride, sampleLogIndices } from './logSpatialSampling.js';

test('sampling thresholds match the requested log counts', () => {
  assert.equal(getLogSamplingStride(50000), 1);
  assert.equal(getLogSamplingStride(50001), 2);
  assert.equal(getLogSamplingStride(100000), 2);
  assert.equal(getLogSamplingStride(100001), 3);
});

test('keeps every log through 50,000', () => {
  const coordinates = new Float64Array([77, 28, 77.1, 28.1, 77.2, 28.2]);
  assert.deepEqual([...sampleLogIndices({ coordinates, totalLogs: 50000 })], [0, 1, 2]);
});

test('skips only logs in the same spatial range', () => {
  const coordinates = new Float64Array([
    77, 28,
    77.000001, 28.000001,
    77.000002, 28.000002,
    79, 30,
  ]);

  assert.deepEqual(
    [...sampleLogIndices({ coordinates, totalLogs: 50001, zoom: 12 })],
    [0, 2, 3],
  );
  assert.deepEqual(
    [...sampleLogIndices({ coordinates, totalLogs: 100001, zoom: 12 })],
    [0, 3],
  );
});

test('filters outside the viewport and always retains the selected log', () => {
  const coordinates = new Float64Array([77, 28, 77.000001, 28.000001, 80, 31]);
  const indexes = sampleLogIndices({
    coordinates,
    totalLogs: 50001,
    selectedIndex: 1,
    bounds: { north: 29, south: 27, east: 78, west: 76 },
    zoom: 12,
  });

  assert.deepEqual([...indexes], [0, 1]);
});
