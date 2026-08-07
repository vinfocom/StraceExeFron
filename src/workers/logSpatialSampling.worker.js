import { sampleLogIndices } from '../utils/logSpatialSampling';

self.onmessage = ({ data }) => {
  const { requestId, coordinatesBuffer, ...options } = data;

  try {
    const indexes = sampleLogIndices({
      ...options,
      coordinates: new Float64Array(coordinatesBuffer),
    });
    self.postMessage({ requestId, indexesBuffer: indexes.buffer }, [indexes.buffer]);
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : 'Unable to sample map logs',
    });
  }
};
