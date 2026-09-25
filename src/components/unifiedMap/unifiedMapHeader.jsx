import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LogOut,
  Filter,
  ChartBar,
  LayoutGrid,
  Plus,
  Minus,
  UploadCloud,
  ArrowLeft,
  ChevronDown,
  SlidersHorizontal,
  Eye,
  Trash2,
  Radio,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { mapViewApi } from "@/api/apiEndpoints";
import { toast } from "react-toastify";
import { normalizeSiteUploadFile, getSiteUploadValidationMessage } from "@/utils/siteUpload";
import SiteUploadValidationDialog from "@/components/common/SiteUploadValidationDialog";
import Spinner from "@/components/common/Spinner";
import ProjectsDropdown from "../project/ProjectsDropdown";
import DrawingControlsPanel from "../map/layout/DrawingControlsPanel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsDialog } from "@/context/SettingsDialogContext";
import {
  findProjectInProjectsCache,
  upsertProjectInProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";
import {
  MAP_ZOOM_LOCK_EVENT,
  MAP_ZOOM_LOCK_STORAGE_KEY,
  readInitialMapZoomLock,
} from "@/utils/unifiedMapConfig";

const isTimeoutError = (error) => {
  const message = String(
    error?.message ||
      error?.response?.data?.Message ||
      error?.response?.data?.message ||
      "",
  ).toLowerCase();

  return (
    error?.code === "ECONNABORTED" ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
};

const SelectRow = ({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = "",
}) => (
  <div className={`min-w-0 flex-1 space-y-1.5 ${className}`}>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-full min-w-0 bg-slate-800 border-slate-600 text-xs text-white [&>span]:truncate">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-w-[340px] min-w-[240px] bg-slate-900 border-slate-700 text-white">
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="pr-8 text-xs text-white focus:text-white"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

function UnifiedHeader({
  onBack,
  onToggleControls,
  isControlsOpen,
  isLeftOpen,
  onLeftToggle,
  showAnalytics,
  projectId,
  sessionIds,
  opacity,
  project,
  setProject,
  setOpacity,
  logRadius = 12,
  setLogRadius,
  neighborLogsAvailable = false,
  neighborSquareSize = 12,
  setNeighborSquareSize,
  triangleSizeAvailable = false,
  triangleScaleMultiplier = 1,
  setTriangleScaleMultiplier,
  defaultSiteBeamwidth = 30,
  setDefaultSiteBeamwidth,
  onUIChange,
  onFillWithLogs,
  ui,
  onSettingsSaved,
  onOpenMultiView,
  gridViewEnabled = false,
  onGridViewToggle,
  canEnableGridView = false,
  onMapSnapshot,
  onAddSiteClick,
  enableSiteToggle = false,
  siteToggle,
  setSiteToggle,
  sitePredictionVersion = "original",
  sitePredictionScenarioId = null,
  setSitePredictionScenarioId,
  sitePredictionScenarioOptions = [],
  onDeleteSitePredictionScenario,
  siteLabelField = "none",
  setSiteLabelField,
  storedGridOpacity = 0.55,
  setStoredGridOpacity,
  isRestoringFromStorage = false,
}) {
  const { user, logout } = useAuth();
  const { openSettings } = useSettingsDialog();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isElectronRuntime =
    typeof navigator !== "undefined" &&
    /electron/i.test(navigator.userAgent || "");

  const effectiveProjectId =
    projectId || searchParams.get("project_id") || searchParams.get("project");
  const sessionParam =
    searchParams.get("sessionId") || searchParams.get("session");
  const effectiveSessionIds =
    sessionIds ||
    (sessionParam
      ? sessionParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id)
      : []);
  const [isUploading, setIsUploading] = useState(false);
  const l3Flag = project?.l3 ?? project?.L3;
  const hasProjectL3 =
    l3Flag === true || l3Flag === 1 || String(l3Flag).toLowerCase() === "true";
  const l3SessionIds = [...new Set(
    (Array.isArray(effectiveSessionIds) ? effectiveSessionIds : String(effectiveSessionIds || "").split(","))
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  )];
  const handleOpenL3 = async () => {
    if (!l3SessionIds.length) return;
    const params = new URLSearchParams({ sessionIds: l3SessionIds.join(",") });
    if (effectiveProjectId) params.set("projectId", String(effectiveProjectId));
    if (window.electronWindow?.openL3) {
      try {
        await window.electronWindow.openL3(params.toString());
      } catch (error) {
        console.error("Failed to open L3 analyzer:", error);
        toast.error("Could not open the L3 analyzer window.");
      }
      return;
    }
    const url = new URL(`/project-l3-events?${params}`, window.location.href);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeQuickControl, setActiveQuickControl] = useState(null);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [siteValidationMessage, setSiteValidationMessage] = useState("");
  const [isValidatingSiteFile, setIsValidatingSiteFile] = useState(false);
  const [mapZoomLocked, setMapZoomLockedState] = useState(
    readInitialMapZoomLock,
  );

  useEffect(() => {
    const handleMapZoomLockChange = (event) => {
      setMapZoomLockedState(Boolean(event?.detail?.locked));
    };
    window.addEventListener(MAP_ZOOM_LOCK_EVENT, handleMapZoomLockChange);
    return () =>
      window.removeEventListener(MAP_ZOOM_LOCK_EVENT, handleMapZoomLockChange);
  }, []);

  const toggleMapZoomLock = useCallback(() => {
    const nextLocked = !mapZoomLocked;
    window.localStorage.setItem(
      MAP_ZOOM_LOCK_STORAGE_KEY,
      nextLocked ? "1" : "0",
    );
    window.dispatchEvent(
      new CustomEvent(MAP_ZOOM_LOCK_EVENT, { detail: { locked: nextLocked } }),
    );
  }, [mapZoomLocked]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    setSiteValidationMessage("");
    setSelectedFile(null);
    if (!file) return;
    setIsValidatingSiteFile(true);
    try {
      const result = await normalizeSiteUploadFile(file);
      if (!result.ok) {
        setSiteValidationMessage(getSiteUploadValidationMessage(result));
        return;
      }
      setSelectedFile(file);
    } catch {
      toast.error("Unable to read file. Please verify CSV/XLSX format.");
    } finally {
      setIsValidatingSiteFile(false);
    }
  };

  const handleQuickUpload = async () => {
    if (!selectedFile) {
      toast.warn("Please select a file first.");
      return;
    }
    if (!effectiveProjectId) {
      toast.error("ProjectId is missing. Open a project first, then upload.");
      return;
    }

    let uploadFile = selectedFile;
    try {
      const normalizedCsv = await normalizeSiteUploadFile(selectedFile);
      if (!normalizedCsv.ok) {
        setSiteValidationMessage(getSiteUploadValidationMessage(normalizedCsv));
        return;
      }
      uploadFile = normalizedCsv.file;
    } catch {
      toast.error("Unable to read file. Please verify CSV/XLSX format.");
      return;
    }

    const formData = new FormData();
    // Send both keys for compatibility with older/newer backend binders.
    formData.append("File", uploadFile);
    formData.append("UploadFile", uploadFile);
    formData.append("ProjectId", String(effectiveProjectId));

    setIsUploading(true);
    try {
      const resp = await mapViewApi.uploadSitePredictionCsv(formData);
      if (resp?.Status === 1 || resp?.status === 1) {
        const inserted = resp.Inserted ?? resp.inserted;
        const skipped = Number(resp.Skipped ?? resp.skipped ?? 0);
        if (skipped > 0) {
          toast.warn(`${inserted ?? 0} rows uploaded; ${skipped} rows skipped. Please check the file for missing or invalid values.`, { autoClose: false });
        } else {
          toast.success(inserted != null ? `File uploaded successfully! ${inserted} rows saved.` : "File uploaded successfully!");
        }
        setSelectedFile(null);
        setOpenImportDialog(false);
      } else {
        toast.error(resp?.Message || resp?.message || "Upload failed");
      }
    } catch (error) {
      const errorMsg =
        error?.data?.Message ||
        error?.data?.message ||
        error?.response?.data?.Message ||
        error?.response?.data?.message ||
        error?.message ||
        "Upload request failed.";
      toast.error(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const fetchProject = async () => {
      const numericProjectId = Number(effectiveProjectId);
      const isCurrentProjectLoaded =
        Number(project?.id) === numericProjectId && Boolean(project?.project_name);
      const cachedProject = findProjectInProjectsCache(effectiveProjectId);

      if (isCurrentProjectLoaded) {
        upsertProjectInProjectsCache(project);
        return;
      }

      if (cachedProject) {
        setProject((prev) =>
          prev?.id === cachedProject.id ? prev : cachedProject,
        );
        upsertProjectInProjectsCache(cachedProject);
        return;
      }

      try {
        const response = await mapViewApi.getProjects(undefined, {
          timeout: 30000,
          dedupe: false,
        });
        const allProjects = response?.Data || [];

        if (!Array.isArray(allProjects)) {
          return;
        }
        writeProjectsListCache(allProjects);

        const matchedProject = allProjects.find(
          (project) => project.id === Number(effectiveProjectId),
        );

        if (matchedProject) {
          setProject((prev) =>
            prev?.id === matchedProject.id ? prev : matchedProject,
          );
          upsertProjectInProjectsCache(matchedProject);
          return;
        }

        toast.warn(`Project ${effectiveProjectId} was not found.`);
      } catch (error) {
        console.error("Failed to fetch project info", error);
        if (isTimeoutError(error)) {
          toast.warn(
            `Project ${effectiveProjectId} details timed out while loading.`,
          );
        }
      }
    };

    if (effectiveProjectId) {
      fetchProject();
    }
  }, [effectiveProjectId, project, setProject]);

  const isMapPage = location.pathname.includes("unified-map");
  const currentOpacityPercent = Math.round((opacity ?? 0.8) * 100);
  const currentStoredGridOpacityPercent = Math.round(
    (Number.isFinite(Number(storedGridOpacity)) ? Number(storedGridOpacity) : 0.55) *
      100,
  );
  const currentLogRadius = Number.isFinite(Number(logRadius))
    ? Number(logRadius)
    : 12;
  const currentNeighborSquareSize = Number.isFinite(Number(neighborSquareSize))
    ? Number(neighborSquareSize)
    : 12;
  const currentTriangleScaleMultiplier = Number.isFinite(
    Number(triangleScaleMultiplier),
  )
    ? Number(triangleScaleMultiplier)
    : 1;
  const currentDefaultSiteBeamwidth = Number.isFinite(
    Number(defaultSiteBeamwidth),
  )
    ? Number(defaultSiteBeamwidth)
    : 30;
  const minTriangleScale = 0.25;
  const maxTriangleScale = 5;
  const triangleScaleStep = 0.25;
  const minBeamwidth = 5;
  const maxBeamwidth = 180;

  const adjustOpacity = (deltaPercent) => {
    const nextPercent = Math.max(
      0,
      Math.min(100, currentOpacityPercent + deltaPercent),
    );
    setOpacity(nextPercent / 100);
  };

  const updateOpacityFromInput = (rawValue) => {
    const nextPercent = Number(rawValue);
    if (!Number.isFinite(nextPercent)) return;
    setOpacity(Math.max(0, Math.min(100, nextPercent)) / 100);
  };

  const adjustStoredGridOpacity = (deltaPercent) => {
    if (!setStoredGridOpacity) return;
    const nextPercent = Math.max(
      10,
      Math.min(100, currentStoredGridOpacityPercent + deltaPercent),
    );
    setStoredGridOpacity(nextPercent / 100);
  };

  const updateStoredGridOpacityFromInput = (rawValue) => {
    if (!setStoredGridOpacity) return;
    const nextPercent = Number(rawValue);
    if (!Number.isFinite(nextPercent)) return;
    setStoredGridOpacity(Math.max(10, Math.min(100, nextPercent)) / 100);
  };

  const adjustLogRadius = (delta) => {
    if (!setLogRadius) return;
    const nextRadius = Math.max(4, Math.min(40, currentLogRadius + delta));
    setLogRadius(nextRadius);
  };

  const updateLogRadiusFromInput = (rawValue) => {
    if (!setLogRadius) return;
    const nextRadius = Number(rawValue);
    if (!Number.isFinite(nextRadius)) return;
    setLogRadius(Math.max(2, Math.min(40, Math.round(nextRadius))));
  };

  const adjustNeighborSquareSize = (delta) => {
    if (!setNeighborSquareSize) return;
    const nextSize = Math.max(
      3,
      Math.min(80, currentNeighborSquareSize + delta),
    );
    setNeighborSquareSize(nextSize);
  };

  const updateNeighborSquareSizeFromInput = (rawValue) => {
    if (!setNeighborSquareSize) return;
    const nextSize = Number(rawValue);
    if (!Number.isFinite(nextSize)) return;
    setNeighborSquareSize(Math.max(3, Math.min(80, Math.round(nextSize))));
  };

  const adjustTriangleScale = (delta) => {
    if (!setTriangleScaleMultiplier) return;
    const nextValue = Number(
      (currentTriangleScaleMultiplier + delta).toFixed(2),
    );
    setTriangleScaleMultiplier(
      Math.max(minTriangleScale, Math.min(maxTriangleScale, nextValue)),
    );
  };

  const updateTriangleScaleFromInput = (rawValue) => {
    if (!setTriangleScaleMultiplier) return;
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) return;
    setTriangleScaleMultiplier(
      Math.max(minTriangleScale, Math.min(maxTriangleScale, nextValue)),
    );
  };

  const adjustDefaultBeamwidth = (delta) => {
    if (!setDefaultSiteBeamwidth) return;
    const nextValue = Math.round(currentDefaultSiteBeamwidth + delta);
    setDefaultSiteBeamwidth(
      Math.max(minBeamwidth, Math.min(maxBeamwidth, nextValue)),
    );
  };

  const updateDefaultBeamwidthFromInput = (rawValue) => {
    if (!setDefaultSiteBeamwidth) return;
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) return;
    setDefaultSiteBeamwidth(
      Math.max(minBeamwidth, Math.min(maxBeamwidth, Math.round(nextValue))),
    );
  };

  const toggleQuickControl = useCallback((controlKey) => {
    setActiveQuickControl((prev) => (prev === controlKey ? null : controlKey));
  }, []);

  const utilityMenuItems = [
    {
      label: "Snapshot",
      action: () => onMapSnapshot?.(),
      disabled: !canEnableGridView,
    },
    {
      label: "Add Site",
      action: () => onAddSiteClick?.(),
    },
    {
      label: "Import Site",
      action: () => setOpenImportDialog(true),
    },
    { label: "Opacity", action: () => toggleQuickControl("opacity") },
    {
      label: "Baseline Opacity",
      action: () => toggleQuickControl("stored-grid-opacity"),
      disabled: typeof setStoredGridOpacity !== "function",
    },
    { label: "Log Radius", action: () => toggleQuickControl("radius") },
    {
      label: "Secondary Radius",
      action: () => toggleQuickControl("neighbors"),
      disabled: !neighborLogsAvailable,
    },
    {
      label: "Site Size",
      action: () => toggleQuickControl("triangle"),
      disabled: !triangleSizeAvailable,
    },
    {
      label: "Beamwidth",
      action: () => toggleQuickControl("beamwidth"),
      disabled: !triangleSizeAvailable,
    },
    {
      label: "Map Lock",
      action: toggleMapZoomLock,
      checked: mapZoomLocked,
    },
    {
      label: "Settings",
      action: () => openSettings({ onSaveSuccess: onSettingsSaved }),
    },
  ];

  useEffect(() => {
    if (!neighborLogsAvailable && activeQuickControl === "neighbors") {
      setActiveQuickControl(null);
    }
  }, [neighborLogsAvailable, activeQuickControl]);

  useEffect(() => {
    if (!triangleSizeAvailable && activeQuickControl === "triangle") {
      setActiveQuickControl(null);
    }
  }, [triangleSizeAvailable, activeQuickControl]);


  useEffect(() => {
    const handleUtilityAction = (event) => {
      const action = event?.detail?.action;

      if (!action) return;

      if (action === "settings") {
        openSettings({ onSaveSuccess: onSettingsSaved });
        return;
      }
      if (!isMapPage || !action) return;

      if (action === "add-site") {
        onAddSiteClick?.();
        return;
      }
      if (action === "opacity") {
        toggleQuickControl("opacity");
        return;
      }
      if (action === "stored-grid-opacity") {
        toggleQuickControl("stored-grid-opacity");
        return;
      }
      if (action === "log-radius") {
        toggleQuickControl("radius");
        return;
      }
      if (action === "neighbor-radius") {
        if (neighborLogsAvailable) {
          toggleQuickControl("neighbors");
        }
        return;
      }
      if (action === "triangle-size") {
        if (triangleSizeAvailable) {
          toggleQuickControl("triangle");
        }
        return;
      }
      if (action === "beamwidth") {
        toggleQuickControl("beamwidth");
        return;
      }
      if (action === "import") {
        setOpenImportDialog(true);
        return;
      }
      if (action === "snapshot") {
        if (canEnableGridView) {
          onMapSnapshot?.();
        }
      }
    };

    window.addEventListener("stracer:utility-action", handleUtilityAction);
    return () =>
      window.removeEventListener("stracer:utility-action", handleUtilityAction);
  }, [
    isMapPage,
    neighborLogsAvailable,
    onAddSiteClick,
    onSettingsSaved,
    onMapSnapshot,
    openSettings,
    canEnableGridView,
    triangleSizeAvailable,
    toggleQuickControl,
  ]);

  return (
    <header className="min-h-14 bg-gray-800 text-white shadow-sm flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 px-3 sm:px-4 xl:px-6 py-2 xl:py-0 flex-shrink-0 relative overflow-visible z-10">
      {isRestoringFromStorage && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-slate-700/80">
          <div className="h-full w-1/3 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-cyan-400/90 shadow-[0_0_12px_rgba(34,211,238,0.65)]" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
        {isMapPage && (
          <>
            <Button
              onClick={() => onBack?.()}
              size="sm"
              className="h-9 shrink-0 flex gap-1 items-center bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <h1 className="min-w-[96px] max-w-[min(42vw,420px)] truncate text-base md:text-xl font-semibold">
              <span className="truncate align-bottom">
                {project?.project_name || "Drive Session"}
              </span>
              <span className="hidden xl:inline text-sm font-normal text-gray-400 ml-2">
                {effectiveProjectId && `(Project: ${effectiveProjectId})`}
              </span>
            </h1>

            <Button
              onClick={onToggleControls}
              size="sm"
              title={isControlsOpen ? "Hide filters" : "Show filters"}
              className={`h-9 shrink-0 flex gap-1 items-center bg-blue-600 hover:bg-blue-500
                ${
                  isControlsOpen
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-blue-600 hover:bg-blue-500"
                }
               text-white`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden xl:inline">
                {isControlsOpen ? "Hide" : "Filter"}
              </span>
            </Button>

            <Button
              onClick={onLeftToggle}
              size="sm"
              title={showAnalytics ? "Hide analytics" : "Show analytics"}
              className={`h-9 shrink-0 flex gap-1 items-center ${
                showAnalytics
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-blue-600 hover:bg-blue-500"
              } text-white`}
            >
              <ChartBar className="h-4 w-4" />
              <span className="hidden xl:inline">
                {showAnalytics ? "Hide" : "Analytics"}
              </span>
            </Button>

            {hasProjectL3 && (
              <Button
                onClick={handleOpenL3}
                disabled={l3SessionIds.length === 0}
                size="sm"
                title={l3SessionIds.length ? "Open L3 for current sessions in a new tab" : "No sessions available for L3"}
                aria-label="Open L3 analysis in a new tab"
                className="h-9 shrink-0 flex gap-1 items-center bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Radio className="h-4 w-4" />
                <span>L3</span>
              </Button>
            )}

            <Button
              onClick={() => onOpenMultiView?.()}
              size="sm"
              title="Multi Map"
              className="h-9 shrink-0 flex gap-1 items-center bg-blue-600 hover:bg-blue-500 text-white"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden xl:inline">Multi Map</span>
            </Button>

            

            {!isElectronRuntime && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    title="View"
                    className="h-9 shrink-0 flex gap-1 items-center bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="hidden xl:inline">View</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white text-slate-800">
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/mapview")}>
                    Map View
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.reload()}>
                    Reload
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {activeQuickControl === "opacity" && (
              <div className="flex max-w-full flex-wrap items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Opacity
                </span>
                <button
                  type="button"
                  onClick={() => adjustOpacity(-5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease opacity"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={currentOpacityPercent}
                  onChange={(e) => updateOpacityFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustOpacity(5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase opacity"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="text-xs text-blue-300 font-medium">%</span>
              </div>
            )}

            {activeQuickControl === "stored-grid-opacity" && (
              <div className="flex max-w-full flex-wrap items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Baseline Opacity
                </span>
                <button
                  type="button"
                  onClick={() => adjustStoredGridOpacity(-5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease baseline opacity"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={10}
                  max={100}
                  value={currentStoredGridOpacityPercent}
                  onChange={(e) =>
                    updateStoredGridOpacityFromInput(e.target.value)
                  }
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustStoredGridOpacity(5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase baseline opacity"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="text-xs text-blue-300 font-medium">%</span>
              </div>
            )}

            {activeQuickControl === "radius" && (
              <div className="flex max-w-full flex-wrap items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Log Radius
                </span>
                <button
                  type="button"
                  onClick={() => adjustLogRadius(-1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease log radius"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={4}
                  max={40}
                  value={currentLogRadius}
                  onChange={(e) => updateLogRadiusFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustLogRadius(1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase log radius"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}

            {!isElectronRuntime && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    title="Utility"
                    className="h-9 shrink-0 flex gap-1 items-center bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="hidden xl:inline">Utility</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white text-slate-800">
                  <DropdownMenuLabel>Utility</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {utilityMenuItems.map((item) =>
                    item.checked !== undefined ? (
                      <DropdownMenuCheckboxItem
                        key={item.label}
                        className="pr-8 pl-2 [&>span]:right-2 [&>span]:left-auto"
                        disabled={item.disabled}
                        checked={item.checked}
                        onSelect={(e) => {
                          e.preventDefault();
                          item.action();
                        }}
                      >
                        {item.label}
                      </DropdownMenuCheckboxItem>
                    ) : (
                      <DropdownMenuItem
                        key={item.label}
                        disabled={item.disabled}
                        onClick={item.action}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {activeQuickControl === "neighbors" && neighborLogsAvailable && (
              <div className="flex max-w-full flex-wrap items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Secondary Size
                </span>
                <button
                  type="button"
                  onClick={() => adjustNeighborSquareSize(-1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease neighbor square size"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={3}
                  max={80}
                  value={currentNeighborSquareSize}
                  onChange={(e) =>
                    updateNeighborSquareSizeFromInput(e.target.value)
                  }
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustNeighborSquareSize(1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase neighbor square size"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}

            {activeQuickControl === "triangle" && triangleSizeAvailable && (
              <div className="flex max-w-full flex-wrap items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Site Size
                </span>
                <button
                  type="button"
                  onClick={() => adjustTriangleScale(-triangleScaleStep)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  disabled={currentTriangleScaleMultiplier <= minTriangleScale}
                  title="Decrease Site size"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={minTriangleScale}
                  max={maxTriangleScale}
                  step={0.25}
                  value={currentTriangleScaleMultiplier}
                  onChange={(e) => updateTriangleScaleFromInput(e.target.value)}
                  className="h-7 w-16 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustTriangleScale(triangleScaleStep)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  disabled={currentTriangleScaleMultiplier >= maxTriangleScale}
                  title="Increase Site size"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setTriangleScaleMultiplier?.(1)}
                  disabled={
                    Math.abs(currentTriangleScaleMultiplier - 1) < 0.001
                  }
                >
                  Reset
                </Button>
              </div>
            )}

            {activeQuickControl === "beamwidth" && (
              <div className="flex max-w-full flex-wrap items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Beamwidth
                </span>
                <button
                  type="button"
                  onClick={() => adjustDefaultBeamwidth(-5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  disabled={currentDefaultSiteBeamwidth <= minBeamwidth}
                  title="Decrease default beamwidth"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={minBeamwidth}
                  max={maxBeamwidth}
                  value={currentDefaultSiteBeamwidth}
                  onChange={(e) =>
                    updateDefaultBeamwidthFromInput(e.target.value)
                  }
                  className="h-7 w-16 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustDefaultBeamwidth(5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  disabled={currentDefaultSiteBeamwidth >= maxBeamwidth}
                  title="Increase default beamwidth"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="text-xs text-blue-300 font-medium">deg</span>
              </div>
            )}
            {enableSiteToggle && (
              <div className="grid min-w-[320px] grid-cols-4 gap-2 xl:min-w-[430px]">
                <SelectRow
                  className="pt-0"
                  value={siteToggle}
                  onChange={setSiteToggle}
                  options={[
                    { value: "Cell", label: "Cell" },
                    { value: "NoML", label: "ML" },
                  ]}
                />
                <SelectRow
                  className="pt-0"
                  value={siteLabelField || "none"}
                  onChange={(nextValue) => setSiteLabelField?.(nextValue)}
                  options={[
                    { value: "none", label: "Label" },
                    { value: "site", label: "Site Name" },
                    { value: "site_id", label: "Site ID" },
                    { value: "cell_id", label: "Cell ID" },
                    { value: "technology", label: "Technology" },
                    { value: "nodeb_id", label: "NodeB ID" },
                    { value: "pci", label: "PCI" },
                    { value: "band", label: "Band" },
                  ]}
                  placeholder="Site label"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="order-3 w-full overflow-x-auto xl:order-none xl:w-auto xl:shrink-0">
        {isMapPage && (
          <div className="flex min-w-max justify-center xl:min-w-0">
            <DrawingControlsPanel
              position="relative"
              onUIChange={onUIChange}
              ui={ui}
              onFillWithLogs={onFillWithLogs}
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        <Dialog open={openImportDialog && !siteValidationMessage} onOpenChange={setOpenImportDialog}>
          <DialogContent title="Upload Site Prediction Data" className="sm:max-w-md text-white border-gray-700" style={{ background: "#1f2937" }}>
            <div className="p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">
                Upload Site Prediction Data
              </h2>
              <p className="mb-4 text-sm text-gray-400">
                Band and cluster are mandatory for every row. Use decimal degrees: latitude -90 to 90, longitude -180 to 180.
              </p>
              <div className="flex flex-col items-center gap-4">
                <label className="w-full flex flex-col items-center px-4 py-6 bg-gray-700 rounded-lg border-2 border-dashed border-gray-500 cursor-pointer hover:border-blue-500 transition-colors">
                  <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm">
                    {selectedFile ? selectedFile.name : "Select .csv or .xlsx file"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploading || isValidatingSiteFile}
                    accept=".csv,.xlsx,.xls"
                  />
                </label>

                <Button
                  onClick={handleQuickUpload}
                  disabled={isUploading || isValidatingSiteFile || !selectedFile}
                  className="w-full bg-blue-600 hover:bg-blue-500"
                >
                  {isValidatingSiteFile ? "Checking required fields..." : isUploading ? <Spinner /> : "Upload Now"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <SiteUploadValidationDialog message={siteValidationMessage} onClose={() => setSiteValidationMessage("")} />

        <ProjectsDropdown currentProjectId={effectiveProjectId} />

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          
        </div>

        
      </div>
    </header>
  );
}

export default React.memo(UnifiedHeader);
