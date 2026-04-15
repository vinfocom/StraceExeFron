// src/api/pythonApiService.js
import axios from 'axios';

const isElectronRuntime =
  typeof navigator !== "undefined" &&
  /electron/i.test(navigator.userAgent || "");

const getRuntimePythonBaseUrl = () => {
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
        "http://127.0.0.1:8080"
      )
    : (import.meta.env.VITE_PYTHON_API_URL || "http://127.0.0.1:8080")
)
  .trim()
  .replace(/\/+$/, "");

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
  baseURL: PYTHON_BASE_URL,
  timeout: 300000, // 5 minutes default
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor
 */
pythonAxios.interceptors.request.use(
  (config) => {
    console.log(`🚀 Python API Request: ${config.method?.toUpperCase()} ${config.url}`);
    
    // Handle FormData
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Python API Request Error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 */
pythonAxios.interceptors.response.use(
  (response) => {
    console.log(`✅ Python API Response: ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      console.error(`❌ Python API Error [${status}]:`, data);
      
      const errorMessage = 
        data?.error || 
        data?.message || 
        data?.Message || 
        error.message || 
        'Unknown error occurred';
      
      error.message = `Python API error! Status: ${status} - ${errorMessage}`;
    } else if (error.request) {
      console.error('❌ Python API No Response:', error.request);
      error.message = 'No response from Python backend. Server may be down.';
    } else {
      console.error('❌ Python API Request Setup Error:', error.message);
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
    console.error(`Python API call to ${endpoint} failed:`, error.message);
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
