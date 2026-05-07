// src/api/apiEndpoints.js
import { CleaningServices } from "@mui/icons-material";
import { api } from "./apiService"; // C# Backend
import { pythonApi, PYTHON_BASE_URL_EXPORT } from "./pythonApiService"; // Python Backend
import axios from "axios";
import { isCancelledError } from './apiService'; // Import the utility

const isRequestCancelled = (error) => {
  if (!error) return false;
  return (
    error.isCancelled === true ||
    error.name === 'AbortError' ||
    error.name === 'CanceledError' ||
    error.code === 'ERR_CANCELED' ||
    error.message?.toLowerCase().includes('cancel') ||
    error.message?.toLowerCase().includes('abort')
  );
};

const isUnifiedMapDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  try {
    const query = new URLSearchParams(window.location.search)
      .get("debugMap")
      ?.toLowerCase();
    const local = (
      window.localStorage.getItem("debug.unifiedMap") || ""
    ).toLowerCase();
    return query === "1" || query === "true" || local === "1" || local === "true";
  } catch {
    return false;
  }
};

const debugUnifiedMapApi = (event, payload = {}) => {
  if (!isUnifiedMapDebugEnabled()) return;
  console.log(`[UnifiedMapApi] ${event}`, payload);
};

const triggerBrowserDownload = (blob, filename) => {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename || "download";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

const downloadUrlAsBlob = async (url, filename) => {
  const response = await axios.get(url, {
    responseType: "blob",
    withCredentials: true,
  });
  const blob = response?.data instanceof Blob
    ? response.data
    : new Blob([response?.data ?? ""]);
  triggerBrowserDownload(blob, filename);
  return { success: true };
};

export const generalApi = {
  healthCheck: async () => {
    try {
      return await pythonApi.get("/health");
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) {
        try {
          // Some Python deployments expose `/` instead of `/health`.
          return await pythonApi.get("/");
        } catch (fallbackError) {
          console.error("Python backend fallback health check failed:", fallbackError);
          throw fallbackError;
        }
      }
      console.error("Python backend health check failed:", error);
      throw error;
    }
  },

  getInfo: async () => {
    try {
      return await pythonApi.get("/");
    } catch (error) {
      console.error("API Info Error:", error);
      throw error;
    }
  },
};

export const dataDeletionApi = {
  sendOtp: async ({ phoneNumber }) => {
    try {
      return await api.post(
        "/api/data-deletion/send-otp",
        { phone_number: phoneNumber },
        {
          skipAuthRedirect: true,
          dedupe: false,
        },
      );
    } catch (error) {
      console.error("Data deletion send OTP error:", error);
      throw error;
    }
  },

  verifyOtp: async ({ phoneNumber, otp }) => {
    try {
      return await api.post(
        "/api/data-deletion/verify-otp",
        {
          phone_number: phoneNumber,
          otp,
        },
        {
          skipAuthRedirect: true,
          dedupe: false,
        },
      );
    } catch (error) {
      console.error("Data deletion verify OTP error:", error);
      throw error;
    }
  },

  getPreview: async ({ deletionToken }) => {
    try {
      return await api.get("/api/data-deletion/data-preview", {
        headers: {
          Authorization: `Bearer ${String(deletionToken || "").trim()}`,
        },
        skipAuthRedirect: true,
        dedupe: false,
      });
    } catch (error) {
      console.error("Data deletion preview error:", error);
      throw error;
    }
  },

  requestDeletion: async ({ deletionToken, confirmPermanentDeletion = true }) => {
    try {
      return await api.post(
        "/api/data-deletion/request-deletion",
        {
          deletion_token: String(deletionToken || "").trim(),
          confirm_permanent_deletion: Boolean(confirmPermanentDeletion),
        },
        {
          headers: {
            Authorization: `Bearer ${String(deletionToken || "").trim()}`,
          },
          skipAuthRedirect: true,
          dedupe: false,
        },
      );
    } catch (error) {
      console.error("Data deletion request error:", error);
      throw error;
    }
  },
};

export const buildingApi = {
  generateBuildings: async (polygonData) => {
    try {
      return await pythonApi.post("/api/buildings/generate", polygonData);
    } catch (error) {
      console.error("Building API Error:", error);
      throw error;
    }
  },

  saveBuildingsWithProject: async (data) => {
    try {
      return await pythonApi.post("/api/buildings/save", data);
    } catch (error) {
      console.error("Save buildings error:", error);
      throw error;
    }
  },

  getProjectBuildings: async (projectId) => {
    try {
      return await pythonApi.get(`/api/buildings/project/${projectId}`);
    } catch (error) {
      console.error("Get project buildings error:", error);
      throw error;
    }
  },

  healthCheck: async () => {
    try {
      return await pythonApi.get("/api/buildings/health");
    } catch (error) {
      console.error("Building service health check failed:", error);
      throw error;
    }
  },
};

