import { useEffect, useState } from "react";
import { mapViewApi } from "@/api/apiEndpoints";
import { getClutterTilesPayload } from "@/utils/clutterTilesResponse";

export const PROJECT_CLUTTER_TILE_LIMIT = 5000;
const MAX_ERROR_MESSAGE_LENGTH = 240;

const emptyState = {
  requestKey: null,
  tiles: [],
  buildingPolygons: [],
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

const getTileKey = (row, index) => {
  const tileId = String(row?.clutterTileId ?? row?.gridId ?? "").trim();
  if (tileId) return `tile:${tileId}`;
  const wkt = typeof row?.clutterPolygonWkt === "string" ? row.clutterPolygonWkt.trim() : "";
  return wkt ? `wkt:${wkt}` : `row:${index}`;
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

    const loadPages = async () => {
      const allRowsByTile = new Map();
      const buildingPolygonsById = new Map();
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await mapViewApi.getProjectBuildingClutterTiles(
          numericProjectId,
          {
            buildingPolygonId: buildingIdProvided ? numericBuildingPolygonId : undefined,
            limit: PROJECT_CLUTTER_TILE_LIMIT,
            offset,
          },
        );
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

        rows.forEach((row, index) => {
          const key = getTileKey(row, `${offset}:${index}`);
          if (!allRowsByTile.has(key)) allRowsByTile.set(key, row);
        });
        for (const polygon of payload?.buildingPolygons ?? payload?.BuildingPolygons ?? []) {
          if (polygon?.buildingPolygonId != null) {
            buildingPolygonsById.set(String(polygon.buildingPolygonId), polygon);
          }
        }

        setState({
          requestKey,
          tiles: [...allRowsByTile.values()],
          buildingPolygons: [...buildingPolygonsById.values()],
          loading: true,
          error: null,
          hasMore: true,
        });

        const nextOffset = Number(payload?.nextOffset ?? payload?.NextOffset);
        hasMore = Boolean(payload?.hasMore ?? payload?.HasMore) && rows.length > 0;
        offset = Number.isFinite(nextOffset) && nextOffset > offset
          ? nextOffset
          : offset + rows.length;
      }

      if (!active) return;
      setState({
        requestKey,
        tiles: [...allRowsByTile.values()],
        buildingPolygons: [...buildingPolygonsById.values()],
        loading: false,
        error: null,
        hasMore: false,
      });
    };

    loadPages()
      .catch((requestError) => {
        if (!active || requestError?.isCancelled) return;
        setState({
          requestKey,
          tiles: [],
          buildingPolygons: [],
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
    buildingPolygons: enabled && stateMatchesRequest ? state.buildingPolygons : [],
    loading: Boolean(enabled && validProjectId && validBuildingPolygonId &&
      (!stateMatchesRequest || state.loading)),
    error: immediateError || (stateMatchesRequest ? state.error : null),
    hasMore: Boolean(stateMatchesRequest && state.hasMore),
  };
};
