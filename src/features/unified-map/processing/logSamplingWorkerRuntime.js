import { sampleLogIndices } from "../../../utils/logSpatialSampling.js";

export const LOG_SAMPLING_SYNC_FALLBACK_LIMIT = 50000;

export const createLogSamplingWorkerRuntime = ({
  createWorker,
  onResult = () => {},
  onStatus = () => {},
  maxRetries = 1,
  fallbackLimit = LOG_SAMPLING_SYNC_FALLBACK_LIMIT,
} = {}) => {
  let worker = null;
  let latestJob = null;
  let lastCoordinates = null;
  let requestId = 0;
  let retries = 0;
  let disposed = false;

  const terminate = (target = worker) => {
    if (!target) return;
    target.onmessage = null;
    target.onerror = null;
    target.onmessageerror = null;
    try { target.terminate?.(); } catch { /* worker already closed */ }
    if (worker === target) worker = null;
  };

  const fallbackOrFail = (error) => {
    if (!latestJob || disposed) return;
    if (latestJob.totalLogs <= fallbackLimit) {
      try {
        const indexes = sampleLogIndices({ ...latestJob.options, coordinates: latestJob.coordinates });
        onResult({ ...latestJob, indexes, requestId, fallback: true });
        onStatus({ status: "fallback", error: null, retry: api.retry });
        return;
      } catch (fallbackError) {
        error = fallbackError;
      }
    }
    onStatus({ status: "error", error: error?.message || "Map log sampling failed", retry: api.retry });
  };

  const dispatch = () => {
    if (!latestJob || disposed) return;
    if (!worker) {
      try {
        if (typeof createWorker !== "function") throw new Error("Web workers are unavailable");
        worker = createWorker();
        const ownedWorker = worker;
        ownedWorker.onmessage = ({ data } = {}) => {
          if (worker !== ownedWorker || disposed || data?.requestId !== requestId || data?.datasetRevision !== latestJob.datasetRevision) return;
          if (data?.error) return fail(new Error(data.error), ownedWorker);
          try {
            if (!(data?.indexesBuffer instanceof ArrayBuffer) || data.indexesBuffer.byteLength % Uint32Array.BYTES_PER_ELEMENT !== 0) {
              throw new Error("Sampling worker returned invalid index data");
            }
            const indexes = new Uint32Array(data.indexesBuffer);
            if (indexes.some((index) => index >= latestJob.totalLogs)) throw new Error("Sampling worker returned an out-of-range index");
            onResult({ ...latestJob, indexes, requestId, fallback: false });
            onStatus({ status: "ready", error: null, retry: api.retry });
            retries = 0;
          } catch (error) {
            fail(error, ownedWorker);
          }
        };
        ownedWorker.onerror = (event) => {
          event?.preventDefault?.();
          fail(new Error(event?.message || "Map log sampling worker crashed"), ownedWorker);
        };
        ownedWorker.onmessageerror = () => fail(new Error("Map log sampling worker response could not be decoded"), ownedWorker);
        onStatus({ status: "ready", error: null, retry: api.retry });
      } catch (error) {
        fail(error);
        return;
      }
    }

    requestId += 1;
    const { coordinates, options, datasetRevision, totalLogs } = latestJob;
    const payload = { ...options, requestId, datasetRevision, totalLogs };
    try {
      if (lastCoordinates !== coordinates) {
        const buffer = coordinates.slice().buffer;
        worker.postMessage({ ...payload, coordinatesBuffer: buffer }, [buffer]);
        lastCoordinates = coordinates;
      } else {
        worker.postMessage(payload);
      }
    } catch (error) {
      fail(error, worker);
    }
  };

  const fail = (error, failedWorker = worker) => {
    if (disposed) return;
    terminate(failedWorker);
    lastCoordinates = null;
    retries += 1;
    if (retries <= maxRetries) {
      onStatus({ status: "recovering", error: error?.message || "Sampling worker failed", retry: api.retry });
      dispatch();
      return;
    }
    fallbackOrFail(error);
  };

  const api = {
    request(job) {
      if (disposed) return;
      latestJob = { ...job, options: { ...job.options } };
      dispatch();
    },
    retry() {
      if (disposed || !latestJob) return;
      retries = 0;
      terminate();
      lastCoordinates = null;
      onStatus({ status: "recovering", error: null, retry: api.retry });
      dispatch();
    },
    dispose() {
      disposed = true;
      latestJob = null;
      terminate();
    },
  };
  return api;
};
