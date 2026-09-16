import { useEffect, useState } from "react";
import { mapViewApi } from "@/api/apiEndpoints";

const PAGE_SIZE = 5000;

const emptyState = {
  requestKey: null,
  features: [],
  loading: false,
  error: null,
  hasMore: false,
};

const getPayload = (response) => {
  if (response && typeof response === "object" && ("status" in response || "Status" in response)) {
    return response;
  }
  return response?.data ?? response;
};

const getSafeErrorMessage = (error) => {
  const rawMessage =
    error?.response?.data?.message ??
    error?.data?.message ??
    error?.message ??
    "Could not load source geometry.";
  return String(rawMessage).replace(/\s+/g, " ").trim().slice(0, 240);
};

export const useProjectSavedSourceGeometries = (projectId, enabled) => {
  const [state, setState] = useState(emptyState);
  const numericProjectId = Number(projectId);
  const validProjectId = Number.isSafeInteger(numericProjectId) && numericProjectId > 0;
  const requestKey = validProjectId ? `${numericProjectId}:all` : null;

  useEffect(() => {
    if (!enabled || projectId == null || String(projectId).trim() === "") {
      setState(emptyState);
      return undefined;
    }

    if (!validProjectId) {
      setState({ ...emptyState, error: "The selected project has an invalid ID." });
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    let offset = 0;
    const features = [];

    setState({ ...emptyState, requestKey, loading: true });

    const load = async () => {
      while (active) {
        controller.signal.throwIfAborted();
        const payload = getPayload(await mapViewApi.getProjectSavedSourceGeometries(
          numericProjectId,
          { layer: "all", limit: PAGE_SIZE, offset },
          { signal: controller.signal, dedupe: false },
        ));
        controller.signal.throwIfAborted();
        if (Number(payload?.status ?? payload?.Status) !== 1) {
          throw new Error(payload?.message ?? payload?.Message ?? "The source geometry request failed.");
        }

        const rows = payload?.data ?? payload?.Data;
        if (!Array.isArray(rows)) throw new Error("The source geometry response has an invalid data field.");
        features.push(...rows);
        const hasMore = Boolean(payload?.hasMore ?? payload?.HasMore);
        setState({
          requestKey,
          features: [...features],
          loading: hasMore,
          error: null,
          hasMore,
        });
        if (!hasMore) break;
        const nextOffset = Number(payload?.nextOffset ?? payload?.NextOffset ?? offset + rows.length);
        if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
          throw new Error("Source geometry loading stopped because the next page did not advance.");
        }
        offset = nextOffset;
      }
    };

    load()
      .then(() => {
        if (!active) return;
        setState((previous) => ({
          ...previous,
          requestKey,
          loading: false,
          hasMore: false,
        }));
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;
        setState((previous) => ({
          ...previous,
          requestKey,
          loading: false,
          hasMore: false,
          error: getSafeErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, numericProjectId, projectId, requestKey, validProjectId]);

  const matches = Boolean(requestKey && state.requestKey === requestKey);
  return {
    features: enabled && matches ? state.features : [],
    loading: Boolean(enabled && validProjectId && (!matches || state.loading)),
    error: matches ? state.error : null,
    hasMore: Boolean(matches && state.hasMore),
  };
};
