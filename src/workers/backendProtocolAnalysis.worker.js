import { buildProtocolAnalysis } from "../utils/l3Events/protocolAnalyzer.js";
import { buildUnifiedSignalingRows } from "../utils/l3Events/signalingModel.js";

self.onmessage = ({ data }) => {
  try {
    if (data.kind === "signaling") {
      const rows = buildUnifiedSignalingRows(data.timeline || [], data.calls || [], null);
      self.postMessage({ id: data.id, rows });
      return;
    }
    const analysis = buildProtocolAnalysis(data.timeline || [], []);
    // Functions cannot cross the worker boundary. ProtocolAnalyzerView owns
    // its duration formatter, so keep the analysis payload data-only.
    delete analysis.formatDuration;
    self.postMessage({ id: data.id, analysis });
  } catch (error) {
    self.postMessage({ id: data.id, error: error?.message || "Protocol analysis failed." });
  }
};
