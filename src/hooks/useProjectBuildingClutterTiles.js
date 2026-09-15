import { useEffect, useState } from "react";
import { mapViewApi } from "@/api/apiEndpoints";
import { getClutterTilesPayload } from "@/utils/clutterTilesResponse";

export const PROJECT_CLUTTER_TILE_LIMIT = 50000;
const MAX_ERROR_MESSAGE_LENGTH = 240;

const emptyState = {
  requestKey: null,
  tiles: [],
  loading: false,
  error: null,
  hasMore: false,
};

const getSafeErrorMessage = (error) => {
  const rawMessage =
    error?.response?.data?.message ??
    error?.data?.message ??
    error?.message ??
    "Could not load clutter tiles.";
  const message = String(rawMessage).replace(/\s+/g, " ").trim();
  return (message || "Could not load clutter tiles.").slice(0, MAX_ERROR_MESSAGE_LENGTH);
};

export const useProjectBuildingClutterTiles = (
  projectId,
  enabled,
  buildingPolygonId = null,
) => {
  const [state, setState] = useState(emptyState);
  const projectIdProvided = projectId != null && String(projectId).trim() !== "";
  const numericProjectId = Number(projectId);
  const validProjectId = Number.isSafeInteger(numericProjectId) && numericProjectId > 0;
  const buildingIdProvided = buildingPolygonId != null && String(buildingPolygonId).trim() !== "";
  const numericBuildingPolygonId = buildingIdProvided ? Number(buildingPolygonId) : null;
  const validBuildingPolygonId =
    !buildingIdProvided ||
    (Number.isSafeInteger(numericBuildingPolygonId) && numericBuildingPolygonId > 0);
  const requestKey = validProjectId
    ? `${numericProjectId}:${buildingIdProvided ? numericBuildingPolygonId : "all"}`
    : null;

  useEffect(() => {
    if (!enabled || !projectIdProvided) {
      setState(emptyState);
      return undefined;
    }

    if (!validProjectId) {
      setState({ ...emptyState, error: "The selected project has an invalid ID." });
      return undefined;
    }

    if (!validBuildingPolygonId) {
      setState({
        ...emptyState,
        requestKey,
        error: "The selected building has an invalid ID.",
      });
      return undefined;
    }

    let active = true;
    setState({ ...emptyState, requestKey, loading: true });

    mapViewApi
      .getProjectBuildingClutterTiles(
        numericProjectId,
        {
          buildingPolygonId: buildingIdProvided ? numericBuildingPolygonId : undefined,
          limit: PROJECT_CLUTTER_TILE_LIMIT,
        },
      )
      .then((response) => {
        if (!active) return;
        const payload = getClutterTilesPayload(response);
        const status = Number(payload?.status ?? payload?.Status);
        const rows = payload?.data ?? payload?.Data;
        if (status !== 1) {
          throw new Error(payload?.message ?? payload?.Message ?? "The clutter tiles request failed.");
        }
        if (!Array.isArray(rows)) {
          throw new Error("The clutter tiles response has an invalid data field.");
        }

        const limitedRows = rows.slice(0, PROJECT_CLUTTER_TILE_LIMIT);
        const matchedCount = Number(payload?.matchedCount ?? payload?.MatchedCount);
        const explicitHasMore = payload?.hasMore ?? payload?.HasMore;
        const hasMore = rows.length > PROJECT_CLUTTER_TILE_LIMIT ||
          (typeof explicitHasMore === "boolean"
            ? explicitHasMore
            : rows.length >= PROJECT_CLUTTER_TILE_LIMIT ||
              (Number.isFinite(matchedCount) && matchedCount > rows.length));

        setState({
          requestKey,
          tiles: limitedRows,
          loading: false,
          error: null,
          hasMore,
        });
      })
      .catch((requestError) => {
        if (!active || requestError?.isCancelled) return;
        setState({
          requestKey,
          tiles: [],
          loading: false,
          error: getSafeErrorMessage(requestError),
          hasMore: false,
        });
      });

    return () => {
      active = false;
    };
  }, [
    buildingIdProvided,
    enabled,
    numericBuildingPolygonId,
    numericProjectId,
    projectIdProvided,
    requestKey,
    validBuildingPolygonId,
    validProjectId,
  ]);

  const stateMatchesRequest = Boolean(requestKey && state.requestKey === requestKey);
  const immediateError = enabled && projectIdProvided && !validProjectId
    ? "The selected project has an invalid ID."
    : enabled && validProjectId && !validBuildingPolygonId
      ? "The selected building has an invalid ID."
      : null;

  return {
    tiles: enabled && stateMatchesRequest ? state.tiles : [],
    loading: Boolean(enabled && validProjectId && validBuildingPolygonId &&
      (!stateMatchesRequest || state.loading)),
    error: immediateError || (stateMatchesRequest ? state.error : null),
    hasMore: Boolean(stateMatchesRequest && state.hasMore),
  };
};
