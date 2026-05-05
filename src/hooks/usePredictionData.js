// src/hooks/usePredictionData.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';
import {
  normalizeBandName,
  normalizeProviderName,
  normalizeTechName,
} from '@/utils/colorUtils';

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const usePredictionData = (projectId, selectedMetric, enabled = true) => {
  const [locations, setLocations] = useState([]);
  const [colorSettings, setColorSettings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [hasData, setHasData] = useState(false);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!projectId) {
      setLocations([]);
      setColorSettings([]);
      setHasFetched(false);
      setHasData(false);
      return;
    }

    if (!enabled) {
      setLocations([]);
      setColorSettings([]);
      return;
    }

    const cacheKey = makeProjectCacheKey({
      resource: 'unified-prediction-log',
      projectId,
      variant: String(selectedMetric || 'rsrp').toLowerCase(),
    });

    if (!forceRefresh) {
      const cached = readProjectSessionCache(cacheKey);
      if (cached && Array.isArray(cached?.locations)) {
        setLocations(cached.locations);
        setColorSettings(Array.isArray(cached?.colorSettings) ? cached.colorSettings : []);
        setHasFetched(true);
        setHasData(cached.locations.length > 0);
        return;
      }
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await mapViewApi.getPredictionLog({
        projectId: Number(projectId),
        metric: selectedMetric.toUpperCase(),
        signal: abortControllerRef.current.signal,
      });

      if (res?.Status === 1 && res?.Data) {
        const rawData = Array.isArray(res.Data)
          ? res.Data
          : Array.isArray(res.Data?.dataList)
            ? res.Data.dataList
            : [];
        const colorSetting = Array.isArray(res.Data?.colorSetting) ? res.Data.colorSetting : [];

        const formatted = rawData.map((pt) => {
          const lat = parseFloat(pt.lat ?? pt.latitude ?? pt.Lat);
          const lng = parseFloat(pt.lon ?? pt.lng ?? pt.longitude ?? pt.Lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const rawBand = pt.band ?? pt.Band ?? '';
          const band = normalizeBandName(rawBand);
          const networkRaw = pt.network ?? pt.Network ?? '';
          const providerRaw =
            pt.provider ??
            pt.Provider ??
            pt.operator ??
            pt.Operator ??
            pt.network_provider ??
            pt.networkProvider ??
            networkRaw;
          const provider = normalizeProviderName(providerRaw) || 'Unknown';

          const technologyRaw =
            pt.technology ??
            pt.Technology ??
            pt.networkType ??
            pt.network_type ??
            pt.tech ??
            networkRaw;
          const technology = normalizeTechName(technologyRaw, band) || 'Unknown';

          const rsrp = toFiniteNumber(pt.rsrp ?? pt.RSRP ?? pt.prm ?? pt.value);
          const rsrq = toFiniteNumber(pt.rsrq ?? pt.RSRQ);
          const sinr = toFiniteNumber(pt.sinr ?? pt.SINR);
          const metricValue =
            toFiniteNumber(pt.prm ?? pt.value ?? pt[selectedMetric]) ??
            (selectedMetric === 'rsrp'
              ? rsrp
              : selectedMetric === 'rsrq'
                ? rsrq
                : selectedMetric === 'sinr'
                  ? sinr
                  : null);

          return {
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            [selectedMetric]: metricValue,
            value: metricValue, // required by LtePredictionLocationLayer
            rsrp,
            rsrq,
            sinr,
            prm: toFiniteNumber(pt.prm),
            provider,
            network: networkRaw || provider,
            technology,
            networkType: technology,
            band,
            isPrediction: true,
          };
        }).filter(Boolean);

        setLocations(formatted);
        setColorSettings(colorSetting);
        setHasFetched(true);
        setHasData(formatted.length > 0);
        writeProjectSessionCache(cacheKey, {
          locations: formatted,
          colorSettings: colorSetting,
        });
        const totalCount = formatted.length > 0 ? formatted.length : rawData.length;
        toast.success(
          `${totalCount > 0 ? `${totalCount} prediction points` : "No prediction points"} loaded`,
        );
      } else {
        toast.error(res?.Message || "No prediction data");
        setLocations([]);
        setHasFetched(true);
        setHasData(false);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      toast.error(err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedMetric, enabled]);

  useEffect(() => {
    setHasFetched(false);
    setHasData(false);
  }, [projectId, selectedMetric]);

  useEffect(() => {
    fetchData(false);
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  return {
    locations,
    colorSettings,
    loading,
    error,
    hasFetched,
    hasData,
    refetch: () => fetchData(true),
  };
};
