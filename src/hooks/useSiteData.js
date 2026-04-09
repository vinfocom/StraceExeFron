// src/hooks/useSiteData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';

const getFirstFiniteNumber = (values = [], fallback = 0) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
};

const normalizeBeamwidth = (value, fallback = 65) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(5, Math.min(180, numeric));
};

const normalizeSectorRange = (value, fallback = 220) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(20, Math.min(5000, numeric));
};

const normalizeSitePredictionRows = (rows = [], options = {}) => {
  const deltaVariant = String(options?.deltaVariant || "").trim().toLowerCase();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item, index) => {
      const earfcnValue = item.earfcn_or_narfcn ?? item.earfcn ?? item.Earfcn;
      const earfcnNum = Number(earfcnValue);
      const inferredTechnology =
        Number.isFinite(earfcnNum) ? (earfcnNum >= 100000 ? "5G" : "4G") : "Unknown";

      const lat = parseFloat(item.lat_pred || item.lat || item.latitude || 0);
      const lng = parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0);

      return {
        ...item,
        site:
          item.site ||
          item.site_id ||
          item.siteId ||
          item.site_key_inferred ||
          item.siteKeyInferred ||
          item.nodeb_id ||
          item.nodeB_id ||
          item.node_b_id ||
          item.nodebId ||
          item.cell_id_representative ||
          item.cellIdRepresentative ||
          `site_${index}`,
        lat,
        lng,
        azimuth: getFirstFiniteNumber([item.azimuth_deg_5, item.azimuth_deg_5_soft, item.azimuth], 0),
        beamwidth: normalizeBeamwidth(
          getFirstFiniteNumber([item.bw, item.bandwidth, item.beamwidth, item.beamwidth_deg_est], 65),
          65,
        ),
        range: normalizeSectorRange(getFirstFiniteNumber([item.range, item.radius], 220), 220),
        operator: item.network || item.Network || item.cluster || item.operator_name || "Unknown",
        band: item.band || item.frequency_band || item.frequency || "Unknown",
        technology: item.Technology || item.tech || item.technology || inferredTechnology,
        pci:
          item.pci ??
          item.PCI ??
          item.pci_or_psi ??
          item.cell_id ??
          item.cell_id_representative,
        deltaVariant: deltaVariant || String(item.deltaVariant || item.delta_variant || "").trim().toLowerCase() || null,
        id:
          item.original_id ??
          item.id ??
          item.cell_id ??
          item.cell_id_representative ??
          item.site ??
          item.site_id ??
          item.siteId ??
          item.site_key_inferred ??
          `${deltaVariant || "site"}_${index}`,
      };
    })
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.lat !== 0);
};

const normalizeCompareSitePredictionPayload = (payload) => {
  const responseRoot = payload?.data || payload;
  const baselineEntries = Array.isArray(responseRoot?.baseline) ? responseRoot.baseline : [];
  const optimizedEntries = Array.isArray(responseRoot?.optimized) ? responseRoot.optimized : [];

  const baselineRows = baselineEntries
    .map((entry) => {
      if (entry && typeof entry === "object" && entry.baseline && typeof entry.baseline === "object") {
        return entry.baseline;
      }
      return entry;
    })
    .filter((row) => row && typeof row === "object");

  const optimizedRows = optimizedEntries
    .map((entry) => {
      if (entry && typeof entry === "object" && entry.optimized && typeof entry.optimized === "object") {
        return entry.optimized;
      }
      return entry;
    })
    .filter((row) => row && typeof row === "object");

  return [
    ...normalizeSitePredictionRows(baselineRows, { deltaVariant: "baseline" }),
    ...normalizeSitePredictionRows(optimizedRows, { deltaVariant: "optimized" }),
  ];
};

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

export const useSiteData = ({ 
  enableSiteToggle, 
  siteToggle, 
  sitePredictionVersion = "original",
  projectId, 
  sessionIds,
  autoFetch = false,
  filterEnabled = false,
  polygons = [],
}) => {
  const [siteData, setSiteData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const isMounted = useRef(true);
  const lastFetchParams = useRef(null);

  // DEBUG: Log current state on every render
  useEffect(() => {
  }, [enableSiteToggle, siteToggle, sitePredictionVersion, siteData.length]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchSiteData = useCallback(async (forceRefresh = false) => {

    // If the toggle is not enabled, we clear data and stop
    if (!enableSiteToggle) {
      setSiteData([]);
      setLoading(false);
      lastFetchParams.current = null;
      return;
    }

    // Prevents duplicate calls
    const currentParams = JSON.stringify({
      siteToggle,
      sitePredictionVersion,
      projectId,
      sessionIds,
      filterEnabled,
      polygons,
    });
    if (lastFetchParams.current === currentParams && siteData.length > 0) {
      return;
    }

    const cacheKey = makeProjectCacheKey({
      resource: 'unified-site-data',
      projectId: projectId || 'global',
      sessionIds,
      variant: `${String(siteToggle || '').toLowerCase()}_${String(sitePredictionVersion || 'original').toLowerCase()}`,
    });

    if (!forceRefresh) {
      const cachedData = readProjectSessionCache(cacheKey);
      if (Array.isArray(cachedData)) {
        setSiteData(cachedData);
        setLoading(false);
        setError(null);
        lastFetchParams.current = currentParams;
        return;
      }
    }

    setLoading(true);
    setError(null);
    lastFetchParams.current = currentParams;
    
    try {
      const params = { projectId: projectId || '' };
      let response;
      const normalizedVersionRaw = String(sitePredictionVersion || "original").trim().toLowerCase();
      const normalizedVersion =
        normalizedVersionRaw === "updated"
          ? "updated"
          : normalizedVersionRaw === "delta"
            ? "delta"
            : "original";

      switch (siteToggle) {
        case 'Cell':
          if (normalizedVersion === "delta") {
            response = await mapViewApi.compareSitePrediction(params);
          } else {
            response = await mapViewApi.getSitePrediction({
              ...params,
              version: normalizedVersion,
            });
          }
          break;
        case 'NoML': response = await mapViewApi.getSiteNoMl(params); break;
        case 'ML': response = await mapViewApi.getSiteMl(params); break;
        default: response = { data: [] };
      }

      if (!isMounted.current) return;

      const rawData = response?.data?.Data || response?.data?.data || response?.Data || response?.data || [];
      const normalizedData =
        normalizedVersion === "delta"
          ? normalizeCompareSitePredictionPayload(response)
          : normalizeSitePredictionRows(Array.isArray(rawData) ? rawData : []);

      let finalData = normalizedData;
      if (filterEnabled && polygons?.length > 0) {
        finalData = normalizedData.filter((site) =>
          polygons.some((poly) => isPointInPolygon(site, poly)),
        );
      }

      setSiteData(finalData);
      if (!filterEnabled || polygons?.length === 0) {
        writeProjectSessionCache(cacheKey, finalData);
      }

    } catch (err) {
      if (isMounted.current) {
        setError(err);
        setSiteData([]);
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [enableSiteToggle, siteToggle, sitePredictionVersion, projectId, sessionIds, siteData.length, filterEnabled, polygons]);

  useEffect(() => {
    if (autoFetch) {
      fetchSiteData(false);
    }
  }, [fetchSiteData, autoFetch]);

  return { siteData, loading, error, fetchSiteData };
};