export const cellSiteApi = {
  /**
   * Verify project exists
   */

  checkSiteData: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/cell-site/site-noml/${projectId}`
      );

      const count = response?.count || response?.data?.length || 0;

      return {
        exists: count > 0,
        count: count,
        data: response,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false, count: 0 };
      }
      console.error(" Check site data error:", error);
      return { exists: false, count: 0, error: error.message };
    }
  },
  verifyProject: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/cell-site/verify-project/${projectId}`
      );
      return response;
    } catch (error) {
      console.error("Project verification failed:", error);
      throw error;
    }
  },

  /**
   * Upload site file with progress tracking
   */
  uploadSite: async (formData, onUploadProgress = null) => {
    try {



      const response = await pythonApi.post("/api/process-and-save", formData, {
        timeout: 300000, // 5 minutes
        onUploadProgress:
          onUploadProgress ||
          ((progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }),
      });

      return response;
    } catch (error) {
      console.error(" Cell Site upload error:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Upload timed out. File may be too large.");
      }

      throw error;
    }
  },

  uploadSitePredictionCsv: async (formData, onUploadProgress = null) => {
    try {
      const response = await api.post("/api/MapView/UploadSitePredictionCsv", formData, {
        timeout: 300000,
        onUploadProgress:
          onUploadProgress ||
          ((progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }),
      });

      return response;
    } catch (error) {
      console.error(" Site prediction upload error:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Upload timed out. File may be too large.");
      }

      throw error;
    }
  },


  uploadSessions: async (payload) => {
    try {

      const response = await pythonApi.post(
        "/api/cell-site/process-session",
        payload,
        {
          timeout: 300000, // 5 minutes
        }
      );

      return response;
    } catch (error) {
      console.error(" Session upload error:", error);
      throw error;
    }
  },

  /**
   * Get site data by project with cancellation support
   */
  siteNoml: async (projectId, cancelToken = null) => {
    try {

      const config = {
        timeout: 30000, // 30 seconds
      };

      if (cancelToken) {
        config.cancelToken = cancelToken;
      }

      const response = await pythonApi.get(
        `/api/cell-site/site-noml/${projectId}`,
        config
      );


      return response;
    } catch (error) {
      // Handle cancellation
      if (axios.isCancel(error)) {
        return null;
      }

      console.error(" siteNoml error:", error);

      // Return empty data for 404
      if (error.response?.status === 404) {
        console.warn(` No site data found for project ${projectId}`);
        return {
          success: true,
          project_id: projectId,
          count: 0,
          data: [],
          message: "No site data found",
        };
      }

      throw error;
    }
  },

  /**
   * Update project ID
   */
  updateProjectId: async (filename, projectId) => {
    try {

      const response = await pythonApi.post(
        "/api/cell-site/update-project-id",
        {
          filename: filename,
          project_id: projectId,
        }
      );

      return response;
    } catch (error) {
      console.error(" Update project ID error:", error);
      throw error;
    }
  },

  /**
   * Get project cell sites
   */
  getProjectCellSites: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/cell-site/project/${projectId}`
      );
      return response;
    } catch (error) {
      console.error(" Get project cell sites error:", error);
      throw error;
    }
  },

  /**
   * Download file without opening a new Electron window.
   */
  downloadFile: (outputDir, filename) => {
    const baseUrl =
      import.meta.env.VITE_PYTHON_API_URL || "http://localhost:8080";
    const url = `${baseUrl}/api/cell-site/download/${outputDir}/${filename}`;
    return downloadUrlAsBlob(url, filename);
  },

  /**
   * Download file as blob using axios
   */
  downloadFileBlob: async (outputDir, filename) => {
    try {

      const response = await pythonApi.get(
        `/api/cell-site/download/${outputDir}/${filename}`,
        {
          responseType: "blob", // Important for file downloads
        }
      );

      const blob = new Blob([response]);
      triggerBrowserDownload(blob, filename);

      return blob;
    } catch (error) {
      console.error("Download error:", error);
      throw error;
    }
  },

  /**
   * List output files
   */
  listOutputs: async (outputDir) => {
    try {
      return await pythonApi.get(`/api/cell-site/outputs/${outputDir}`);
    } catch (error) {
      console.error("List outputs error:", error);
      throw error;
    }
  },

  /**
   * Health check
   */
  healthCheck: async () => {
    try {
      return await pythonApi.get("/api/cell-site/health");
    } catch (error) {
      console.error("Cell Site health check failed:", error);
      throw error;
    }
  },
};

export const areaBreakdownApi = {
  getAreaBreakdown: (params) => {
    const response = pythonApi.post("/api/area-breakup/process", params);
    return response;
  },

  getAreaPolygons: (projectId, config = {}) =>
    pythonApi.get(`/api/area-breakup/fetch/${projectId}`, config),
};

export const predictionApi = {
  runPrediction: async (params) => {
    try {


      if (!params.Project_id) {
        throw new Error("Project_id is required");
      }
      if (
        !params.Session_ids ||
        !Array.isArray(params.Session_ids) ||
        params.Session_ids.length === 0
      ) {
        throw new Error("Session_ids array is required and must not be empty");
      }

      const payload = {
        Project_id: params.Project_id,
        Session_ids: params.Session_ids,
        indoor_mode: params.indoor_mode || "heuristic",
        grid: params.grid || 10.0,
      };

      const response = await pythonApi.post("/api/prediction/run", payload, {
        timeout: 600000, // 10 minutes
      });

      return response;
    } catch (error) {
      console.error(" Prediction pipeline error:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Prediction timed out. The dataset may be too large.");
      }

      if (error.response?.data?.detail) {
        throw new Error(`Prediction failed: ${error.response.data.detail}`);
      }

      throw error;
    }
  },

  runLtePrediction: async (params) => {
    try {
      if (!params.project_id) throw new Error("project_id is required");
      if (!params.user_id) throw new Error("user_id is required");
      if (!params.session_ids || !Array.isArray(params.session_ids) || params.session_ids.length === 0) {
        throw new Error("session_ids array is required and must not be empty");
      }

      const payload = {
        user_id: params.user_id,
        project_id: params.project_id,
        session_ids: params.session_ids,
        grid_value: params.grid_value ?? 25.0,
        radius_m: params.radius_m ?? 5000.0,
        building: params.building ?? true
      };

      if (Array.isArray(params.polygon_area) && params.polygon_area.length >= 3) {
        payload.polygon_area = params.polygon_area;
      }

      const response = await pythonApi.post("/api/lte-prediction/run", payload, {
        timeout: 600000, // 10 minutes
      });
      return response;
    } catch (error) {
      console.error("LTE Prediction run error:", error);
      if (error.code === "ECONNABORTED") {
        throw new Error("LTE Prediction timed out.");
      }
      if (error.response?.data?.detail) {
        throw new Error(`LTE Prediction failed: ${error.response.data.detail}`);
      }
      throw error;
    }
  },

  runLteOptimisedPrediction: async (params) => {
    try {
      if (!params.project_id) throw new Error("project_id is required");
      if (!params.user_id) throw new Error("user_id is required");

      const payload = {
        user_id: params.user_id,
        project_id: params.project_id,
        radius: params.radius ?? 5000.0,
        grid_resolution: params.grid_resolution ?? 25.0,
      };

      const response = await pythonApi.post("/api/lte-prediction-optimised/run", payload, {
        timeout: 600000,
      });
      return response;
    } catch (error) {
      console.error("LTE Optimised Prediction run error:", error);
      if (error.code === "ECONNABORTED") {
        throw new Error("LTE Optimised Prediction timed out.");
      }
      if (error.response?.data?.detail) {
        throw new Error(`LTE Optimised Prediction failed: ${error.response.data.detail}`);
      }
      if (error.response?.data?.error) {
        throw new Error(`LTE Optimised Prediction failed: ${error.response.data.error}`);
      }
      throw error;
    }
  },

  runLteTiltRecommendation: async (params) => {
    try {
      if (!params.project_id) throw new Error("project_id is required");

      const payload = {
        project_id: params.project_id,
      };

      const operator = String(params.operator || "").trim();
      if (operator && operator.toLowerCase() !== "all") {
        payload.operator = operator;
      }

      if (Array.isArray(params.session_ids) && params.session_ids.length > 0) {
        payload.session_ids = params.session_ids
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0);
      }

      if (params.rsrp !== undefined && params.rsrp !== null && params.rsrp !== "") {
        payload.rsrp = Number(params.rsrp);
      }
      if (params.rsrq !== undefined && params.rsrq !== null && params.rsrq !== "") {
        payload.rsrq = Number(params.rsrq);
      }
      if (params.sinr !== undefined && params.sinr !== null && params.sinr !== "") {
        payload.sinr = Number(params.sinr);
      }

      return await pythonApi.post("/api/lte-tilt-recommendation/optimize", payload, {
        timeout: 600000,
      });
    } catch (error) {
      console.error("LTE tilt recommendation run error:", error);
      if (error.code === "ECONNABORTED") {
        throw new Error("LTE tilt recommendation timed out.");
      }
      throw error;
    }
  },

  getLteTiltRecommendationStatus: async (jobId) => {
    try {
      if (!jobId) throw new Error("jobId is required");
      return await pythonApi.get(`/api/lte-tilt-recommendation/status/${jobId}`);
    } catch (error) {
      console.error("LTE tilt recommendation status error:", error);
      throw error;
    }
  },

  getLteTiltRecommendationDownloadUrl: (filePath) => {
    if (!filePath) return "";
    return `${PYTHON_BASE_URL_EXPORT}/api/lte-tilt-recommendation/download?file=${encodeURIComponent(filePath)}`;
  },

  downloadLteTiltRecommendation: (filePath) => {
    if (!filePath) return Promise.resolve({ success: false });
    const url = `${PYTHON_BASE_URL_EXPORT}/api/lte-tilt-recommendation/download?file=${encodeURIComponent(filePath)}`;
    const filename = String(filePath).split(/[\\/]/).pop() || "lte_tilt_recommendation.csv";
    return downloadUrlAsBlob(url, filename);
  },

  getLtePredictionStatus: async (jobId) => {
    try {
      if (!jobId) throw new Error("jobId is required");
      return await pythonApi.get(`/api/lte-prediction/status/${jobId}`);
    } catch (error) {
      console.error("LTE Prediction status error:", error);
      throw error;
    }
  },

  getLteOptimisedPredictionStatus: async (jobId) => {
    try {
      if (!jobId) throw new Error("jobId is required");
      return await pythonApi.get(`/api/lte-prediction-optimised/status/${jobId}`);
    } catch (error) {
      console.error("LTE Optimised Prediction status error:", error);
      throw error;
    }
  },

  getLtePredictionResult: async (jobId) => {
    try {
      if (!jobId) throw new Error("jobId is required");
      return await pythonApi.get(`/api/lte-prediction/result/${jobId}`);
    } catch (error) {
      console.error("LTE Prediction result error:", error);
      throw error;
    }
  },


  debugDatabase: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/prediction/debug-db/${projectId}`
      );
      return response;
    } catch (error) {
      console.error(" Debug database error:", error);
      throw error;
    }
  },


  verifySiteData: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/prediction/debug-db/${projectId}`
      );

      const result = {
        hasData: (response?.site_noMl_count || 0) > 0,
        count: response?.site_noMl_count || 0,
        projectExists: response?.project_exists === "YES",
        tables: response?.all_tables || [],
        details: response,
      };

      return result;
    } catch (error) {
      console.error(" Verify site data error:", error);
      return {
        hasData: false,
        count: 0,
        projectExists: false,
        error: error.message,
      };
    }
  },


  waitForSiteData: async (projectId, maxRetries = 5, delayMs = 2000) => {


    for (let attempt = 1; attempt <= maxRetries; attempt++) {

      try {
        const result = await predictionApi.verifySiteData(projectId);

        if (result.hasData && result.count > 0) {

          return {
            success: true,
            count: result.count,
            attempts: attempt,
            details: result,
          };
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(` Attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    console.error(" Site data not available after all retries");
    return {
      success: false,
      count: 0,
      attempts: maxRetries,
      error: "Site data not found after retries",
    };
  },

  /**
   * Health check for prediction service
   */
  healthCheck: async () => {
    try {
      return await pythonApi.get("/api/prediction/health");
    } catch (error) {
      console.error("Prediction service health check failed:", error);
      throw error;
    }
  },
};

