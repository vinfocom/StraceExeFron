// src/hooks/useAreaPolygons.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { areaBreakdownApi } from '@/api/apiEndpoints';
import { isCancelledError } from '@/api/apiService';
import { parseWKTToPolygons, computeBbox } from '@/utils/wkt.js';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';

const EMPTY_POLYGONS = [];
export const useAreaPolygons = (projectId, areaEnabled) => {
  const [polygons, setPolygons] = useState(EMPTY_POLYGONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!projectId || !areaEnabled) {
      setPolygons((prev) => prev.length ? EMPTY_POLYGONS : prev);
      return;
    }

    const cacheKey = makeProjectCacheKey({
      resource: 'area-polygons',
      projectId,
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
      const res = await areaBreakdownApi.getAreaPolygons(projectId, {
        signal: controller.signal,
      });

      // Navigate to the correct path in your response: res.data.ai_zones
      const items = res?.data?.ai_zones || []; 
      
      const parsed = items.flatMap((item) => {
        // Use the 'geometry' field as shown in your console log
        const wkt = item.geometry; 
        if (!wkt) return [];
        const itemData = Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== "geometry"),
        );

        return parseWKTToPolygons(wkt).map((p, k) => ({
          ...itemData,
          id: item.id || item.Id,
          name: item.project_name || `Zone ${item.id ?? item.Id}`,
          uid: `area-${item.id ?? item.Id}-${k}`,
          paths: p.paths,
          bbox: computeBbox(p.paths[0]),
        }));
      });

      if (requestId !== requestIdRef.current) return;
      setPolygons(parsed);
      writeProjectSessionCache(cacheKey, parsed);
    } catch (err) {
      if (isCancelledError(err)) return;
      if (requestId !== requestIdRef.current) return;
      console.error("Area Polygons Fetch Error:", err);
      setError(err.message);
      setPolygons((prev) => prev.length ? EMPTY_POLYGONS : prev);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId, areaEnabled]);

  useEffect(() => {
    fetchData(false);
    return () => {
      requestIdRef.current += 1;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);
  return { areaData: polygons, loading, error, refetch };
};
