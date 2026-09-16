import { useEffect, useState } from "react";
import { mapViewApi } from "@/api/apiEndpoints";
import { loadClutterTiles, CLUTTER_PAGE_SIZE } from "@/utils/loadClutterTiles";

export const PROJECT_CLUTTER_TILE_LIMIT = CLUTTER_PAGE_SIZE;
const MAX_ERROR_MESSAGE_LENGTH = 240;

const emptyState = {
  requestKey: null,
  tiles: [],
  buildingPolygons: [],
  loading: false,
  error: null,
  hasMore: false,
  loadedMatches: 0,
  loadedPages: 0,
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
    const controller = new AbortController();
    setState({ ...emptyState, requestKey, loading: true });

    loadClutterTiles(
      (page) => mapViewApi.getProjectBuildingClutterTiles(
        numericProjectId,
        {
          buildingPolygonId: buildingIdProvided ? numericBuildingPolygonId : undefined,
          ...page,
        },
        { signal: controller.signal, dedupe: false },
      ),
      {
        signal: controller.signal,
        onProgress: ({ tiles, hasMore, loadedMatches, pageNumber }) => {
          if (!active) return;
          setState({
            requestKey,
            tiles,
            loading: hasMore,
            error: null,
            hasMore,
            loadedMatches,
            loadedPages: pageNumber,
          });
        },
      },
    )
      .then((tiles) => {
        if (!active) return;

        setState((previous) => ({
          ...previous,
          requestKey,
          tiles,
          loading: false,
          error: null,
          hasMore: false,
        }));
      })
      .catch((requestError) => {
        if (!active || requestError?.isCancelled) return;
        setState((previous) => ({
          ...previous,
          requestKey,
          loading: false,
          error: getSafeErrorMessage(requestError),
          hasMore: false,
        }));
      });

    return () => {
      active = false;
      controller.abort();
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
    buildingPolygons: enabled && stateMatchesRequest ? state.buildingPolygons : [],
    loading: Boolean(enabled && validProjectId && validBuildingPolygonId &&
      (!stateMatchesRequest || state.loading)),
    error: immediateError || (stateMatchesRequest ? state.error : null),
    hasMore: Boolean(stateMatchesRequest && state.hasMore),
    loadedMatches: stateMatchesRequest ? state.loadedMatches : 0,
    loadedPages: stateMatchesRequest ? state.loadedPages : 0,
  };
};