export const reportApi = {
  generateReport: (payload) =>
    pythonApi.post("/api/report/generate", payload, { timeout: 600000 }),
  getReportStatus: (reportId) =>
    pythonApi.get(`/api/report/status/${reportId}`, { timeout: 120000 }),
  downloadReport: (reportId) =>
    pythonApi.get(`/api/report/download/${reportId}`, {
      responseType: 'blob',
      timeout: 600000,
    }),
};

export const authApi = {
  checkStatus: () => api.get("/api/auth/status"),
};

export const adminApi = {
  getReactDashboardData: () => api.get("/Admin/GetReactDashboardData"),
  getDashboardGraphData: () => api.get("/Admin/GetDashboardGraphData"),
  getIndoorCount: () => api.get("/Admin/IndoorCount"),
  getOutdoorCount: () => api.get("/Admin/OutdoorCount"),
  getAllUsers: (filters) => api.post("/Admin/GetAllUsers", filters),

  getAppValue: (startDate, endDate) => {
    const params = {};
    if (startDate) params.from = startDate;
    if (endDate) params.to = endDate;
    return api.get("/Admin/AppQualityFlatV2", { params });
  },

  getHoles: () => api.get("/Admin/holes"),
  getBoxData: (metric, params = {}) =>
    api.get("/Admin/box-plot/operators", {
      params: { metric, ...params },
    }),
  getIndoorOutdoor: (params = {}) =>
    api.get("/Admin/operator-indoor-outdoor-avg", { params }),

  getNetworkDurations: async (startDate, endDate) => {
    const formatDateLocal = (d) => {
      if (!d) return null;
      const dateObj = new Date(d);
      if (isNaN(dateObj)) return null;
      return dateObj.toISOString().split("T")[0];
    };

    const from = formatDateLocal(startDate);
    const to = formatDateLocal(endDate);

    if (!from || !to) throw new Error("Invalid date range");

    try {
      const response = await api.get("/Admin/GetNetworkDurations", {
        params: { fromDate: from, toDate: to },
      });
      return response;
    } catch (err) {
      console.error(" Network durations error:", err);
      throw err;
    }
  },

  getFilteredLocations: async (payload) => {
    try {
      const response = await api.get("/Admin/GetNetworkDurations", payload);
      return response.data;
    } catch (error) {
      console.error("Error fetching filtered locations:", error);
      throw error;
    }
  },

  getUsers: (params) => api.get("/Admin/GetUsers", { params }),
  getOnlineUsers: () => api.get("/Admin/GetOnlineUsers"),

  getOperatorCoverageRanking: ({ min, max, from, to } = {}) =>
    api.get("/Admin/GetOperatorCoverageRanking", { params: { min, max, from, to } }),

  getOperatorQualityRanking: ({ min, max, from, to } = {}) =>
    api.get("/Admin/GetOperatorQualityRanking", { params: { min, max, from, to } }),

  getUserById: (userId) => {
    const formData = new FormData();
    formData.append("UserID", userId);
    formData.append("token", "");
    return api.post("/Admin/GetUser", formData);
  },

  getTotalsV2: () => api.get("/Admin/TotalsV2"),
  getMonthlySamplesV2: (params) =>
    api.get("/Admin/MonthlySamplesV2", { params }),
  getOperatorSamplesV2: (params) =>
    api.get("/Admin/OperatorSamplesV2", { params }),
  getNetworkTypeDistributionV2: (params) =>
    api.get("/Admin/NetworkTypeDistributionV2", { params }),
  getAvgRsrpV2: (params) => api.get("/Admin/AvgRsrpV2", { params }),
  getAvgRsrqV2: (params) => api.get("/Admin/AvgRsrqV2", { params }),
  getAvgSinrV2: (params) => api.get("/Admin/AvgSinrV2", { params }),
  getAvgMosV2: (params) => api.get("/Admin/AvgMosV2", { params }),
  getAvgJitterV2: (params) => api.get("/Admin/AvgJitterV2", { params }),
  getAvgLatencyV2: (params) => api.get("/Admin/AvgLatencyV2", { params }),
  getAvgPacketLossV2: (params) => api.get("/Admin/AvgPacketLossV2", { params }),
  getAvgDlTptV2: (params) => api.get("/Admin/AvgDlTptV2", { params }),
  getAvgUlTptV2: (params) => api.get("/Admin/AvgUlTptV2", { params }),
  getBandDistributionV2: (params) =>
    api.get("/Admin/BandDistributionV2", { params }),
  getHandsetDistributionV2: (params) =>
    api.get("/Admin/HandsetDistributionV2", { params }),

  getOperatorsV2: () => api.get("/Admin/OperatorsV2"),
  getNetworksV2: () => api.get("/Admin/NetworksV2"),

  saveUserDetails: (data) => api.post("/Admin/SaveUserDetails", data),
  deleteUser: (id) => api.post(`/Admin/DeleteUser`, { id }),
  activateUser: (id) => api.post(`/Admin/ActivateUser`, { id }),
  inactivateUser: (id) => api.post(`/Admin/InactivateUser`, { id }),
  userResetPassword: (data) => api.post("/Admin/UserResetPassword", data),
  changePassword: (data) => api.post("/Admin/ChangePassword", data),
  getSessions: () => api.get("/Admin/GetSessions"),
  getAllNetworkLogs: (params) =>
    api.get("/Admin/GetAllNetworkLogs", { params }),
  deleteSession: (sessionId) =>
    api.delete(`/Admin/DeleteSession?id=${parseInt(sessionId, 10)}`),
  getSessionsByFilter: (filters) =>
    api.get("/Admin/GetSessionsByDateRange", { params: filters }),
};

