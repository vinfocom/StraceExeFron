import { prepareRfInvestigation } from "../utils/l3Events/rfInvestigation.js";

self.onmessage = ({ data }) => {
  try {
    const investigation = prepareRfInvestigation(data);
    self.postMessage({ id: data.id, analysis: investigation });
  } catch (error) {
    self.postMessage({ id: data.id, error: error?.message || "RF investigation preparation failed." });
  }
};
