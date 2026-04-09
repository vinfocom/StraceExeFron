import useSWR, { useSWRConfig } from 'swr';
import { useMemo, useCallback, useRef } from 'react';
import { adminApi } from '../api/apiEndpoints';
import { 
  buildQueryString, 
  groupOperatorSamplesByNetwork, 
  buildRanking,
  toNumber,
  ensureNegative
} from '../utils/dashboardUtils';
import { normalizeBandName, normalizeProviderName, normalizeTechName } from '@/utils/colorUtils';



const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: true,
  shouldRetryOnError: true,       
  errorRetryCount: 2,              
  errorRetryInterval: 3000,
  dedupingInterval: 5000,
  focusThrottleInterval: 30000,
  loadingTimeout: 10000,
  keepPreviousData: true,
  revalidateIfStale: true,
};

const CACHE_TIME = {
  SHORT: 2 * 60 * 1000,
  MEDIUM: 5 * 60 * 1000,
  LONG: 15 * 60 * 1000,
};

const METRIC_ENDPOINT_MAP = {
  rsrp: 'getAvgRsrpV2',
  rsrq: 'getAvgRsrqV2',
  sinr: 'getAvgSinrV2',
  mos: 'getAvgMosV2',
  jitter: 'getAvgJitterV2',
  latency: 'getAvgLatencyV2',
  packetLoss: 'getAvgPacketLossV2',
  dlTpt: 'getAvgDlTptV2',
  ulTpt: 'getAvgUlTptV2',
};

const NEGATIVE_METRICS = ['rsrp', 'rsrq'];

const METRIC_TO_FIELD = {
  samples: 'value',
  rsrp: 'avg_rsrp',
  rsrq: 'avg_rsrq', 
  sinr: 'avg_sinr',
  mos: 'avg_mos',
  jitter: 'avg_jitter',
  latency: 'avg_latency',
  packetLoss: 'avg_packet_loss',
  dlTpt: 'avg_dl_tpt',
  ulTpt: 'avg_ul_tpt',
};

const METRIC_FIELD_FALLBACKS = {
  samples: ['value', 'count', 'samples', 'sampleCount'],
  rsrp: ['avg_rsrp', 'avgRsrp', 'rsrp', 'RSRP'],
  rsrq: ['avg_rsrq', 'avgRsrq', 'rsrq', 'RSRQ'],
  sinr: ['avg_sinr', 'avgSinr', 'sinr', 'SINR'],
  mos: ['avg_mos', 'avgMos', 'mos', 'MOS'],
  jitter: ['avg_jitter', 'avgJitter', 'jitter'],
  latency: ['avg_latency', 'avgLatency', 'latency'],
  packetLoss: ['avg_packet_loss', 'avgPacketLoss', 'packet_loss'],
  dlTpt: ['avg_dl_tpt', 'avgDlTpt', 'dl_tpt', 'downloadSpeed'],
  ulTpt: ['avg_ul_tpt', 'avgUlTpt', 'ul_tpt', 'uploadSpeed'],
};

