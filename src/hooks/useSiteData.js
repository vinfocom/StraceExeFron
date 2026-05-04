// src/hooks/useSiteData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';
import {
  makeProjectCacheKey,
  readProjectSessionCacheEntry,
  isProjectSessionCacheFresh,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';

const SITE_PREDICTION_PAGE_SIZE = 5000;
const MAX_SITE_PREDICTION_PAGES = 200;
const SITE_DATA_CACHE_MAX_AGE_MS = 2 * 60 * 1000;

const getFirstFiniteNumber = (values = [], fallback = 0) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
};

const getFirstPositiveFiniteNumberOrNull = (values = []) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
};

const normalizeBeamwidth = (value, fallback = 30) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(5, Math.min(180, numeric));
};

const normalizeSectorRange = (value, fallback = 220) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(20, Math.min(5000, numeric));
};

const toFiniteNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractRowsFromResponse = (response) => {
  const payload =
    response?.data?.Data ??
    response?.data?.data ??
    response?.Data ??
    response?.data ??
    [];
  return Array.isArray(payload) ? payload : [];
};

const extractSitePredictionPaginationMeta = (response = {}) => {
  const root = response?.data || response || {};
  const pagination =
    root?.pagination && typeof root.pagination === "object"
      ? root.pagination
      : {};

  const page = toFiniteNumberOrNull(
    pagination.page ??
      pagination.currentPage ??
      pagination.current_page ??
      root.page ??
      root.currentPage ??
      root.current_page,
  );
  const pageSize = toFiniteNumberOrNull(
    pagination.pageSize ??
      pagination.page_size ??
      pagination.perPage ??
      pagination.per_page ??
      pagination.limit ??
      root.pageSize ??
      root.page_size ??
      root.perPage ??
      root.per_page ??
      root.limit,
  );
  const totalPages = toFiniteNumberOrNull(
    pagination.totalPages ??
      pagination.total_pages ??
      pagination.pageCount ??
      pagination.page_count ??
      pagination.lastPage ??
      pagination.last_page ??
      root.totalPages ??
      root.total_pages ??
      root.pageCount ??
      root.page_count ??
      root.lastPage ??
      root.last_page,
  );
  const totalCount = toFiniteNumberOrNull(
    pagination.total ??
      pagination.totalCount ??
      pagination.total_count ??
      pagination.count ??
      root.total ??
      root.totalCount ??
      root.total_count ??
      root.count,
  );

  return { page, pageSize, totalPages, totalCount };
};

const getSitePredictionRowKey = (row = {}, index = 0) =>
  [
    row?.id ??
      row?.original_id ??
      row?.cell_id ??
      row?.cellId ??
      row?.cell_id_representative ??
      row?.cellIdRepresentative ??
      "",
    row?.site ??
      row?.site_id ??
      row?.siteId ??
      row?.site_key_inferred ??
      row?.siteKeyInferred ??
      "",
    row?.sector ?? row?.sector_id ?? row?.sectorId ?? "",
    row?.lat_pred ?? row?.lat ?? row?.latitude ?? "",
    row?.lon_pred ?? row?.lng ?? row?.lon ?? row?.longitude ?? "",
    index,
  ].join("|");

const fetchAllSitePredictionRows = async (params = {}) => {
  const aggregatedRows = [];
  const seenRows = new Set();

  let page = 1;
  let totalPagesHint = null;
  let totalCountHint = null;

  while (page <= MAX_SITE_PREDICTION_PAGES) {
    const response = await mapViewApi.getSitePrediction({
      ...params,
      page,
      limit: SITE_PREDICTION_PAGE_SIZE,
    });

    const pageRows = extractRowsFromResponse(response);
    if (pageRows.length === 0) break;

    let addedThisPage = 0;
    pageRows.forEach((row, index) => {
      const key = getSitePredictionRowKey(row, index);
      if (seenRows.has(key)) return;
      seenRows.add(key);
      aggregatedRows.push(row);
      addedThisPage += 1;
    });

    const meta = extractSitePredictionPaginationMeta(response);
    const effectivePage = meta.page ?? page;
    const effectivePageSize = meta.pageSize ?? SITE_PREDICTION_PAGE_SIZE;
    totalPagesHint = meta.totalPages ?? totalPagesHint;
    totalCountHint = meta.totalCount ?? totalCountHint;

    if (totalPagesHint && effectivePage >= totalPagesHint) break;
    if (totalCountHint && aggregatedRows.length >= totalCountHint) break;
    if (addedThisPage === 0) break;
    if (pageRows.length < effectivePageSize) break;

    page += 1;
  }

  return aggregatedRows;
};

