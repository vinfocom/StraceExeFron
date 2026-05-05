// components/project/ProjectForm.jsx
import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileText,
  X,
  CheckSquare,
  Square,
  Download,
  Play,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  mapViewApi,
  buildingApi,
  excelApi,
  cellSiteApi,
  areaBreakdownApi,
  predictionApi,
} from "../../api/apiEndpoints";
import { useAuth } from "../../context/AuthContext";
import Spinner from "../common/Spinner";

const DEFAULT_MIN_SAMPLES = 10;

const resolveCompanyId = (user) => {
  const directCompanyId = Number(
    user?.company_id ?? user?.CompanyId ?? user?.companyId ?? 0
  );
  if (Number.isFinite(directCompanyId) && directCompanyId > 0) {
    return directCompanyId;
  }

  if (typeof window === "undefined") return 0;

  try {
    const cachedUser = JSON.parse(sessionStorage.getItem("user") || "null");
    const cachedCompanyId = Number(
      cachedUser?.company_id ??
        cachedUser?.CompanyId ??
        cachedUser?.companyId ??
        0
    );
    return Number.isFinite(cachedCompanyId) && cachedCompanyId > 0
      ? cachedCompanyId
      : 0;
  } catch {
    return 0;
  }
};

const PolygonDropdown = ({
  polygons,
  selectedPolygon,
  setSelectedPolygon,
  disabled,
}) => {
  const safePolygons = Array.isArray(polygons) ? polygons : [];

  return (
    <select
      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
      value={selectedPolygon || ""}
      onChange={(e) =>
        setSelectedPolygon(e.target.value ? Number(e.target.value) : null)
      }
      disabled={disabled}
    >
      <option value="">
        {safePolygons.length === 0
          ? "No polygons available"
          : "Select polygon..."}
      </option>
      {safePolygons.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}{" "}
          {p.sessionIds?.length > 0 ? `(${p.sessionIds.length} sessions)` : ""}
        </option>
      ))}
    </select>
  );
};

