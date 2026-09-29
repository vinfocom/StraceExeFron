export function startWorkerRequest(createWorker, payload, expectedId) {
  let worker = null;
  let cancelled = false;
  let settled = false;
  let rejectRequest;
  const promise = new Promise((resolve, reject) => {
    rejectRequest = reject;
    const fail = (error) => {
      if (settled || cancelled) return;
      settled = true;
      worker?.terminate?.();
      reject(error instanceof Error ? error : new Error(String(error || "Worker request failed.")));
    };

    try {
      worker = createWorker();
      if (!worker || typeof worker.postMessage !== "function") {
        throw new Error("Worker could not be created.");
      }
      worker.onmessage = ({ data } = {}) => {
        if (cancelled || settled) return;
        if (data?.id !== expectedId) {
          fail(new Error("Worker returned a stale or mismatched response."));
          return;
        }
        if (data?.error) {
          fail(new Error(data.error));
          return;
        }
        if (!data || !Object.prototype.hasOwnProperty.call(data, "analysis")) {
          fail(new Error("Worker returned an invalid analysis response."));
          return;
        }
        settled = true;
        worker.terminate?.();
        resolve(data);
      };
      worker.onerror = (event) => fail(event?.error || new Error(event?.message || "Worker runtime failed."));
      worker.onmessageerror = () => fail(new Error("Worker response could not be read."));
      worker.postMessage(payload);
    } catch (error) {
      fail(error);
    }
  });

  return {
    promise,
    cancel() {
      if (cancelled || settled) return;
      cancelled = true;
      worker?.terminate?.();
      rejectRequest?.(new Error("Worker request cancelled."));
    },
  };
}
