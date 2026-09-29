export const createRequestCancelledError = (message = "Request cancelled") => {
  const error = new Error(message);
  error.name = "RequestCancelledError";
  error.code = "ERR_CANCELED";
  error.isCancelled = true;
  return error;
};

export const canDeduplicateRequest = (dedupe, signal) => Boolean(dedupe && !signal);

export class RequestQueue {
  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  add(fn, priority = 0, { signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(createRequestCancelledError());
        return;
      }

      const item = { fn, resolve, reject, priority, signal, settled: false };
      item.onAbort = () => {
        const queueIndex = this.queue.indexOf(item);
        if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
        item.settled = true;
        reject(createRequestCancelledError());
      };
      signal?.addEventListener("abort", item.onAbort, { once: true });
      this.queue.push(item);
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const item = this.queue.shift();
    item.signal?.removeEventListener("abort", item.onAbort);
    if (item.settled) {
      this.process();
      return;
    }

    this.running++;
    const onActiveAbort = () => {
      if (item.settled) return;
      item.settled = true;
      item.reject(createRequestCancelledError());
    };
    item.signal?.addEventListener("abort", onActiveAbort, { once: true });

    try {
      const result = await item.fn();
      if (!item.settled) {
        item.settled = true;
        item.resolve(result);
      }
    } catch (error) {
      if (!item.settled) {
        item.settled = true;
        item.reject(error);
      }
    } finally {
      item.signal?.removeEventListener("abort", onActiveAbort);
      this.running--;
      this.process();
    }
  }

  clear() {
    const pending = this.queue.splice(0);
    pending.forEach((item) => {
      item.signal?.removeEventListener("abort", item.onAbort);
      if (item.settled) return;
      item.settled = true;
      item.reject(createRequestCancelledError());
    });
  }
}

export const dedupeRequest = (inFlightRequests, key, fn) => {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  let promise;
  promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, promise);
  return promise;
};