const SessionSelector = ({
  sessions,
  selectedSessions,
  setSelectedSessions,
  disabled,
}) => {
  const allSelected =
    sessions.length > 0 && selectedSessions.length === sessions.length;

  const toggleAll = () => {
    setSelectedSessions(allSelected ? [] : [...sessions]);
  };

  const toggleSession = (sessionId) => {
    setSelectedSessions(
      selectedSessions.includes(sessionId)
        ? selectedSessions.filter((id) => id !== sessionId)
        : [...selectedSessions, sessionId]
    );
  };

  if (!sessions || sessions.length === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-blue-900">
          Sessions ({selectedSessions.length}/{sessions.length} selected)
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={disabled}
          className="h-8 text-xs border-blue-300 hover:bg-blue-100"
        >
          {allSelected ? (
            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <Square className="h-3.5 w-3.5 mr-1.5" />
          )}
          {allSelected ? "Deselect All" : "Select All"}
        </Button>
      </div>

      <div className="space-y-1 max-h-36 overflow-y-auto rounded-md bg-white border border-blue-100 p-1">
        {sessions.map((sessionId) => (
          <label
            key={sessionId}
            className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50 rounded-md cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedSessions.includes(sessionId)}
              onChange={() => toggleSession(sessionId)}
              disabled={disabled}
              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 font-medium">
              Session {sessionId}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

const GridSizeInput = ({
  gridSize,
  setGridSize,
  disabled,
  label = "Area Grid Size (meters)",
  description = "Grid block size for area breakdown",
  presets = [50, 100, 200, 500],
  max = 10000,
}) => {
  return (
    <div className="space-y-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-gray-700">
          {label} <span className="text-red-500">*</span>
        </Label>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            type="number"
            value={gridSize}
            onChange={(e) => setGridSize(e.target.value)}
            disabled={disabled}
            min="1"
            max={String(max)}
            className="w-24 h-9"
          />
          <div className="flex gap-1.5">
            {presets.map((size) => (
              <Button
                key={size}
                type="button"
                variant={gridSize == size ? "default" : "outline"}
                size="sm"
                onClick={() => setGridSize(size.toString())}
                disabled={disabled}
                className="h-9 px-3 text-xs font-medium"
              >
                {size}m
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {description}
        </p>
      </div>
    </div>
  );
};

const PredictionOptions = ({
  enabled,
  setEnabled,
  indoorMode,
  setIndoorMode,
  predictionGrid,
  setPredictionGrid,
  disabled,
  sessionCount,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const gridPresets = [10, 22, 50, 100];

  return (
    <div className="space-y-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            id="run-prediction"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={disabled || sessionCount === 0}
            className="h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
          />
          <Label
            htmlFor="run-prediction"
            className="text-sm font-semibold text-purple-900 cursor-pointer"
          >
            Run LTE Prediction Pipeline
          </Label>
        </div>

        {enabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-8 text-xs text-purple-700 hover:bg-purple-100"
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            {showAdvanced ? "Hide" : "Options"}
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5 ml-1" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            )}
          </Button>
        )}
      </div>

      {sessionCount === 0 && (
        <p className="text-xs text-orange-600 font-medium">
          ⚠️ Select sessions to enable prediction
        </p>
      )}

      {enabled && sessionCount > 0 && (
        <p className="text-xs text-purple-600 font-medium">
          ✓ Will run prediction on {sessionCount} session(s) after project
          creation
        </p>
      )}

      {enabled && showAdvanced && (
        <div className="pt-3 border-t border-purple-200 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-purple-800">
              Indoor Detection Mode <span className="text-red-500">*</span>
            </Label>
            <select
              value={indoorMode}
              onChange={(e) => setIndoorMode(e.target.value)}
              disabled={disabled}
              className="w-full border border-purple-200 rounded-lg px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="heuristic">Heuristic (Default)</option>
              <option value="ml">Machine Learning</option>
              <option value="none">None</option>
            </select>
            <p className="text-xs text-gray-500">
              Method used to detect indoor/outdoor locations
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-purple-800">
              Prediction Grid Size (meters){" "}
              <span className="text-red-500">*</span>
            </Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                type="number"
                value={predictionGrid}
                onChange={(e) => setPredictionGrid(e.target.value)}
                disabled={disabled}
                min="1"
                max="1000"
                className="w-24 h-9"
              />
              <div className="flex gap-1.5">
                {gridPresets.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={predictionGrid == size ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPredictionGrid(size.toString())}
                    disabled={disabled}
                    className="h-9 px-3 text-xs font-medium"
                  >
                    {size}m
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Grid resolution for prediction output (default: 22m)
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProjectForm = ({
  polygons,
  loading: parentLoading,
  onProjectCreated,
}) => {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState("");
  const [selectedPolygon, setSelectedPolygon] = useState(null);
  const [selectedPolygonData, setSelectedPolygonData] = useState(null);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [gridSize, setGridSize] = useState("100");
  const [logGridSize, setLogGridSize] = useState("20");
  const [siteFile, setSiteFile] = useState(null);

  const [runPrediction, setRunPrediction] = useState(false);
  const [indoorMode, setIndoorMode] = useState("heuristic");
  const [predictionGrid, setPredictionGrid] = useState("22");

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState("");

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (selectedPolygon) {
      const polygon = polygons.find((p) => p.value === selectedPolygon);
      setSelectedPolygonData(polygon);
      setSelectedSessions(polygon?.sessionIds || []);
    } else {
      setSelectedPolygonData(null);
      setSelectedSessions([]);
    }
  }, [selectedPolygon, polygons]);

  useEffect(() => {
    if (selectedSessions.length === 0) {
      setRunPrediction(false);
    }
  }, [selectedSessions]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext === "csv") {
        setSiteFile(file);
        toast.success(`File selected: ${file.name}`);
      } else {
        toast.error("Invalid file type. Only CSV is supported for site prediction upload");
        e.target.value = null;
      }
    }
  };

  const removeFile = () => {
    setSiteFile(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  const validateForm = () => {
    const errors = [];

    if (!projectName.trim()) {
      errors.push("Project name is required");
    }

    if (!selectedPolygon) {
      errors.push("Please select a polygon");
    }

    const numGridSize = parseFloat(gridSize);
    if (isNaN(numGridSize) || numGridSize < 1 || numGridSize > 10000) {
      errors.push("Grid size must be between 1 and 10000");
    }

    const numLogGridSize = parseFloat(logGridSize);
    if (
      isNaN(numLogGridSize) ||
      numLogGridSize < 1 ||
      numLogGridSize > 10000
    ) {
      errors.push("Log grid size must be between 1 and 10000");
    }

    if (runPrediction) {
      const numPredictionGrid = parseFloat(predictionGrid);
      if (
        isNaN(numPredictionGrid) ||
        numPredictionGrid < 1 ||
        numPredictionGrid > 1000
      ) {
        errors.push("Prediction grid must be between 1 and 1000");
      }
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      toast.error(validationErrors.join(", "));
      return;
    }

    setLoading(true);
    let projectId = null;
    let projectData = null;
    let predictionResult = null;
    const completedSteps = [];

    try {
      setCurrentStep("Creating project...");

      const projectPayload = {
        ProjectName: projectName.trim(),
        PolygonIds: [selectedPolygon],
        SessionIds: selectedSessions,
        GridSize: String(parseFloat(gridSize)),
        LogGrid: String(parseFloat(logGridSize)),
        log_grid: String(parseFloat(logGridSize)),
        ...(Number.isFinite(scopedCompanyId) && scopedCompanyId > 0
          ? { company_id: scopedCompanyId }
          : {}),
      };

      const projectRes = await mapViewApi.createProjectWithPolygons(
        projectPayload
      );

      if (!projectRes || projectRes.Status !== 1) {
        throw new Error(projectRes?.Message || "Project creation failed");
      }

      projectId =
        projectRes?.Data?.projectId ||
        projectRes?.Data?.project_id ||
        projectRes?.Data?.id;
      if (!projectId) throw new Error("No project ID received");

      projectData = projectRes.Data?.project || projectRes.Data;
      toast.success(`Project created! ID: ${projectId}`);
      completedSteps.push("project_created");

      if (selectedPolygonData?.wkt) {
        setCurrentStep("Generating buildings...");

        try {
          const buildingPayload = {
            WKT: selectedPolygonData.wkt,
            Name: selectedPolygonData.label || projectName.trim(),
            project_id: projectId,
          };

          const buildingRes = await buildingApi.generateBuildings(
            buildingPayload
          );

          if (buildingRes.Status === 1 || buildingRes.success) {
            toast.success(
              `Generated ${buildingRes.Stats?.extracted || 0} buildings`
            );
            completedSteps.push("buildings_generated");
          }
        } catch (err) {
          toast.warn("Building generation skipped");
        }

        setCurrentStep(`Analyzing area (${gridSize}m grid)...`);

        try {
          const breakdownPayload = {
            WKT: selectedPolygonData.wkt,
            project_id: projectId,
            Name: projectName.trim(),
            grid: parseFloat(gridSize),
            min_samples: DEFAULT_MIN_SAMPLES,
          };

          const breakdownRes = await areaBreakdownApi.getAreaBreakdown(
            breakdownPayload
          );

          if (breakdownRes?.status === "success") {
            const details = breakdownRes.details || [];
            toast.success(
              `Area analysis complete: ${details.length} items processed`
            );
            completedSteps.push("breakdown_processed");
          }
        } catch (err) {
          toast.warn(
            "Area breakdown failed: " + (err.message || "Unknown error")
          );
        }
      }

      if (siteFile) {
        setCurrentStep(`Saving ${siteFile.name} to site prediction...`);

        try {
          const formData = new FormData();
          formData.append("ProjectId", projectId.toString());
          formData.append("File", siteFile);

          const uploadRes = await cellSiteApi.uploadSitePredictionCsv(formData);

          if (uploadRes.success || uploadRes.Status === 1) {
            const inserted = Number(uploadRes.Inserted ?? uploadRes.inserted ?? 0);
            toast.success(
              inserted > 0
                ? `Site prediction saved (${inserted} rows)`
                : "Site file processed"
            );
            completedSteps.push("site_uploaded");
          }
        } catch (err) {
          toast.warn(`Site upload failed: ${err.message}`);
        }
      }

      if (selectedSessions.length > 0) {
        setCurrentStep(`Processing ${selectedSessions.length} sessions...`);

        try {
          const sessionPayload = {
            project_id: projectId,
            project_name: projectName.trim(),
            polygon_id: selectedPolygon,
            session_ids: selectedSessions,
            method: "noml",
          };

          const sessionRes = await cellSiteApi.uploadSessions(sessionPayload);

          if (sessionRes.success || sessionRes.Status === 1) {
            toast.success(`Processed ${selectedSessions.length} sessions`);
            completedSteps.push("sessions_uploaded");
          }
        } catch (err) {
          if (!err.message?.includes("already exists")) {
            toast.warn(`Session upload issue: ${err.message}`);
          }
        }
      }

      if (runPrediction && selectedSessions.length > 0) {
        setCurrentStep(`Running LTE prediction (${predictionGrid}m grid)...`);

        try {
          const predictionPayload = {
            Project_id: projectId,
            Session_ids: selectedSessions,
            indoor_mode: indoorMode,
            grid: parseFloat(predictionGrid),
          };

          const predRes = await predictionApi.runPrediction(predictionPayload);

          if (predRes.status === "success" || predRes.message) {
            predictionResult = predRes;
            toast.success(
              `Prediction complete! ${
                predRes.predictions_saved || 0
              } predictions saved`
            );
            completedSteps.push("prediction_completed");
          }
        } catch (err) {
          toast.warn(`Prediction failed: ${err.message}`);
        }
      }

      setCurrentStep("");
      toast.success("🎉 Project created successfully!", { autoClose: 5000 });

      setProjectName("");
      setSelectedPolygon(null);
      setSelectedSessions([]);
      setSiteFile(null);
      setGridSize("100");
      setLogGridSize("20");
      setRunPrediction(false);
      setIndoorMode("heuristic");
      setPredictionGrid("22");
      if (fileInputRef.current) fileInputRef.current.value = null;

      if (onProjectCreated) {
        onProjectCreated({
          projectId,
          projectData,
          completedSteps,
          predictionResult,
          gridSize: parseFloat(gridSize),
          logGridSize: parseFloat(logGridSize),
          minSamples: DEFAULT_MIN_SAMPLES,
          predictionGrid: parseFloat(predictionGrid),
        });
      }
    } catch (err) {
      let errorMessage = "Failed to create project";
      if (err.response?.data?.Message) {
        errorMessage = err.response.data.Message;
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }

      toast.error(errorMessage, { autoClose: 8000 });
    } finally {
      setLoading(false);
      setCurrentStep("");
    }
  };

  const canSubmit =
    projectName.trim() &&
    selectedPolygon &&
    parseFloat(gridSize) > 0 &&
    parseFloat(logGridSize) > 0;
  const isLoadingPolygons =
    parentLoading && (!polygons || polygons.length === 0);
  const scopedCompanyId = resolveCompanyId(user);

  return (
    <Card className="shadow-lg border-gray-200">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Create New Project</CardTitle>
        <CardDescription className="text-gray-500">
          Set up a project with polygon, buildings, area breakdown, and optional
          prediction
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Project Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., City Coverage Analysis"
              disabled={loading}
              maxLength={255}
              className="h-10"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              Select Polygon <span className="text-red-500">*</span>
            </Label>

            {isLoadingPolygons ? (
              <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <Spinner className="h-4 w-4" />
                <span className="text-sm text-gray-600">
                  Loading polygons...
                </span>
              </div>
            ) : (
              <PolygonDropdown
                polygons={polygons || []}
                selectedPolygon={selectedPolygon}
                setSelectedPolygon={setSelectedPolygon}
                disabled={loading}
              />
            )}

            {selectedPolygonData?.wkt && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-800 font-semibold">
                  ✓ Polygon WKT loaded
                </p>
                <p
                  className="text-xs text-green-600 mt-1 truncate font-mono"
                  title={selectedPolygonData.wkt}
                >
                  {selectedPolygonData.wkt.substring(0, 80)}...
                </p>
              </div>
            )}

            {selectedPolygonData && (
              <div className="space-y-3">
                <GridSizeInput
                  gridSize={gridSize}
                  setGridSize={setGridSize}
                  disabled={loading}
                />
                <GridSizeInput
                  gridSize={logGridSize}
                  setGridSize={setLogGridSize}
                  disabled={loading}
                  label="Log Grid Size (meters)"
                  description="Grid size used by Unified Map grid view"
                  presets={[10, 20, 25, 50]}
                />
              </div>
            )}
          </div>

          {selectedPolygonData?.sessionIds?.length > 0 && (
            <SessionSelector
              sessions={selectedPolygonData.sessionIds}
              selectedSessions={selectedSessions}
              setSelectedSessions={setSelectedSessions}
              disabled={loading}
            />
          )}

          {selectedPolygonData && (
            <PredictionOptions
              enabled={runPrediction}
              setEnabled={setRunPrediction}
              indoorMode={indoorMode}
              setIndoorMode={setIndoorMode}
              predictionGrid={predictionGrid}
              setPredictionGrid={setPredictionGrid}
              disabled={loading}
              sessionCount={selectedSessions.length}
            />
          )}

          <details className="group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                <Upload className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Upload Site Data (Optional)
                </span>
                {siteFile && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    1 file
                  </span>
                )}
                <ChevronDown className="h-4 w-4 ml-auto text-gray-400 group-open:rotate-180 transition-transform" />
              </div>
            </summary>

            <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => excelApi.downloadTemplate(3)}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download Template
                </Button>
              </div>

              {!siteFile ? (
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              ) : (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        {siteFile.name}
                      </p>
                      <p className="text-xs text-blue-600">
                        {(siteFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeFile}
                    disabled={loading}
                    className="h-8 w-8 p-0 text-gray-500 hover:text-red-500 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </details>

          

          <div className="flex justify-end pt-3">
            <Button
              type="submit"
              disabled={loading || !canSubmit || isLoadingPolygons}
              className="min-w-[180px] h-10 font-semibold"
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Create Project
                </>
              )}
            </Button>
          </div>

          {/* {selectedPolygonData && !loading && (
            <div className="text-xs text-gray-500 border-t border-gray-200 h-2 pt-4 mt-4">
              <p className="font-semibold text-gray-700 mb-2">Pipeline Steps:</p>
              <ol className="list-decimal list-inside space-y-1 ml-1 text-gray-600">
                <li>Create project with polygon</li>
                <li>Generate buildings from WKT</li>
                <li>Area breakdown (grid: {gridSize}m)</li>
                {selectedSessions.length > 0 && <li>Process {selectedSessions.length} session(s)</li>}
                {siteFile && <li>Upload site data</li>}
                {runPrediction && selectedSessions.length > 0 && (
                  <li className="text-purple-600">Run prediction (grid: {predictionGrid}m, mode: {indoorMode})</li>
                )}
              </ol>
            </div>
          )} */}
        </form>
      </CardContent>
    </Card>
  );
};

export default ProjectForm;