const createCacheKey = (base, filters) => {
  if (!filters || Object.keys(filters).length === 0) return base;
  
  const normalized = Object.keys(filters)
    .sort()
    .reduce((acc, key) => {
      const value = filters[key];
      if (value === undefined || value === null || value === '') return acc;
      
      if (value instanceof Date) {
        acc[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        acc[key] = value.sort().join(',');
      } else if (typeof value === 'object') {
        acc[key] = JSON.stringify(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  
  return Object.keys(normalized).length > 0 
    ? `${base}::${JSON.stringify(normalized)}` 
    : base;
};

const extractData = (response, fallback = []) => {
  if (response === null || response === undefined) {
    return fallback;
  }
  
  if (Array.isArray(response)) {
    return response;
  }
  
  if (response?.Status === 0) {
    return fallback;
  }
  
  if (Array.isArray(response?.Data)) {
    return response.Data;
  }
  if (Array.isArray(response?.data)) {
    return response.data;
  }
  if (Array.isArray(response?.Result)) {
    return response.Result;
  }
  if (Array.isArray(response?.result)) {
    return response.result;
  }
  
  if (typeof response === 'object' && !Array.isArray(response)) {
    if (response.Data !== undefined) {
      return response.Data;
    }
    if (response.data !== undefined) {
      return response.data;
    }
    return response;
  }
  
  return fallback;
};

const createFetcher = (apiFn, fallback = []) => {
  return async () => {
    try {
      const response = await apiFn();
      const data = extractData(response, fallback);
      
      if (data !== null && data !== undefined) {
        const isValidArray = Array.isArray(data) && data.length > 0;
        const isValidObject = !Array.isArray(data) && typeof data === 'object' && Object.keys(data).length > 0;
        const isValidNumber = typeof data === 'number';
        
        if (isValidArray || isValidObject || isValidNumber) {
          return data;
        }
      }
      
      return fallback;
    } catch (error) {
      throw error;
    }
  };
};

const extractMetricValue = (item, metric) => {
  if (!item || !metric) return null;

  const primaryField = METRIC_TO_FIELD[metric];
  if (primaryField && item[primaryField] !== undefined && item[primaryField] !== null) {
    return toNumber(item[primaryField]);
  }

  const fallbacks = METRIC_FIELD_FALLBACKS[metric] || [];
  for (const field of fallbacks) {
    if (item[field] !== undefined && item[field] !== null) {
      return toNumber(item[field]);
    }
  }

  return null;
};

const isValidMetricValue = (value, metric) => {
  if (value === null || value === undefined || isNaN(value)) return false;
  
  if (NEGATIVE_METRICS.includes(metric)) {
    return value !== 0;
  }
  
  if (metric === 'samples') {
    return value > 0;
  }
  
  return value >= 0;
};

const processMetricData = (rawData, metric) => {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  
  const merged = new Map();
  const isNegative = NEGATIVE_METRICS.includes(metric);
  
  for (const item of rawData) {
    const name = normalizeProviderName(item?.operatorName || item?.name || item?.operator);
    if (!name || name === 'Unknown') continue;
    
    const value = extractMetricValue(item, metric);
    if (!isValidMetricValue(value, metric)) continue;
    
    if (!merged.has(name)) {
      merged.set(name, { name, value, count: 1 });
    } else {
      const existing = merged.get(name);
      existing.value = ((existing.value * existing.count) + value) / (existing.count + 1);
      existing.count++;
    }
  }
  
  return Array.from(merged.values())
    .map(({ name, value }) => ({
      name,
      value: isNegative ? ensureNegative(value) : value
    }))
    .sort((a, b) => isNegative ? a.value - b.value : b.value - a.value);
};

const processOperatorMetrics = (rawData, metric) => {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return [];
  }

  if (metric === 'samples') {
    return groupOperatorSamplesByNetwork(rawData);
  }

  const isNegative = NEGATIVE_METRICS.includes(metric);
  const grouped = {};

  rawData.forEach((item, index) => {
    const operatorName = normalizeProviderName(
      item?.operatorName || item?.operator || item?.name
    );
    
    const network = item?.network || item?.networkType || item?.type;
    const value = extractMetricValue(item, metric);

    if (!operatorName || operatorName === 'Unknown') return;
    if (!network) return;
    
    const networkLower = network.toLowerCase();
    if (networkLower.includes('edge') || 
        networkLower === 'unknown' ||
        networkLower.includes('no service')) {
      return;
    }

    if (!isValidMetricValue(value, metric)) {
      return;
    }

    if (!grouped[operatorName]) {
      grouped[operatorName] = { 
        name: operatorName,
        _networkCounts: {}
      };
    }

    const operatorData = grouped[operatorName];
    const finalValue = isNegative ? ensureNegative(value) : value;

    if (operatorData[network] !== undefined) {
      const currentCount = operatorData._networkCounts[network] || 1;
      const currentSum = operatorData[network] * currentCount;
      operatorData._networkCounts[network] = currentCount + 1;
      operatorData[network] = (currentSum + finalValue) / operatorData._networkCounts[network];
    } else {
      operatorData[network] = finalValue;
      operatorData._networkCounts[network] = 1;
    }
  });

  const result = Object.values(grouped)
    .map(item => {
      const { _networkCounts, ...cleanItem } = item;
      
      const networkKeys = Object.keys(cleanItem).filter(k => k !== 'name');
      const validNetworks = networkKeys.filter(net => {
        const val = cleanItem[net];
        return typeof val === 'number' && !isNaN(val);
      });

      let total = 0;
      if (validNetworks.length > 0) {
        const sum = validNetworks.reduce((acc, net) => acc + cleanItem[net], 0);
        total = sum / validNetworks.length;
      }

      return {
        ...cleanItem,
        total: isNegative ? ensureNegative(total) : total
      };
    })
    .filter(item => {
      const networks = Object.keys(item).filter(k => k !== 'name' && k !== 'total');
      return networks.length > 0;
    })
    .sort((a, b) => isNegative ? a.total - b.total : b.total - a.total);

  return result;
};

const processBandDistribution = (rawData) => {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  
  const merged = new Map();
  
  for (const item of rawData) {
    const bandValue = item?.band ?? item?.Band ?? item?.bandNumber ?? item?.name;
    const band = bandValue !== undefined ? `Band ${bandValue}` : 'Unknown';
    const count = toNumber(item?.count ?? item?.Count ?? item?.samples ?? item?.value ?? 1);
    
    if (band !== 'Unknown') {
      merged.set(band, (merged.get(band) || 0) + count);
    }
  }
  
  return Array.from(merged.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
};

const processUniqueList = (rawData, keyOptions) => {
  if (!rawData) return [];
  
  if (Array.isArray(rawData) && rawData.length > 0 && typeof rawData[0] === 'string') {
    return [...new Set(rawData)].filter(Boolean).sort();
  }
  
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  
  const unique = new Set();
  
  rawData.forEach(item => {
    if (!item) return;
    
    let value;
    
    if (typeof item === 'string') {
      value = item;
    } else if (typeof item === 'object') {
      for (const key of keyOptions) {
        if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
          value = item[key];
          break;
        }
      }
    }
    
    if (value && value !== 'Unknown' && value !== 'unknown') {
      unique.add(String(value).trim());
    }
  });
  
  return Array.from(unique).sort();
};

const parseDurationToHours = (duration) => {
  if (!duration || typeof duration !== 'string') return 0;
  
  const parts = duration.split(':');
  if (parts.length !== 3) return 0;
  
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  
  return parseFloat((hours + (minutes / 60) + (seconds / 3600)).toFixed(2));
};

export const useTotals = () => {
  return useSWR(
    'totals',
    createFetcher(() => adminApi.getTotalsV2?.(), {}),
    { 
      ...SWR_CONFIG, 
      dedupingInterval: CACHE_TIME.SHORT, 
      refreshInterval: 60000,
      fallbackData: {}
    }
  );
};

export const useMonthlySamples = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('monthlySamples', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useSWR(
    cacheKey,
    createFetcher(() => adminApi.getMonthlySamplesV2?.(query), []),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.MEDIUM, fallbackData: [] }
  );
};

export const useOperatorSamples = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('operatorSamples', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    createFetcher(() => adminApi.getOperatorSamplesV2?.(query), []),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.SHORT, fallbackData: [] }
  );
  
  const processedData = useMemo(
    () => groupOperatorSamplesByNetwork(rawData || []),
    [rawData]
  );
  
  return { data: processedData, ...rest };
};

export const useNetworkDistribution = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('networkDist', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useSWR(
    cacheKey,
    createFetcher(() => adminApi.getNetworkTypeDistributionV2?.(query), []),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.MEDIUM, fallbackData: [] }
  );
};

