// src/hooks/useNeighborCollisions.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '../api/apiEndpoints';
import { toast } from 'react-toastify';

/**
 * Check if coordinates are valid
 */
const isValidCoordinate = (lat, lng) => {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  
  return (
    lat !== null && lat !== undefined &&
    lng !== null && lng !== undefined &&
    !isNaN(latNum) && !isNaN(lngNum) &&
    isFinite(latNum) && isFinite(lngNum) &&
    latNum >= -90 && latNum <= 90 &&
    lngNum >= -180 && lngNum <= 180
  );
};

/**
 * Process API response - ONLY keep neighbors with valid coordinates
 */
function processNeighborResponse(responses) {
  const allNeighbors = [];
  const collisions = [];
  const pciSet = new Set();
  
  const stats = {
    totalRaw: 0,
    withCoords: 0,
    withoutCoords: 0,
    fromCollisions: 0,
    fromPrimaries: 0,
  };

  responses.forEach((response) => {
    // ==================== PROCESS PCI COLLISIONS ====================
    // These usually have coordinates
    const pciCollisions = response?.pci_collision_primary || [];
    
    pciCollisions.forEach((collision) => {
      const pci = String(collision.pci || '');
      const locations = collision.locations || [];

      if (!pci) return;

      const uniqueLocations = [];

      locations.forEach((location) => {
        const lat = parseFloat(location.lat);
        const lng = parseFloat(location.lon || location.lng);

        // SKIP if no valid coordinates
        if (!isValidCoordinate(location.lat, location.lon || location.lng)) {
          return;
        }

        pciSet.add(pci);
        stats.fromCollisions++;

        const cells = location.cells || [];
        
        // Add each cell at this collision location
        if (cells.length > 0) {
          cells.forEach((cell) => {
            allNeighbors.push({
              id: cell.id || `collision-${pci}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
              pci,
              lat,
              lng,
              cell_id: cell.cell_id,
              rsrp: null,
              rsrq: null,
              sinr: null,
              band: null,
              source: 'collision',
              isCollision: true,
            });
            stats.withCoords++;
          });
        } else {
          // Location without cells
          allNeighbors.push({
            id: `collision-${pci}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
            pci,
            lat,
            lng,
            cell_id: null,
            rsrp: null,
            rsrq: null,
            sinr: null,
            band: null,
            source: 'collision',
            isCollision: true,
          });
          stats.withCoords++;
        }

        // Track unique locations for collision count
        const isDuplicate = uniqueLocations.some(
          (existing) =>
            Math.abs(existing.lat - lat) < 0.0001 &&
            Math.abs(existing.lng - lng) < 0.0001
        );
        if (!isDuplicate) {
          uniqueLocations.push({ lat, lng });
        }
      });

      // Multiple distinct locations = collision
      if (uniqueLocations.length > 1) {
        collisions.push({
          pci,
          count: uniqueLocations.length,
          locations: uniqueLocations,
        });
      }
    });

    // ==================== PROCESS PRIMARIES & NEIGHBORS ====================
    const primaries = response?.primaries || [];

    primaries.forEach((primary) => {
      const primaryPci = primary.primary_pci;
      const primaryCellId = primary.primary_cell_id;
      const neighborsData = primary.neighbours_data || [];

      neighborsData.forEach((neighbor) => {
        stats.totalRaw++;
        
        const lat = neighbor.lat;
        const lng = neighbor.lon || neighbor.lng;

        // SKIP if no valid coordinates - DO NOT try to find from elsewhere
        if (!isValidCoordinate(lat, lng)) {
          stats.withoutCoords++;
          return;
        }

        const pci = String(neighbor.pci || '');
        if (pci) pciSet.add(pci);

        stats.withCoords++;
        stats.fromPrimaries++;

        allNeighbors.push({
          id: neighbor.id || `neighbor-${pci}-${parseFloat(lat).toFixed(5)}-${parseFloat(lng).toFixed(5)}`,
          pci,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          cell_id: neighbor.cell_id,
          rsrp: neighbor.rsrp !== null ? parseFloat(neighbor.rsrp) : null,
          rsrq: neighbor.rsrq !== null ? parseFloat(neighbor.rsrq) : null,
          sinr: neighbor.sinr !== null ? parseFloat(neighbor.sinr) : null,
          mos: neighbor.mos !== null ? parseFloat(neighbor.mos) : null,
          dl_tpt: neighbor.dl_tpt !== null ? parseFloat(neighbor.dl_tpt) : null,
          ul_tpt: neighbor.ul_tpt !== null ? parseFloat(neighbor.ul_tpt) : null,
          band: neighbor.band || null,
          latency: neighbor.latency !== null ? parseFloat(neighbor.latency) : null,
          jitter: neighbor.jitter !== null ? parseFloat(neighbor.jitter) : null,
          primaryPci,
          primaryCellId,
          source: 'primary',
          isCollision: false,
        });
      });
    });
  });

  return {
    allNeighbors,
    collisions,
    stats: {
      total: allNeighbors.length,
      collisions: collisions.length,
      uniquePCIs: pciSet.size,
      withCoords: stats.withCoords,
      withoutCoords: stats.withoutCoords,
      fromCollisions: stats.fromCollisions,
      fromPrimaries: stats.fromPrimaries,
    },
  };
}

export function useNeighborCollisions({
  sessionIds = [],
  enabled = false,
  cacheTimeout = 5 * 60 * 1000,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    allNeighbors: [],
    collisions: [],
    stats: { total: 0, collisions: 0, uniquePCIs: 0, withCoords: 0, withoutCoords: 0 },
  });

  const cacheRef = useRef(new Map());
  const abortControllerRef = useRef(null);

  const getCacheKey = useCallback(
    (ids) => (ids?.length ? [...ids].sort().join('-') : ''),
    []
  );

  const fetchData = useCallback(async () => {
    // Guard: disabled
    if (!enabled) {
      setData({
        allNeighbors: [],
        collisions: [],
        stats: { total: 0, collisions: 0, uniquePCIs: 0, withCoords: 0, withoutCoords: 0 },
      });
      return;
    }

    // Guard: no sessions
    if (!sessionIds?.length) {
      return;
    }

    const cacheKey = getCacheKey(sessionIds);

    // Check cache
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTimeout) {
      setData(cached.data);
      return;
    }

    // Cancel previous
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const results = [];

      for (let i = 0; i < sessionIds.length; i++) {
        const sessionId = sessionIds[i];
        
        try {
          const response = await mapViewApi.getNeighbours(sessionId);
          if (response) {
            results.push(response);
          }
        } catch (err) {
          console.warn(`⚠️ Session ${sessionId} failed:`, err.message);
        }

        // Delay between requests
        if (i < sessionIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      if (results.length === 0) {
        throw new Error('No neighbor data retrieved');
      }

      const processed = processNeighborResponse(results);

      // Cache
      cacheRef.current.set(cacheKey, {
        data: processed,
        timestamp: Date.now(),
      });

      setData(processed);

      // Toast feedback
      if (processed.stats.total > 0) {
        toast.success(
          `${processed.stats.total} neighbors loaded (${processed.stats.uniquePCIs} PCIs)`,
          { autoClose: 2000 }
        );
      } else {
        toast.info(
          `No neighbors with coordinates. ${processed.stats.withoutCoords} skipped (null coords).`,
          { autoClose: 3000 }
        );
      }

      if (processed.stats.collisions > 0) {
        toast.warning(`${processed.stats.collisions} PCI collision(s)`, { autoClose: 3000 });
      }

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('❌ Neighbor fetch error:', err);
        setError(err);
        toast.error(`Failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionIds, enabled, cacheTimeout, getCacheKey]);

  // Fetch on mount/change
  useEffect(() => {
    fetchData();
    return () => abortControllerRef.current?.abort();
  }, [fetchData]);

  // Clear when disabled
  useEffect(() => {
    if (!enabled) {
      setData({
        allNeighbors: [],
        collisions: [],
        stats: { total: 0, collisions: 0, uniquePCIs: 0, withCoords: 0, withoutCoords: 0 },
      });
    }
  }, [enabled]);

  return {
    ...data,
    loading,
    error,
    refetch: fetchData,
    clearCache: () => cacheRef.current.clear(),
  };
}
