// src/api/pythonApiService.js
import axios from 'axios';

const DEFAULT_PYTHON_API_URL = "https://stracerservices.vinfocom.co.in";

const isElectronRuntime =
  typeof navigator !== "undefined" &&
  /electron/i.test(navigator.userAgent || "");

const isProductionBuild = Boolean(import.meta.env.PROD);

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/^=+/, "")
    .trim()
    .replace(/\/+$/, "");

const getRuntimePythonBaseUrl = () => {
  if (typeof window === "undefined") return "";

  try {
    const queryValue = new URLSearchParams(window.location.search).get(
      "pythonApiBaseUrl",
    );
    const runtimeConfigValue =
      window.__STRACER_CONFIG__?.PYTHON_API_URL ||
      window.__STRACER_CONFIG__?.pythonApiUrl ||
      window.__APP_CONFIG__?.PYTHON_API_URL ||
      window.__APP_CONFIG__?.pythonApiUrl;

    return normalizeBaseUrl(queryValue || runtimeConfigValue);
  } catch {
    return "";
  }
};

const getConfiguredPythonBaseUrl = () => {
  const runtimeBaseUrl = getRuntimePythonBaseUrl();
  if (runtimeBaseUrl) return runtimeBaseUrl;

  const envBaseUrl = isElectronRuntime
    ? import.meta.env.VITE_ELECTRON_PYTHON_API_URL || import.meta.env.VITE_PYTHON_API_URL
    : import.meta.env.VITE_PYTHON_API_URL;
  if (envBaseUrl) return normalizeBaseUrl(envBaseUrl);

  return DEFAULT_PYTHON_API_URL;
};

const PYTHON_BASE_URL = getConfiguredPythonBaseUrl();

let activePythonBaseUrl = PYTHON_BASE_URL;
let discoveryPromise = null;
const isVerboseApiLoggingEnabled =
  String(import.meta.env.VITE_ENABLE_API_LOGS || "").toLowerCase() === "true";

const logApiDebug = (...args) => {
  if (isVerboseApiLoggingEnabled) console.log(...args);
};

const logApiWarn = (...args) => {
  if (isVerboseApiLoggingEnabled) console.warn(...args);
};

const logApiError = (...args) => {
  if (isVerboseApiLoggingEnabled) console.error(...args);
};

const AXIOS_CONFIG_KEYS = new Set([
  'headers',
  'timeout',
  'signal',
  'cancelToken',
  'responseType',
  'withCredentials',
  'onUploadProgress',
  'onDownloadProgress',
  'auth',
  'validateStatus',
  'maxBodyLength',
  'maxContentLength',
  'adapter',
  'transformRequest',
  'transformResponse',
  'paramsSerializer',
  'baseURL',
]);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const looksLikeAxiosConfig = (value) => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.some((key) => AXIOS_CONFIG_KEYS.has(key));
};

const isBlank = (value) => value === undefined || value === null || value === '';

const isPlainRequestBody = (value) =>
  isPlainObject(value) &&
  !(typeof Blob !== 'undefined' && value instanceof Blob) &&
  !(typeof File !== 'undefined' && value instanceof File);

const DEFAULT_PYTHON_REGION = 'india';

/**
 * Resolve the active region from the signed-in user's session, so every
 * Python request carries region context even when the caller didn't pass one.
 */
const getStoredUserRegion = () => {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return '';
  }

  try {
    const raw = window.sessionStorage.getItem('user');
    if (!raw) return '';

    const user = JSON.parse(raw);
    const rawValue =
      user?.country_code ??
      user?.countryCode ??
      user?.country ??
      user?.source_db ??
      user?.sourceDb;

    const normalized = String(rawValue || '').trim().toLowerCase();
    if (!normalized) return '';
    if (['tw', 'twn', 'taiwan'].includes(normalized)) return 'taiwan';
    if (['in', 'ind', 'india'].includes(normalized)) return 'india';
    return normalized;
  } catch {
    return '';
  }
};

const resolveRequestRegion = () => getStoredUserRegion() || DEFAULT_PYTHON_REGION;

/**
 * Create axios instance for Python backend
 */
const pythonAxios = axios.create({
  baseURL: activePythonBaseUrl,
  timeout: 300000, // 5 minutes default
  headers: {
    'Content-Type': 'application/json',
  },
});

