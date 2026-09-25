import { buildProtocolAnalysis } from "./protocolAnalyzer.js";
import { buildUnifiedSignalingRows } from "./signalingModel.js";

// Keep summary and on-demand detail requests separate, deduplicating effect
// replays and tab changes within one open analyzer.
export function createBackendL3Loader(fetchSummary) {
  let current = null;
  return (scope) => {
    const { includeRows = false, ...selection } = scope;
    const key = JSON.stringify(selection);
    if (current?.key !== key) current = { key, requests: new Map() };
    const entry = current;
    if (entry.requests.has(includeRows)) return entry.requests.get(includeRows);
    const promise = Promise.resolve().then(() => fetchSummary({ ...selection, includeRows })).catch((error) => {
      entry.requests.delete(includeRows);
      throw error;
    });
    entry.requests.set(includeRows, promise);
    return promise;
  };
}

// Per-view endpoints use the same scope-level in-flight deduplication as the
// summary/timeline loader while keeping each view's response independent.
export function createBackendScopedLoader(fetchRows) {
  let current = null;
  return (scope) => {
    const key = JSON.stringify(scope);
    if (current?.key !== key) current = { key, promise: null };
    if (current.promise) return current.promise;
    const entry = current;
    entry.promise = Promise.resolve().then(() => fetchRows(scope)).catch((error) => {
      if (current === entry) entry.promise = null;
      throw error;
    });
    return entry.promise;
  };
}

// Build once per loaded response. Tab selection must not clear another view's data.
export function buildBackendDetailModel(timeline, calls = []) {
  const analysis = buildProtocolAnalysis(timeline, []);
  return {
    analysis,
    signalingRows: buildUnifiedSignalingRows(timeline, calls, analysis),
  };
}
