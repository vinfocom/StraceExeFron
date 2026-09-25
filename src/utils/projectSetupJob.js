import { projectSetupApi } from "@/api/apiEndpoints";
import { followProjectSetupJob, ProjectSetupUnavailableError } from "./projectSetupRunner";

export { ProjectSetupUnavailableError };

/**
 * Start the backend project-setup job and follow it until it ends.
 *
 * `onProgress(status)` is called with every status reply (progress, stage_index,
 * stages_total, stage_label, step_label, eta_seconds, ...). Resolves with the final
 * status: { status: "completed" | "failed", stages, results, ... }. Individual
 * stages can fail while the job still completes - see `stages[].state`.
 * Rejects with ProjectSetupUnavailableError only if the job never started.
 */
export const runProjectSetupJob = (payload, onProgress) => followProjectSetupJob(projectSetupApi, payload, onProgress);
