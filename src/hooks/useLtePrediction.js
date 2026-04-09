import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';

const isPointInPolygon = (point, polygon) => {
  const path = Array.isArray(polygon?.paths?.[0])
    ? polygon.paths[0]
    : Array.isArray(polygon?.paths) && polygon.paths[0]?.lat != null
      ? polygon.paths
      : Array.isArray(polygon?.path) && polygon.path[0]?.lat != null
        ? polygon.path
        : null;
  if (!path?.length) return false;
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  if (lat == null || lng == null) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

export const useLtePrediction = ({
  projectId,
  siteId = null,
  metric = 'rsrp',
  sitePredictionVersion = 'original',
  stat = 'avg',
  enabled = true,
  autoFetch = true,
  filterEnabled = false,
  polygons = [],
  maxLocations = 12000,
} = {}) => {
  const [locations, setLocations] = useState([]);
  const [meta, setMeta] = useState({
    status: null,
    projectId: null,
    metric: null,
    statRequested: null,
    totalLocations: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const fetchLtePrediction = useCallback(async () => {
    if (!enabled || !projectId) {
      setLocations([]);
      setMeta({
        status: null,
        projectId: null,
        metric: null,
        statRequested: null,
        totalLocations: 0,
      });
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      const requestedMetricUpper = String(metric || '').trim().toUpperCase();
      const allowedBaselineMetrics = new Set(['RSRP', 'RSRQ', 'SINR', 'SNR']);
      const normalizedBaselineMetric = allowedBaselineMetrics.has(requestedMetricUpper)
        ? (requestedMetricUpper === 'SNR' ? 'SINR' : requestedMetricUpper)
        : 'RSRP';
      const isOptimizedVersion =
        String(sitePredictionVersion || 'original').trim().toLowerCase() === 'updated';
      const effectiveMetric = isOptimizedVersion
        ? 'MEASURED'
        : normalizedBaselineMetric;
      const fetchFn = isOptimizedVersion
        ? mapViewApi.getLtePredictionLocationStatsRefined
        : mapViewApi.getLtePfrection;

      const params = {
        projectId: Number(projectId),
        metric: effectiveMetric,
        statType: stat,
        stat,
      };

      let rawData = [];
      let combinedResponse = null;

      if (siteId && siteId.includes(",")) {
        const ids = siteId.split(",").map(id => id.trim()).filter(Boolean);
        for (const id of ids) {
          const res = await fetchFn({ ...params, siteId: id }, { signal }).catch(() => null);
          if (res && Array.isArray(res.Data)) {
            rawData = rawData.concat(res.Data);
            if (!combinedResponse && res.Status === 1) {
              combinedResponse = res;
            }
          }
        }

        if (!combinedResponse) {
          combinedResponse = { Status: 1, TotalLocations: rawData.length };
        }
      } else {
        if (siteId) {
          params.siteId = siteId;
        }
        combinedResponse = await fetchFn(params, { signal });
        rawData = Array.isArray(combinedResponse?.Data) ? combinedResponse.Data : [];
      }

      if (!isMountedRef.current) return;

      const normalized = rawData
        .map((item) => {
          const lat = Number(item?.latitude ?? item?.lat);
          const lng = Number(item?.longitude ?? item?.lon ?? item?.lng);

          let rawValue = item?.value;

          if (rawValue === undefined || rawValue === null) {
            // Check specifically for rsrp, rsrq, sinr keys common in these payloads
            if (metric === "rsrp" && item.reference_signal_power !== undefined) {
              rawValue = item.reference_signal_power;
            } else if (metric === "rsrq" && item.reference_signal_quality !== undefined) {
              rawValue = item.reference_signal_quality;
            } else if (metric === "sinr" && item.signal_to_noise_ratio !== undefined) {
              rawValue = item.signal_to_noise_ratio;
            } else {
              // generic fallback for matching the key names
              if (item[metric] !== undefined) rawValue = item[metric];
              else if (item[metric.toUpperCase()] !== undefined) rawValue = item[metric.toUpperCase()];
              else if (item[metric.toLowerCase()] !== undefined) rawValue = item[metric.toLowerCase()];
              else {
                // brute force search
                const foundKey = Object.keys(item).find(k => k.toLowerCase().includes(metric.toLowerCase()));
                if (foundKey) rawValue = item[foundKey];
              }
            }
          }

          const value = Number(rawValue);
          // Default to 1 if missing because predictions often don't have sample counts but DeckGL needs it
          const sampleCount = Number(item?.sampleCount ?? item?.sample_count ?? 1);
          const rowSiteId = String(item?.siteId ?? item?.site_id ?? item?.site ?? '').trim();

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return {
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            value: Number.isFinite(value) ? value : null,
            sampleCount: Number.isFinite(sampleCount) ? sampleCount : 1,
            siteId: rowSiteId,
          };
        })
        .filter(Boolean);

      let finalLocations = normalized;
      if (filterEnabled && polygons?.length > 0) {
        finalLocations = normalized.filter((pt) =>
          polygons.some((poly) => isPointInPolygon(pt, poly)),
        );
      }
      const maxAllowed = Number(maxLocations);
      if (Number.isFinite(maxAllowed) && maxAllowed > 0 && finalLocations.length > maxAllowed) {
        const step = Math.ceil(finalLocations.length / maxAllowed);
        finalLocations = finalLocations.filter((_, index) => index % step === 0).slice(0, maxAllowed);
      }

      setLocations(finalLocations);
      setMeta({
        status: combinedResponse?.Status ?? null,
        projectId: combinedResponse?.ProjectId ?? Number(projectId),
        metric: combinedResponse?.Metric ?? effectiveMetric,
        statRequested: combinedResponse?.StatRequested ?? stat,
        totalLocations: combinedResponse?.TotalLocations ?? finalLocations.length,
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err);
      setLocations([]);
      setMeta({
        status: null,
        projectId: Number(projectId) || null,
        metric:
          String(sitePredictionVersion || 'original').trim().toLowerCase() === 'updated'
            ? 'MEASURED'
            : String(metric || '').trim().toUpperCase() || 'RSRP',
        statRequested: stat,
        totalLocations: 0,
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, projectId, siteId, metric, sitePredictionVersion, stat, filterEnabled, polygons, maxLocations]);

  useEffect(() => {
    if (!autoFetch) return;
    fetchLtePrediction();
  }, [fetchLtePrediction, autoFetch]);

  return {
    locations,
    meta,
    loading,
    error,
    fetchLtePrediction,
  };
};

export default useLtePrediction;
