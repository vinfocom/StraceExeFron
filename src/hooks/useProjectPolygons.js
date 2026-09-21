// src/hooks/useProjectPolygons.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import { isCancelledError } from '@/api/apiService';
import { parseWKTToPolygons, computeBbox } from '@/utils/wkt.js';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';





const EMPTY_POLYGONS = [];
export const useProjectPolygons = (projectId, showPolygons, polygonSource) => {
  const [polygons, setPolygons] = useState(EMPTY_POLYGONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!projectId || !showPolygons) {
      setPolygons((prev) => prev.length ? EMPTY_POLYGONS : prev);
      return;
    }

    const cacheKey = makeProjectCacheKey({
      resource: 'project-polygons-v2',
      projectId,
      variant: polygonSource || 'map',
    });

    if (!forceRefresh) {
      const cachedPolygons = readProjectSessionCache(cacheKey);
      if (Array.isArray(cachedPolygons) && cachedPolygons.length > 0) {
        setPolygons(cachedPolygons);
        return;
      }
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await mapViewApi.getProjectPolygonsV2(projectId, polygonSource, {
        signal: controller.signal,
      });

      const sourceRequested =
        res?.SourceRequested ??
        res?.data?.SourceRequested ??
        polygonSource;
      const countFromSavePolygon = Number(
        res?.CountFromSavePolygon ?? res?.data?.CountFromSavePolygon,
      );

      const items = res?.Data || res?.data?.Data || (Array.isArray(res) ? res : []);
      const parsed = items.flatMap((item) => {
        const wkt = item.Wkt || item.wkt;
        if (!wkt) return [];
        const rawArea = item.Area ?? item.area;
        const parsedArea = rawArea == null ? null : Number(rawArea);
        const itemId = item.Id ?? item.id;

        return parseWKTToPolygons(wkt).map((p, k) => ({
          id: itemId,
          name: item.Name || item.name || `Polygon ${itemId}`,
          source: polygonSource,
          uid: `${polygonSource}-${itemId}-${k}`,
          paths: p.paths,
          bbox: computeBbox(p.paths[0]),
          area: Number.isFinite(parsedArea) ? parsedArea : null,
        }));
      });

      if (requestId !== requestIdRef.current) return;
      setPolygons(parsed);
      writeProjectSessionCache(cacheKey, parsed);
      if (
        sourceRequested === 'save' &&
        Number.isFinite(countFromSavePolygon) &&
        countFromSavePolygon === 0
      ) {
        toast.info('No building found.');
      }
    } catch (err) {
      if (isCancelledError(err)) return;
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
      setPolygons((prev) => prev.length ? EMPTY_POLYGONS : prev);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId, showPolygons, polygonSource]);

  useEffect(() => {
    fetchData(false);
    return () => {
      requestIdRef.current += 1;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);
  return { polygons, loading, error, refetch };
};