export const useMetricData = (metric, filters) => {
  const cacheKey = useMemo(() => createCacheKey(`metric_${metric}`, filters), [metric, filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    async () => {
      const endpoint = METRIC_ENDPOINT_MAP[metric];
      if (!endpoint || !adminApi[endpoint]) return [];
      
      const response = await adminApi[endpoint](query);
      return extractData(response, []);
    },
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.SHORT, fallbackData: [] }
  );
  
  const processedData = useMemo(
    () => processMetricData(rawData || [], metric),
    [rawData, metric]
  );
  
  return { data: processedData, ...rest };
};

export const useOperatorMetrics = (metric, filters) => {
  const cacheKey = useMemo(() => createCacheKey('operatorMetricsAll', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    async () => {
      const response = await adminApi.getOperatorSamplesV2?.(query);
      const extracted = extractData(response, []);
      
      return extracted;
    },
    { 
      ...SWR_CONFIG, 
      dedupingInterval: CACHE_TIME.MEDIUM,
      fallbackData: [] 
    }
  );
  
  const processedData = useMemo(() => {
    const processed = processOperatorMetrics(rawData || [], metric);
    
    return processed;
  }, [rawData, metric]);
  
  return { data: processedData, ...rest };
};

export const useBandDistributionRaw = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('bandDistRaw', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useSWR(
    cacheKey,
    createFetcher(() => adminApi.getBandDistributionV2?.(query), []),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.MEDIUM, fallbackData: [] }
  );
};

export const useBandDistribution = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('bandDist', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    createFetcher(() => adminApi.getBandDistributionV2?.(query), []),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.MEDIUM, fallbackData: [] }
  );
  
  const processedData = useMemo(
    () => processBandDistribution(rawData || []),
    [rawData]
  );
  
  return { data: processedData, ...rest };
};

