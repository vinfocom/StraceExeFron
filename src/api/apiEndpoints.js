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

const getPublicApiHeaders = () => {
  const key = String(import.meta.env.VITE_PUBLIC_API_KEY || "").trim();
  return key ? { "X-Public-Api-Key": key } : {};
};

const LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS = Object.freeze({
  region: "india",
  radius: 500,
  grid_resolution: 25,
  n_workers: 3,
  impact_radius_m: 500,
  neighbor_site_count: 2,
  max_neighbors_per_update_cell: 2,
  max_interference_sites: 10,
});

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

const downloadUrlAsBlob = async (url, filename, headers = {}) => {
  const response = await axios.get(url, {
    responseType: "blob",
    withCredentials: true,
    headers,
  });
  const blob = response?.data instanceof Blob
    ? response.data
    : new Blob([response?.data ?? ""]);
  triggerBrowserDownload(blob, filename);
  return { success: true };
};

const TEMPLATE_DOWNLOAD_FILENAMES = {
  1: "Session_Template.zip",
  2: "Template_NetworkLog.csv",
  3: "Site_Prediction_Data.csv",
  4: "python-runtime-v5-win-x64.zip",
};

const downloadTemplateFromCsharpApi = async (fileType) => {
  const normalizedFileType = Number(fileType);
  const filename =
    TEMPLATE_DOWNLOAD_FILENAMES[normalizedFileType] || "template_download";
  const blob = await api.get("/ExcelUpload/DownloadExcel", {
    params: { fileType: normalizedFileType },
    responseType: "blob",
    headers: getPublicApiHeaders(),
    dedupe: false,
  });
  triggerBrowserDownload(blob instanceof Blob ? blob : new Blob([blob ?? ""]), filename);
  return { success: true };
};

const postWithRouteFallback = async (paths, payload, config = {}, client = pythonApi) => {
  let lastError = null;
  for (const path of paths) {
    try {
      return await client.post(path, payload, config);
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (status !== 404 && status !== 405) {
        throw error;
      }
    }
  }
  throw lastError;
};

