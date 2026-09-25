// Pure job-following logic (no imports), so it can be unit tested with node:test.
// projectSetupJob.js wires it to the real API.

/** The job could not be started (older backend, network error): the caller falls back to the step-by-step calls. */
export class ProjectSetupUnavailableError extends Error {}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const followProjectSetupJob = async (
  api,
  payload,
  onProgress,
  { pollMs = 2000, maxPollFailures = 8, maxWaitMs = 2 * 60 * 60 * 1000, sleep = defaultSleep } = {},
) => {
  let started;
  try {
    started = await api.start(payload);
  } catch (err) {
    throw new ProjectSetupUnavailableError(err?.message || "Project setup job could not be started");
  }
  const jobId = started?.job_id;
  if (!jobId) throw new ProjectSetupUnavailableError("Project setup job returned no id");

  if (typeof onProgress === "function") onProgress(started);
  const began = Date.now();
  let failures = 0;
  while (Date.now() - began < maxWaitMs) {
    await sleep(pollMs);
    let status;
    try {
      status = await api.status(jobId);
      failures = 0;
    } catch (err) {
      if (err?.response?.status === 404) {
        throw new Error("The setup job was lost (the backend may have restarted). Please check the project.");
      }
      failures += 1;
      if (failures >= maxPollFailures) {
        throw new Error("Lost contact with the setup job. It may still be running on the server.");
      }
      continue;
    }
    if (typeof onProgress === "function") onProgress(status);
    if (status?.status && status.status !== "processing") return status;
  }
  throw new Error("Project setup is taking longer than expected. It may still finish on the server.");
};