export const useBandCount = () => {
  const { data: rawData, ...rest } = useSWR(
    'bandCount',
    createFetcher(
      () => adminApi.getBandDistributionV2?.(),
      []
    ),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.MEDIUM, fallbackData: [] }
  );
  
  const count = useMemo(() => {
    if (!Array.isArray(rawData) || rawData.length === 0) return 0;
    
    const uniqueBands = new Set();
    rawData.forEach(item => {
      const rawBand = item?.band ?? item?.Band ?? item?.bandNumber ?? item?.name;
      if (rawBand !== undefined && rawBand !== null) {
        const cleanBand = String(rawBand).replace(/^Band\s+/i, '').trim();
        const normalized = normalizeBandName(cleanBand);
        if (normalized && normalized !== 'Unknown') {
          uniqueBands.add(normalized);
        }
      }
    });
    
    return uniqueBands.size;
  }, [rawData]);
  
  return { data: count, ...rest };
};

export const useIndoorCount = (filters = {}) => {
  const cacheKey = useMemo(() => createCacheKey('indoorCount', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useSWR(
    cacheKey,
    async () => {
      const response = await adminApi.getIndoorCount?.(query);
      const resp = extractData(response, {});
      
      if (typeof resp === 'number') return resp;
      if (resp?.Status === 0) return 0;
      
      return Number(resp?.Count ?? resp?.count ?? resp?.total ?? resp?.data ?? 0);
    },
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.SHORT, fallbackData: 0 }
  );
};

export const useOutdoorCount = (filters = {}) => {
  const cacheKey = useMemo(() => createCacheKey('outdoorCount', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useSWR(
    cacheKey,
    async () => {
      const response = await adminApi.getOutdoorCount?.(query);
      const resp = extractData(response, {});
      
      if (typeof resp === 'number') return resp;
      if (resp?.Status === 0) return 0;
      
      return Number(resp?.Count ?? resp?.count ?? resp?.total ?? resp?.data ?? 0);
    },
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.SHORT, fallbackData: 0 }
  );
};

export const useCoverageRanking = (rsrpMin = -95, rsrpMax = 0) => {
  const query = useMemo(
    () => ({
      min: rsrpMin,
      max: rsrpMax,
    }),
    [rsrpMin, rsrpMax]
  );

  const cacheKey = useMemo(
    () => createCacheKey('coverageRank', query), 
    [query]
  );
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    createFetcher(
      () => adminApi.getOperatorCoverageRanking(query),
      []
    ),
    {
      ...SWR_CONFIG,
      dedupingInterval: CACHE_TIME.MEDIUM,
      fallbackData: [],
      shouldRetryOnError: false,
    }
  );
  
  const ranking = useMemo(
    () => buildRanking(rawData || [], { nameKey: 'name', countKey: 'count' }),
    [rawData]
  );
  
  return { data: ranking, ...rest };
};

export const useQualityRanking = (rsrqMin = -10, rsrqMax = 0) => {
  const query = useMemo(
    () => ({
      min: rsrqMin,
      max: rsrqMax,
    }),
    [rsrqMin, rsrqMax]
  );

  const cacheKey = useMemo(
    () => createCacheKey('qualityRank', query), 
    [query]
  );
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    createFetcher(
      () => adminApi.getOperatorQualityRanking(query),
      []
    ),
    {
      ...SWR_CONFIG,
      dedupingInterval: CACHE_TIME.MEDIUM,
      fallbackData: [],
      shouldRetryOnError: false,
    }
  );
  
  const ranking = useMemo(
    () => buildRanking(rawData || [], { nameKey: 'name', countKey: 'count' }),
    [rawData]
  );
  
  return { data: ranking, ...rest };
};

export const useIndOut =() =>{
  const {data:rawData, ...rest} =useSWR(
    "IndoorOutdoor",
    async() => {
      try {
        const response  = await adminApi.getIndoorOutdoor();
        return extractData(response, []);
      } catch (error) {
        throw error;
      }
    },
    {
      ...SWR_CONFIG,
      dedupingInterval: CACHE_TIME.MEDIUM,
      revalidateOnMount: true,
      fallbackData: [],
      shouldRetryOnError: false,
    }
  );

  const processedData = useMemo(()=>{
    if(!rawData || !Array.isArray(rawData)){
      console.error("data is not array")
      return []
    }
    return rawData.map((item) => ({
      provider: normalizeProviderName(item.OperatorName) || "Unknown",
      location: item.LocationType || "Unknown",
      avgRsrp: Number(item.AvgRsrp) || 0,
      avgRsrq: Number(item.AvgRsrq) || 0,
      avgSinr: Number(item.AvgSinr) || 0,
      avgMos: Number(item.AvgMos) || 0,
      avgDlTpt: Number(item.AvgDlTpt) || 0,
      avgUlTpt: Number(item.AvgUlTpt) || 0,
      sampleCount: Number(item.SampleCount) || 0,
    }));
  },[rawData])
  return { data: processedData, ...rest };
}