const normalizeSitePredictionRows = (rows = [], options = {}) => {
  const deltaVariant = String(options?.deltaVariant || "").trim().toLowerCase();
  const defaultBeamwidth = normalizeBeamwidth(options?.defaultBeamwidth, 30);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item, index) => {
      const earfcnValue = item.earfcn_or_narfcn ?? item.earfcn ?? item.Earfcn;
      const earfcnNum = Number(earfcnValue);
      const inferredTechnology =
        Number.isFinite(earfcnNum) ? (earfcnNum >= 100000 ? "5G" : "4G") : "Unknown";

      const lat = parseFloat(item.lat_pred || item.lat || item.latitude || 0);
      const lng = parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0);
      const sourceBeamwidth = getFirstPositiveFiniteNumberOrNull([
        item.bw,
        item.bandwidth,
        item.beamwidth,
        item.beamwidth_deg_est,
      ]);
      const hasBeamwidthValue = sourceBeamwidth !== null;

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
          hasBeamwidthValue ? sourceBeamwidth : defaultBeamwidth,
          defaultBeamwidth,
        ),
        hasBeamwidthValue,
        beamwidthSource: hasBeamwidthValue ? "data" : "default",
        range: normalizeSectorRange(getFirstFiniteNumber([item.range, item.radius], 220), 220),
        operator: item.cluster || item.network || item.Network || item.operator_name || "Unknown",
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

const normalizeCompareSitePredictionPayload = (payload, options = {}) => {
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
    ...normalizeSitePredictionRows(baselineRows, {
      ...options,
      deltaVariant: "baseline",
    }),
    ...normalizeSitePredictionRows(optimizedRows, {
      ...options,
      deltaVariant: "optimized",
    }),
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
  defaultBeamwidth = 30,
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
    const normalizedDefaultBeamwidth = normalizeBeamwidth(defaultBeamwidth, 30);

    // If the toggle is not enabled, we clear data and stop
    if (!enableSiteToggle) {
      setSiteData([]);
      setLoading(false);
      lastFetchParams.current = null;
      return;
    }

    const normalizedVersionRaw = String(sitePredictionVersion || "original").trim().toLowerCase();
    const normalizedVersion =
      normalizedVersionRaw === "updated"
        ? "updated"
        : normalizedVersionRaw === "delta"
          ? "delta"
          : "original";
    const shouldUseLocalCache = normalizedVersion !== "delta";

    // Prevents duplicate calls
    const currentParams = JSON.stringify({
      siteToggle,
      sitePredictionVersion,
      defaultBeamwidth: normalizedDefaultBeamwidth,
      projectId,
      sessionIds,
      filterEnabled,
      polygons,
    });
    if (!forceRefresh && lastFetchParams.current === currentParams && siteData.length > 0) {
      return;
    }

    const cacheKey = makeProjectCacheKey({
      resource: 'unified-site-data',
      projectId: projectId || 'global',
      sessionIds,
      variant: `${String(siteToggle || '').toLowerCase()}_${String(sitePredictionVersion || 'original').toLowerCase()}_bw${normalizedDefaultBeamwidth}`,
    });

    if (shouldUseLocalCache && !forceRefresh) {
      const cacheEntry = readProjectSessionCacheEntry(cacheKey);
      if (Array.isArray(cacheEntry?.data)) {
        setSiteData(cacheEntry.data);
        setError(null);
        lastFetchParams.current = currentParams;

        if (isProjectSessionCacheFresh(cacheEntry, SITE_DATA_CACHE_MAX_AGE_MS)) {
          setLoading(false);
          return;
        }
      }
    }

    setLoading(true);
    setError(null);
    lastFetchParams.current = currentParams;
    
    try {
      const params = { projectId: projectId || '' };
      let response;

      switch (siteToggle) {
        case 'Cell':
          if (normalizedVersion === "delta") {
            response = await mapViewApi.compareSitePrediction({
              ...params,
              limit: SITE_PREDICTION_PAGE_SIZE,
            });
          } else {
            response = await fetchAllSitePredictionRows({
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

      const rawData = Array.isArray(response)
        ? response
        : response?.data?.Data || response?.data?.data || response?.Data || response?.data || [];
      const normalizedData =
        normalizedVersion === "delta"
          ? normalizeCompareSitePredictionPayload(response, {
              defaultBeamwidth: normalizedDefaultBeamwidth,
            })
          : normalizeSitePredictionRows(Array.isArray(rawData) ? rawData : [], {
              defaultBeamwidth: normalizedDefaultBeamwidth,
            });

      let finalData = normalizedData;
      if (filterEnabled && polygons?.length > 0) {
        finalData = normalizedData.filter((site) =>
          polygons.some((poly) => isPointInPolygon(site, poly)),
        );
      }

      setSiteData(finalData);
      if (shouldUseLocalCache && (!filterEnabled || polygons?.length === 0)) {
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
  }, [enableSiteToggle, siteToggle, sitePredictionVersion, defaultBeamwidth, projectId, sessionIds, siteData.length, filterEnabled, polygons]);

  useEffect(() => {
    if (autoFetch) {
      fetchSiteData(false);
    }
  }, [fetchSiteData, autoFetch]);

  return { siteData, loading, error, fetchSiteData, refetch: fetchSiteData };
};
