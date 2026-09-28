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
import { useRequestGeneration } from '@/features/unified-map/data/useRequestGeneration.js';

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
  const [outcome, setOutcome] = useState('empty');
  const [complete, setComplete] = useState(false);
  const lastLoadedIdentityRef = useRef(null);
  const requestIdentity = JSON.stringify({ projectId: projectId ?? null, metric: selectedMetric, enabled: Boolean(enabled) });
  const requestGeneration = useRequestGeneration(requestIdentity);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const lease = requestGeneration.begin({ force: forceRefresh });
    if (!lease.started) return;
    const { request } = lease;
    const isCurrent = () => requestGeneration.isCurrent(request);
    const signal = request.controller.signal;
    if (requestIdentity !== lastLoadedIdentityRef.current) {
      lastLoadedIdentityRef.current = null;
      setLocations([]);
      setColorSettings([]);
      setHasFetched(false);
      setHasData(false);
    }
    if (!projectId) {
      setLocations([]);
      setColorSettings([]);
      setHasFetched(false);
      setHasData(false);
      setLoading(false);
      setOutcome('empty');
      setComplete(false);
      requestGeneration.finish(request);
      return;
    }

    if (!enabled) {
      setLocations([]);
      setColorSettings([]);
      setLoading(false);
      setOutcome('empty');
      setComplete(false);
      requestGeneration.finish(request);
      return;
    }

    const cacheKey = makeProjectCacheKey({
      resource: 'unified-prediction-log',
      projectId,
      variant: `schema2_${String(selectedMetric || 'rsrp').toLowerCase()}`,
    });

    if (!forceRefresh) {
      let cached = null;
      try {
        cached = readProjectSessionCache(cacheKey);
      } catch {
        cached = null;
      }
      if (!isCurrent()) return;
      if (cached?.cacheSchemaVersion === 2 && Array.isArray(cached?.locations) && typeof cached.complete === 'boolean') {
        setLocations(cached.locations);
        setColorSettings(Array.isArray(cached?.colorSettings) ? cached.colorSettings : []);
        setHasFetched(true);
        setHasData(cached.locations.length > 0);
        setOutcome(cached.outcome || (cached.locations.length ? 'complete' : 'empty'));
        setComplete(cached.complete);
        lastLoadedIdentityRef.current = requestIdentity;
        setLoading(false);
        setError(null);
        requestGeneration.finish(request);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setOutcome('loading');
    setComplete(false);

    try {
      const res = await mapViewApi.getPredictionLog({
        projectId: Number(projectId),
        metric: selectedMetric.toUpperCase(),
        signal,
      });

      if (!isCurrent()) return;
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
        const resultOutcome = formatted.length ? 'complete' : 'empty';
        setOutcome(resultOutcome);
        setComplete(true);
        lastLoadedIdentityRef.current = requestIdentity;
        writeProjectSessionCache(cacheKey, {
          cacheSchemaVersion: 2,
          outcome: resultOutcome,
          complete: true,
          locations: formatted,
          colorSettings: colorSetting,
        });
        const totalCount = formatted.length > 0 ? formatted.length : rawData.length;
        toast.success(
          `${totalCount > 0 ? `${totalCount} prediction points` : "No prediction points"} loaded`,
        );
      } else {
        setOutcome('failed');
        setComplete(false);
        toast.error(res?.Message || "No prediction data");
        setLocations([]);
        setHasFetched(true);
        setHasData(false);
        lastLoadedIdentityRef.current = requestIdentity;
      }
    } catch (err) {
      if (err.name === "AbortError" || signal.aborted || !isCurrent()) return;
      toast.error(err.message);
      setError(err.message);
      setOutcome('failed');
      setComplete(false);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        requestGeneration.finish(request);
      }
    }
  }, [projectId, selectedMetric, enabled, requestIdentity, requestGeneration]);

  useEffect(() => {
    setHasFetched(false);
    setHasData(false);
  }, [projectId, selectedMetric]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  return {
    locations,
    colorSettings,
    loading,
    error,
    hasFetched,
    hasData,
    outcome,
    complete,
    refetch: () => fetchData(true),
  };
};