const LOCAL_PROJECT_API_FLAG = String(
  import.meta.env.VITE_USE_LOCAL_PROJECT_API || ""
).toLowerCase();

const isElectronRuntime = (() => {
  if (typeof navigator === "undefined") return false;
  return /electron/i.test(navigator.userAgent || "");
})();

const preferLocalProjectApi = (() => {
  if (["1", "true", "yes"].includes(LOCAL_PROJECT_API_FLAG)) return true;
  if (["0", "false", "no"].includes(LOCAL_PROJECT_API_FLAG)) return false;
  // Default to C# first for stability. Enable local Python explicitly via VITE_USE_LOCAL_PROJECT_API=true.
  return false;
})();

const shouldFallbackToLocalProjectApi = (error) => {
  if (!error) return true;
  if (isCancelledError(error) || isRequestCancelled(error)) return false;
  const status = error?.status || error?.response?.status;
  return !status || status >= 500 || status === 404 || status === 405;
};

const resolveProjectApiCall = async ({ csharpCall, localPythonCall }) => {
  if (preferLocalProjectApi) {
    try {
      return await localPythonCall();
    } catch (localError) {
      console.warn("[Project API] Local Python call failed, trying C# fallback", localError);
      return csharpCall();
    }
  }

  try {
    return await csharpCall();
  } catch (csharpError) {
    if (!shouldFallbackToLocalProjectApi(csharpError)) {
      throw csharpError;
    }
    console.warn("[Project API] C# call failed, trying local Python fallback", csharpError);
    return localPythonCall();
  }
};

