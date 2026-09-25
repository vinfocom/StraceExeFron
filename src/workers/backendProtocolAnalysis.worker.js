import { buildProtocolAnalysis } from "../utils/l3Events/protocolAnalyzer.js";

self.onmessage = ({ data }) => {
  try {
    const analysis = buildProtocolAnalysis(data.timeline || [], []);
    self.postMessage({ id: data.id, analysis });
  } catch (error) {
    self.postMessage({ id: data.id, error: error?.message || "Protocol analysis failed." });
  }
};