export const useHoles = () => {
  const { data: rawData, ...rest } = useSWR(
    "holes",
    async () => {
      try {
        const response = await adminApi.getHoles();
        return extractData(response, []);
      } catch (error) {
        console.error('[useHoles] Error:', error);
        throw error;
      }
    },
    {
      ...SWR_CONFIG,
      dedupingInterval: CACHE_TIME.MEDIUM,
      revalidateOnMount: true,
      fallbackData: []
    }
  );

  const processedData = useMemo(() => {
    if (!rawData || !Array.isArray(rawData)) {
      return [];
    }

    const processed = rawData
      .filter(item => item?.rsrp != null && item?.rsrq != null)
      .map(item => ({
        id: item?.id,
        sessionId: item?.session_id,
        operator: item?.m_alpha_long,
        rsrp: Number(item?.rsrp),
        rsrq: Number(item?.rsrq),
      }));

    return processed;
  }, [rawData]);

  return { data: processedData, ...rest };
};

export const useHandsetPerformance = () => {
  const { data: rawData, ...rest } = useSWR(
    'handsetAvg',
    async () => {
      try {
        const response = await adminApi.getHandsetDistributionV2();
        
        return extractData(response, []);
      } catch (error) {
        throw error;
      }
    },
    { 
      ...SWR_CONFIG, 
      dedupingInterval: CACHE_TIME.MEDIUM,
      revalidateOnMount: true,
      fallbackData: [],
      shouldRetryOnError: false,
    }
  );
  
  const processedData = useMemo(() => {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    const processed = rawData.map(item => ({
      Make: item?.name || 'Unknown',
      Avg: ensureNegative(toNumber(item?.avg_rsrp || 0)),
      Samples: toNumber(item?.value || 0),
      AvgRsrq: toNumber(item?.avg_rsrq || 0),
      AvgSinr: toNumber(item?.avg_sinr || 0),
    }));

    return processed;
  }, [rawData]);
  
  return { data: processedData, ...rest };
};

export const useHandsetDistribution = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('handsetDist', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useSWR(
    cacheKey,
    createFetcher(() => adminApi.getHandsetDistributionV2?.(query), []),
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.MEDIUM, fallbackData: [] }
  );
};

export const useOperatorsAndNetworks = () => {
  const { 
    data: rawOperators = [], 
    isLoading: operatorsLoading, 
    error: operatorsError 
  } = useSWR(
    'operators',
    async () => {
      const response = await adminApi.getOperatorsV2?.();
      const extracted = extractData(response, []);
      return extracted;
    },
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.LONG, fallbackData: [] }
  );

  const { 
    data: rawNetworks = [], 
    isLoading: networksLoading, 
    error: networksError 
  } = useSWR(
    'networks',
    async () => {
      const response = await adminApi.getNetworksV2?.();
      const extracted = extractData(response, []);
      return extracted;
    },
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.LONG, fallbackData: [] }
  );

  const operators = useMemo(() => {
    if (!rawOperators || (Array.isArray(rawOperators) && rawOperators.length === 0)) {
      return [];
    }
    
    const operatorKeys = [
      'operatorName', 'OperatorName', 
      'operator', 'Operator',
      'name', 'Name',
      'carrier', 'Carrier'
    ];
    
    const list = processUniqueList(rawOperators, operatorKeys);
    
    const processed = list
      .map(op => normalizeProviderName(op))
      .filter(op => op && op.toLowerCase !== 'Unknown' && op !== 'unknown');

      const uniqueOperator = [...new Set(processed)];
    
    return uniqueOperator;
  }, [rawOperators]);

  const networks = useMemo(() => {
  if (!rawNetworks || (Array.isArray(rawNetworks) && rawNetworks.length === 0)) {
    return [];
  }
  
  const networkKeys = [
    'network', 'Network',
    'networkType', 'NetworkType',
    'type', 'Type',
    'name', 'Name'
  ];
  
  // 1. Get the unique raw list from the API
  const rawList = processUniqueList(rawNetworks, networkKeys);
  
  // 2. Map through each item to normalize it (e.g., "LTE" -> "4G")
  const normalizedList = rawList.map(tech => normalizeTechName(tech));
  
  // 3. Create a New Set to remove duplicates created by normalization
  // This ensures "LTE" and "4G" (which both become "4G") only show up once.
  return [...new Set(normalizedList)].filter(t => t !== "Unknown");
}, [rawNetworks]);

  return { 
    operators, 
    networks, 
    operatorCount: operators.length,
    networkCount: networks.length,
    isLoading: operatorsLoading || networksLoading,
    error: operatorsError || networksError
  };
};