export const mapViewApi = {
  addSitePrediction: (payload) => api.post("/api/Mapview/AddSitePrediction", payload),
  getLtePfrection: (params, config = {}) =>
    api.get("/api/MapView/GetLtePredictionLocationStats", { params, ...config }),
  getLtePredictionLocationStatsRefined: (params, config = {}) =>
    api.get("/api/MapView/GetLtePredictionLocationStatsRefined", { params, ...config }),

  signup: (user) => api.post("/api/MapView/user_signup", user),
  startSession: (data) => api.post("/api/MapView/start_session", data),
  endSession: (data) => api.post("/api/MapView/end_session", data),
  getDuration: ({ sessionIds }) => api.get(`/api/MapView/session/provider-network-time/combined`, { params: { sessionIds } }),
  getIOAnalysis: (params) =>
    api.get(`/api/MapView/GetIndoorOutdoorSessionAnalytics`, { params }),

  // ==================== Polygon Management ====================
  getProjectPolygons: (projectId) =>
    api.get("/api/MapView/GetProjectPolygons", {
      params: { projectId },
    }),


  getProjectPolygonsV2: (projectId, source = "map") =>
    api.get("/api/MapView/GetProjectPolygonsV2", {
      params: { projectId, source },
    }),

  savePolygon: (payload) => api.post("/api/MapView/SavePolygon", payload),

  importPolygon: (payload) =>
    resolveProjectApiCall({
      csharpCall: () => api.post("/api/MapView/ImportPolygon", payload),
      localPythonCall: () =>
        pythonApi.post("/api/local-mapview/polygons/import", payload),
    }),

  savePolygonWithLogs: (payload) =>
    api.post("/api/MapView/SavePolygonWithLogs", payload),

  getAvailablePolygons: (projectId, companyId) => {
    const params = projectId ? { projectId } : {};

    if (companyId) {
      params.company_id = companyId;
    }

    return resolveProjectApiCall({
      csharpCall: () => api.get("/api/MapView/GetAvailablePolygons", { params }),
      localPythonCall: () =>
        pythonApi.get("/api/local-mapview/available-polygons", params),
    });
  },


  getPolygonLogCount: (polygonId, from, to) =>
    api.get("/api/MapView/GetPolygonLogCount", {
      params: { polygonId, from, to },
    }),

  deleteAvailablePolygon: (polygonId, companyId) => {
    const params = { polygonId };
    if (companyId) {
      params.company_id = companyId;
    }

    return api.delete("/api/MapView/DeleteAvailablePolygon", { params });
  },

  listSavedPolygons: (projectId, limit = 200, offset = 0) =>
    api.get("/api/MapView/ListSavedPolygons", {
      params: { projectId, limit, offset },
    }),

  assignPolygonToProject: (polygonId, projectId) =>
    api.post("/api/MapView/AssignPolygonToProject", null, {
      params: { polygonId, projectId },
    }),

  // src/api/apiEndpoints.js
  getPciDistribution: async (sessionIds) => {
    try {
      const ids = Array.isArray(sessionIds)
        ? sessionIds.map((x) => String(x).trim()).filter(Boolean).join(",")
        : String(sessionIds ?? "").trim();

      if (!ids) return null;
      debugUnifiedMapApi("getPciDistribution:start", { ids });

      const response = await api.get(`/api/MapView/GetPciDistribution`, {
        params: { session_ids: ids }
      });
      debugUnifiedMapApi("getPciDistribution:success", {
        success: response?.success,
        primaryYesCount: Object.keys(response?.primary_yes || {}).length,
      });
      // REMOVE .data here because api.get already returns the JSON body
      return response;
    } catch (error) {
      debugUnifiedMapApi("getPciDistribution:error", {
        message: error?.message || String(error),
      });
      console.error("Error fetching PCI distribution:", error);
      return null;
    }
  },

  // ==================== Project Management ====================
  getProjects: () =>
    resolveProjectApiCall({
      csharpCall: () => api.get("/api/MapView/GetProjects"),
      localPythonCall: () => pythonApi.get("/api/local-mapview/projects"),
    }),

  /**
   * Create project with polygons and sessions
   */
  createProjectWithPolygons: async (payload) => {
    try {
      const response = await resolveProjectApiCall({
        csharpCall: () =>
          api.post("/api/MapView/CreateProjectWithPolygons", payload),
        localPythonCall: () =>
          pythonApi.post("/api/local-mapview/projects/create-with-polygons", payload),
      });

      return response;
    } catch (error) {
      console.error(" Project creation error:", error);

      // Enhanced error handling
      if (error.response?.data) {
        const data = error.response.data;

        if (data.InnerException) {
          throw new Error(`Database Error: ${data.InnerException}`);
        } else if (data.Message) {
          throw new Error(data.Message);
        } else if (data.errors) {
          const validationErrors = Object.entries(data.errors)
            .map(
              ([field, messages]) =>
                `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages
                }`
            )
            .join("; ");
          throw new Error(`Validation Error: ${validationErrors}`);
        }
      }

      throw error;
    }
  },

  createProject: async (payload) => {
    try {
      const response = await api.post("/api/MapView/createProject", payload);
      return response;
    } catch (error) {
      console.error(" Project creation error:", error);
      if (error.response?.data) {
        const data = error.response.data;
        const details = data.Details || data.InnerException;
        if (details) {
          throw new Error(`Database Error: ${details}`);
        }
        if (data.Message) {
          throw new Error(data.Message);
        }
      }
      throw error;
    }
  },

  deleteProject: async (projectId) => {
    try {
      const response = await resolveProjectApiCall({
        csharpCall: () =>
          api.delete("/api/MapView/DeleteProject", {
            params: { projectId },
          }),
        localPythonCall: () =>
          pythonApi.delete(`/api/local-mapview/projects/${projectId}`),
      });

      return response;
    } catch (error) {
      console.error(" Project deletion error:", error);
      throw error;
    }
  },

  // ==================== Network Logs ====================
  // In apiEndpoints.js
  getNetworkLog: async ({ session_ids, page = 1, limit = 20000, signal }) => {
    const sid = Array.isArray(session_ids) ? session_ids.join(",") : session_ids;

    debugUnifiedMapApi("getNetworkLog:start", { sid, page, limit });

    const response = await api.get("/api/MapView/GetNetworkLog", {
      params: {
        session_Ids: sid,
        session_ids: sid,
        sessionId: sid,
        page: page,
        limit: limit,
      },
      signal: signal,
      dedupe: false,
    });
    debugUnifiedMapApi("getNetworkLog:success", {
      count: Array.isArray(response?.data) ? response.data.length : 0,
      total: response?.total_count,
    });



    return response;
  },

  // apiEndpoints.js

  // apiEndpoints.js
  getSessionNeighbour: async ({ sessionIds, signal }) => {
    try {
      const idsParam = Array.isArray(sessionIds) ? sessionIds.join(",") : sessionIds;


      const response = await api.get(
        '/api/MapView/GetN78Neighbours',
        {
          params: {
            session_ids: idsParam
          },
          signal,
          dedupe: false
        }
      );


      if (response?.data) {
        return response.data;
      }

      if (response?.Status !== undefined) {
        return response;
      }

      console.warn(" Unexpected response structure:", response);
      return response;

    } catch (error) {
      // Silently re-throw cancelled requests - the calling hook will handle this
      if (isCancelledError(error) || isRequestCancelled(error)) {
        throw error;
      }
      
      if (error?.isNetworkError) {
        console.warn('[N78 API] No response (network or cancelled):', error.message);
      } else {
        console.error(' N78 API Error:', error);
      }
      throw error;
    }
  },

  getSubSessionAnalytics: async ({ sessionIds, signal } = {}) => {
    try {
      const idsParam = Array.isArray(sessionIds)
        ? sessionIds.map((id) => String(id ?? "").trim()).filter(Boolean).join(",")
        : String(sessionIds ?? "").trim();

      if (!idsParam) {
        return {
          requested_session_ids: [],
          data: [],
          summary: null,
        };
      }

      const response = await api.get("/api/MapView/GetSubSessionAnalytics", {
        params: {
          sessionIds: idsParam,
          session_ids: idsParam,
        },
        signal,
        dedupe: false,
      });

      if (response?.data && typeof response.data === "object") {
        console.log("Sub-session analytics API Response:", response.data);
        return response.data;
      }
      console.log("Sub-session analytics API Response:", response);
      return response;
    } catch (error) {
      if (isCancelledError(error) || isRequestCancelled(error)) {
        throw error;
      }
      console.error(" Sub-session analytics API Error:", error);
      throw error;
    }
  },

  getDominanceDetails: (sessionIds) => {
    const ids = Array.isArray(sessionIds)
      ? sessionIds.map((x) => String(x).trim()).filter(Boolean).join(",")
      : String(sessionIds ?? "").trim();
    if (!ids) return Promise.resolve({ success: false, data: [] });
    debugUnifiedMapApi("getDominanceDetails:start", { ids });
    return api.get(`/api/MapView/GetDominanceDetails`, {
      params: { session_ids: ids }
    }).then((res) => {
      debugUnifiedMapApi("getDominanceDetails:success", {
        success: res?.success,
        count: Array.isArray(res?.data) ? res.data.length : 0,
      });
      return res;
    }).catch((error) => {
      debugUnifiedMapApi("getDominanceDetails:error", {
        message: error?.message || String(error),
      });
      throw error;
    });
  },


  getDistanceSession: (session) =>
    api.get("/api/MapView/sessionsDistance", {
      params: session
    }),

  getLogsByDateRange: (filters) =>
    api.get("/api/MapView/GetLogsByDateRange", { withCredentials: true, params: filters }),

  logNetwork: (data) => api.post("/api/MapView/log_networkAsync", data),

  getLogsByneighbour: (params) => {
    return api.get("/api/MapView/GetNeighbourLogsByDateRange", {
      params: params
    });
  },
  getproviderVolume: (params) =>
    api.get("/api/MapView/GetProviderWiseVolume", { params }),
  // ==================== Filter Options ====================
  getProviders: () => api.get("/api/MapView/GetProviders"),
  getTechnologies: () => api.get("/api/MapView/GetTechnologies"),
  getBands: () => api.get("/api/MapView/GetBands"),

  // ==================== Prediction Data ====================
  getPredictionLog: (params) =>
    api.get("/api/MapView/GetPredictionLog", { params }),

  getPredictionLogPost: (payload) =>
    api.post("/api/MapView/GetPredictionLog", payload),

  getPredictionDataForBuildings: (projectId, metric) =>
    api.get("/api/MapView/GetPredictionDataForSelectedBuildingPolygonsRaw", {
      params: { projectId, metric },
    }),

  // ==================== Site Prediction ====================
  uploadSitePredictionCsv: (formData) =>
    api.post("/api/MapView/UploadSitePredictionCsv", formData),

  getSitePrediction: (params) =>
    api.get("/api/MapView/GetSitePrediction", {
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  getSitePredictionBase: (params, config = {}) =>
    api.get("/api/MapView/GetSitePredictionBase", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  getSitePredictionOptimised: (params, config = {}) =>
    api.get("/api/MapView/GetSitePredictionOptimised", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  // Keep US spelling alias for callers while backend route remains "Optimised".
  getSitePredictionOptimized: (params, config = {}) =>
    api.get("/api/MapView/GetSitePredictionOptimised", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  compareSitePrediction: (params, config = {}) =>
    api.get("/api/MapView/CompareSitePrediction", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  updateSitePrediction: (payload) =>
    api.post("/api/MapView/UpdateSitePrediction", payload),
  deleteSitePrediction: (payload) =>
    api.post("/api/MapView/DeleteSitePrediction", payload),

  assignSitePredictionToProject: (projectId, siteIds) => {
    const params = new URLSearchParams();
    params.append("projectId", projectId);
    siteIds.forEach((id) => params.append("siteIds", id));
    return api.post(
      `/api/MapView/AssignExistingSitePredictionToProject?${params.toString()}`
    );
  },

  // ==================== ML Site Data ====================
  getSiteNoMl: (params) => api.get("/api/MapView/GetSiteNoMl", { params }),
  getSiteMl: (params) => api.get("/api/MapView/GetSiteMl", { params }),

  // ==================== Image Upload ====================
  uploadImage: (formData) => api.post("/api/MapView/UploadImage", formData),
  uploadImageLegacy: (formData) =>
    api.post("/api/MapView/UploadImageLegacy", formData),
};

export const gridAnalyticsApi = {
      computeAndStoreGridAnalytics: (params, config = {}) =>
    api.post("/api/GridAnalytics/ComputeAndStoreGridAnalytics", null, {
      params,
      ...config,
    }),
  setProjectGridSize: (params, config = {}) =>
    api.post("/api/GridAnalytics/SetProjectGridSize", null, {
      params,
      ...config,
    }),
  getGridAnalytics: (params, config = {}) =>
    api.get("/api/GridAnalytics/GetGridAnalytics", { params, ...config }),
  getCoverageOptimizationSummary: (params, config = {}) =>
    api.get("/api/GridAnalytics/GetCoverageOptimizationSummary", {
      params,
      ...config,
    }),
};

export const homeApi = {
  login: (credentials) => api.post("/Home/UserLogin", credentials),
  getStateInfo: () => api.post("/Home/GetStateIformation"),
  forgotPassword: (data) => api.post("/Home/GetUserForgotPassword", data),
  resetPassword: (data) => api.post("/Home/ForgotResetPassword", data),
  logout: (ip) => api.get("/Home/Logout", { params: { IP: ip || "" } }),
  getLoggedUser: (ip) => api.post("/Home/GetLoggedUser", { ip }),
  getMasterUserTypes: () => api.get("/Home/GetMasterUserTypes"),

  // ✅ ADD THIS METHOD
  getAuthStatus: () => api.get("/api/auth/status"),
};

export const settingApi = {
  checkSession: async () => {
    try {
      const response = await api.get("/api/Setting/CheckSession");
      return response;
    } catch (error) {
      console.error("CheckSession error:", error);
      throw error;
    }
  },

  getThresholdSettings: async () => {
    try {
      const response = await api.get("/api/Setting/GetThresholdSettings");
      return response;
    } catch (error) {
      console.error("GetThresholdSettings error:", error);
      throw error;
    }
  },

  saveThreshold: async (payload) => {
    try {

      const response = await api.post("/api/Setting/SaveThreshold", payload);
      return response;
    } catch (error) {
      console.error("SaveThreshold error:", error);
      throw error;
    }
  },
};

export const excelApi = {
  uploadFile: (formData, onUploadProgress = null) =>
    api.post("/ExcelUpload/UploadExcelFile", formData, {
      timeout: 600000, // 10 minutes for upload + server-side processing
      onUploadProgress:
        onUploadProgress ||
        ((progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
        }),
    }),

  downloadTemplate: (fileType) => {
    const url = `https://s-traccceer.vinfocom.co.in/ExcelUpload/DownloadExcel?fileType=${fileType}`;
    const filename = fileType === 3 ? "project_template.xlsx" : "upload_template.xlsx";
    return downloadUrlAsBlob(url, filename);
  },

  getUploadedFiles: (type) =>
    api.get("/ExcelUpload/GetUploadedExcelFiles", {
      params: { FileType: type },
    }),

  getSessions: (fromDate, toDate) =>
    api.get("/ExcelUpload/GetSessions", {
      params: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
      },
    }),
};


export const checkAllServices = async (options = {}) => {
  const includePython = options?.includePython === true;

  try {
    const checks = [
      includePython ? generalApi.healthCheck() : Promise.resolve({ skipped: true }),
      authApi.checkStatus(),
    ];
    const [pythonHealth, csharpHealth] = await Promise.allSettled(checks);

    return {
      python: {
        enabled: includePython,
        healthy: includePython ? pythonHealth.status === "fulfilled" : true,
        data: pythonHealth.value,
        error: includePython ? pythonHealth.reason?.message : undefined,
        skipped: !includePython,
      },
      csharp: {
        enabled: true,
        healthy: csharpHealth.status === "fulfilled",
        data: csharpHealth.value,
        error: csharpHealth.reason?.message,
      },
    };
  } catch (error) {
    console.error("Service check failed:", error);
    return {
      python: { enabled: includePython, healthy: !includePython, error: includePython ? error.message : undefined, skipped: !includePython },
      csharp: { enabled: true, healthy: false, error: error.message },
    };
  }
};


export const validateProjectExists = async (projectId) => {
  try {
    if (!projectId) return false;

    const pythonCheck = await cellSiteApi.verifyProject(projectId);
    return pythonCheck.exists === true;
  } catch (error) {
    console.error("Project validation error:", error);
    return false;
  }
};

export const companyApi = {
  getAll: (id) => api.get("/api/company/GetAll", { params: { id } }),

  createCompany: (data) => api.post("/api/company/SaveCompanyDetails", data),

  deleteCompany: (id) => api.delete("/api/company/deleteCompany", { params: { id } }),

  updateCompanyStatus: (companyId, status) =>
    api.put("/api/company/updateCompanyStatus", { status }, { params: { companyId } }),

  revokeLicense: (id) => api.post(`/api/company/revokeLicense`, null, { params: { licenseId: id } }),

  updateIssuedLicense: (licenseId, data) =>
    api.put("/api/company/updateIssuedLicense", data, { params: { licenseId } }),

  licensesDetails: (params) => api.get("/api/company/usedLicenses",
    { params, withCredentials: true }
  ),
};

export default {
  generalApi,
  buildingApi,
  cellSiteApi,

  authApi,
  adminApi,
  mapViewApi,
  homeApi,
  settingApi,
  excelApi,

  checkAllServices,
  validateProjectExists,
  companyApi,
};
