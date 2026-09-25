import { useEffect, useState } from "react";
import { projectSetupApi } from "@/api/apiEndpoints";

const POLL_MS = 3000;
const IDLE = { running: false, clutterReady: true, buildingsReady: true, clutterIncomplete: false, stageLabel: "", step: "" };

/**
 * Is the project's creation-time setup (buildings + clutter, area breakup, cell
 * sites) still running in the Python backend?
 *
 * `running` is true only while the backend reports a job in progress.
 * `clutterIncomplete` is "cancelled" / "failed" when the latest setup ended before clutter
 * finished (nothing is locked - the tiles may simply be missing). A project
 * with no known job (older projects, or a backend restart) is treated as ready,
 * so nothing is locked by mistake. `clutterReady` / `buildingsReady` flip to true
 * as soon as that part finishes, before the whole job does.
 */
export const useProjectSetupStatus = (projectId, region) => {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    const id = Number(projectId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      setState((prev) => (prev === IDLE ? prev : IDLE));
      return undefined;
    }
    let cancelled = false;
    let timer = null;

    const check = async () => {
      let keepPolling = false;
      try {
        const res = await projectSetupApi.projectStatus(id, region);
        if (cancelled) return;
        const running = res?.status === "processing";
        keepPolling = running;
        // A setup that was cancelled (or failed) before clutter finished: nothing is locked,
        // but the map can say why clutter tiles may be missing.
        const endedEarly = (res?.status === "cancelled" || res?.status === "failed") && res?.clutter_ready !== true;
        setState({
          running,
          clutterReady: running ? res?.clutter_ready === true : true,
          buildingsReady: running ? res?.buildings_ready === true : true,
          clutterIncomplete: endedEarly ? res?.status : false,
          stageLabel: running ? res?.stage_label || "" : "",
          step: running ? res?.step_label || "" : "",
        });
      } catch (_) {
        // Status is only a convenience lock: on any error leave the map usable.
        if (!cancelled) setState(IDLE);
      }
      if (!cancelled && keepPolling) timer = setTimeout(check, POLL_MS);
    };

    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, region]);

  return state;
};