export const useDashboardDataParallel = (filters) => {
  const cacheKey = useMemo(() => createCacheKey('dashboardAll', filters), [filters]);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  const { data: rawData, ...rest } = useSWR(
    cacheKey,
    async () => {
      const [
        totals,
        operatorSamples,
        networkDist,
        monthlySamples,
        rsrpData,
        rsrqData,
        sinrData,
        bandDist,
      ] = await Promise.all([
        adminApi.getTotalsV2?.().then(r => extractData(r, {})).catch(() => ({})),
        adminApi.getOperatorSamplesV2?.(query).then(r => extractData(r, [])).catch(() => []),
        adminApi.getNetworkTypeDistributionV2?.(query).then(r => extractData(r, [])).catch(() => []),
        adminApi.getMonthlySamplesV2?.(query).then(r => extractData(r, [])).catch(() => []),
        adminApi.getAvgRsrpV2?.(query).then(r => extractData(r, [])).catch(() => []),
        adminApi.getAvgRsrqV2?.(query).then(r => extractData(r, [])).catch(() => []),
        adminApi.getAvgSinrV2?.(query).then(r => extractData(r, [])).catch(() => []),
        adminApi.getBandDistributionV2?.(query).then(r => extractData(r, [])).catch(() => []),
      ]);
      
      return {
        totals,
        monthlySamples,
        operatorSamples,
        networkDist,
        rsrpData,
        rsrqData,
        sinrData,
        bandDist,
      };
    },
    { 
      ...SWR_CONFIG, 
      dedupingInterval: CACHE_TIME.SHORT,
      fallbackData: {
        totals: {},
        monthlySamples: [],
        operatorSamples: [],
        networkDist: [],
        rsrpData: [],
        rsrqData: [],
        sinrData: [],
        bandDist: [],
      }
    }
  );

  const processedData = useMemo(() => ({
    totals: rawData?.totals || {},
    monthlySamples: rawData?.monthlySamples || [],
    operatorSamples: groupOperatorSamplesByNetwork(rawData?.operatorSamples || []),
    networkDist: rawData?.networkDist || [],
    rsrp: processMetricData(rawData?.rsrpData || [], 'rsrp'),
    rsrq: processMetricData(rawData?.rsrqData || [], 'rsrq'),
    sinr: processMetricData(rawData?.sinrData || [], 'sinr'),
    bandDist: processBandDistribution(rawData?.bandDist || []),
  }), [rawData]);
  
  return { data: processedData, ...rest };
};

export const useParallelMetrics = (metrics = [], filters) => {
  const cacheKey = useMemo(
    () => createCacheKey(`parallel_${[...metrics].sort().join('_')}`, filters),
    [metrics, filters]
  );
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  const { data: rawData, ...rest } = useSWR(
    metrics.length > 0 ? cacheKey : null,
    async () => {
      const results = await Promise.all(
        metrics.map(async (metric) => {
          const endpoint = METRIC_ENDPOINT_MAP[metric];
          if (!endpoint || !adminApi[endpoint]) return [metric, []];
          
          try {
            const response = await adminApi[endpoint](query);
            return [metric, extractData(response, [])];
          } catch {
            return [metric, []];
          }
        })
      );
      
      return Object.fromEntries(results);
    },
    { ...SWR_CONFIG, dedupingInterval: CACHE_TIME.SHORT, fallbackData: {} }
  );

  const processedData = useMemo(() => {
    if (!rawData || Object.keys(rawData).length === 0) return {};
    
    const result = {};
    for (const [metric, data] of Object.entries(rawData)) {
      result[metric] = processMetricData(data, metric);
    }
    return result;
  }, [rawData]);
  
  return { data: processedData, ...rest };
};

