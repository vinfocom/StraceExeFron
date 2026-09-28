// src/hooks/useSessionNeighbors.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import { isCancelledError } from '@/api/apiService';
import { useRequestGeneration } from '@/features/unified-map/data/useRequestGeneration.js';
import { getPolygonRequestIdentity } from '@/features/unified-map/data/mapRequestIdentity.js';
import { normalizeProviderName, normalizeTechName } from '@/utils/colorUtils';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';

const parsePci = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const useSessionNeighbors = (
  sessionIds,
  enabled = true,
  filterEnabled = false,
  polygons = [],
  maxRows = 300000,
  projectId = null,
) => {
  const [neighborData, setNeighborData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [outcome, setOutcome] = useState('empty');
  const [complete, setComplete] = useState(false);
  const lastSuccessIdentityRef = useRef(null);

  const safeMaxRows =
    Number.isFinite(Number(maxRows)) && Number(maxRows) > 0
      ? Math.floor(Number(maxRows))
      : null;
  const canUsePersistentCache = !filterEnabled || polygons?.length === 0;
  const cacheKey = makeProjectCacheKey({
    resource: 'unified-session-neighbors',
    sessionIds: sessionIds || [],
    projectId: projectId || 'global',
    variant: `v2_${safeMaxRows || 'all'}_${filterEnabled ? 'filtered' : 'all'}_project-${projectId || 'none'}`,
  });
  const requestIdentity = JSON.stringify({
    cacheKey,
    sessionIds: sessionIds ? [...sessionIds].map(String).sort() : [],
    projectId: projectId ?? null,
    enabled: Boolean(enabled),
    filterEnabled: Boolean(filterEnabled),
    polygons: getPolygonRequestIdentity(polygons),
    maxRows: safeMaxRows,
  });
  const requestGeneration = useRequestGeneration(requestIdentity);

  const fetchData = useCallback(async (force = false) => {
    const lease = requestGeneration.begin({ force });
    if (!lease.started) return;
    const { request } = lease;
    const isCurrent = () => requestGeneration.isCurrent(request);
    const signal = request.controller.signal;

    if (requestIdentity !== lastSuccessIdentityRef.current) {
      lastSuccessIdentityRef.current = null;
      setNeighborData([]);
      setStats(null);
    }

    if (!sessionIds?.length || !enabled) {
      setNeighborData([]);
      setStats(null);
      setLoading(false);
      setError(null);
      setOutcome('empty');
      setComplete(false);
      lastSuccessIdentityRef.current = requestIdentity;
      requestGeneration.finish(request);
      return;
    }
    
    if (!force && requestIdentity === lastSuccessIdentityRef.current) {
      requestGeneration.finish(request);
      return;
    }

    setLoading(true);
    setError(null);
    setOutcome('loading');
    setComplete(false);

    if (!force && canUsePersistentCache) {
      let cached = null;
      try {
        cached = readProjectSessionCache(cacheKey);
      } catch {
        cached = null;
      }
      if (!isCurrent()) return;
      if (
        cached?.cacheSchemaVersion === 2 &&
        ['complete', 'empty', 'capped'].includes(cached?.outcome) &&
        typeof cached?.complete === 'boolean' &&
        Array.isArray(cached?.neighborData)
      ) {
        setNeighborData(cached.neighborData);
        setStats(cached.stats || null);
        setOutcome(cached.outcome);
        setComplete(cached.complete);
        setLoading(false);
        setError(null);
        lastSuccessIdentityRef.current = requestIdentity;
        requestGeneration.finish(request);
        return;
      }
    }

    try {
      const res = await mapViewApi.getSessionNeighbour({
        sessionIds: sessionIds,
        project_id: projectId,
        signal,
      });

      if (!isCurrent()) return;

      const responseRows = Array.isArray(res?.Data)
        ? res.Data
        : res?.success && Array.isArray(res?.data)
          ? res.data
          : null;
      if ((res?.Status === 1 || res?.success === true) && Array.isArray(responseRows)) {
        const formattedData = responseRows.map((item) => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            if (!isFinite(lat) || !isFinite(lng)) return null;
            const neighbourBand = item.neighbour_band || item.neighbor_band;

            return {
                id: item.id,
                sessionId: item.session_id,
                timestamp: item.timestamp,
                lat, lng,
                provider: normalizeProviderName(item.provider || ""),
                networkType: normalizeTechName(item.primary_network, neighbourBand),
                primaryBand: item.primary_band,
                neighbourBand: neighbourBand,
                primaryRsrp: parseFloat(item.primary_rsrp) || null,
                primaryRsrq: parseFloat(item.primary_rsrq) || null,
                primarySinr: parseFloat(item.primary_sinr) || null,
                primaryPci: parsePci(item.primary_pci),
                neighbourRsrp: parseFloat(item.neighbour_rsrp) || null,
                neighbourRsrq: parseFloat(item.neighbour_rsrq) || null,
                neighbourSinr: parseFloat(item.neighbour_sinr) || null,
                neighbourPci: parsePci(item.neighbour_pci),
            };
        }).filter(Boolean);

        // Polygon filtering is handled by backend GetN78Neighbours using project raw filter.
        let finalNeighbors = formattedData;

        const wasCapped = Boolean(safeMaxRows && finalNeighbors.length > safeMaxRows);
        if (wasCapped) {
          const step = Math.ceil(finalNeighbors.length / safeMaxRows);
          finalNeighbors = finalNeighbors
            .filter((_, index) => index % step === 0)
            .slice(0, safeMaxRows);
        }

        const statsObj = { 
          total: finalNeighbors.length,
          uniquePCIs: new Set(finalNeighbors.map(d => d.primaryPci)).size
        }; 

        if (!isCurrent()) return;
        const resultOutcome = finalNeighbors.length === 0 ? 'empty' : wasCapped ? 'capped' : 'complete';
        const resultComplete = !wasCapped;
        setNeighborData(finalNeighbors);
        setStats(statsObj);
        setOutcome(resultOutcome);
        setComplete(resultComplete);
        lastSuccessIdentityRef.current = requestIdentity;
        if (canUsePersistentCache) {
          writeProjectSessionCache(cacheKey, {
            cacheSchemaVersion: 2,
            outcome: resultOutcome,
            complete: resultComplete,
            neighborData: finalNeighbors,
            stats: statsObj,
          });
        }
      } else {
        if (!isCurrent()) return;
        setNeighborData([]);
        setStats(null);
        setOutcome('failed');
        setComplete(false);
        setError('Neighbor request returned an invalid response.');
      }
    } catch (err) {
      if (isCancelledError(err) || signal.aborted || !isCurrent()) return;
      
      setError(err.message);
      setOutcome('failed');
      setComplete(false);
      toast.error(`Failed to fetch neighbor data: ${err.message}`);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        requestGeneration.finish(request);
      }
    }
  }, [
    sessionIds,
    enabled,
    safeMaxRows,
    projectId,
    filterEnabled,
    polygons,
    canUsePersistentCache,
    cacheKey,
    requestIdentity,
    requestGeneration,
  ]);

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchData(), 100);
    return () => clearTimeout(timeoutId);
  }, [sessionIds?.join(','), enabled, fetchData]);

  return {
    neighborData,
    stats,
    loading,
    error,
    outcome,
    complete,
    refetch: () => fetchData(true),
  };
};
