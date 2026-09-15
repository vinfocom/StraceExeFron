import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sampleLogIndices } from '../utils/logSpatialSampling.js';

test('sampling worker reuses coordinates across viewports and replaces them for new logs', () => {
  const replies = [];
  const self = { postMessage: (message) => replies.push(message) };
  const source = readFileSync(new URL('./logSpatialSampling.worker.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/, '');
  vm.runInNewContext(source, { self, sampleLogIndices, Float64Array, Error });
  const coordinates = new Float64Array([77, 28, 78, 29, 79, 30]);
  const options = { totalLogs: 3, zoom: 14 };
  const send = (data, expectedCoordinates) => {
    self.onmessage({ data });
    const reply = replies.at(-1);
    assert.equal(reply.requestId, data.requestId);
    assert.equal(reply.error, undefined);
    assert.deepEqual(
      new Uint32Array(reply.indexesBuffer),
      sampleLogIndices({ ...data, coordinates: expectedCoordinates }),
    );
  };
  send({ ...options, requestId: 1, coordinatesBuffer: coordinates.buffer }, coordinates);
  send({ ...options, requestId: 2, bounds: { west: 77.5, east: 78.5, south: 28.5, north: 29.5 } }, coordinates);
  const replacement = new Float64Array([80, 31]);
  send({ totalLogs: 1, requestId: 3, coordinatesBuffer: replacement.buffer }, replacement);
  send({ totalLogs: 1, requestId: 4 }, replacement);
});
