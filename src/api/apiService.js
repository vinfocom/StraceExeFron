// src/api/apiService.js
import axios from 'axios';
import { clearProjectSessionCache } from '../utils/projectSessionCache';

const getRuntimeCsharpApiBaseUrl = () => {
  if (typeof window === "undefined") return "";
  try {
    const fromQuery = new URLSearchParams(window.location.search)
      .get("csharpApiBaseUrl")
      ?.trim();
    if (!fromQuery) return "";
    return fromQuery.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const API_BASE_URL = (() => {
  const runtimeOverride = getRuntimeCsharpApiBaseUrl();
  if (runtimeOverride) return runtimeOverride;
  return import.meta.env.DEV ? "" : (import.meta.env.VITE_CSHARP_API_URL || "");
})();

if (!import.meta.env.DEV && !API_BASE_URL) {
  console.warn(
    "VITE_CSHARP_API_URL is not defined. API requests will use relative paths, which can cause 404 errors in dev mode. " +
      "Create a .env, .env.development, or .env.development.local file with VITE_CSHARP_API_URL set to your backend URL."
  );
}


let authErrorHandler = null;
let isRedirecting = false;

export const setAuthErrorHandler = (handler) => {
  authErrorHandler = handler;
};
// yeh function is used to set a global handler for authentication errors (like 401/403). When such an error occurs, the handler will be called to, for example, redirect the user to the login page. This allows us to centralize auth error handling in one place (like AuthProvider) instead of having to handle it in every API call.


class RequestQueue {
  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(fn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority });
      this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const { fn, resolve, reject } = this.queue.shift();
    this.running++;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }

  clear() {
    this.queue = [];
  }
}

const requestQueue = new RequestQueue(4); // Max 4 concurrent requests

// ============================================
// REQUEST CACHE - Prevents duplicate in-flight requests
// ============================================
const inFlightRequests = new Map();

const dedupeRequest = async (key, fn) => {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const promise = fn().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
};

// ============================================
// AXIOS INSTANCE
// ============================================
const csharpAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for long-running operations
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
  },
});

