import { sampleLogIndices } from '../utils/logSpatialSampling';

let coordinates = new Float64Array();

self.onmessage = ({ data }) => {
  const { requestId, datasetRevision, coordinatesBuffer, ...options } = data;

  try {
    if (coordinatesBuffer) coordinates = new Float64Array(coordinatesBuffer);
    const indexes = sampleLogIndices({
      ...options,
      coordinates,
    });
    self.postMessage({ requestId, datasetRevision, indexesBuffer: indexes.buffer }, [indexes.buffer]);
  } catch (error) {
    self.postMessage({
      requestId,
      datasetRevision,
      error: error instanceof Error ? error.message : 'Unable to sample map logs',
    });
  }
};
