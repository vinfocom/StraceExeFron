// src/hooks/useProjectPolygons.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import { parseWKTToPolygons, computeBbox } from '@/utils/wkt.js';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';





export const useProjectPolygons = (projectId, showPolygons, polygonSource) => {
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!projectId || !showPolygons) {
      setPolygons([]);
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
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await mapViewApi.getProjectPolygonsV2(projectId, polygonSource, {
        signal: abortControllerRef.current.signal,
      });

      const items = res?.Data || res?.data?.Data || (Array.isArray(res) ? res : []);
      const parsed = items.flatMap((item) => {
        const wkt = item.Wkt || item.wkt;
        if (!wkt) return [];
        const rawArea = item.Area ?? item.area;
        const parsedArea = rawArea == null ? null : Number(rawArea);

        return parseWKTToPolygons(wkt).map((p, k) => ({
          id: item.Id || item.id,
          name: item.Name || item.name || `Polygon ${item.Id}`,
          source: polygonSource,
          uid: `${polygonSource}-${item.Id}-${k}`,
          paths: p.paths,
          bbox: computeBbox(p.paths[0]),
          area: Number.isFinite(parsedArea) ? parsedArea : null,
        }));
      });

      setPolygons(parsed);
      writeProjectSessionCache(cacheKey, parsed);
      if (parsed.length) toast.success(`${parsed.length} polygon(s) loaded`);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setPolygons([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, showPolygons, polygonSource]);

  useEffect(() => {
    fetchData(false);
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  return { polygons, loading, error, refetch: () => fetchData(true) };
};