const getWithRouteFallback = async (paths, config = {}) => {
  let lastError = null;
  for (const path of paths) {
    try {
      return await pythonApi.get(path, config);
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (status !== 404 && status !== 405) {
        throw error;
      }
    }
  }
  throw lastError;
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
    const url = `${PYTHON_BASE_URL_EXPORT}/api/cell-site/download/${outputDir}/${filename}`;
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

      const blob = response instanceof Blob ? response : new Blob([response ?? ""]);
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

      const operatorValue = String(params.operator || "").trim();
      if (operatorValue && operatorValue.toLowerCase() !== "auto" && operatorValue.toLowerCase() !== "all") {
        payload.operator = operatorValue;
      }

      if (Array.isArray(params.drive_rows) && params.drive_rows.length > 0) {
        payload.drive_rows = params.drive_rows;
        payload.drive_rows_source = params.drive_rows_source || "frontend_memory_cache";
        console.info("[LTE_PREDICTION_INPUT] sending drive_rows to Python", {
          source: payload.drive_rows_source,
          rows: payload.drive_rows.length,
        });
      } else {
        payload.drive_rows_source = params.drive_rows_source || "python_backend_fallback";
        console.info("[LTE_PREDICTION_INPUT] no frontend drive_rows; Python fallback will be used", {
          source: payload.drive_rows_source,
        });
      }

      if (Array.isArray(params.polygon_area) && params.polygon_area.length >= 3) {
        payload.polygon_area = params.polygon_area;
      }
      if (params.polygon_ids) {
        payload.polygon_ids = params.polygon_ids;
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

      const selectedOperators = Array.isArray(params.operators)
        ? params.operators
            .map((value) => String(value || "").trim())
            .filter((value) => value.toLowerCase() !== "all")
            .filter(Boolean)
        : [];
      const uniqueOperators = Array.from(new Set(selectedOperators));
      const operatorValue =
        uniqueOperators.length > 0
          ? uniqueOperators[0]
          : String(params.operator || "").trim() || "Airtel";

      const payload = {
        user_id: params.user_id,
        project_id: params.project_id,
        radius: params.radius ?? 2000.0,
        grid_resolution: params.grid_resolution ?? 50.0,
        n_workers: params.n_workers ?? 2,
        operator: operatorValue,
        operators: operatorValue ? [operatorValue] : [],
      };
      if (params.polygon_ids) {
        payload.polygon_ids = params.polygon_ids;
      }
      const sitePredictionScenarioId = Number(
        params.site_prediction_scenario_id ?? params.sitePredictionScenarioId ?? params.scenario,
      );
      if (Number.isFinite(sitePredictionScenarioId) && sitePredictionScenarioId > 0) {
        payload.site_prediction_scenario_id = sitePredictionScenarioId;
        payload.scenario = sitePredictionScenarioId;
      }

      const response = await postWithRouteFallback(
        [
          "/api/lte-prediction-optimised/run",
          "/api/lte-prediction-optimized/run",
          "/api/lte-prediction-optimised/optimized",
          "/api/lte-prediction-optimized/optimized",
        ],
        payload,
        { timeout: 600000 },
      );
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

  runLteRecommendationOptimisedPrediction: async (params) => {
    try {
      if (!params.project_id) throw new Error("project_id is required");

      const operatorValue = String(params.operator ?? "Airtel").trim();
      const radius = Number(
        params.radius ??
        params.radius_m ??
        LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.radius,
      );
      const gridResolution = Number(
        params.grid_resolution ??
        params.grid_resolution_m ??
        LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.grid_resolution,
      );
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error("radius must be a positive number");
      }
      if (!Number.isFinite(gridResolution) || gridResolution <= 0) {
        throw new Error("grid_resolution must be a positive number");
      }

      const payload = {
        project_id: params.project_id,
        region: params.region || LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.region,
        radius,
        grid_resolution: gridResolution,
        n_workers: params.n_workers ?? LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.n_workers,
        impact_radius_m:
          params.impact_radius_m ??
          params.radius ??
          params.radius_m ??
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.impact_radius_m,
        neighbor_site_count:
          params.neighbor_site_count ??
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.neighbor_site_count,
        max_neighbors_per_update_cell:
          params.max_neighbors_per_update_cell ??
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.max_neighbors_per_update_cell,
        max_interference_sites:
          params.max_interference_sites ??
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.max_interference_sites,
      };

      if (operatorValue && operatorValue.toLowerCase() !== "all") {
        payload.operator = operatorValue;
      }
      if (params.polygon_ids) {
        payload.polygon_ids = params.polygon_ids;
      }

      const recommendationScenarioId = Number(params.recommendation_scenario_id);
      if (Number.isFinite(recommendationScenarioId) && recommendationScenarioId > 0) {
        payload.recommendation_scenario_id = recommendationScenarioId;
      }

      console.info("[LTE_OPT_RECOMMENDATION] POST /api/lte-prediction-optimised/recommendation-optimized", payload);
      return await postWithRouteFallback(
        [
          "/api/lte-prediction-optimised/recommendation-optimized",
          "/api/lte-prediction-optimized/recommendation-optimized",
        ],
        payload,
        { timeout: 600000 },
      );
    } catch (error) {
      console.error("LTE recommendation optimized prediction run error:", error);
      if (error.code === "ECONNABORTED") {
        throw new Error("LTE recommendation optimized prediction timed out.");
      }
      if (error.response?.data?.detail) {
        throw new Error(`LTE recommendation optimized prediction failed: ${error.response.data.detail}`);
      }
      if (error.response?.data?.error) {
        throw new Error(`LTE recommendation optimized prediction failed: ${error.response.data.error}`);
      }
      throw error;
    }
  },

  runLteTiltRecommendation: async (params) => {
    try {
      if (!params.project_id) throw new Error("project_id is required");

      const operator = String(params.operator || "").trim();
      const parsedSessionIds = Array.isArray(params.session_ids) && params.session_ids.length > 0
        ? params.session_ids
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
        : [];
      const hasFile = params.threshold_file instanceof File;
      const optionalFieldKeys = [
        "region",
        "rsrp_weight",
        "rsrq_weight",
        "sinr_weight",
        "validate_candidates",
        "radius_m",
        "grid_resolution_m",
        "n_workers",
        "impact_radius_m",
        "neighbor_site_count",
        "max_interference_sites",
        "candidate_workers",
        "coordinate_passes",
        "bad_grid_coverage_pct",
        "max_group_cells",
        "max_neighbors_per_update_cell",
        "threshold_file_path",
      ];
      const copyOptionalFields = (target) => {
        optionalFieldKeys.forEach((key) => {
          if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
            target[key] = params[key];
          }
        });
      };

      if (hasFile) {
        const formData = new FormData();
        formData.append("project_id", String(params.project_id));
        if (operator && operator.toLowerCase() !== "all") {
          formData.append("operator", operator);
        }
        if (parsedSessionIds.length > 0) {
          formData.append("session_ids", JSON.stringify(parsedSessionIds));
        }
        if (params.rsrp !== undefined && params.rsrp !== null && params.rsrp !== "") {
          formData.append("rsrp", String(Number(params.rsrp)));
        }
        if (params.rsrq !== undefined && params.rsrq !== null && params.rsrq !== "") {
          formData.append("rsrq", String(Number(params.rsrq)));
        }
        if (params.sinr !== undefined && params.sinr !== null && params.sinr !== "") {
          formData.append("sinr", String(Number(params.sinr)));
        }
        optionalFieldKeys.forEach((key) => {
          if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
            formData.append(key, String(params[key]));
          }
        });
        formData.append("threshold_file", params.threshold_file);

        const debugPayload = {
          project_id: params.project_id,
          operator: operator || undefined,
          session_ids: validSessionIds,
          rsrp: params.rsrp,
          rsrq: params.rsrq,
          sinr: params.sinr,
          threshold_file: params.threshold_file?.name,
        };
        copyOptionalFields(debugPayload);
        console.info("[LTE_TILT_RECOMMENDATION] POST /api/lte-tilt-recommandation/optimize", debugPayload);

        return await postWithRouteFallback(
          [
            "/api/lte-tilt-recommandation/optimize",
            "/api/lte-tilt-recommendation/optimize",
          ],
          formData,
          {
            timeout: 600000,
            headers: { "Content-Type": "multipart/form-data" },
          },
        );
      }

      const payload = { project_id: params.project_id };
      if (operator && operator.toLowerCase() !== "all") {
        payload.operator = operator;
      }
      if (parsedSessionIds.length > 0) {
        payload.session_ids = parsedSessionIds;
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
      copyOptionalFields(payload);

      console.info("[LTE_TILT_RECOMMENDATION] POST /api/lte-tilt-recommandation/optimize", payload);

      return await postWithRouteFallback(
        [
          "/api/lte-tilt-recommandation/optimize",
          "/api/lte-tilt-recommendation/optimize",
        ],
        payload,
        { timeout: 600000 },
      );
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
      return await getWithRouteFallback([
        `/api/lte-tilt-recommandation/status/${jobId}`,
        `/api/lte-tilt-recommendation/status/${jobId}`,
      ]);
    } catch (error) {
      console.error("LTE tilt recommendation status error:", error);
      throw error;
    }
  },

  getLteTiltRecommendationDownloadUrl: (filePath) => {
    if (!filePath) return "";
    return `${PYTHON_BASE_URL_EXPORT}/api/lte-tilt-recommandation/download?file=${encodeURIComponent(filePath)}`;
  },

  downloadLteTiltRecommendation: (filePath) => {
    if (!filePath) return Promise.resolve({ success: false });
    const url = `${PYTHON_BASE_URL_EXPORT}/api/lte-tilt-recommandation/download?file=${encodeURIComponent(filePath)}`;
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
      return await getWithRouteFallback([
        `/api/lte-prediction-optimised/status/${jobId}`,
        `/api/lte-prediction-optimized/status/${jobId}`,
      ]);
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
  generateUnifiedMapPdf: (payload) =>
    api.post("/api/UnifiedMapReport/Generate", payload, {
      responseType: "blob",
      timeout: 600000,
      dedupe: false,
    }),
};