const setPythonBaseUrl = (nextBaseUrl) => {
  const normalized = String(nextBaseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return;
  activePythonBaseUrl = normalized;
  pythonAxios.defaults.baseURL = normalized;
};

const discoverPythonBaseUrl = async () => {
  if (discoveryPromise) return discoveryPromise;

  discoveryPromise = (async () => {
    if (!isElectronRuntime || isProductionBuild) return "";

    const candidates = [
      normalizeBaseUrl(import.meta.env.VITE_ELECTRON_PYTHON_API_URL),
      normalizeBaseUrl(import.meta.env.VITE_PYTHON_API_URL),
    ].filter(Boolean);
    const explicitHost = String(import.meta.env.VITE_ELECTRON_PYTHON_API_HOST || "").trim();
    const explicitPort = Number(
      String(import.meta.env.VITE_ELECTRON_PYTHON_API_PORT || "").trim()
    );

    if (explicitHost && Number.isFinite(explicitPort) && explicitPort > 0) {
      candidates.push(`http://${explicitHost}:${explicitPort}`);
    }

    const uniqueCandidates = [...new Set(candidates)];
    for (const baseUrl of uniqueCandidates) {
      try {
        await axios.get(`${baseUrl}/health`, { timeout: 1200 });
        return baseUrl;
      } catch {
        // continue probing
      }
    }

    return "";
  })();

  try {
    const found = await discoveryPromise;
    return found;
  } finally {
    discoveryPromise = null;
  }
};

/**
 * Request Interceptor
 */
pythonAxios.interceptors.request.use(
  (config) => {
    logApiDebug(`Python API Request: ${config.method?.toUpperCase()} ${config.url}`);

    const method = String(config.method || 'get').toLowerCase();
    const region = resolveRequestRegion();

    // Handle FormData
    if (config.data instanceof FormData) {
      if (!config.data.has('region')) {
        config.data.append('region', region);
      }
      delete config.headers['Content-Type'];
    } else if (isPlainRequestBody(config.data)) {
      if (isBlank(config.data.region)) {
        config.data.region = region;
      }
    } else if (['post', 'put', 'patch'].includes(method) && config.data === undefined) {
      config.data = { region };
    }

    // GET/DELETE requests carry region as a query param instead of a body
    if (method === 'get' || method === 'delete') {
      if (!config.params) config.params = {};
      if (isBlank(config.params.region)) {
        config.params.region = region;
      }
    }

    return config;
  },
  (error) => {
    logApiError('Python API Request Error:', error?.message || error);
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 */
pythonAxios.interceptors.response.use(
  (response) => {
    logApiDebug(`Python API Response: ${response.config.url}`);
    return response;
  },
  async (error) => {
    if (error.response) {
      const { status, data } = error.response;
      logApiWarn(`Python API Error [${status}]:`, data?.message || data?.Message || data?.error || error.message);
      
      const errorMessage = 
        data?.error || 
        data?.message || 
        data?.Message || 
        error.message || 
        'Unknown error occurred';
      
      error.message = `Python API error! Status: ${status} - ${errorMessage}`;
    } else if (error.request) {
      logApiWarn('Python API No Response:', error.config?.url || activePythonBaseUrl);
      const originalConfig = error.config || {};
      if (activePythonBaseUrl && !originalConfig.__portAutoRetried) {
        const discoveredBaseUrl = await discoverPythonBaseUrl();
        if (discoveredBaseUrl) {
          setPythonBaseUrl(discoveredBaseUrl);
          logApiDebug(`Auto-detected Python backend at ${discoveredBaseUrl}`);
          return pythonAxios({
            ...originalConfig,
            __portAutoRetried: true,
          });
        }
      }

      error.message = activePythonBaseUrl
        ? `No response from Python backend. Tried base URL: ${activePythonBaseUrl}`
        : 'Python API URL is not configured. Set VITE_PYTHON_API_URL or provide pythonApiBaseUrl in the runtime config.';
    } else {
      logApiError('Python API Request Setup Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

/**
 * Python API Service - Fixed to properly handle config
 */
const pythonApiService = async (endpoint, options = {}) => {
  try {
    // Extract only valid axios config options
    const { method = 'GET', data, params, headers, timeout, ...rest } = options;
    
    const config = {
      url: endpoint,
      method,
      ...(data && { data }),
      ...(params && { params }),
      ...(headers && { headers }),
      ...(timeout && { timeout }),
      ...rest,
    };
    
    const response = await pythonAxios(config);
    
    if (response.status === 204) {
      return null;
    }
    
    return response.data;
  } catch (error) {
    logApiError(`Python API call to ${endpoint} failed:`, error.message);
    throw error;
  }
};

/**
 * Exported Python API methods
 */
export const pythonApi = {
  get: (endpoint, paramsOrOptions = {}, options = {}) => {
    if (looksLikeAxiosConfig(paramsOrOptions) && Object.keys(options).length === 0) {
      return pythonApiService(endpoint, {
        method: 'GET',
        ...paramsOrOptions,
      });
    }

    return pythonApiService(endpoint, {
      method: 'GET',
      params: paramsOrOptions,
      ...options,
    });
  },
  
  post: (endpoint, body, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'POST', 
      data: body,
      ...options 
    }),
  
  put: (endpoint, body, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'PUT', 
      data: body,
      ...options 
    }),
  
  delete: (endpoint, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'DELETE',
      ...options 
    }),
};

export const PYTHON_BASE_URL_EXPORT = PYTHON_BASE_URL;
export const pythonAxiosInstance = pythonAxios;
