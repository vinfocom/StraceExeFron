export const createRequestGeneration = () => {
  let generation = 0;
  let activeRequest = null;

  const begin = (identity, { reuse = false } = {}) => {
    if (reuse && activeRequest?.identity === identity && !activeRequest.controller.signal.aborted) {
      return activeRequest;
    }
    activeRequest?.controller.abort();
    activeRequest = { identity, generation: ++generation, controller: new AbortController() };
    return activeRequest;
  };

  const isCurrent = (request, identity = request?.identity) => Boolean(
    request && activeRequest === request && generation === request.generation &&
    request.identity === identity && !request.controller.signal.aborted,
  );

  const invalidate = () => {
    generation += 1;
    activeRequest?.controller.abort();
    activeRequest = null;
  };

  const finish = (request) => {
    if (activeRequest !== request) return false;
    activeRequest = null;
    return true;
  };

  return { begin, finish, invalidate, isCurrent, getCurrent: () => activeRequest };
};
