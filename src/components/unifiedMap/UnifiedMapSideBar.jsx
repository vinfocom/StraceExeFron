// src/components/UnifiedMapSidebar.jsx
import React, { useMemo, useCallback, memo, useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import {
  X,
  RefreshCw,
  AlertTriangle,
  Layers,
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  Database,
  Radio,
  Hexagon,
  Palette,
  Grid3X3,
  ArrowLeftRight,
  PlusCircle,
  Check,
  MapPin,
  TowerControl,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { predictionApi } from "@/api/apiEndpoints";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { FEATURE_KEYS, hasFeatureAccess } from "@/utils/featureAccess";
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
    <div className={`min-w-0 flex-1 space-y-1.5 ${className}`}>
      {label && <Label className="text-xs text-slate-400">{label}</Label>}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-full min-w-0 bg-slate-800 border-slate-600 text-sm text-white [&>span]:truncate">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-w-[260px]">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="pr-8">
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
  siteLabelField = "none",
  setSiteLabelField,
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
  projectPolygonEditEnabled = false,
  setProjectPolygonEditEnabled,
  canSaveDrawnPolygonToProject = false,
  newProjectPolygonName = "",
  setNewProjectPolygonName,
  isSavingProjectPolygon = false,
  onSaveDrawnPolygonToProject,
  ltePredictionUseBuildings = true,
  setLtePredictionUseBuildings,
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
  const { user, refreshUser } = useAuth();
  const [showCurrentViewInfo, setShowCurrentViewInfo] = useState(false);
  useEffect(() => {
    refreshUser?.();
  }, [refreshUser]);
  const canRunPrediction = useMemo(
    () => hasFeatureAccess(user, FEATURE_KEYS.RUN_PREDICTION, false),
    [user],
  );
  const canUseGridApi = useMemo(
    () => hasFeatureAccess(user, FEATURE_KEYS.GRID_FETCH, false),
    [user],
  );

  const sideClasses = useMemo(() => {
    const base =
      "relative h-full z-20 bg-slate-950 text-white transition-[width] duration-200 ease-out flex flex-col shrink-0 overflow-hidden";
    return open ? `${base} w-[340px]` : `${base} w-0`;
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
      { value: "level", label: "Ping pong" },
      { value: "jitter", label: "Jitter" },
      { value: "latency", label: "Latency" },
      { value: "packet_loss", label: "Packet Loss" },
      { value: "tac", label: "TAC" },
      { value: "dominance", label: "Dominance Analysis" },
      { value: "coverage_violation", label: "Coverage Violation" },
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
      Boolean(deltaGridApiState?.gridVisible) ||
      showPolygons ||
      onlyInsidePolygons,
    [
      enableDataToggle,
      enableSiteToggle,
      siteToggle,
      deltaGridApiState?.gridVisible,
      showPolygons,
      onlyInsidePolygons,
    ],
  );

  useEffect(() => {
    const normalizedMetric = String(metric || "").trim().toLowerCase();
    if (normalizedMetric === "dominance") {
      if (dominanceThreshold === null) {
        setDominanceThreshold?.(6);
      }
      if (coverageViolationThreshold !== null) {
        setCoverageViolationThreshold?.(null);
      }
      return;
    }

    if (normalizedMetric === "coverage_violation") {
      if (coverageViolationThreshold === null) {
        setCoverageViolationThreshold?.(-10);
      }
      if (dominanceThreshold !== null) {
        setDominanceThreshold?.(null);
      }
      return;
    }

    if (dominanceThreshold !== null) {
      setDominanceThreshold?.(null);
    }
    if (coverageViolationThreshold !== null) {
      setCoverageViolationThreshold?.(null);
    }
  }, [
    metric,
    dominanceThreshold,
    coverageViolationThreshold,
    setDominanceThreshold,
    setCoverageViolationThreshold,
  ]);

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
  const [isRunningLteTiltRecommendation, setIsRunningLteTiltRecommendation] = useState(false);
  const [lteTiltRecommendationOperator, setLteTiltRecommendationOperator] = useState("all");
  const [lteTiltRecommendationRsrp, setLteTiltRecommendationRsrp] = useState(-105);
  const [lteTiltRecommendationRsrq, setLteTiltRecommendationRsrq] = useState(-15);
  const [lteTiltRecommendationSinr, setLteTiltRecommendationSinr] = useState(0);
  const lteTiltRecommendationPollingRef = useRef(null);
  const lteTiltRecommendationToastIdRef = useRef(null);
  const lteTiltRecommendationJobIdRef = useRef(null);
  const [isRunningLteOptimisedPrediction, setIsRunningLteOptimisedPrediction] = useState(false);
  const lteOptimisedPredictionPollingRef = useRef(null);
  const lteOptimisedPredictionToastIdRef = useRef(null);
  const lteOptimisedPredictionJobIdRef = useRef(null);

  const deltaGridButtonsDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    return (
      !canUseGridApi ||
      !Number.isFinite(numericProjectId) ||
      numericProjectId <= 0
    );
  }, [projectId, canUseGridApi]);
  const ltePredictionButtonDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    const validSessionIds = (Array.isArray(sessionIds) ? sessionIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    return (
      !canRunPrediction ||
      isRunningLtePrediction ||
      !Number.isFinite(numericProjectId) ||
      numericProjectId <= 0 ||
      validSessionIds.length === 0
    );
  }, [canRunPrediction, isRunningLtePrediction, projectId, sessionIds]);
  const lteOptimisedPredictionButtonDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    return (
      !canRunPrediction ||
      isRunningLteOptimisedPrediction ||
      !Number.isFinite(numericProjectId) ||
      numericProjectId <= 0
    );
  }, [canRunPrediction, isRunningLteOptimisedPrediction, projectId]);
  const lteTiltRecommendationButtonDisabled = useMemo(() => {
    const numericProjectId = Number(projectId);
    return (
      !canRunPrediction ||
      isRunningLteTiltRecommendation ||
      !Number.isFinite(numericProjectId) ||
      numericProjectId <= 0
    );
  }, [canRunPrediction, isRunningLteTiltRecommendation, projectId]);
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
  const storedGridLayerMode = useMemo(() => {
    const normalizedMode = String(storedGridMetricMode || "max").trim().toLowerCase();
    return normalizedMode === "best_operator" ||
      normalizedMode === "operator_min" ||
      normalizedMode === "operator_max"
      ? "operator"
      : "kpi";
  }, [storedGridMetricMode]);
  const storedGridAggregateMode = useMemo(() => {
    const normalizedMode = String(storedGridMetricMode || "max").trim().toLowerCase();
    if (normalizedMode === "avg" || normalizedMode === "best_operator") return "avg";
    if (normalizedMode === "min" || normalizedMode === "operator_min") return "min";
    return "max";
  }, [storedGridMetricMode]);
  const handleStoredGridLayerModeChange = useCallback(
    (nextLayerMode) => {
      const aggregateMode = storedGridAggregateMode || "max";
      if (String(nextLayerMode || "").trim().toLowerCase() === "operator") {
        setStoredGridMetricMode?.(
          aggregateMode === "min"
            ? "operator_min"
            : aggregateMode === "max"
              ? "operator_max"
              : "best_operator",
        );
        return;
      }

      setStoredGridMetricMode?.(
        aggregateMode === "min" ? "min" : aggregateMode === "avg" ? "avg" : "max",
      );
    },
    [setStoredGridMetricMode, storedGridAggregateMode],
  );
  const handleStoredGridAggregateModeChange = useCallback(
    (nextAggregateMode) => {
      const aggregateMode = String(nextAggregateMode || "max").trim().toLowerCase();
      if (storedGridLayerMode === "operator") {
        setStoredGridMetricMode?.(
          aggregateMode === "min"
            ? "operator_min"
            : aggregateMode === "max"
              ? "operator_max"
              : "best_operator",
        );
        return;
      }

      setStoredGridMetricMode?.(
        aggregateMode === "min" ? "min" : aggregateMode === "avg" ? "avg" : "max",
      );
    },
    [setStoredGridMetricMode, storedGridLayerMode],
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

  const stopLteTiltRecommendationMonitoring = useCallback((dismissToast = false) => {
    if (lteTiltRecommendationPollingRef.current) {
      clearInterval(lteTiltRecommendationPollingRef.current);
      lteTiltRecommendationPollingRef.current = null;
    }

    if (dismissToast && lteTiltRecommendationToastIdRef.current) {
      toast.dismiss(lteTiltRecommendationToastIdRef.current);
    }

    lteTiltRecommendationJobIdRef.current = null;
    if (dismissToast) {
      lteTiltRecommendationToastIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopLtePredictionMonitoring(true);
      stopLteTiltRecommendationMonitoring(true);
      stopLteOptimisedPredictionMonitoring(true);
    };
  }, [stopLteOptimisedPredictionMonitoring, stopLtePredictionMonitoring, stopLteTiltRecommendationMonitoring]);

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

  const pollLteTiltRecommendationStatus = useCallback(async () => {
    const jobId = lteTiltRecommendationJobIdRef.current;
    const toastId = lteTiltRecommendationToastIdRef.current;

    if (!jobId || !toastId) return;

    try {
      const statusResponse = await predictionApi.getLteTiltRecommendationStatus(jobId);
      const status = String(statusResponse?.status || "").trim().toLowerCase();
      const progressText = statusResponse?.progress
        ? String(statusResponse.progress).trim()
        : "";

      if (status === "done") {
        stopLteTiltRecommendationMonitoring(false);
        setIsRunningLteTiltRecommendation(false);

        const scenario = statusResponse?.scenario;
        const outputFile = statusResponse?.output;
        const downloadUrl = predictionApi.getLteTiltRecommendationDownloadUrl(outputFile);

        toast.update(toastId, {
          render: scenario
            ? `LTE tilt recommendation completed. Scenario ${scenario} saved.`
            : "LTE tilt recommendation completed.",
          type: "success",
          isLoading: false,
          autoClose: 5000,
          closeOnClick: true,
          draggable: true,
        });

        if (downloadUrl) {
          window.open(downloadUrl, "_blank", "noopener,noreferrer");
        }

        lteTiltRecommendationToastIdRef.current = null;
        return;
      }

      if (status === "failed") {
        stopLteTiltRecommendationMonitoring(false);
        setIsRunningLteTiltRecommendation(false);
        const errorMessage =
          statusResponse?.error || "LTE tilt recommendation failed in Python service.";
        toast.update(toastId, {
          render: `LTE tilt recommendation failed: ${errorMessage}`,
          type: "error",
          isLoading: false,
          autoClose: 7000,
          closeOnClick: true,
          draggable: true,
        });
        lteTiltRecommendationToastIdRef.current = null;
        return;
      }

      const statusLabel = status ? status.toUpperCase() : "RUNNING";
      const liveMessage = progressText
        ? `LTE tilt ${statusLabel}: ${progressText}`
        : `LTE tilt ${statusLabel}...`;

      toast.update(toastId, {
        render: liveMessage,
        isLoading: true,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });
    } catch (statusError) {
      const msg = statusError?.message || "Unable to fetch LTE tilt recommendation status.";
      console.error("LTE tilt recommendation polling failed:", msg);
    }
  }, [stopLteTiltRecommendationMonitoring]);

  const handleRunLtePrediction = useCallback(async () => {
    if (!canRunPrediction) {
      toast.error("Prediction is disabled for your license.");
      return;
    }

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
        user_id: Number(user?.id) || 0,
        project_id: numericProjectId,
        session_ids: validSessionIds,
        grid_value: Number(lteGridSizeMeters) || 25,
        radius_m: Number(ltePredictionRadiusMeters) || 5000,
        building: Boolean(ltePredictionUseBuildings),
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
    canRunPrediction,
    projectId,
    sessionIds,
    lteGridSizeMeters,
    ltePredictionRadiusMeters,
    ltePredictionUseBuildings,
    stopLtePredictionMonitoring,
    pollLtePredictionStatus,
  ]);

  const handleRunLteOptimisedPrediction = useCallback(async () => {
    if (!canRunPrediction) {
      toast.error("Prediction is disabled for your license.");
      return;
    }

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
        user_id: Number(user?.id) || 0,
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
    canRunPrediction,
    projectId,
    lteGridSizeMeters,
    ltePredictionRadiusMeters,
    stopLteOptimisedPredictionMonitoring,
    pollLteOptimisedPredictionStatus,
  ]);

  const handleRunLteTiltRecommendation = useCallback(async () => {
    if (!canRunPrediction) {
      toast.error("Prediction is disabled for your license.");
      return;
    }

    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Please select a valid project before running LTE tilt recommendation.");
      return;
    }

    setIsRunningLteTiltRecommendation(true);
    stopLteTiltRecommendationMonitoring(true);
    const loadingToastId = toast.loading("Starting LTE tilt recommendation...", {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
    });
    lteTiltRecommendationToastIdRef.current = loadingToastId;

    try {
      const response = await predictionApi.runLteTiltRecommendation({
        project_id: numericProjectId,
        operator: lteTiltRecommendationOperator,
        rsrp: lteTiltRecommendationRsrp,
        rsrq: lteTiltRecommendationRsrq,
        sinr: lteTiltRecommendationSinr,
      });

      const jobId = response?.job_id || response?.jobId;
      if (!jobId) {
        setIsRunningLteTiltRecommendation(false);
        toast.update(loadingToastId, {
          render: "LTE tilt recommendation started, but no job id was returned.",
          type: "warning",
          isLoading: false,
          autoClose: 6000,
          closeOnClick: true,
          draggable: true,
        });
        lteTiltRecommendationToastIdRef.current = null;
        return;
      }

      lteTiltRecommendationJobIdRef.current = jobId;
      toast.update(loadingToastId, {
        render: `LTE tilt recommendation queued. Job: ${jobId}. Monitoring progress...`,
        isLoading: true,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });

      await pollLteTiltRecommendationStatus();
      lteTiltRecommendationPollingRef.current = setInterval(() => {
        pollLteTiltRecommendationStatus();
      }, 3000);
    } catch (error) {
      setIsRunningLteTiltRecommendation(false);
      const failureMessage = error?.message || "Failed to start LTE tilt recommendation.";
      if (lteTiltRecommendationToastIdRef.current) {
        toast.update(lteTiltRecommendationToastIdRef.current, {
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
      stopLteTiltRecommendationMonitoring(false);
      lteTiltRecommendationToastIdRef.current = null;
    }
  }, [
    canRunPrediction,
    projectId,
    lteTiltRecommendationOperator,
    lteTiltRecommendationRsrp,
    lteTiltRecommendationRsrq,
    lteTiltRecommendationSinr,
    stopLteTiltRecommendationMonitoring,
    pollLteTiltRecommendationStatus,
  ]);

  const selectedEnvironment = useMemo(() => {
    const current = dataFilters?.indoorOutdoor || [];
    if (current.includes("Indoor")) return "Indoor";
    if (current.includes("Outdoor")) return "Outdoor";
    return "all";
  }, [dataFilters?.indoorOutdoor]);

  const updateEnvironment = useCallback(
    (value) => {
      setDataFilters?.((prev) => ({
        ...prev,
        indoorOutdoor: value === "all" ? [] : [value],
      }));
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
            <div className="bg-slate-800/50 rounded-lg text-xs border border-slate-700/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCurrentViewInfo((prev) => !prev)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-slate-700/30 transition-colors"
              >
                <span className="text-slate-200 font-medium">Sessions</span>
                {showCurrentViewInfo ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {showCurrentViewInfo && (
                <div className="px-2.5 pb-2.5 space-y-1 border-t border-slate-700/50">
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
            </div>
          )}

          <CollapsibleSection
            title="Data Layer"
            icon={Database}
            defaultOpen={true}
          >
            <ToggleRow
              label="Log View"
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



                <ToggleRow
                  label="Show Num cell "
                  checked={showNumCells}
                  onChange={setShowNumCells}
                />
              </>
            )}
            <ToggleRow
              label="Secondary Logs"
              checked={Boolean(showSessionNeighbors)}
              onChange={setShowSessionNeighbors}
              useSwitch={true}
            />

            <ToggleRow
              label="Buildings"
              checked={Boolean(showPolygons && polygonSource === "save")}
              onChange={(checked) => {
                if (checked) {
                  setShowPolygons?.(true);
                  setPolygonSource?.("save");
                  return;
                }
                setShowPolygons?.(false);
                setPolygonSource?.("map");
              }}
              useSwitch={true}
            />

            <ToggleRow
              label="Edit Polygon"
              description="Enable drag and reshape for the map boundary polygon"
              checked={Boolean(projectPolygonEditEnabled)}
              onChange={setProjectPolygonEditEnabled}
              useSwitch={true}
            />

            <ToggleRow
              label="Area Zone"
              checked={Boolean(areaEnabled)}
              onChange={setAreaEnabled}
              useSwitch={true}
            />

            <ToggleRow
                  label="Sub Sessions"
                  checked={Boolean(showSubSession)}
                  onChange={setShowSubSession}
                  useSwitch={true}
                />
          </CollapsibleSection>

          <CollapsibleSection
            title="Raster"
            icon={Grid3X3}
            defaultOpen={true}
            badge={activeDataFiltersCount > 0 ? activeDataFiltersCount : null}
          >
            {shouldShowMetricSelector ? (
              <div className="space-y-3">


                <SelectRow
                  label="KPI"
                  value={metric}
                  onChange={setMetric}
                  options={metricOptions}
                  placeholder="Select metric"
                />

                {String(metric || "").toLowerCase() === "dominance" && (
                  <div className="border border-slate-700/50 rounded-lg p-2.5 bg-slate-900/40 space-y-3">
                    <div className="text-xs font-semibold text-amber-300">
                      Dominance Analysis
                    </div>
                    {loading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Loading dominance analysis...
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-400">
                            Range Mask (±dB)
                          </Label>
                          <Input
                            type="number"
                            value={dominanceThreshold ?? 6}
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
                            {-Math.abs(Number(dominanceThreshold ?? 6))} to{" "}
                            {Math.abs(Number(dominanceThreshold ?? 6))} dB. Colors reflect the count
                            of overlapping signals.
                          </p>
                          {!supportsSessionFilters && (
                            <p className="text-[10px] text-amber-400">
                              Available only in Data Layer sample mode.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {String(metric || "").toLowerCase() === "coverage_violation" && (
                  <div className="border border-slate-700/50 rounded-lg p-2.5 bg-slate-900/40 space-y-3">
                    <div className="text-xs font-semibold text-amber-300">
                      Coverage Violation
                    </div>
                    {loading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Loading coverage violation...
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-400">
                            Range Start (Negative dB)
                          </Label>
                          <Input
                            type="number"
                            value={coverageViolationThreshold ?? -10}
                            max={0}
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
                            {Number(coverageViolationThreshold ?? -10)} dB and 0 dB relative to
                            primary. Colors reflect count of signals.
                          </p>
                          {!supportsSessionFilters && (
                            <p className="text-[10px] text-amber-400">
                              Available only in Data Layer sample mode.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <SelectRow
                  label="Color By"
                  value={colorBy || "metric"}
                  onChange={(v) => setColorBy?.(v === "metric" ? null : v)}
                  options={colorOptions}
                  placeholder="Select color scheme"
                  disabled={!enableDataToggle}
                />

                <div className="border-t border-slate-700/50 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">KPI Filters</span>
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
                </div>
                

                
                <SelectRow
                  label="Environment"
                  value={selectedEnvironment}
                  onChange={updateEnvironment}
                  disabled={!enableDataToggle}
                  options={[
                    { value: "all", label: "All" },
                    { value: "Indoor", label: "Indoor" },
                    { value: "Outdoor", label: "Outdoor" },
                  ]}
                  placeholder="Select environment"
                  className="pt-1"
                />

                

                {activeDataFiltersCount > 0 && (
                  <div className="mt-1 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-xs text-blue-300">
                    Filters active: {activeDataFiltersCount}
                  </div>
                )}


              </div>
            ) : (
              <p className="text-[11px] text-slate-400 pt-1">
                Enable Data, Sites prediction, Stored Grid, or Polygons to configure Raster KPI.
              </p>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Prediction" icon={Radio}>
            <ToggleRow
              label="Sites"
              checked={enableSiteToggle}
              onChange={setEnableSiteToggle}
              useSwitch={true}
            />

            {enableSiteToggle && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <SelectRow
                  className="pt-2"
                  value={siteToggle}
                  onChange={setSiteToggle}
                  options={[
                    { value: "Cell", label: "Cell" },
                    { value: "NoML", label: "ML" },
                  ]}
                />

                  {siteToggle === "Cell" && (
                    <SelectRow
                      
                      value={sitePredictionVersion}
                      onChange={(nextValue) =>
                        setSitePredictionVersion?.(nextValue)
                      }
                      options={[
                        { value: "original", label: "Baseline" },
                        { value: "updated", label: "Optimized" },
                        { value: "delta", label: "Delta" },
                      ]}
                      placeholder="Select cell version"
                      className="pt-2"
                    />
                  )}
                  <SelectRow
                    className="pt-2"
                    value={siteLabelField || "none"}
                    onChange={(nextValue) => setSiteLabelField?.(nextValue)}
                    options={[
                      { value: "none", label: "None" },
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
                      {isBaselineCellMode && canRunPrediction && (
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
                          <ToggleRow
                            label="Buildings"
                            description="Include building data in prediction"
                            checked={Boolean(ltePredictionUseBuildings)}
                            onChange={setLtePredictionUseBuildings}
                            useSwitch={true}
                          />
                          <Button
                            type="button"
                            onClick={handleRunLtePrediction}
                            disabled={ltePredictionButtonDisabled}
                            className="w-full h-8 text-xs font-semibold"
                            title={!canRunPrediction ? "Disabled by license" : "Run LTE Prediction"}
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

                      {isOptimizedCellMode && canRunPrediction && (
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
                            title={!canRunPrediction ? "Disabled by license" : "Run optimized prediction"}
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

                      {isDeltaCellMode && canUseGridApi && (
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


          {canUseGridApi && (
            <div className="pt-2 border-t border-slate-700/50 space-y-2">
              <ToggleRow
                label="Show Stored Grid"
                description={
                  deltaGridApiState?.computing
                    ? "Computing grid..."
                    : deltaGridApiState?.fetching
                      ? "Fetching stored grid..."
                      : ""
                }
                checked={Boolean(deltaGridApiState?.gridVisible)}
                onChange={() => onDeltaGridFetchStored?.()}
                disabled={
                  deltaGridButtonsDisabled ||
                  Boolean(deltaGridApiState?.computing) ||
                  Boolean(deltaGridApiState?.fetching)
                }
                useSwitch={true}
              />
              {(deltaGridApiState?.computing || deltaGridApiState?.fetching) && (
                <p className="pt-1 text-[10px] text-blue-300">
                  {deltaGridApiState?.computing
                    ? "Computing grid..."
                    : "Fetching stored grid..."}
                </p>
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
                        title={!canUseGridApi ? "Disabled by license" : "Compute and store with current manual grid size"}
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
                    label="Layer"
                    value={storedGridLayerMode}
                    onChange={handleStoredGridLayerModeChange}
                    options={[
                      { value: "kpi", label: "KPI" },
                      { value: "operator", label: "Customer Benchmark" },
                    ]}
                    placeholder="Select layer"
                  />

                  <SelectRow
                    label="Aggregate"
                    value={storedGridAggregateMode}
                    onChange={handleStoredGridAggregateModeChange}
                    options={[
                      { value: "avg", label: "Average" },
                      { value: "min", label: "Minimum" },
                      { value: "max", label: "Maximum" },
                    ]}
                    placeholder="Select aggregate"
                  />

                  
                </>
              )}
            </div>
          )}
          </CollapsibleSection>






          {/* Metric & Filters moved to Raster section */}

          {/* Dominance/Coverage controls moved under Raster KPI */}
          <CollapsibleSection
            title="Mobility"
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

          <CollapsibleSection
          title="Optimisation" 
          icon={TowerControl} >
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1.5">
            {canRunPrediction && (
              <>
                      <Label className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
                        <Radio className="w-3 h-3" /> LTE Tilt Recommendation
                      </Label>
                      
                      <div className="rounded-lg bg-slate-800/60 p-2">
                        <Label className="mb-1 block text-[11px] text-slate-400">
                          Operator
                        </Label>
                        <Input
                          value={lteTiltRecommendationOperator}
                          onChange={(e) => setLteTiltRecommendationOperator(e.target.value)}
                          placeholder="all / Airtel / Jio / Vi"
                          className="h-8 bg-slate-800 border-slate-600 text-white text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-slate-800/60 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">RSRP</span>
                          </div>
                          <ThresholdInput
                            value={Number(lteTiltRecommendationRsrp) || -105}
                            onChange={(next) => setLteTiltRecommendationRsrp(Number(next))}
                            min={-140}
                            max={0}
                            step={1}
                            unit="dBm"
                            showButtons={false}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-800/60 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">RSRQ</span>
                          </div>
                          <ThresholdInput
                            value={Number(lteTiltRecommendationRsrq) || -15}
                            onChange={(next) => setLteTiltRecommendationRsrq(Number(next))}
                            min={-40}
                            max={0}
                            step={1}
                            unit="dB"
                            showButtons={false}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-800/60 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">SINR</span>
                          </div>
                          <ThresholdInput
                            value={Number(lteTiltRecommendationSinr) || 0}
                            onChange={(next) => setLteTiltRecommendationSinr(Number(next))}
                            min={-20}
                            max={40}
                            step={1}
                            unit="dB"
                            showButtons={false}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={handleRunLteTiltRecommendation}
                        disabled={lteTiltRecommendationButtonDisabled}
                        className="w-full h-8 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500"
                        title={!canRunPrediction ? "Disabled by license" : "Run LTE tilt recommendation"}
                      >
                        {isRunningLteTiltRecommendation ? (
                          <span className="inline-flex items-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Running...
                          </span>
                        ) : (
                          "Run LTE Tilt Recommendation"
                        )}
                      </Button>
                    </>
                  )}
            </div>
          
            </CollapsibleSection>
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
