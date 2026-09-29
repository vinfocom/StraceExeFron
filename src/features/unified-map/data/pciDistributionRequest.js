export const runPciDistributionRequest = async ({
  sessionIds,
  signal,
  load,
  isCurrent,
  onData,
  onError,
}) => {
  try {
    const data = await load(sessionIds, signal);
    if (signal?.aborted || !isCurrent()) return false;
    onData(data?.success ? data.primary_yes || null : null);
    return true;
  } catch (error) {
    if (signal?.aborted || error?.isCancelled || error?.code === "ERR_CANCELED") return false;
    if (isCurrent()) onError?.(error);
    return false;
  }
};