export const useAppData = () => {
  const { data: rawData, isLoading, error, isValidating, mutate, ...rest } = useSWR(
    'appData:all',
    async () => {
      try {
        if (!adminApi.getAppValue) {
          throw new Error('API method getAppValue not found');
        }

        const response = await adminApi.getAppValue();
        
        if (response === null || response === undefined) {
          return [];
        }
        
        if (response?.Status === 0) {
          return [];
        }
        
        let extracted = null;
        
        if (Array.isArray(response)) {
          extracted = response;
        }
        else if (Array.isArray(response?.Data)) {
          extracted = response.Data;
        }
        else if (Array.isArray(response?.data)) {
          extracted = response.data;
        }
        else if (Array.isArray(response?.Result)) {
          extracted = response.Result;
        }
        else if (Array.isArray(response?.result)) {
          extracted = response.result;
        }
        else if (typeof response === 'object' && response !== null) {
          if (response.appName || response.AppName) {
            extracted = [response];
          } else {
            for (const key of Object.keys(response)) {
              if (Array.isArray(response[key])) {
                extracted = response[key];
                break;
              }
            }
          }
        }
        
        if (!extracted) {
          return [];
        }
        
        return extracted;
        
      } catch (err) {
        throw err;
      }
    },
    { 
      ...SWR_CONFIG,
      dedupingInterval: CACHE_TIME.MEDIUM,
      fallbackData: [],
      loadingTimeout: 35000,
      errorRetryInterval: 5000,
      errorRetryCount: 3,
      shouldRetryOnError: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
        if (error?.status === 404 || error?.status === 401) {
          return;
        }
        setTimeout(() => revalidate({ retryCount }), config.errorRetryInterval);
      },
    }
  );
  
  const processedData = useMemo(() => {
    if (!rawData) {
      return [];
    }
    
    if (!Array.isArray(rawData)) {
      return [];
    }
    
    if (rawData.length === 0) {
      return [];
    }
    
    const processed = rawData.map((item, index) => {
      if (!item) {
        return null;
      }
      
      const durationStr = item?.durationHHMMSS || item?.avgDuration || '00:00:00';
      
      return {
        appName: item?.appName || item?.AppName || item?.app_name || 'Unknown',
        sampleCount: toNumber(item?.sampleCount || item?.SampleCount || item?.sample_count || 0),
        avgRsrp: toNumber(item?.avgRsrp || item?.AvgRsrp || item?.avg_rsrp || 0),
        avgRsrq: toNumber(item?.avgRsrq || item?.AvgRsrq || item?.avg_rsrq || 0),
        avgSinr: toNumber(item?.avgSinr || item?.AvgSinr || item?.avg_sinr || 0),
        avgMos: toNumber(item?.avgMos || item?.AvgMos || item?.avg_mos || 0),
        avgJitter: toNumber(item?.avgJitter || item?.AvgJitter || item?.avg_jitter || 0),
        avgLatency: toNumber(item?.avgLatency || item?.AvgLatency || item?.avg_latency || 0),
        avgPacketLoss: toNumber(item?.avgPacketLoss || item?.AvgPacketLoss || item?.avg_packet_loss || 0),
        avgDlTptMbps: toNumber(item?.avgDlTptMbps || item?.AvgDlTptMbps || item?.avg_dl_tpt_mbps || 0),
        avgUlTptMbps: toNumber(item?.avgUlTptMbps || item?.AvgUlTptMbps || item?.avg_ul_tpt_mbps || 0),
        avgDuration: parseDurationToHours(durationStr),
        avgDurationFormatted: durationStr,
        durationSeconds: toNumber(item?.durationSeconds || item?.duration_seconds || 0),
        durationMinutes: toNumber(item?.durationMinutes || item?.duration_minutes || 0),
        firstUsedAt: item?.firstUsedAt || item?.first_used_at,
        lastUsedAt: item?.lastUsedAt || item?.last_used_at,
        usageDate: item?.usageDate || item?.usage_date,
      };
    }).filter(Boolean);

    return processed;
  }, [rawData]);
  
  return { 
    data: processedData, 
    rawData,
    isLoading,
    isValidating,
    error,
    mutate,
    refresh: () => mutate(),
    ...rest 
  };
};

export const usePrefetchDashboard = (filters) => {
  const prefetchRef = useRef(false);
  const query = useMemo(() => buildQueryString(filters), [filters]);
  
  return useCallback(() => {
    if (prefetchRef.current) return;
    
    Promise.allSettled([
      adminApi.getTotalsV2?.(),
      adminApi.getOperatorsV2?.(),
      adminApi.getNetworksV2?.(),
      adminApi.getOperatorSamplesV2?.(query),
    ]).finally(() => {
      prefetchRef.current = true;
    });
  }, [query]);
};

export const useClearDashboardCache = () => {
  const { cache, mutate } = useSWRConfig();
  
  return useCallback(() => {
    if (cache instanceof Map) {
      cache.clear();
    }
    
    mutate(() => true, undefined, { revalidate: true });
  }, [cache, mutate]);
};

