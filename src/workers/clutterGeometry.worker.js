import { buildClutterFeatureCollection } from "../utils/clutterGeometry.js";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: buildClutterFeatureCollection(data) });
  } catch {
    self.postMessage({ error: "The clutter geometry could not be processed." });
  }
};
