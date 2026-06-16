// src/api/pythonApiService.js
import axios from 'axios';

const isElectronRuntime =
  typeof navigator !== "undefined" &&
  /electron/i.test(navigator.userAgent || "");

const getRuntimePythonBaseUrl = () => {
  if (!isElectronRuntime) return "";
  if (typeof window === "undefined") return "";

  try {
    const queryValue = new URLSearchParams(window.location.search).get(
      "pythonApiBaseUrl",
    );
    return String(queryValue || "").trim();
  } catch {
    return "";
  }
};

const PYTHON_BASE_URL = String(
  isElectronRuntime
    ? (
        getRuntimePythonBaseUrl() ||
        import.meta.env.VITE_ELECTRON_PYTHON_API_URL ||
        "http://127.0.0.1:8081"
      )
    : (import.meta.env.VITE_PYTHON_API_URL || "http://127.0.0.1:8081")
)
  .trim()
  .replace(/\/+$/, "");

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
    const candidates = [];
    const explicitHost = (import.meta.env.VITE_ELECTRON_PYTHON_API_HOST || "127.0.0.1").trim();
    const explicitPort = Number(
      String(import.meta.env.VITE_ELECTRON_PYTHON_API_PORT || "").trim()
    );

    if (Number.isFinite(explicitPort) && explicitPort > 0) {
      candidates.push(`http://${explicitHost}:${explicitPort}`);
    }

    for (let port = 8081; port <= 8105; port += 1) {
      candidates.push(`http://127.0.0.1:${port}`);
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
    
    // Handle FormData
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
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
      if (!originalConfig.__portAutoRetried) {
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

      error.message = `No response from Python backend. Tried base URL: ${activePythonBaseUrl}`;
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
