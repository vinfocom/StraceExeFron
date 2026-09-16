import { useEffect, useState } from "react";

const EMPTY_RESULT = {
  featureCollection: { type: "FeatureCollection", features: [] },
  classCounts: [],
  invalidGeometryCount: 0,
  conflictingGeometryCount: 0,
};

export const useClutterGeometry = (tiles, enabled) => {
  const [state, setState] = useState({ tiles: null, result: EMPTY_RESULT, error: null });
  useEffect(() => {
    if (!enabled || !tiles.length) return undefined;
    let active = true;
    let worker;
    const fail = () => {
      if (active) setState({ tiles, result: EMPTY_RESULT, error: "The clutter geometry could not be processed." });
      worker?.terminate();
    };
    try {
      worker = new Worker(new URL("../workers/clutterGeometry.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        if (active) setState({ tiles, result: data.result || EMPTY_RESULT, error: data.error || null });
        worker.terminate();
      };
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.postMessage(tiles);
    } catch {
      fail();
    }
    return () => {
      active = false;
      worker?.terminate();
    };
  }, [tiles, enabled]);
  const current = enabled && state.tiles === tiles;
  const canKeepPreviousResult = Boolean(enabled && tiles.length && state.tiles?.length);
  return {
    ...(current || canKeepPreviousResult ? state.result : EMPTY_RESULT),
    processing: Boolean(enabled && tiles.length && !current),
    processingError: current ? state.error : null,
  };
};
