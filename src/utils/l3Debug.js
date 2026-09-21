// L3DEBUG-START
export const DEBUG_L3 =
  import.meta.env.DEV && localStorage.getItem("debugL3") === "1";

const dependencySnapshots = new Map();
const effectHistory = new Map();
const eventHistory = new Map();

const logWithBurstGuard = (history, name, payload) => {
  if (!DEBUG_L3) return;

  const now = Date.now();
  const state = history.get(name) || { timestamps: [], traced: false };
  if (state.traced) return;

  state.timestamps = state.timestamps.filter((timestamp) => now - timestamp < 1000);
  state.timestamps.push(now);
  history.set(name, state);
  console.debug("[L3DEBUG]", name, { countInLastSecond: state.timestamps.length, ...payload });

  if (state.timestamps.length > 30) {
    state.traced = true;
    console.trace("[L3DEBUG] effect/event exceeded 30 calls in 1 second:", name);
  }
};

export const traceL3Effect = (name, dependencies) => {
  if (!DEBUG_L3) return;

  const previous = dependencySnapshots.get(name);
  const changedDependencies = previous
    ? Object.entries(dependencies)
        .filter(([key, value]) => !Object.is(previous[key], value))
        .map(([key]) => key)
    : Object.keys(dependencies);
  dependencySnapshots.set(name, { ...dependencies });
  logWithBurstGuard(effectHistory, name, { changedDependencies });
};

export const traceL3Event = (name, payload) => {
  logWithBurstGuard(eventHistory, name, payload);
};
// L3DEBUG-END
