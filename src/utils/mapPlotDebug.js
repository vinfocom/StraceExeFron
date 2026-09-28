// MAPPLOTDEBUG-START
// Temporary, opt-in tracing for the "log plotting" pipeline: map auto-fit /
// zoom-lock interaction, the deck.gl overlay attach race, the viewport-based
// sampling worker, and the final layer-build/setProps call.
//
// Enable from any DevTools console (browser tab or Electron's own
// View > Toggle DevTools) with:
//   localStorage.setItem("debugMapPlot", "1")
// then reload. Disable with:
//   localStorage.removeItem("debugMapPlot")
//
// Every line is prefixed "[MapPlotDebug]" so it's easy to filter in the
// console's filter box.
export const DEBUG_MAP_PLOT =
  typeof window !== "undefined" && window.localStorage?.getItem("debugMapPlot") === "1";

export const logMapPlot = (label, payload) => {
  if (!DEBUG_MAP_PLOT) return;
  if (payload !== undefined) {
    console.log("[MapPlotDebug]", label, payload);
  } else {
    console.log("[MapPlotDebug]", label);
  }
};
// MAPPLOTDEBUG-END