export const useRefreshDashboard = () => {
  const { mutate } = useSWRConfig();
  
  return useCallback(() => {
    mutate(() => true, undefined, { revalidate: true });
  }, [mutate]);
};

// hooks/useDashboardData.js

export const useBoxData = (options = {}) => {
  const normalizedOptions = typeof options === 'string'
    ? { metric: options }
    : (options || {});
  const metric = normalizedOptions?.metric || 'rsrp';

  const fromDate = normalizedOptions?.dateFrom ? new Date(normalizedOptions.dateFrom) : null;
  const toDate = normalizedOptions?.dateTo ? new Date(normalizedOptions.dateTo) : null;
  const from = fromDate && !Number.isNaN(fromDate.getTime())
    ? fromDate.toISOString()
    : undefined;
  const to = toDate && !Number.isNaN(toDate.getTime())
    ? toDate.toISOString()
    : undefined;

  const { data: rawData, ...rest } = useSWR(
    ['boxData', metric, from || 'all', to || 'all'],
    async () => {
      try {
        const params = {};
        if (from) params.from = from;
        if (to) params.to = to;
        const response = await adminApi.getBoxData?.(metric, params);
        const extractedData = extractData(response, []);
        return extractedData;
      } catch (error) {
        console.error('Error fetching box data:', error);
        throw error;
      }
    },
    {
      ...SWR_CONFIG,
      dedupingInterval: CACHE_TIME.MEDIUM,
      fallbackData: [],
      shouldRetryOnError: false,
    }
  );

  const processedData = useMemo(() => {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    // Step 1: normalize + validate rows
    const validRows = [];

    rawData.forEach((item) => {
      if (!item) return;

      const rawOperator = item.Operator || item.operator || '';
      const provider = normalizeProviderName(rawOperator);

      // Skip invalid / unknown operators
      if (!provider) {
        return;
      }

      const min = toNumber(item.Min);
      const max = toNumber(item.Max);
      const Q1 = toNumber(item.Q1);
      const Q3 = toNumber(item.Q3);
      const Median = toNumber(item.Median);
      const samples = toNumber(item.Samples) || 0;

      // Ensure all required values are finite
      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        !Number.isFinite(Q1) ||
        !Number.isFinite(Q3) ||
        !Number.isFinite(Median)
      ) {
        return;
      }

      // Ensure proper ordering
      const sorted = [min, Q1, Median, Q3, max].sort((a, b) => a - b);

      validRows.push({
        provider,
        min: sorted[0],
        Q1: sorted[1],
        Median: sorted[2],
        Q3: sorted[3],
        max: sorted[4],
        samples,
        _rawOperator: rawOperator
      });
    });

    // Step 2: group by provider
    const providerMap = new Map();

    validRows.forEach((row) => {
      if (!providerMap.has(row.provider)) {
        providerMap.set(row.provider, []);
      }
      providerMap.get(row.provider).push(row);
    });

    // Step 3: aggregate statistics per provider
    const aggregated = Array.from(providerMap.entries()).map(
      ([provider, entries]) => {
        if (entries.length === 1) {
          const e = entries[0];
          return {
            provider,
            min: e.min,
            Q1: e.Q1,
            Median: e.Median,
            Q3: e.Q3,
            max: e.max,
            samples: e.samples,
            _sourceCount: 1
          };
        }

        const totalSamples = entries.reduce(
          (sum, e) => sum + (e.samples || 1),
          0
        );

        const overallMin = Math.min(...entries.map(e => e.min));
        const overallMax = Math.max(...entries.map(e => e.max));

        let weightedQ1 = 0;
        let weightedMedian = 0;
        let weightedQ3 = 0;

        entries.forEach((e) => {
          const weight = (e.samples || 1) / totalSamples;
          weightedQ1 += e.Q1 * weight;
          weightedMedian += e.Median * weight;
          weightedQ3 += e.Q3 * weight;
        });

        const sortedStats = [
          overallMin,
          weightedQ1,
          weightedMedian,
          weightedQ3,
          overallMax
        ].sort((a, b) => a - b);

        return {
          provider,
          min: sortedStats[0],
          Q1: sortedStats[1],
          Median: sortedStats[2],
          Q3: sortedStats[3],
          max: sortedStats[4],
          samples: totalSamples,
          _sourceCount: entries.length
        };
      }
    );

    // Sort providers by Median (descending)
    aggregated.sort((a, b) => b.Median - a.Median);

    return aggregated;
  }, [rawData, metric]);

  return { data: processedData, rawData, ...rest };
};


export { SWR_CONFIG, CACHE_TIME };