export const authApi = {
  checkStatus: () => api.get("/api/auth/status"),
};

export const indoorPlanningApi = {
  getProjects: () => api.get("/api/IndoorPlanning/projects"),
  createProject: (payload) => api.post("/api/IndoorPlanning/projects", payload),
  getProject: (id) => api.get(`/api/IndoorPlanning/projects/${id}`),
  saveFloor: (id, payload) => api.put(`/api/IndoorPlanning/projects/${id}/floor`, payload),
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

const emptyOfflineResponse = (extra = {}) => ({
  Status: 1,
  Data: [],
  localOnly: true,
  ...extra,
});

const offlineStorageAvailable = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readOfflineJson = (key, fallback) => {
  if (!offlineStorageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeOfflineJson = (key, value) => {
  if (!offlineStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local offline cache is best-effort only.
  }
};

export const offlineApi = {
  health: async () => ({ Status: 1, localOnly: true }),
  getImports: async () =>
    emptyOfflineResponse({ Data: readOfflineJson("stracer.offline.imports", []) }),
  importFiles: async () =>
    emptyOfflineResponse({
      Message: "Offline file import is disabled in the frontend-only offline adapter.",
    }),
  getSessions: async () =>
    emptyOfflineResponse({ Data: readOfflineJson("stracer.offline.sessions", []) }),
  getProjects: async () =>
    emptyOfflineResponse({ Data: readOfflineJson("stracer.offline.projects", []) }),
  getProject: async (projectId) => {
    const projects = readOfflineJson("stracer.offline.projects", []);
    const project = projects.find((row) => String(row?.id) === String(projectId));
    return { Status: project ? 1 : 0, Data: project || null, localOnly: true };
  },
  createProject: async (payload) => {
    const projects = readOfflineJson("stracer.offline.projects", []);
    const project = {
      ...payload,
      id: payload?.id || `local-${Date.now()}`,
      sync_status: "pending",
      created_at: payload?.created_at || new Date().toISOString(),
    };
    writeOfflineJson("stracer.offline.projects", [project, ...projects]);
    return { Status: 1, Data: project, localOnly: true };
  },
  updateProjectSiteSize: async (payload) => {
    const projects = readOfflineJson("stracer.offline.projects", []);
    const nextProjects = projects.map((project) =>
      String(project?.id) === String(payload?.ProjectId || payload?.projectId)
        ? { ...project, sitesize: payload?.SiteSize ?? payload?.siteSize ?? 1 }
        : project,
    );
    writeOfflineJson("stracer.offline.projects", nextProjects);
    const updatedProject = nextProjects.find(
      (project) => String(project?.id) === String(payload?.ProjectId || payload?.projectId),
    );
    return { Status: 1, Data: updatedProject || null, localOnly: true };
  },
  getNetworkLog: async () =>
    emptyOfflineResponse({ Data: readOfflineJson("stracer.offline.networkLog", []) }),
  prepareSync: async () => ({
    Status: 1,
    synced: 0,
    skipped: true,
    reason: "frontend-offline-adapter",
    localOnly: true,
  }),
  getSyncStatus: async () => ({
    Status: 1,
    syncing: false,
    pending: 0,
    localOnly: true,
  }),
};

const LOCAL_PROJECT_API_FLAG = String(
  import.meta.env.VITE_USE_LOCAL_PROJECT_API || ""
).toLowerCase();
const LOCAL_PROJECT_API_FALLBACK_FLAG = String(
  import.meta.env.VITE_ALLOW_LOCAL_PROJECT_API_FALLBACK || ""
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

const allowLocalProjectApiFallback = (() => {
  if (preferLocalProjectApi) return true;
  if (["1", "true", "yes"].includes(LOCAL_PROJECT_API_FALLBACK_FLAG)) return true;
  if (["0", "false", "no"].includes(LOCAL_PROJECT_API_FALLBACK_FLAG)) return false;
  // In the browser app we should not silently depend on a Python process unless explicitly enabled.
  // Electron/local-packaged flows can opt in via env if needed.
  return false;
})();

const shouldFallbackToLocalProjectApi = (error) => {
  if (!error) return true;
  if (isCancelledError(error) || isRequestCancelled(error)) return false;
  const status = error?.status || error?.response?.status;
  return !status || status >= 500 || status === 404 || status === 405;
};

const shouldFallbackToOfflineCache = (error) => {
  if (!error) return true;
  if (isCancelledError(error) || isRequestCancelled(error)) return false;
  const status = error?.status || error?.response?.status;
  const message = String(error?.message || "").toLowerCase();

  // Fallback to local cache only when cloud is effectively unreachable.
  // If server responds with an HTTP status, keep it as cloud-path behavior.
  if (status) return false;

  return (
    message.includes("no response from server") ||
    message.includes("network error") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    error?.isNetworkError === true
  );
};

const resolveProjectApiCall = async ({ csharpCall, localPythonCall }) => {
  const hasLogicalFailure = (payload) => {
    if (!payload || typeof payload !== "object") return false;
    if (payload.Status === 0) return true;
    if (payload.success === false) return true;
    return false;
  };

  if (preferLocalProjectApi) {
    try {
      const localResult = await localPythonCall();
      if (!hasLogicalFailure(localResult)) {
        return localResult;
      }
      console.warn("[Project API] Local Python returned logical failure, trying C# fallback", localResult);
      return csharpCall();
    } catch (localError) {
      console.warn("[Project API] Local Python call failed, trying C# fallback", localError);
      return csharpCall();
    }
  }

  try {
    const csharpResult = await csharpCall();
    if (!hasLogicalFailure(csharpResult)) {
      return csharpResult;
    }
    if (!allowLocalProjectApiFallback) {
      return csharpResult;
    }
    console.warn("[Project API] C# returned logical failure, trying local Python fallback", csharpResult);
    return localPythonCall();
  } catch (csharpError) {
    if (!allowLocalProjectApiFallback || !shouldFallbackToLocalProjectApi(csharpError)) {
      throw csharpError;
    }
    console.warn("[Project API] C# call failed, trying local Python fallback", csharpError);
    return localPythonCall();
  }
};

export const sitePredictionApi = {
  add: (payload) => api.post("/api/Mapview/AddSitePrediction", payload),
  uploadCsv: (formData) =>
    api.post("/api/MapView/UploadSitePredictionCsv", formData),
  get: (params) =>
    api.get("/api/MapView/GetSitePrediction", {
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  getBase: (params, config = {}) =>
    api.get("/api/MapView/GetSitePredictionBase", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  getOptimised: (params, config = {}) =>
    api.get("/api/MapView/GetSitePredictionOptimised", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  getOptimized: (params, config = {}) =>
    api.get("/api/MapView/GetSitePredictionOptimised", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  compare: (params, config = {}) =>
    api.get("/api/MapView/CompareSitePrediction", {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    }),
  update: (payload) =>
    api.post("/api/MapView/UpdateSitePrediction", payload),
  getScenarios: async (params, config = {}) => {
    const requestConfig = {
      ...config,
      params: { ...params, _ts: Date.now() },
      dedupe: false,
    };
    try {
      return await api.get("/api/SitePrediction/GetScenarios", requestConfig);
    } catch (error) {
      const status = Number(error?.status ?? error?.response?.status ?? error?.data?.Status);
      if (status !== 404) throw error;
      return api.get("/api/MapView/GetSitePredictionScenarios", requestConfig);
    }
  },
  deleteScenario: (payload, config = {}) =>
    postWithRouteFallback(
      [
        "/api/SitePrediction/DeleteScenario",
        "/api/MapView/DeleteSitePredictionScenario",
      ],
      payload,
      config,
      api,
    ),
  delete: (payload) =>
    postWithRouteFallback(
      [
        "/api/SitePrediction/Delete",
        "/api/MapView/DeleteSitePrediction",
      ],
      payload,
      {},
      api,
    ),
  assignToProject: (projectId, siteIds) => {
    const params = new URLSearchParams();
    params.append("projectId", projectId);
    siteIds.forEach((id) => params.append("siteIds", id));
    return api.post(
      `/api/MapView/AssignExistingSitePredictionToProject?${params.toString()}`
    );
  },
  getNoMl: (params) => api.get("/api/MapView/GetSiteNoMl", { params }),
  getMl: (params) => api.get("/api/MapView/GetSiteMl", { params }),
};

export const mapViewApi = {
  addSitePrediction: sitePredictionApi.add,
  getLtePfrection: (params, config = {}) =>
    api.get("/api/MapView/GetLtePredictionLocationStats", { params, ...config }),
  getLtePredictionLocationStatsRefined: (params, config = {}) =>
    api.get("/api/MapView/GetLtePredictionLocationStatsRefined", { params, ...config }),

  signup: (user) =>
    api.post("/api/MapView/user_signup", user, { headers: getPublicApiHeaders() }),
  startSession: (data) =>
    api.post("/api/MapView/start_session", data, { headers: getPublicApiHeaders() }),
  endSession: (data) =>
    api.post("/api/MapView/end_session", data, { headers: getPublicApiHeaders() }),
  getDuration: ({ sessionIds }) => api.get(`/api/MapView/session/provider-network-time/combined`, { params: { sessionIds } }),
  getIOAnalysis: (params) =>
    api.get(`/api/MapView/GetIndoorOutdoorSessionAnalytics`, { params }),

  // ==================== Polygon Management ====================
  getProjectPolygons: (projectId) =>
    resolveProjectApiCall({
      csharpCall: () =>
        api.get("/api/MapView/GetProjectPolygons", {
          params: { projectId },
        }),
      localPythonCall: () =>
        pythonApi.get("/api/local-mapview/project-polygons", { projectId }),
    }),


  getProjectPolygonsV2: (projectId, source = "map") =>
    api.get("/api/MapView/GetProjectPolygonsV2", {
      params: { projectId, source },
    }),

  savePolygon: (payload) => api.post("/api/MapView/SavePolygon", payload),

  updateProjectPolygon: (payload) =>
    api.post("/api/MapView/UpdateProjectPolygon", payload),

  // Polygon import should always go through C# backend (no local Python fallback).
  importPolygon: (payload) => api.post("/api/MapView/ImportPolygon", payload),

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
    resolveProjectApiCall({
      csharpCall: () =>
        api.get("/api/MapView/ListSavedPolygons", {
          params: { projectId, limit, offset },
        }),
      localPythonCall: () =>
        pythonApi.get("/api/local-mapview/project-polygons", { projectId }),
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
  getProjects: (companyId, options = {}) =>
    resolveProjectApiCall({
      csharpCall: () => api.get("/api/MapView/GetProjects", options),
      localPythonCall: () =>
        pythonApi.get(
          "/api/local-mapview/projects",
          companyId ? { company_id: companyId } : {},
          options,
        ),
    }),

  updateProjectSiteSize: async (payload) => {
    try {
      return await api.put("/api/MapView/UpdateProjectSiteSize", payload);
    } catch (error) {
      console.error(" Project site size update error:", error);
      throw error;
    }
  },

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

  updateProjectSessions: (payload) =>
    api.put("/api/MapView/UpdateProjectSessions", payload),

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
  getNetworkLog: async ({
    session_ids,
    page = 1,
    limit = 20000,
    signal,
    project_id,
    force_refresh = false,
    NetworkType,
    networkType,
  }) => {
    const sid = Array.isArray(session_ids) ? session_ids.join(",") : session_ids;

    debugUnifiedMapApi("getNetworkLog:start", { sid, page, limit, force_refresh });

    const hasLocalSession = String(sid || "")
      .split(",")
      .some((id) => Number(id) < 0);

    if (hasLocalSession) {
      return pythonApi.get("/api/offline/network-log", {
        session_ids: sid,
        session_Ids: sid,
        sessionId: sid,
        page,
        limit,
      }, { signal });
    }

    const response = await api.get("/api/MapView/GetNetworkLog", {
      params: {
        session_Ids: sid,
        session_ids: sid,
        sessionId: sid,
        project_id: project_id ?? undefined,
        NetworkType: NetworkType ?? networkType ?? undefined,
        page: page,
        limit: limit,
        force_refresh: force_refresh ? true : undefined,
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


  getSessionNeighbour: async ({ sessionIds, signal, project_id }) => {
    try {
      const idsParam = Array.isArray(sessionIds) ? sessionIds.join(",") : sessionIds;
      const hasLocalSession = String(idsParam || "")
        .split(",")
        .map((id) => Number(String(id).trim()))
        .some((id) => Number.isFinite(id) && id < 0);

     
      if (hasLocalSession) {
        return {
          Status: 1,
          success: true,
          data: [],
          total: 0,
          count: 0,
          message: "No neighbor data for local cached session(s).",
        };
      }


      const response = await api.get(
        '/api/MapView/GetN78Neighbours',
        {
          params: {
            session_ids: idsParam,
            project_id: project_id ?? undefined,
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

      const status = error?.status || error?.response?.status;
      if (status === 400) {
        return {
          Status: 1,
          success: true,
          data: [],
          total: 0,
          count: 0,
          message: "No valid session IDs for neighbor API.",
        };
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

  logNetwork: (data) =>
    api.post("/api/MapView/log_networkAsync", data, { headers: getPublicApiHeaders() }),

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
  uploadSitePredictionCsv: sitePredictionApi.uploadCsv,
  getSitePrediction: sitePredictionApi.get,
  getSitePredictionBase: sitePredictionApi.getBase,
  getSitePredictionOptimised: sitePredictionApi.getOptimised,
  // Keep US spelling alias for callers while backend route remains "Optimised".
  getSitePredictionOptimized: sitePredictionApi.getOptimized,
  compareSitePrediction: sitePredictionApi.compare,
  updateSitePrediction: sitePredictionApi.update,
  getSitePredictionScenarios: sitePredictionApi.getScenarios,
  deleteSitePredictionScenario: sitePredictionApi.deleteScenario,
  deleteLtePredictionOptimisedScenario: (payload, config = {}) =>
    api.post("/api/MapView/DeleteLtePredictionOptimisedScenario", payload, config),
  deleteSitePrediction: sitePredictionApi.delete,
  assignSitePredictionToProject: sitePredictionApi.assignToProject,

  // ==================== ML Site Data ====================
  getSiteNoMl: sitePredictionApi.getNoMl,
  getSiteMl: sitePredictionApi.getMl,

  // ==================== Image Upload ====================
  uploadImage: (formData) =>
    api.post("/api/MapView/UploadImage", formData, { headers: getPublicApiHeaders() }),
  uploadImageLegacy: (formData) =>
    api.post("/api/MapView/UploadImageLegacy", formData, { headers: getPublicApiHeaders() }),
};

export const gridAnalyticsApi = {
      computeAndStoreGridAnalytics: (params, config = {}) =>
    api.post("/api/GridAnalytics/ComputeAndStoreGridAnalytics", null, {
      params,
      ...config,
    }),
  getOptimizationScenarios: (params, config = {}) =>
    api.get("/api/GridAnalytics/GetOptimizationScenarios", { params, ...config }),
  setProjectGridSize: (params, config = {}) =>
    api.post("/api/GridAnalytics/SetProjectGridSize", null, {
      params,
      ...config,
    }),
  setProjectLogGrid: (params, config = {}) =>
    api.post("/api/GridAnalytics/SetProjectLogGrid", null, {
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
  login: (credentials) => api.post("/api/auth/login", credentials),
  getStateInfo: () => api.post("/Home/GetStateIformation"),
  forgotPassword: (data) => api.post("/Home/GetUserForgotPassword", data),
  resetPassword: (data) => api.post("/Home/ForgotResetPassword", data),
  logout: async (ip) => {
    try {
      // Preferred logout endpoint for the newer auth flow.
      return await api.post("/api/auth/logout");
    } catch (error) {
      // Backward-compat fallback for older deployments.
      return api.get("/Home/Logout", { params: { IP: ip || "" } });
    }
  },
  getLoggedUser: (ip) => api.post("/Home/GetLoggedUser", { ip }),
  getMasterUserTypes: () => api.get("/Home/GetMasterUserTypes"),

  getAuthStatus: () => api.get("/api/auth/status"),
};

export const settingApi = {
  checkSession: async () => {
    try {
      const response = await api.get("/api/Setting/CheckSession");
      return response;
    } catch (error) {
      if (isCancelledError(error) || isRequestCancelled(error)) {
        return null;
      }
      console.error("CheckSession error:", error);
      throw error;
    }
  },

  getThresholdSettings: async () => {
    try {
      const response = await api.get("/api/Setting/GetThresholdSettings");
      return response;
    } catch (error) {
      if (isCancelledError(error) || isRequestCancelled(error)) {
        return null;
      }
      console.error("GetThresholdSettings error:", error);
      throw error;
    }
  },

  saveThreshold: async (payload) => {
    try {

      const response = await api.post("/api/Setting/SaveThreshold", payload);
      return response;
    } catch (error) {
      if (isCancelledError(error) || isRequestCancelled(error)) {
        return null;
      }
      console.error("SaveThreshold error:", error);
      throw error;
    }
  },
};

export const excelApi = {
  uploadFile: async (formData, onUploadProgress = null) => {
    try {
      return await api.post("/ExcelUpload/UploadExcelFile", formData, {
        timeout: 7200000,
        onUploadProgress:
          onUploadProgress ||
          ((progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }),
      });
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      
      if (message.includes("timed out") || message.includes("timeout")) {
        throw error;
      }

     
      try {
        await authApi.checkStatus();
        throw error;
      } catch (statusError) {
        const cloudReachable = !(
          statusError?.isNetworkError === true ||
          /no response from server|network error|request setup failed/i.test(
            String(statusError?.message || ""),
          )
        );
        if (cloudReachable) {
          throw error;
        }
      }

      if (!shouldFallbackToOfflineCache(error)) throw error;
      const fallbackForm = new FormData();
      const mainFile = formData.get("UploadFile");
      const polygonFile = formData.get("UploadNoteFile");
      if (mainFile) fallbackForm.append("files", mainFile);
      if (polygonFile) fallbackForm.append("files", polygonFile);
      fallbackForm.append("workspaceName", "Auto Cache");
      fallbackForm.append(
        "metadata",
        JSON.stringify({
          source: "upload-data",
          upload_file_type: formData.get("UploadFileType") || "",
          remarks: formData.get("remarks") || "",
          project_name: formData.get("ProjectName") || "",
          session_ids: formData.get("SessionIds") || "",
        }),
      );
      return offlineApi.importFiles(fallbackForm);
    }
  },

  downloadTemplate: (fileType) => downloadTemplateFromCsharpApi(fileType),

  getUploadedFiles: async (type) => {
    try {
      return await api.get("/ExcelUpload/GetUploadedExcelFiles", {
        params: { FileType: type },
      });
    } catch (error) {
      if (!shouldFallbackToOfflineCache(error)) throw error;
      const [local, localSessions] = await Promise.all([
        offlineApi.getImports({ limit: 300, offset: 0 }),
        offlineApi.getSessions({ limit: 1000, offset: 0 }),
      ]);
      const sessionsByImportId = new Map();
      const sessionRows = Array.isArray(localSessions?.Data) ? localSessions.Data : [];
      for (const row of sessionRows) {
        const importId = String(row?.import_id || "").trim();
        if (!importId) continue;
        const sid = String(row?.id ?? row?.session_id ?? "").trim();
        if (!sid) continue;
        if (!sessionsByImportId.has(importId)) {
          sessionsByImportId.set(importId, []);
        }
        sessionsByImportId.get(importId).push(sid);
      }
      const data = Array.isArray(local?.Data)
        ? local.Data.map((item) => ({
            id: item.id,
            file_name: item.file_name,
            uploaded_by: item.imported_by || "Local Cache",
            status: item.status || "cached",
            remarks: item.remarks || "",
            uploaded_on: item.imported_at,
            session_id:
              sessionsByImportId.get(String(item?.id || "").trim())?.join(",") ||
              item?.metadata?.session_ids ||
              "",
          }))
        : [];
      return { Status: 1, Data: data };
    }
  },

  getSessions: async (fromDate, toDate) => {
    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();
    try {
      return await api.get("/ExcelUpload/GetSessions", {
        params: {
          fromDate: fromIso,
          toDate: toIso,
        },
      });
    } catch (error) {
      if (!shouldFallbackToOfflineCache(error)) throw error;
      const local = await offlineApi.getSessions({ limit: 1000, offset: 0 });
      const rows = Array.isArray(local?.Data) ? local.Data : [];
      const fromTs = new Date(fromIso).getTime();
      const toTs = new Date(toIso).getTime();
      const filtered = rows.filter((item) => {
        const t = new Date(item?.start_time || item?.created_at || 0).getTime();
        if (!Number.isFinite(t)) return true;
        return t >= fromTs && t <= toTs;
      });
      return {
        Status: 1,
        Data: filtered.map((item) => ({
          id: item?.id ?? item?.session_id,
          session_id: item?.session_id ?? item?.id,
          label: item?.label || `Session ${item?.session_id ?? item?.id ?? ""}`,
        })),
      };
    }
  },
};

export const uniReport = {
  getBand: async (formData, onUploadProgress = null) => {
    try {
      return await api.post("/api/UnifiedMapZipReport/DiscoverBands", formData, {
        timeout: 7200000,
        onUploadProgress:
          onUploadProgress ||
          ((progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }),
      });
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      
      if (message.includes("timed out") || message.includes("timeout")) {
        throw error;
      }

     
      try {
        await authApi.checkStatus();
        throw error;
      } catch (statusError) {
        const cloudReachable = !(
          statusError?.isNetworkError === true ||
          /no response from server|network error|request setup failed/i.test(
            String(statusError?.message || ""),
          )
        );
        if (cloudReachable) {
          throw error;
        }
      }

      if (!shouldFallbackToOfflineCache(error)) throw error;
      const fallbackForm = new FormData();
      const mainFile = formData.get("UploadFile");
      const polygonFile = formData.get("UploadNoteFile");
      if (mainFile) fallbackForm.append("files", mainFile);
      if (polygonFile) fallbackForm.append("files", polygonFile);
      fallbackForm.append("workspaceName", "Auto Cache");
      fallbackForm.append(
        "metadata",
        JSON.stringify({
          source: "upload-data",
          upload_file_type: formData.get("UploadFileType") || "",
          remarks: formData.get("remarks") || "",
          project_name: formData.get("ProjectName") || "",
          session_ids: formData.get("SessionIds") || "",
        }),
      );
      return offlineApi.importFiles(fallbackForm);
    }
  },

  generateFromZip: async (formData, onUploadProgress = null) => {
    try {
      return await api.post("/api/UnifiedMapZipReport/GenerateFromZip", formData, {
        timeout: 7200000,
        responseType: "blob",
        onUploadProgress:
          onUploadProgress ||
          ((progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }),
      });
    } catch (error) {
      throw error;
    }
  },
}


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

let autoSyncInFlight = false;
let lastAutoSyncAt = 0;
export const tryAutoSyncOfflineQueue = async () => {
  const now = Date.now();
  if (autoSyncInFlight) return { skipped: true, reason: "in-flight" };
  if (now - lastAutoSyncAt < 60_000) return { skipped: true, reason: "cooldown" };

  autoSyncInFlight = true;
  try {
    const services = await checkAllServices({ includePython: false });
    if (!services?.csharp?.healthy) {
      return { skipped: true, reason: "cloud-unhealthy" };
    }
    const result = await offlineApi.prepareSync({ limit: 500 });
    lastAutoSyncAt = Date.now();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  } finally {
    autoSyncInFlight = false;
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
  tryAutoSyncOfflineQueue,
  validateProjectExists,
  companyApi,
};
