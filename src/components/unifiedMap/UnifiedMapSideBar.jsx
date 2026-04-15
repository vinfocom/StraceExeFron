// src/components/UnifiedMapSidebar.jsx
import React, { useMemo, useCallback, memo, useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import {
  X,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Layers,
  Filter,
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  Database,
  Radio,
  Hexagon,
  Palette,
  Grid3X3,
  Thermometer,
  ArrowLeftRight,
  PlusCircle,
  Check,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { predictionApi } from "@/api/apiEndpoints";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// Custom Checkbox Component - Fully Visible
const Checkbox = memo(
  ({ checked, onChange, disabled = false, className = "" }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`
      w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0
      ${checked
          ? "bg-blue-600 border-blue-600"
          : "bg-slate-700 border-slate-500 hover:border-slate-400"
        }
      ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      ${className}
    `}
    >
      {checked && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
    </button>
  ),
);
Checkbox.displayName = "Checkbox";

// Custom Toggle Switch - Fully Visible
const ToggleSwitch = memo(({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange?.(!checked)}
    className={`
      relative w-11 h-6 rounded-full transition-all shrink-0
      ${checked ? "bg-blue-600" : "bg-slate-600"}
      ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
    `}
  >
    <span
      className={`
        absolute top-1 w-4 h-4 rounded-full bg-white  transition-all
        ${checked ? "left-6" : "left-1"}
      `}
    />
  </button>
));
ToggleSwitch.displayName = "ToggleSwitch";

// Collapsible Section Component
const CollapsibleSection = memo(
  ({ title, icon: Icon, children, defaultOpen = false, badge = null }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
      <div className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-blue-400" />}
            <span className="text-sm font-medium text-slate-100">{title}</span>
            {badge !== null && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white rounded-full">
                {badge}
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {isOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-700/50">
            {children}
          </div>
        )}
      </div>
    );
  },
);
CollapsibleSection.displayName = "CollapsibleSection";

// Toggle Row with Checkbox
const ToggleRow = memo(
  ({
    label,
    description,
    checked,
    onChange,
    disabled = false,
    useSwitch = false,
  }) => (
    <div className="flex items-center justify-between py-1.5 gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200">{label}</div>
        {description && (
          <div className="text-xs text-slate-500 truncate">{description}</div>
        )}
      </div>
      {useSwitch ? (
        <ToggleSwitch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <Checkbox checked={checked} onChange={onChange} disabled={disabled} />
      )}
    </div>
  ),
);
ToggleRow.displayName = "ToggleRow";

// Compact Select Row
const SelectRow = memo(
  ({
    label,
    value,
    onChange,
    options,
    placeholder,
    disabled = false,
    className = "",
  }) => (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-slate-400">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-8 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
);
SelectRow.displayName = "SelectRow";

// Segmented Control
const SegmentedControl = memo(
  ({ value, onChange, options, disabled = false }) => (
    <div
      className={`flex rounded-md overflow-hidden border border-slate-600 ${disabled ? "opacity-50" : ""
        }`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 text-xs font-medium transition-all ${value === option.value
            ? "bg-blue-600 text-white"
            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
);
SegmentedControl.displayName = "SegmentedControl";

// Threshold Input
const ThresholdInput = memo(
  ({ value, onChange, min, max, step, unit, disabled, showButtons = true }) => {
    const [inputValue, setInputValue] = useState(String(value));

    useEffect(() => {
      setInputValue(String(value));
    }, [value]);

    const handleChange = (delta) => {
      const newValue =
        delta > 0
          ? Math.min(max, parseFloat(value) + step)
          : Math.max(min, parseFloat(value) - step);
      onChange(newValue);
      setInputValue(String(newValue));
    };

    const handleInputChange = (e) => {
      const val = e.target.value;
      setInputValue(val);
      const numValue = parseFloat(val);
      if (!isNaN(numValue) && numValue >= min && numValue <= max) {
        onChange(numValue);
      }
    };

    const handleBlur = () => {
      const numValue = parseFloat(inputValue);
      if (isNaN(numValue)) {
        setInputValue(String(value));
      } else {
        const clamped = Math.max(min, Math.min(max, numValue));
        onChange(clamped);
        setInputValue(String(clamped));
      }
    };

    return (
      <div className="flex items-center gap-1">
        {showButtons && (
          <button
            type="button"
            onClick={() => handleChange(-1)}
            disabled={disabled || value <= min}
            className="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors text-white"
          >
            <Minus className="h-3 w-3" />
          </button>
        )}
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          className={`bg-slate-800 border-slate-600 text-white h-6 text-center text-xs px-1 ${showButtons ? "w-14" : "w-20"}`}
        />
        {showButtons && (
          <button
            type="button"
            onClick={() => handleChange(1)}
            disabled={disabled || value >= max}
            className="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors text-white"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        <span className="text-[10px] text-slate-400 w-8">{unit}</span>
      </div>
    );
  },
);
ThresholdInput.displayName = "ThresholdInput";

// Info Badge
const InfoBadge = memo(({ label, value, color = "blue" }) => {
  const colors = {
    blue: "text-blue-400",
    green: "text-green-400",
    orange: "text-orange-400",
    yellow: "text-yellow-400",
  };

  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${colors[color]}`}>{value}</span>
    </div>
  );
});
InfoBadge.displayName = "InfoBadge";

// Main Component
const UnifiedMapSidebar = ({
  open,
  onOpenChange,
  pciThreshold,
  dominanceThreshold,
  setDominanceThreshold,
  setPciThreshold,
  showNumCells,
  setShowNumCells,
  enableDataToggle,
  setEnableDataToggle,
  dataToggle,
  setDataToggle,
  enableSiteToggle,
  setEnableSiteToggle,
  setTechHandover,
  bandHandover,
  setBandHandover,
  bandTransitions,
  pciHandover,
  setPciHandover,
  pciTransitions,
  siteToggle,
  setSiteToggle,
  sitePredictionVersion = "original",
  setSitePredictionVersion,
  modeMethod,
  setModeMethod,
  projectId,
  sessionIds,
  metric,
  setMetric,
  coverageHoleFilters,
  setCoverageHoleFilters,
  dataFilters,
  setDataFilters,
  availableFilterOptions,
  colorBy,
  setColorBy,
  ui,
  onUIChange,
  techHandover,
  pciRange = { min: 0, max: 100 },
  supportsSessionFilters = true,
  technologyTransitions,
  showPolygons,
  setShowPolygons,
  polygonSource,
  setPolygonSource,
  onlyInsidePolygons,
  polygonCount,
  loading,
  reloadData,
  isZoomLocked = false,
  setIsZoomLocked,
  currentZoom = 13,
  onResetZoom,
  showNeighbors,
  setShowNeighbors,
  showSubSession,
  setShowSubSession,
  showSessionNeighbors,
  setShowSessionNeighbors,
  gridCellStats = { total: 0, populated: 0 },
  subSessionMarkerCount = 0,
  subSessionLoading = false,
  neighborStats,
  areaEnabled,
  setAreaEnabled,
  enableGrid,
  setEnableGrid,
  gridSizeMeters,
  setGridSizeMeters,
  lteGridAvailable = false,
  lteGridSizeMeters,
  setLteGridSizeMeters,
  lteGridAggregationMethod,
  setLteGridAggregationMethod,
  storedGridMetricMode = "max",
  setStoredGridMetricMode,
  deltaGridScope = "selected",
  setDeltaGridScope,
  deltaGridApiState = {},
  onDeltaGridComputeStore,
  onDeltaGridFetchStored,
  mlGridEnabled,
  setMlGridEnabled,
  mlGridSize,
  setMlGridSize,
  mlGridAggregation,
  setMlGridAggregation,
  coverageViolationThreshold,
  setCoverageViolationThreshold,
  onAddSiteClick,
}) => {
  const sideClasses = useMemo(() => {
    const base =
      "fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-50 w-[340px] bg-slate-950 text-white  transition-transform duration-200 ease-out flex flex-col";
    return open ? `${base} translate-x-0` : `${base} -translate-x-full`;
  }, [open]);

  // Metric options
  const metricOptions = useMemo(
    () => [
      { value: "rsrp", label: "RSRP" },
      { value: "rsrq", label: "RSRQ" },
      { value: "sinr", label: "SINR" },
      { value: "dl_thpt", label: "DL Throughput" },
      { value: "ul_thpt", label: "UL Throughput" },
      { value: "mos", label: "MOS" },
      { value: "pci", label: "PCI" },
      { value: "num_cells", label: "Pilot pollution" },
      { value: "level", label: "SSI" },
      { value: "jitter", label: "Jitter" },
      { value: "latency", label: "Latency" },
      { value: "packet_loss", label: "Packet Loss" },
      { value: "tac", label: "TAC" },
    ],
    [],
  );

  const colorOptions = useMemo(
    () => [
      { value: "metric", label: "By Metric Value" },
      { value: "provider", label: "By Provider" },
      { value: "band", label: "By Band" },
      { value: "technology", label: "By Technology" },
    ],
    [],
  );

  // Filter handlers
  const updateDataFilter = useCallback(
    (filterType, value) => {
      setDataFilters?.((prev) => ({
        ...prev,
        [filterType]: value === "all" ? [] : [value],
      }));
    },
    [setDataFilters],
  );

  const clearAllDataFilters = useCallback(() => {
    setDataFilters?.({ providers: [], bands: [], technologies: [], indoorOutdoor: [] });
    setPciThreshold(0);
  }, [setDataFilters, setPciThreshold]);

  const activeDataFiltersCount = useMemo(() => {
    if (!dataFilters) return 0;
    return (
      (dataFilters.providers?.length > 0 ? 1 : 0) +
      (dataFilters.bands?.length > 0 ? 1 : 0) +
      (dataFilters.technologies?.length > 0 ? 1 : 0)
    );
  }, [dataFilters]);

  const updateCoverageFilter = useCallback(
    (metric, field, value) => {
      setCoverageHoleFilters?.((prev) => ({
        ...prev,
        [metric]: { ...prev[metric], [field]: value },
      }));
    },
    [setCoverageHoleFilters],
  );

  const activeCoverageFiltersCount = useMemo(() => {
    if (!coverageHoleFilters) return 0;
    return Object.values(coverageHoleFilters).filter((f) => f.enabled).length;
  }, [coverageHoleFilters]);

  const normalizedPciRange = useMemo(() => {
    const rawMin = Number(pciRange?.min);
    const rawMax = Number(pciRange?.max);
    const min = Number.isFinite(rawMin) ? rawMin : 0;
    const max = Number.isFinite(rawMax) ? rawMax : 100;
    if (max <= min) return { min: 0, max: 100 };
    return { min, max };
  }, [pciRange]);

  const clampedPciThreshold = useMemo(() => {
    const numericThreshold = Number(pciThreshold);
    const safeThreshold = Number.isFinite(numericThreshold)
      ? numericThreshold
      : normalizedPciRange.min;
    return Math.min(
      normalizedPciRange.max,
      Math.max(normalizedPciRange.min, safeThreshold),
    );
  }, [pciThreshold, normalizedPciRange]);

  useEffect(() => {
    if (!supportsSessionFilters) return;
    const current = Number(pciThreshold);
    const next = Number(clampedPciThreshold);
    if (!Number.isFinite(next)) return;
    if (!Number.isFinite(current) || Math.abs(next - current) > 0.0001) {
      setPciThreshold(next);
    }
  }, [
    clampedPciThreshold,
    pciThreshold,
    setPciThreshold,
    supportsSessionFilters,
  ]);

  const shouldShowMetricSelector = useMemo(
    () =>
      enableDataToggle ||
      (enableSiteToggle && siteToggle === "sites-prediction") ||
      showPolygons ||
      onlyInsidePolygons,
    [enableDataToggle, enableSiteToggle, siteToggle, showPolygons, onlyInsidePolygons],
  );

  const isDeltaCellMode = useMemo(
    () =>
      String(siteToggle || "").toLowerCase() === "cell" &&
      String(sitePredictionVersion || "").trim().toLowerCase() === "delta",
    [siteToggle, sitePredictionVersion],
  );
  const isCellMode = useMemo(
    () => String(siteToggle || "").toLowerCase() === "cell",
    [siteToggle],
  );
  const isBaselineCellMode = useMemo(
    () =>
      String(siteToggle || "").toLowerCase() === "cell" &&
      String(sitePredictionVersion || "").trim().toLowerCase() === "original",
    [siteToggle, sitePredictionVersion],
  );
  const isOptimizedCellMode = useMemo(
    () =>
      String(siteToggle || "").toLowerCase() === "cell" &&
      String(sitePredictionVersion || "").trim().toLowerCase() === "updated",
    [siteToggle, sitePredictionVersion],
  );
  const [isRunningLtePrediction, setIsRunningLtePrediction] = useState(false);
  const [ltePredictionRadiusMeters, setLtePredictionRadiusMeters] = useState(5000);
  const ltePredictionPollingRef = useRef(null);
  const ltePredictionToastIdRef = useRef(null);
  const ltePredictionJobIdRef = useRef(null);
  const [isRunningLteOptimisedPrediction, setIsRunningLteOptimisedPrediction] = useState(false);
  const lteOptimisedPredictionPollingRef = useRef(null);
  const lteOptimisedPredictionToastIdRef = useRef(null);
  const lteOptimisedPredictionJobIdRef = useRef(null);

  const deltaGridButtonsDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    return !Number.isFinite(numericProjectId) || numericProjectId <= 0;
  }, [projectId]);
  const ltePredictionButtonDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    const validSessionIds = (Array.isArray(sessionIds) ? sessionIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    return (
      isRunningLtePrediction ||
      !Number.isFinite(numericProjectId) ||
      numericProjectId <= 0 ||
      validSessionIds.length === 0
    );
  }, [isRunningLtePrediction, projectId, sessionIds]);
  const lteOptimisedPredictionButtonDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    return (
      isRunningLteOptimisedPrediction ||
      !Number.isFinite(numericProjectId) ||
      numericProjectId <= 0
    );
  }, [isRunningLteOptimisedPrediction, projectId]);
  const showDeltaGridAdvancedControls = useMemo(
    () =>
      Boolean(deltaGridApiState?.gridVisible) ||
      Boolean(deltaGridApiState?.computing) ||
      Boolean(deltaGridApiState?.fetching),
    [
      deltaGridApiState?.gridVisible,
      deltaGridApiState?.computing,
      deltaGridApiState?.fetching,
    ],
  );
  const stopLtePredictionMonitoring = useCallback((dismissToast = false) => {
    if (ltePredictionPollingRef.current) {
      clearInterval(ltePredictionPollingRef.current);
      ltePredictionPollingRef.current = null;
    }

    if (dismissToast && ltePredictionToastIdRef.current) {
      toast.dismiss(ltePredictionToastIdRef.current);
    }

    ltePredictionJobIdRef.current = null;
    if (dismissToast) {
      ltePredictionToastIdRef.current = null;
    }
  }, []);

  const stopLteOptimisedPredictionMonitoring = useCallback((dismissToast = false) => {
    if (lteOptimisedPredictionPollingRef.current) {
      clearInterval(lteOptimisedPredictionPollingRef.current);
      lteOptimisedPredictionPollingRef.current = null;
    }

    if (dismissToast && lteOptimisedPredictionToastIdRef.current) {
      toast.dismiss(lteOptimisedPredictionToastIdRef.current);
    }

    lteOptimisedPredictionJobIdRef.current = null;
    if (dismissToast) {
      lteOptimisedPredictionToastIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopLtePredictionMonitoring(true);
      stopLteOptimisedPredictionMonitoring(true);
    };
  }, [stopLteOptimisedPredictionMonitoring, stopLtePredictionMonitoring]);

  const pollLtePredictionStatus = useCallback(async () => {
    const jobId = ltePredictionJobIdRef.current;
    const toastId = ltePredictionToastIdRef.current;

    if (!jobId || !toastId) return;

    try {
      const statusResponse = await predictionApi.getLtePredictionStatus(jobId);
      const status = String(statusResponse?.status || "").trim().toLowerCase();
      const progressText = statusResponse?.progress
        ? String(statusResponse.progress).trim()
        : "";

      if (status === "done") {
        stopLtePredictionMonitoring(false);
        setIsRunningLtePrediction(false);
        const insertedRows = Number(statusResponse?.inserted);
        const suffix = Number.isFinite(insertedRows) ? ` (${insertedRows} rows)` : "";
        toast.update(toastId, {
          render: `LTE prediction completed${suffix}.`,
          type: "success",
          isLoading: false,
          autoClose: 5000,
          closeOnClick: true,
          draggable: true,
        });
        ltePredictionToastIdRef.current = null;
        return;
      }

      if (status === "failed") {
        stopLtePredictionMonitoring(false);
        setIsRunningLtePrediction(false);
        const errorMessage =
          statusResponse?.error || "Prediction failed in Python service.";
        toast.update(toastId, {
          render: `LTE prediction failed: ${errorMessage}`,
          type: "error",
          isLoading: false,
          autoClose: 7000,
          closeOnClick: true,
          draggable: true,
        });
        ltePredictionToastIdRef.current = null;
        return;
      }

      const statusLabel = status ? status.toUpperCase() : "RUNNING";
      const liveMessage = progressText
        ? `LTE prediction ${statusLabel}: ${progressText}`
        : `LTE prediction ${statusLabel}...`;

      toast.update(toastId, {
        render: liveMessage,
        isLoading: true,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });
    } catch (statusError) {
      const msg = statusError?.message || "Unable to fetch LTE status.";
      console.error("LTE status polling failed:", msg);
    }
  }, [stopLtePredictionMonitoring]);

  const pollLteOptimisedPredictionStatus = useCallback(async () => {
    const jobId = lteOptimisedPredictionJobIdRef.current;
    const toastId = lteOptimisedPredictionToastIdRef.current;

    if (!jobId || !toastId) return;

    try {
      const statusResponse = await predictionApi.getLteOptimisedPredictionStatus(jobId);
      const status = String(statusResponse?.status || "").trim().toLowerCase();
      const progressText = statusResponse?.progress
        ? String(statusResponse.progress).trim()
        : "";

      if (status === "done") {
        stopLteOptimisedPredictionMonitoring(false);
        setIsRunningLteOptimisedPrediction(false);
        const insertedRows = Number(statusResponse?.inserted);
        const suffix = Number.isFinite(insertedRows) ? ` (${insertedRows} rows)` : "";
        toast.update(toastId, {
          render: `LTE optimized prediction completed${suffix}.`,
          type: "success",
          isLoading: false,
          autoClose: 5000,
          closeOnClick: true,
          draggable: true,
        });
        lteOptimisedPredictionToastIdRef.current = null;
        return;
      }

      if (status === "failed") {
        stopLteOptimisedPredictionMonitoring(false);
        setIsRunningLteOptimisedPrediction(false);
        const errorMessage =
          statusResponse?.error || "Optimized prediction failed in Python service.";
        toast.update(toastId, {
          render: `LTE optimized prediction failed: ${errorMessage}`,
          type: "error",
          isLoading: false,
          autoClose: 7000,
          closeOnClick: true,
          draggable: true,
        });
        lteOptimisedPredictionToastIdRef.current = null;
        return;
      }

      const statusLabel = status ? status.toUpperCase() : "RUNNING";
      const liveMessage = progressText
        ? `LTE optimized ${statusLabel}: ${progressText}`
        : `LTE optimized ${statusLabel}...`;

      toast.update(toastId, {
        render: liveMessage,
        isLoading: true,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });
    } catch (statusError) {
      const msg = statusError?.message || "Unable to fetch LTE optimized status.";
      console.error("LTE optimized status polling failed:", msg);
    }
  }, [stopLteOptimisedPredictionMonitoring]);

  const handleRunLtePrediction = useCallback(async () => {
    const numericProjectId = Number(projectId);
    const validSessionIds = (Array.isArray(sessionIds) ? sessionIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Please select a valid project before running LTE prediction.");
      return;
    }

    if (validSessionIds.length === 0) {
      toast.error("Please select at least one session before running LTE prediction.");
      return;
    }

    setIsRunningLtePrediction(true);
    stopLtePredictionMonitoring(true);
    const loadingToastId = toast.loading("Starting LTE prediction...", {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
    });
    ltePredictionToastIdRef.current = loadingToastId;

    try {
      const response = await predictionApi.runLtePrediction({
        project_id: numericProjectId,
        session_ids: validSessionIds,
        grid_value: Number(lteGridSizeMeters) || 25,
        radius_m: Number(ltePredictionRadiusMeters) || 5000,
        building: true,
      });

      const jobId = response?.job_id || response?.jobId;
      if (!jobId) {
        setIsRunningLtePrediction(false);
        toast.update(loadingToastId, {
          render: "LTE prediction started, but no job id was returned.",
          type: "warning",
          isLoading: false,
          autoClose: 6000,
          closeOnClick: true,
          draggable: true,
        });
        ltePredictionToastIdRef.current = null;
        return;
      }

      ltePredictionJobIdRef.current = jobId;
      toast.update(loadingToastId, {
        render: `LTE prediction queued. Job: ${jobId}. Monitoring progress...`,
        isLoading: true,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });

      await pollLtePredictionStatus();
      ltePredictionPollingRef.current = setInterval(() => {
        pollLtePredictionStatus();
      }, 3000);
    } catch (error) {
      setIsRunningLtePrediction(false);
      const failureMessage = error?.message || "Failed to start LTE prediction.";
      if (ltePredictionToastIdRef.current) {
        toast.update(ltePredictionToastIdRef.current, {
          render: failureMessage,
          type: "error",
          isLoading: false,
          autoClose: 7000,
          closeOnClick: true,
          draggable: true,
        });
      } else {
        toast.error(failureMessage);
      }
      stopLtePredictionMonitoring(false);
      ltePredictionToastIdRef.current = null;
    }
  }, [
    projectId,
    sessionIds,
    lteGridSizeMeters,
    ltePredictionRadiusMeters,
    stopLtePredictionMonitoring,
    pollLtePredictionStatus,
  ]);

  const handleRunLteOptimisedPrediction = useCallback(async () => {
    const numericProjectId = Number(projectId);

    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Please select a valid project before running LTE optimized prediction.");
      return;
    }

    setIsRunningLteOptimisedPrediction(true);
    stopLteOptimisedPredictionMonitoring(true);
    const loadingToastId = toast.loading("Starting LTE optimized prediction...", {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
    });
    lteOptimisedPredictionToastIdRef.current = loadingToastId;

    try {
      const response = await predictionApi.runLteOptimisedPrediction({
        project_id: numericProjectId,
        grid_resolution: Number(lteGridSizeMeters) || 25,
        radius: Number(ltePredictionRadiusMeters) || 5000,
      });

      const jobId = response?.job_id || response?.jobId;
      if (!jobId) {
        setIsRunningLteOptimisedPrediction(false);
        toast.update(loadingToastId, {
          render: "LTE optimized prediction started, but no job id was returned.",
          type: "warning",
          isLoading: false,
          autoClose: 6000,
          closeOnClick: true,
          draggable: true,
        });
        lteOptimisedPredictionToastIdRef.current = null;
        return;
      }

      lteOptimisedPredictionJobIdRef.current = jobId;
      toast.update(loadingToastId, {
        render: `LTE optimized prediction queued. Job: ${jobId}. Monitoring progress...`,
        isLoading: true,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });

      await pollLteOptimisedPredictionStatus();
      lteOptimisedPredictionPollingRef.current = setInterval(() => {
        pollLteOptimisedPredictionStatus();
      }, 3000);
    } catch (error) {
      setIsRunningLteOptimisedPrediction(false);
      const failureMessage = error?.message || "Failed to start LTE optimized prediction.";
      if (lteOptimisedPredictionToastIdRef.current) {
        toast.update(lteOptimisedPredictionToastIdRef.current, {
          render: failureMessage,
          type: "error",
          isLoading: false,
          autoClose: 7000,
          closeOnClick: true,
          draggable: true,
        });
      } else {
        toast.error(failureMessage);
      }
      stopLteOptimisedPredictionMonitoring(false);
      lteOptimisedPredictionToastIdRef.current = null;
    }
  }, [
    projectId,
    lteGridSizeMeters,
    ltePredictionRadiusMeters,
    stopLteOptimisedPredictionMonitoring,
    pollLteOptimisedPredictionStatus,
  ]);

  const toggleEnvironment = useCallback(
    (value) => {
      setDataFilters?.((prev) => {
        const current = prev.indoorOutdoor || [];
        const exists = current.includes(value);
        let newValues;
        if (exists) {
          newValues = current.filter((v) => v !== value);
        } else {
          newValues = [...current, value];
        }
        return { ...prev, indoorOutdoor: newValues };
      });
    },
    [setDataFilters],
  );

  return (
    <>
      <div className={sideClasses}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 shrink-0">
          <h2 className="text-base font-semibold">Map Controls</h2>
          <button
            className="p-1.5 rounded-md hover:bg-slate-800 transition-colors"
            onClick={() => onOpenChange?.(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* Current View Info */}
          {(projectId || sessionIds?.length > 0) && (
            <div className="p-2.5 bg-slate-800/50 rounded-lg text-xs space-y-1 border border-slate-700/50">
              {projectId && <InfoBadge label="Project" value={projectId} />}
              {sessionIds?.length > 0 && (
                <div className="text-xs">
                  <div className="text-slate-500 mb-1">Sessions</div>
                  <div className="bg-slate-900/60 border border-slate-700 rounded p-1.5 max-h-20 overflow-y-auto text-green-400 break-all">
                    {sessionIds.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}

          <CollapsibleSection title="Map View" icon={Layers}>
            <ToggleRow
              label="Lock Zoom"
              description="Keep current zoom level fixed"
              checked={Boolean(isZoomLocked)}
              onChange={setIsZoomLocked}
              useSwitch={true}
            />

            <div className="bg-slate-800/50 rounded p-2">
              <InfoBadge
                label="Current Zoom"
                value={Number.isFinite(currentZoom) ? currentZoom.toFixed(1) : "N/A"}
                color="blue"
              />
            </div>

            <Button
              className="w-full bg-slate-700 hover:bg-slate-600 h-8 text-xs"
              onClick={() => onResetZoom?.()}
            >
              Reset Zoom
            </Button>
          </CollapsibleSection>

          {/* Data Layer */}
          <CollapsibleSection
            title="Data Layer"
            icon={Database}
            defaultOpen={true}
          >
            <ToggleRow
              label="Enable Data"
              checked={enableDataToggle}
              onChange={setEnableDataToggle}
              useSwitch={true}
            />

            {enableDataToggle && (
              <>
                <SegmentedControl
                  value={dataToggle}
                  onChange={setDataToggle}
                  options={[
                    { value: "sample", label: "Sample" },
                    { value: "prediction", label: "Prediction" },
                  ]}
                />

                <div className="space-y-2 pt-1">
                  <ToggleRow
                    label="Area Zones"
                    checked={areaEnabled}
                    onChange={setAreaEnabled}
                  />
                  <ToggleRow
                    label="Secondary Logs"
                    description="Show secondary signal markers on map"
                    checked={Boolean(showSessionNeighbors)}
                    onChange={setShowSessionNeighbors}
                    useSwitch={true}
                  />
                  <ToggleRow
                    label="Grid View"
                    description="Show data as grid cells"
                    checked={enableGrid}
                    onChange={setEnableGrid}
                  />
                </div>

                {enableGrid && (
                  <div className="pt-1 bg-slate-800/50 rounded-lg p-2">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400">Cell Size</span>
                    </div>
                    <ThresholdInput
                      value={Number(gridSizeMeters) || 50}
                      onChange={(next) => setGridSizeMeters?.(Math.round(next))}
                      min={5}
                      max={200}
                      step={10}
                      unit="m"
                    />
                    <div className="mt-2 space-y-1 border-t border-slate-700/50 pt-2">
                      <InfoBadge
                        label="Grid Formed"
                        value={Number(gridCellStats?.total) || 0}
                        color="blue"
                      />
                      <InfoBadge
                        label="With Logs"
                        value={Number(gridCellStats?.populated) || 0}
                        color="green"
                      />
                    </div>
                  </div>
                )}

                <ToggleRow
                  label="Show Num cell "
                  description="Display cell count on logs"
                  checked={showNumCells}
                  onChange={setShowNumCells}
                />
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Sub Sessions"
            icon={MapPin}
            badge={showSubSession ? subSessionMarkerCount : null}
          >
            <ToggleRow
              label="Enable Sub Sessions"
              description="Load sub-session analytics and map markers"
              checked={Boolean(showSubSession)}
              onChange={setShowSubSession}
              useSwitch={true}
            />

            {showSubSession && (
              <div className="bg-slate-800/50 rounded p-2 text-xs">
                <InfoBadge
                  label="Start Markers"
                  value={subSessionLoading ? "Loading..." : subSessionMarkerCount}
                  color="orange"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Click any marker to view sub-session details. A new analytics tab
                  is available in the detail logs panel.
                </p>
              </div>
            )}
          </CollapsibleSection>


          <CollapsibleSection title="Sites Layer" icon={Radio}>
            <ToggleRow
              label="Enable Sites"
              checked={enableSiteToggle}
              onChange={setEnableSiteToggle}
              useSwitch={true}
            />

            {enableSiteToggle && (
              <>
                <SegmentedControl
                  value={siteToggle}
                  onChange={setSiteToggle}
                  options={[
                    { value: "Cell", label: "Cell" },
                    { value: "NoML", label: "NoML" },
                    { value: "ML", label: "ML" },
                  ]}
                />

                {siteToggle === "Cell" && (
                  <div className="space-y-1.5 pt-2">
                    <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                      <ArrowLeftRight className="w-3 h-3" /> Cell Version
                    </Label>
                    <SegmentedControl
                      value={sitePredictionVersion}
                      onChange={(nextValue) =>
                        setSitePredictionVersion?.(nextValue)
                      }
                      options={[
                        { value: "original", label: "Baseline" },
                        { value: "updated", label: "Optimized" },
                        { value: "delta", label: "Delta" }
                      ]}
                    />
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                  <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                    <Grid3X3 className="w-3 h-3" /> Prediction Grid
                  </Label>

                  {lteGridAvailable ? (
                    <>
                      {!isCellMode && (
                        <>
                          <div className="pt-1 bg-slate-800/50 rounded-lg p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-400">Grid Size</span>
                            </div>
                            <ThresholdInput
                              value={Number(lteGridSizeMeters) || 50}
                              onChange={(next) =>
                                setLteGridSizeMeters?.(Math.round(next))
                              }
                              min={5}
                              max={500}
                              step={5}
                              unit="m"
                            />
                          </div>

                          <SelectRow
                            label="Aggregation"
                            value={lteGridAggregationMethod || "median"}
                            onChange={setLteGridAggregationMethod}
                            options={[
                              { value: "avg", label: "Average" },
                              { value: "median", label: "Median" },
                              { value: "mean", label: "Mean" },
                              { value: "min", label: "Min" },
                              { value: "max", label: "Max" },
                            ]}
                            placeholder="Select aggregation"
                          />
                        </>
                      )}

                    </>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      Select any site or sector prediction first.
                    </p>
                  )}

                  {isCellMode && (
                    <div className="pt-1 bg-slate-800/50 rounded-lg p-2 space-y-2">
                      {isBaselineCellMode && (
                        <div className="pt-1 bg-slate-900/40 rounded-lg p-2 space-y-2">
                          <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                            <Radio className="w-3 h-3" /> Baseline LTE Prediction
                          </Label>
                          <p className="text-[10px] text-slate-400">
                            Set grid size and radius, then run Python LTE prediction for the selected sessions.
                          </p>
                          <div className="pt-1 bg-slate-800/60 rounded-lg p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-400">Grid Size</span>
                            </div>
                            <ThresholdInput
                              value={Number(lteGridSizeMeters) || 25}
                              onChange={(next) =>
                                setLteGridSizeMeters?.(Math.round(next))
                              }
                              min={5}
                              max={500}
                              step={5}
                              unit="m"
                            />
                          </div>
                          <div className="pt-1 bg-slate-800/60 rounded-lg p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-400">Radius</span>
                            </div>
                            <ThresholdInput
                              value={Number(ltePredictionRadiusMeters) || 5000}
                              onChange={(next) =>
                                setLtePredictionRadiusMeters(Math.round(next))
                              }
                              min={100}
                              max={20000}
                              step={100}
                              unit="m"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={handleRunLtePrediction}
                            disabled={ltePredictionButtonDisabled}
                            className="w-full h-8 text-xs font-semibold"
                          >
                            {isRunningLtePrediction ? (
                              <span className="inline-flex items-center gap-2">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Running...
                              </span>
                            ) : (
                              "Run LTE Prediction"
                            )}
                          </Button>
                        </div>
                      )}

                      {isOptimizedCellMode && (
                        <div className="pt-1 bg-slate-900/40 rounded-lg p-2 space-y-2">
                          <Label className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <Radio className="w-3 h-3" /> Optimized LTE Prediction
                          </Label>
                          <p className="text-[10px] text-slate-400">
                            Run the LTE optimisation pipeline for this project and store the optimized output in DB.
                          </p>
                          <div className="pt-1 bg-slate-800/60 rounded-lg p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-400">Grid Size</span>
                            </div>
                            <ThresholdInput
                              value={Number(lteGridSizeMeters) || 25}
                              onChange={(next) =>
                                setLteGridSizeMeters?.(Math.round(next))
                              }
                              min={5}
                              max={500}
                              step={5}
                              unit="m"
                            />
                          </div>
                          <div className="pt-1 bg-slate-800/60 rounded-lg p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-400">Radius</span>
                            </div>
                            <ThresholdInput
                              value={Number(ltePredictionRadiusMeters) || 5000}
                              onChange={(next) =>
                                setLtePredictionRadiusMeters(Math.round(next))
                              }
                              min={100}
                              max={20000}
                              step={100}
                              unit="m"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={handleRunLteOptimisedPrediction}
                            disabled={lteOptimisedPredictionButtonDisabled}
                            className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500"
                          >
                            {isRunningLteOptimisedPrediction ? (
                              <span className="inline-flex items-center gap-2">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Running...
                              </span>
                            ) : (
                              "Run Optimized Prediction"
                            )}
                          </Button>
                        </div>
                      )}

                      {isDeltaCellMode && (
                        <>
                          <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                            <Grid3X3 className="w-3 h-3" /> Delta Grid Scope
                          </Label>
                          <SegmentedControl
                            value={deltaGridScope || "selected"}
                            onChange={(nextValue) => setDeltaGridScope?.(nextValue)}
                            options={[
                              { value: "selected", label: "Selected" },
                              { value: "complete", label: "Complete" },
                            ]}
                          />
                          <p className="text-[10px] text-slate-400">
                            Selected uses currently selected sites/sectors. Complete uses project map regions and compares baseline vs optimized for full-grid delta.
                          </p>
                        </>
                      )}

                      {showDeltaGridAdvancedControls && (
                        <>
                          <div className="pt-1 bg-slate-900/40 rounded-lg p-2">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-400">Manual Grid Size</span>
                              <button
                                type="button"
                                onClick={() => onDeltaGridComputeStore?.()}
                                disabled={
                                  deltaGridButtonsDisabled ||
                                  Boolean(deltaGridApiState?.computing) ||
                                  Boolean(deltaGridApiState?.fetching)
                                }
                                className="px-2 py-1 rounded text-[10px] font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Compute and store with current manual grid size"
                              >
                                {deltaGridApiState?.computing ? "Computing..." : "Compute"}
                              </button>
                            </div>
                            <ThresholdInput
                              value={Number(lteGridSizeMeters) || 50}
                              onChange={(next) => setLteGridSizeMeters?.(Math.round(next))}
                              min={5}
                              max={500}
                              step={5}
                              unit="m"
                              showButtons={false}
                            />
                          </div>

                          <SelectRow
                            label="Stored Grid Metric"
                            value={storedGridMetricMode || "max"}
                            onChange={setStoredGridMetricMode}
                            options={[
                              // { value: "avg", label: "Average" },
                              // { value: "median", label: "Median" },
                              { value: "max", label: "Maximum" },
                              { value: "min", label: "Minimum" },
                            ]}
                            placeholder="Select DB metric"
                          />
                        </>
                      )}

                      <div className="pt-2 border-t border-slate-700/50 space-y-2">
                        <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                          <Database className="w-3 h-3" /> Grid API
                        </Label>
                        <p className="text-[10px] text-slate-400">
                          {showDeltaGridAdvancedControls
                            ? "Grid is manual. Use Compute to update DB, then Fetch to read/show."
                            : "Click Fetch once to show Manual Grid Size and Stored Grid Metric."}
                        </p>
                        <button
                          type="button"
                          onClick={() => onDeltaGridFetchStored?.()}
                          disabled={
                            deltaGridButtonsDisabled ||
                            Boolean(deltaGridApiState?.computing) ||
                            Boolean(deltaGridApiState?.fetching)
                          }
                          className={`w-full px-2 py-1.5 rounded-md text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                            deltaGridApiState?.gridVisible
                              ? "bg-rose-600 hover:bg-rose-500"
                              : "bg-emerald-600 hover:bg-emerald-500"
                          }`}
                        >
                          {deltaGridApiState?.computing
                            ? "Computing..."
                            : deltaGridApiState?.fetching
                              ? "Fetching..."
                              : deltaGridApiState?.gridVisible
                                ? "Hide Grid"
                                : "Fetch & Show Grid"}
                        </button>
                        {(deltaGridApiState?.computing || deltaGridApiState?.fetching) && (
                          <p className="text-[10px] text-blue-300">
                            {deltaGridApiState?.computing
                              ? "Computing grid..."
                              : "Fetching stored grid..."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1.5">
                  <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Color Sites By
                  </Label>
                  <SegmentedControl
                    value={modeMethod}
                    onChange={setModeMethod}
                    options={[
                      { value: "Operator", label: "Operator" },
                      { value: "band", label: "Band" },
                      { value: "technology", label: "Tech" },
                    ]}
                  />
                </div>

                {/* Add Site Button */}
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                  <button
                    onClick={() => onAddSiteClick?.()}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-blue-500/25 transition-all duration-200"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Add Site
                  </button>

                 

                </div>
              </>
            )}
          </CollapsibleSection>

          {/* Polygon Layer */}
          <CollapsibleSection
            title="Polygons"
            icon={Hexagon}
            badge={showPolygons && polygonCount > 0 ? polygonCount : null}
          >
            <ToggleRow
              label="Show Polygons"
              checked={showPolygons}
              onChange={setShowPolygons}
              useSwitch={true}
            />

            {showPolygons && (
              <>
                <SegmentedControl
                  value={polygonSource}
                  onChange={setPolygonSource}
                  options={[
                    { value: "map", label: "Map Regions" },
                    { value: "save", label: "Buildings" },
                  ]}
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-slate-300">
                    Filter Inside Only
                  </span>
                  <span className="rounded border border-emerald-500/40 bg-emerald-600/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    Always On
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Logs and calculations are restricted to polygon boundaries.
                </p>

                {polygonCount > 0 && (
                  <div className="bg-slate-800/50 rounded p-2 text-xs">
                    <InfoBadge
                      label="Loaded"
                      value={`${polygonCount} polygon(s)`}
                      color="green"
                    />
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>

          {
            shouldShowMetricSelector && (
              <CollapsibleSection
                title="Metric & Filters"
                icon={Filter}
                defaultOpen={true}
                badge={activeDataFiltersCount > 0 ? activeDataFiltersCount : null}
              >
                <SelectRow
                  label="Metric"
                  value={metric}
                  onChange={setMetric}
                  options={metricOptions}
                  placeholder="Select metric"
                />

                <SelectRow
                  label="Color By"
                  value={colorBy || "metric"}
                  onChange={(v) => setColorBy?.(v === "metric" ? null : v)}
                  options={colorOptions}
                  placeholder="Select color scheme"
                  disabled={!enableDataToggle}
                />

                <div className="border-t border-slate-700/50 pt-3 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Data Filters</span>
                    {activeDataFiltersCount > 0 && (
                      <button
                        onClick={clearAllDataFilters}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <SelectRow
                      label="Provider"
                      value={dataFilters?.providers?.[0] || "all"}
                      onChange={(v) => updateDataFilter("providers", v)}
                      options={[
                        { value: "all", label: "All Providers" },
                        ...(availableFilterOptions?.providers?.map((p) => ({
                          value: p,
                          label: p,
                        })) || []),
                      ]}
                      disabled={!enableDataToggle}
                    />

                    <SelectRow
                      label="Band"
                      value={dataFilters?.bands?.[0] || "all"}
                      onChange={(v) => updateDataFilter("bands", v)}
                      options={[
                        { value: "all", label: "All Bands" },
                        ...(availableFilterOptions?.bands?.map((b) => ({
                          value: b,
                          label: b,
                        })) || []),
                      ]}
                      disabled={!enableDataToggle}
                    />

                    <SelectRow
                      label="Technology"
                      value={dataFilters?.technologies?.[0] || "all"}
                      onChange={(v) => updateDataFilter("technologies", v)}
                      options={[
                        { value: "all", label: "All Technologies" },
                        ...(availableFilterOptions?.technologies
                          ?.filter((t) => t && t.toLowerCase() !== "unknown")
                          ?.map((t) => ({ value: t, label: t })) || []),
                      ]}
                      disabled={!enableDataToggle}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-slate-400">Environment</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                        <Checkbox
                          checked={dataFilters?.indoorOutdoor?.includes("Indoor")}
                          onChange={() => toggleEnvironment("Indoor")}
                          disabled={!enableDataToggle}
                        />
                        <span className="text-sm text-slate-300">Indoor</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                        <Checkbox
                          checked={dataFilters?.indoorOutdoor?.includes(
                            "Outdoor",
                          )}
                          onChange={() => toggleEnvironment("Outdoor")}
                          disabled={!enableDataToggle}
                        />
                        <span className="text-sm text-slate-300">Outdoor</span>
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-slate-700/50 pt-3 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">
                        PCI Appearance Filter
                      </span>
                    </div>

                    <div className="px-1 flex items-center justify-between gap-2">
                      <ThresholdInput
                        value={clampedPciThreshold}
                        onChange={(next) => setPciThreshold(parseFloat(next))}
                        min={normalizedPciRange.min}
                        max={normalizedPciRange.max}
                        step={1}
                        unit="%"
                        disabled={!supportsSessionFilters}
                      />
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {normalizedPciRange.min}% - {normalizedPciRange.max}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 italic">
                      Hides PCIs that appear less than {clampedPciThreshold}% of
                      the time in this session.
                    </p>
                    {!supportsSessionFilters && (
                      <p className="text-[10px] text-amber-400 mt-1">
                        Available only in Data Layer sample mode.
                      </p>
                    )}
                  </div>

                  {activeDataFiltersCount > 0 && (
                    <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-xs text-blue-300">
                      🔍 {activeDataFiltersCount} filter
                      {activeDataFiltersCount > 1 ? "s" : ""} active
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )
          }

        

          {/* Metric & Filters */}

          <CollapsibleSection title="Dominance Analysis" icon={AlertTriangle}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Dominance Filter</span>
                <ToggleSwitch
                  checked={dominanceThreshold !== null}
                  disabled={!supportsSessionFilters}
                  onChange={(checked) => {
                    const newVal = checked ? 6 : null;
                    setDominanceThreshold(newVal);
                    if (checked) {
                      setCoverageViolationThreshold?.(null);
                    }

                    // if (checked) 
                    //   setMetric("dominance") 
                    //   else 
                    //     setMetric("rsrp");
                  }}
                />
              </div>

              {dominanceThreshold !== null && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    Range Mask (±dB)
                  </Label>
                  <Input
                    type="number"
                    value={dominanceThreshold}
                    min={0}
                    disabled={!supportsSessionFilters}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (Number.isFinite(parsed)) {
                        setDominanceThreshold(Math.max(0, parsed));
                      }
                    }}
                    className="bg-slate-800 border-slate-600 text-white h-8 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 italic">
                    Showing logs with anchor within{" "}
                    {-Math.abs(dominanceThreshold)} to{" "}
                    {Math.abs(dominanceThreshold)} dB. Colors reflect the count
                    of overlapping signals.
                  </p>
                  {!supportsSessionFilters && (
                    <p className="text-[10px] text-amber-400">
                      Available only in Data Layer sample mode.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Coverage Violation" icon={ShieldAlert}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Enable Violation</span>
                <ToggleSwitch
                  checked={coverageViolationThreshold !== null}
                  disabled={!supportsSessionFilters}
                  onChange={(checked) => {
                    // FIX: Ensure it defaults to a negative number and updates the metric
                    const newVal = checked ? -10 : null;
                    setCoverageViolationThreshold?.(newVal);

                    if (checked) {
                      setDominanceThreshold?.(null); // Mutually exclusive
                      // setMetric("coverage_violation"); // This triggers the layer update
                    }
                    // else {
                    //   // If disabling, reset metric to default
                    //   setMetric("rsrp");
                    // }

                  }}
                />
              </div>

              {coverageViolationThreshold !== null && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    Range Start (Negative dB)
                  </Label>
                  <Input
                    type="number"
                    value={coverageViolationThreshold}
                    max={0} // Ensure user doesn't go positive
                    disabled={!supportsSessionFilters}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (Number.isFinite(parsed)) {
                        setCoverageViolationThreshold?.(Math.min(0, parsed));
                      }
                    }}
                    className="bg-slate-800 border-slate-600 text-white h-8 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 italic">
                    Showing logs with neighbors between{" "}
                    {coverageViolationThreshold} dB and 0 dB relative to
                    primary. Colors reflect count of signals.
                  </p>
                  {!supportsSessionFilters && (
                    <p className="text-[10px] text-amber-400">
                      Available only in Data Layer sample mode.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Handovers"
            icon={ArrowLeftRight}
            badge={
              (techHandover ? (technologyTransitions?.length || 0) : 0) +
              (bandHandover ? (bandTransitions?.length || 0) : 0) +
              (pciHandover ? (pciTransitions?.length || 0) : 0)
            }
          >
            {/* Tech Handover */}
            <ToggleRow
              label="Tech Handovers"
              description="Technology change points"
              checked={techHandover}
              onChange={setTechHandover}
              useSwitch={true}
            />
            {techHandover && technologyTransitions?.length > 0 && (
              <div className="bg-slate-800/50 rounded p-2 text-xs mb-2">
                <InfoBadge
                  label="Count"
                  value={technologyTransitions.length}
                  color="blue"
                />
              </div>
            )}

            {/* Band Handover */}
            <ToggleRow
              label="Band Handovers"
              description="Frequency band changes"
              checked={bandHandover}
              onChange={setBandHandover}
              useSwitch={true}
            />
            {bandHandover && bandTransitions?.length > 0 && (
              <div className="bg-slate-800/50 rounded p-2 text-xs mb-2">
                <InfoBadge
                  label="Count"
                  value={bandTransitions.length}
                  color="green"
                />
              </div>
            )}

            {/* PCI Handover */}
            <ToggleRow
              label="PCI Handovers"
              description="PCI changes"
              checked={pciHandover}
              onChange={setPciHandover}
              useSwitch={true}
            />
            {pciHandover && pciTransitions?.length > 0 && (
              <div className="bg-slate-800/50 rounded p-2 text-xs">
                <InfoBadge
                  label="Count"
                  value={pciTransitions.length}
                  color="orange"
                />
              </div>
            )}
          </CollapsibleSection>

          {/* Coverage Hole Filters */}
          {shouldShowMetricSelector && coverageHoleFilters && (
            <CollapsibleSection
              title="Coverage Holes"
              icon={AlertTriangle}
              badge={
                activeCoverageFiltersCount > 0
                  ? activeCoverageFiltersCount
                  : null
              }
            >
              {/* RSRP */}
              <div className="flex items-center gap-3 py-1">
                <Checkbox
                  checked={coverageHoleFilters.rsrp?.enabled}
                  onChange={(v) => updateCoverageFilter("rsrp", "enabled", v)}
                />
                <span className="text-sm w-12 text-slate-200">RSRP</span>
                <ThresholdInput
                  value={coverageHoleFilters.rsrp?.threshold ?? -110}
                  onChange={(v) => updateCoverageFilter("rsrp", "threshold", v)}
                  min={-150}
                  max={-50}
                  step={1}
                  unit="dBm"
                  disabled={!coverageHoleFilters.rsrp?.enabled}
                />
              </div>

              {/* RSRQ */}
              <div className="flex items-center gap-3 py-1">
                <Checkbox
                  checked={coverageHoleFilters.rsrq?.enabled}
                  onChange={(v) => updateCoverageFilter("rsrq", "enabled", v)}
                />
                <span className="text-sm w-12 text-slate-200">RSRQ</span>
                <ThresholdInput
                  value={coverageHoleFilters.rsrq?.threshold ?? -15}
                  onChange={(v) => updateCoverageFilter("rsrq", "threshold", v)}
                  min={-30}
                  max={0}
                  step={0.5}
                  unit="dB"
                  disabled={!coverageHoleFilters.rsrq?.enabled}
                />
              </div>

              {/* SINR */}
              <div className="flex items-center gap-3 py-1">
                <Checkbox
                  checked={coverageHoleFilters.sinr?.enabled}
                  onChange={(v) => updateCoverageFilter("sinr", "enabled", v)}
                />
                <span className="text-sm w-12 text-slate-200">SINR</span>
                <ThresholdInput
                  value={coverageHoleFilters.sinr?.threshold ?? 0}
                  onChange={(v) => updateCoverageFilter("sinr", "threshold", v)}
                  min={-20}
                  max={30}
                  step={1}
                  unit="dB"
                  disabled={!coverageHoleFilters.sinr?.enabled}
                />
              </div>

              {activeCoverageFiltersCount > 0 && (
                <div className="p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-300 mt-2">
                  <div className="font-medium mb-1">
                    {activeCoverageFiltersCount} filter
                    {activeCoverageFiltersCount > 1 ? "s" : ""} active
                  </div>
                  <div className="text-yellow-400/80 text-[10px]">
                    All conditions must be met (AND logic)
                  </div>
                </div>
              )}

              {activeCoverageFiltersCount === 0 && (
                <div className="p-2 bg-slate-800/50 rounded text-xs text-slate-500 text-center">
                  Enable filters to identify coverage holes
                </div>
              )}
            </CollapsibleSection>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-900 shrink-0">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 h-9"
            onClick={reloadData}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Loading..." : "Reload Data"}
          </Button>
        </div>
      </div>
    </>
  );
};

export default memo(UnifiedMapSidebar);
