import { buildProtocolAnalysis } from "./protocolAnalyzer.js";
import { buildUnifiedSignalingRows } from "./signalingModel.js";

// Owned by one open analyzer. Reuse the initial request, including during
// React's development effect replay; never reuse another upload's response.
export function createBackendL3Loader(fetchSummary) {
  let current = null;
  return (scope) => {
    const key = JSON.stringify(scope);
    if (current?.key === key) return current.promise;
    const entry = { key, promise: null };
    entry.promise = Promise.resolve().then(() => fetchSummary({ ...scope, includeRows: true })).catch((error) => {
      if (current === entry) current = null;
      throw error;
    });
    current = entry;
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
