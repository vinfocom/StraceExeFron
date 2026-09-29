const parseSessionIds = (value) => {
  if (Array.isArray(value)) return value.flatMap(parseSessionIds);
  if (typeof value === "number") return Number.isFinite(value) ? [String(value)] : [];
  if (typeof value === "string") {
    return value.split(/[;,|]/).map((id) => id.trim()).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return parseSessionIds(
      value.sessionIds ?? value.session_ids ?? value.sessionId ?? value.session,
    );
  }
  return [];
};

export const normalizeMapSessionIds = (value) => {
  const seen = new Set();
  return parseSessionIds(value).filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const getMapSessionIdentity = (value) =>
  normalizeMapSessionIds(value).join(",");

export const areMapSessionIdsEqual = (left, right) =>
  getMapSessionIdentity(left) === getMapSessionIdentity(right);

export const createSessionSaveCoordinator = ({ getAppliedIds, persist, commit }) => {
  let inFlight = null;

  return (value) => {
    const nextIds = normalizeMapSessionIds(value);
    const nextIdentity = getMapSessionIdentity(nextIds);
    if (inFlight) {
      return inFlight.identity === nextIdentity
        ? inFlight.promise
        : Promise.resolve(false);
    }

    const appliedIds = normalizeMapSessionIds(getAppliedIds());
    if (areMapSessionIdsEqual(appliedIds, nextIds)) return Promise.resolve(true);

    const promise = (async () => {
      const persistedValue = await persist(nextIds);
      commit(nextIds, persistedValue);
      return true;
    })();
    inFlight = { identity: nextIdentity, promise };
    promise.finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    }).catch(() => {});
    return promise;
  };
};