// ============================================
// REQUEST INTERCEPTOR
// ============================================
csharpAxios.interceptors.request.use(
  (config) => {
    // Add request timestamp for performance tracking
    config.metadata = { startTime: Date.now() };

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================
// RESPONSE INTERCEPTOR
// ============================================
csharpAxios.interceptors.response.use(
  (response) => {
    // Track response time
    const duration = Date.now() - (response.config.metadata?.startTime || Date.now());
    if (duration > 5000) {
      console.warn(`Slow API: ${response.config.url} took ${duration}ms`);
    }
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(createError('Request cancelled', { isCancelled: true }));
    }

    // AbortController / fetch abort signals can appear in multiple shapes depending
    // on Axios version and browser. Check all known patterns.
    const isBrowserAbort =
      error.name === 'CanceledError' ||      // Axios v1+ wraps AbortController as this
      error.name === 'AbortError' ||          // native DOMException
      error.code === 'ERR_CANCELED' ||        // Axios v1+ code
      (error instanceof DOMException && error.name === 'AbortError') ||
      error.message === 'canceled' ||         // Axios v0 CancelToken message
      error.message === 'Request cancelled';  // our own createError

    if (isBrowserAbort) {
      return Promise.reject(createError('Request cancelled', { isCancelled: true }));
    }

    if (!error.response) {
      // If there is no `error.request` the error happened before the request
      // left the browser (e.g. bad URL, missing CORS preflight). Only in that
      // case do we show a user-facing network error.
      if (!error.request) {
        return Promise.reject(createError(error.message || 'Request setup failed', { isNetworkError: true }));
      }
      // The request WAS sent but no response arrived. Could be: server down,
      // network cut, or a race-condition abort that slipped past the checks above.
      // Treat as a soft network error (warn, not error) so it doesn't pollute
      // the console when it's just a cancelled in-flight request.
      console.warn('[apiService] No response received for request to:', error.config?.url ?? 'unknown');
      return Promise.reject(createError('No response from server. Please check your connection.', { isNetworkError: true }));
    }

    const { status, data, config } = error.response;

    if ((status === 401 || status === 403) && !isAuthorizationScopeError(status, data)) {
      handleAuthError(config);
      return Promise.reject(
        createError('Session expired. Please login again.', {
          isAuthError: true,
          status
        })
      );
    }

    return Promise.reject(
      createError(`HTTP ${status}: ${extractErrorMessage(data)}`, {
        status,
        data
      })
    );
  }
);

// ============================================
// HELPER FUNCTIONS
// ============================================
const createError = (message, props = {}) => {
  const error = new Error(message);
  Object.assign(error, props);
  return error;
};

const extractErrorMessage = (data) => {
  if (!data) return 'Unknown error';
  if (typeof data === 'string') return data;
  return data.message || data.Message || data.error || data.detail || data.title || 'Request failed';
};

const isAuthorizationScopeError = (status, data) => {
  if (status !== 401 && status !== 403) return false;
  const msg = extractErrorMessage(data).toLowerCase();
  return (
    msg.includes('invalid company') ||
    msg.includes('unable to resolve company context') ||
    msg.includes('forbidden')
  );
};

const handleAuthError = (config) => {
  if (config?.skipAuthRedirect) return;
  const isAuthEndpoint = config?.url?.includes('/auth/');
  if (isRedirecting || isAuthEndpoint) return;

  sessionStorage.removeItem('user');
  clearProjectSessionCache();

  isRedirecting = true;

  if (authErrorHandler) {
    try {
      authErrorHandler();
    } catch {
      redirectToLogin();
    }
  } else {
    redirectToLogin();
  }

  setTimeout(() => { isRedirecting = false; }, 1000);
};

const redirectToLogin = () => {
  const currentPath = window.location.pathname;
  if (currentPath !== '/login') {
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    window.location.href = '/login';
  }
};

// ============================================
// API SERVICE WITH QUEUE
// ============================================
// src/api/apiService.js

const apiService = async (endpoint, options = {}) => {
  const { priority = 0, dedupe = true, ...axiosOptions } = options;

  const makeRequest = async () => {
    const response = await csharpAxios({ url: endpoint, ...axiosOptions });
    return response.status === 204 ? null : response.data;
  };

  if (priority === 0) {
    // FIX: Create a unique key that includes parameters/data
    // This prevents "Network Logs" from sharing a promise with "Neighbors"
    const cacheKey = JSON.stringify({
      method: axiosOptions.method || 'GET',
      endpoint,
      params: axiosOptions.params,
      data: axiosOptions.data
    });

    if (dedupe) {
      return dedupeRequest(cacheKey, () => requestQueue.add(makeRequest, priority));
    }

    return requestQueue.add(makeRequest, priority);
  }

  return makeRequest();
};

// ============================================
// EXPORTED API METHODS
// ============================================
export const api = {
  get: (endpoint, options = {}) =>
    apiService(endpoint, { ...options, method: 'GET' }),

  post: (endpoint, body, options = {}) =>
    apiService(endpoint, { ...options, method: 'POST', data: body }),

  put: (endpoint, body, options = {}) =>
    apiService(endpoint, { ...options, method: 'PUT', data: body }),

  patch: (endpoint, body, options = {}) =>
    apiService(endpoint, { ...options, method: 'PATCH', data: body }),

  delete: (endpoint, options = {}) =>
    apiService(endpoint, { ...options, method: 'DELETE' }),

  upload: (endpoint, formData, options = {}) =>
    apiService(endpoint, {
      ...options,
      method: 'POST',
      data: formData,
      timeout: 120000,
      priority: 1 // High priority
    }),

  // Priority request - bypasses queue
  getPriority: (endpoint, options = {}) =>
    apiService(endpoint, { ...options, method: 'GET', priority: 10 }),
};

// ============================================
// UTILITY EXPORTS
// ============================================
export const CSHARP_BASE_URL = API_BASE_URL;
export const csharpAxiosInstance = csharpAxios;

export const isAuthError = (error) => error?.isAuthError === true;
export const isNetworkError = (error) => error?.isNetworkError === true;
export const isCancelledError = (error) => error?.isCancelled === true;

export const cancelAllRequests = () => {
  requestQueue.clear();
  inFlightRequests.clear();
};

export default api;
