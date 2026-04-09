// src/hooks/useAreaPolygons.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { areaBreakdownApi } from '@/api/apiEndpoints';
import { parseWKTToPolygons, computeBbox } from '@/utils/wkt.js';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';

export const useAreaPolygons = (projectId, areaEnabled) => {
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!projectId || !areaEnabled) {
      setPolygons([]);
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
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await areaBreakdownApi.getAreaPolygons(projectId, {
        signal: abortControllerRef.current.signal,
      });

      // Navigate to the correct path in your response: res.data.ai_zones
      const items = res?.data?.ai_zones || []; 
      
      const parsed = items.flatMap((item) => {
        // Use the 'geometry' field as shown in your console log
        const wkt = item.geometry; 
        if (!wkt) return [];

        return parseWKTToPolygons(wkt).map((p, k) => ({
          id: item.id || item.Id,
          name: item.project_name || `Zone ${item.id}`,
          uid: `area-${item.id}-${k}`,
          paths: p.paths,
          bbox: computeBbox(p.paths[0]),
          // Include the rest of the item data (created_at, project_id, etc.)
          ...item 
        }));
      });

      setPolygons(parsed);
      writeProjectSessionCache(cacheKey, parsed);
      if (parsed.length > 0) {
        toast.success(`${parsed.length} area zone(s) loaded`);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Area Polygons Fetch Error:", err);
      setError(err.message);
      setPolygons([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, areaEnabled]);

  useEffect(() => {
    fetchData(false);
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  return { areaData: polygons, loading, error, refetch: () => fetchData(true) };
};
