// src/components/UnifiedMapSidebar.jsx
import React, { useMemo, useCallback, memo, useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { toast } from "react-toastify";
import {
  X,
  RefreshCw,
  AlertTriangle,
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  Database,
  Radio,
  Grid3X3,
  ArrowLeftRight,
  PlusCircle,
  Check,
  Smartphone,
  TowerControl,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapViewApi, predictionApi } from "@/api/apiEndpoints";
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

const LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS = Object.freeze({
  operator: "Airtel",
  radiusMeters: 500,
  gridResolutionMeters: 25,
  workers: 3,
  neighborSiteCount: 2,
  maxInterferenceSites: 10,
  maxNeighborsPerUpdateCell: 2,
});

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
      {label && <Label className="text-sm font-semibold text-white">{label}</Label>}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-full min-w-0 bg-slate-800 border-slate-600 text-xs text-white [&>span]:truncate">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-w-[340px] min-w-[240px] bg-slate-900 border-slate-700 text-white">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="pr-8 text-xs text-white focus:text-white">
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
      {options.map((option) => {
        const optionDisabled = disabled || Boolean(option.disabled);
        return (
          <button
            key={option.value}
            onClick={() => !optionDisabled && onChange(option.value)}
            disabled={optionDisabled}
            title={option.title}
            className={`flex-1 px-2 py-1.5 text-xs font-medium transition-all ${value === option.value
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              } ${optionDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            {option.label}
          </button>
        );
      })}
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

const GRID_VIEW_ALLOWED_METRICS = Object.freeze([
  "rsrp",
  "rsrq",
  "sinr",
  "dl_thpt",
  "ul_thpt",
  "mos",
  "latency",
  "jitter",
]);
const GRID_ONLY_METRICS = Object.freeze([
  "best_operator",
  "best_technology",
  "best_pci",
]);

// Info Badge
const InfoBadge = memo(({ label, value, color = "blue" }) => {
  const colors = {
    blue: "text-blue-400",
    cyan: "text-cyan-400",
    teal: "text-teal-400",
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
  showMetricLabels = false,
  setShowMetricLabels,
  enableDataToggle,
  setEnableDataToggle,
  dataToggle,
  setDataToggle,
  predictionLoading = false,
  predictionDataUnavailable = false,
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
  siteRowCount = 0,
  sitePredictionVersion = "original",
  setSitePredictionVersion,
  sitePredictionScenarioId = null,
  setSitePredictionScenarioId,
  sitePredictionScenarioOptions = [],
  onDeleteSitePredictionScenario,
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
  siteOperatorOptions = [],
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
  buildingBorderEnabled = false,
  setBuildingBorderEnabled,
  projectPolygonEditEnabled = false,
  setProjectPolygonEditEnabled,
  canSaveDrawnPolygonToProject = false,
  newProjectPolygonName = "",
  setNewProjectPolygonName,
  isSavingProjectPolygon = false,
  onSaveDrawnPolygonToProject,
  editedProjectPolygonCount = 0,
  isSavingEditedProjectPolygons = false,
  onSaveEditedProjectPolygons,
  onDiscardEditedProjectPolygons,
  ltePredictionUseBuildings = true,
  setLtePredictionUseBuildings,
  onlyInsidePolygons,
  polygonCount,
  filterPolygons = [],
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
  neighborLogsAvailable = false,
  sessionNeighborLoading = false,
  gridCellStats = { total: 0, populated: 0 },
  subSessionMarkerCount = 0,
  subSessionLoading = false,
  subSessionError = null,
  neighborStats,
  areaEnabled,
  setAreaEnabled,
  areaZoneCount = 0,
  areaZoneLoading = false,
  areaZoneError = null,
  enableGrid,
  setEnableGrid,
  gridSizeMeters,
  setGridSizeMeters,
  gridAggregationSummary = null,
  canEnableGridView = false,
  lteGridAvailable = false,
  lteGridSizeMeters,
  setLteGridSizeMeters,
  lteGridAggregationMethod,
  setLteGridAggregationMethod,
  storedGridVersion = "original",
  setStoredGridVersion,
  storedGridScenarioId = null,
  setStoredGridScenarioId,
  storedGridScenarioOptions = [],
  storedGridMetricMode = "max",
  setStoredGridMetricMode,
  deltaGridScope = "selected",
  setDeltaGridScope,
  deltaGridApiState = {},
  onDeltaGridComputeStore,
  onDeltaGridFetchStored,
  onDeleteStoredGridScenario,
  mlGridEnabled,
  setMlGridEnabled,
  mlGridSize,
  setMlGridSize,
  mlGridAggregation,
  setMlGridAggregation,
  coverageViolationThreshold,
  setCoverageViolationThreshold,
  onAddSiteClick,
  onSessionIdsChange,
  getCachedNetworkLogsForPrediction,
}) => {
  const { user, refreshUser } = useAuth();
  const [siteScenarioMenuOpen, setSiteScenarioMenuOpen] = useState(false);
  const [storedGridScenarioMenuOpen, setStoredGridScenarioMenuOpen] = useState(false);
  const [showCurrentViewInfo, setShowCurrentViewInfo] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [activeSidebarTab, setActiveSidebarTab] = useState("filter");
  const [isEditingSessions, setIsEditingSessions] = useState(false);
  const [sessionInputValue, setSessionInputValue] = useState("");

  useEffect(() => {
    if (!isEditingSessions) {
      setSessionInputValue(Array.isArray(sessionIds) ? sessionIds.join(", ") : "");
    }
  }, [isEditingSessions, sessionIds]);

  useEffect(() => {
    if (!open) return;
    setSidebarWidth((prev) => {
      if (!Number.isFinite(prev)) return 340;
      return Math.min(Math.max(prev, 280), 620);
    });
  }, [open]);

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

  const sidebarShellStyle = useMemo(
    () => ({
      width: open ? sidebarWidth : 0,
    }),
    [open, sidebarWidth],
  );

  const sidebarPanelStyle = useMemo(
    () => ({
      position: "relative",
    }),
    [],
  );

  // Metric options
  const metricOptions = useMemo(
    () => {
      const allOptions = [
        { value: "rsrp", label: "RSRP/RSSI/RXLevel" },
        { value: "rsrq", label: "RSRQ" },
        { value: "sinr", label: "SINR/RXQual" },
        { value: "dl_thpt", label: "DL Throughput" },
        { value: "ul_thpt", label: "UL Throughput" },
        { value: "mos", label: "MOS" },
        { value: "pci", label: "PCI/BCCH" },
        { value: "num_cells", label: "Pilot pollution" },
        { value: "level", label: "Ping pong" },
        { value: "jitter", label: "Jitter" },
        { value: "latency", label: "Latency" },
        { value: "packet_loss", label: "Packet Loss" },
        { value: "cell_id", label: "Cell ID" },
        { value: "nodebid", label: "NodeB ID" },
        { value: "tac", label: "TAC/LAC" },
        { value: "dominance", label: "Dominance Analysis" },
        { value: "coverage_violation", label: "Coverage Violation" },
      ];

      if (!enableGrid) return allOptions;
      return allOptions.filter((option) =>
        GRID_VIEW_ALLOWED_METRICS.includes(option.value),
      );
    },
    [enableGrid],
  );

  const colorOptions = useMemo(
    () => {
      if (enableGrid) {
        return [
          { value: "metric", label: "By Metric Value" },
          { value: "provider", label: "Best Operator" },
          { value: "band", label: "Best Band" },
          { value: "technology", label: "Best Technology" },
          { value: "nodebid", label: "Best NodeB ID" },
          { value: "pci", label: "Best Server" },
        ];
      }
      return [
        { value: "metric", label: "By Metric Value" },
        { value: "provider", label: "By Provider" },
        { value: "band", label: "By Band" },
        { value: "technology", label: "By Technology" },
        { value: "cell_id", label: "By Cell ID" },
        { value: "nodebid", label: "By NodeB ID" },
      ];
    },
    [enableGrid],
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
    setDataFilters?.((prev) => ({
      ...prev,
      providers: [],
      bands: [],
      technologies: [],
      cellIds: [],
      indoorOutdoor: [],
      excludedMetricValue: "",
    }));
    setPciThreshold(0);
  }, [setDataFilters, setPciThreshold]);

  const toggleAppFilter = useCallback(
    (appName, checked) => {
      setDataFilters?.((prev) => {
        const current = Array.isArray(prev?.apps) ? prev.apps : [];
        const exists = current.includes(appName);
        const nextApps = checked
          ? exists
            ? current
            : [...current, appName]
          : current.filter((app) => app !== appName);
        return {
          ...prev,
          apps: nextApps,
        };
      });
    },
    [setDataFilters],
  );

  const handleSiteToggleChange = useCallback(
    (checked) => {
      setEnableSiteToggle?.(checked);
      if (!checked) return;

      const count = Number(siteRowCount) || 0;
      if (count > 0) {
        toast.info(`${count} site${count === 1 ? "" : "s"} loaded`);
      } else {
        toast.info("Fetching site data...");
      }
    },
    [setEnableSiteToggle, siteRowCount],
  );

  const handleFetchSiteLayerData = useCallback(async () => {
    const isCellMode = String(siteToggle || "").trim().toLowerCase() === "cell";
    const layerLabel = isCellMode ? "sector triangles" : "sites";
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new Event(isCellMode ? "map:selectAllSectors" : "map:selectAllSites"),
        );
      }
      toast.info(`Fetching ${layerLabel} data...`);
    } catch (error) {
      const message = error?.message || `Failed to fetch ${layerLabel} data.`;
      toast.error(message);
    }
  }, [siteToggle]);

  const activeDataFiltersCount = useMemo(() => {
    if (!dataFilters) return 0;
    return (
      (dataFilters.providers?.length > 0 ? 1 : 0) +
      (dataFilters.bands?.length > 0 ? 1 : 0) +
      (dataFilters.technologies?.length > 0 ? 1 : 0) +
      (dataFilters.cellIds?.length > 0 ? 1 : 0) +
      (dataFilters.indoorOutdoor?.length > 0 ? 1 : 0) +
      (String(dataFilters.excludedMetricValue ?? "").trim() ? 1 : 0)
    );
  }, [dataFilters]);

  const activeAppFiltersCount = useMemo(
    () => (Array.isArray(dataFilters?.apps) ? dataFilters.apps.length : 0),
    [dataFilters?.apps],
  );

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

  const areaZoneAvailabilityToastPendingRef = useRef(false);

  useEffect(() => {
    if (!areaEnabled) {
      areaZoneAvailabilityToastPendingRef.current = false;
      return undefined;
    }

    if (!areaZoneAvailabilityToastPendingRef.current || areaZoneLoading) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (!areaZoneAvailabilityToastPendingRef.current) return;
      areaZoneAvailabilityToastPendingRef.current = false;

      if (areaZoneError) {
        toast.error("Could not check area zone availability.");
        return;
      }

      const count = Number(areaZoneCount) || 0;
      if (count > 0) {
        toast.success(`${count} area zone${count === 1 ? "" : "s"} available.`);
      } else {
        toast.info("No area zones available for this project.");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [areaEnabled, areaZoneCount, areaZoneError, areaZoneLoading]);

  const subSessionAvailabilityToastPendingRef = useRef(false);

  useEffect(() => {
    if (!showSubSession) {
      subSessionAvailabilityToastPendingRef.current = false;
      return undefined;
    }

    if (!subSessionAvailabilityToastPendingRef.current || subSessionLoading) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (!subSessionAvailabilityToastPendingRef.current) return;
      subSessionAvailabilityToastPendingRef.current = false;

      if (subSessionError) {
        toast.error("Could not check sub-session availability.");
        return;
      }

      const count = Number(subSessionMarkerCount) || 0;
      if (count > 0) {
        toast.success(`${count} sub-session marker${count === 1 ? "" : "s"} available.`);
      } else {
        toast.info("No sub sessions available for the selected sessions.");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    showSubSession,
    subSessionError,
    subSessionLoading,
    subSessionMarkerCount,
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
    if (dataToggle !== "sample") {
      setDataToggle?.("sample");
    }
  }, [dataToggle, setDataToggle]);

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
  const [ltePredictionOperator, setLtePredictionOperator] = useState("auto");
  const ltePredictionPollingRef = useRef(null);
  const ltePredictionToastIdRef = useRef(null);
  const ltePredictionJobIdRef = useRef(null);
  const [isRunningLteTiltRecommendation, setIsRunningLteTiltRecommendation] = useState(false);
  const [lteTiltRecommendationOperator, setLteTiltRecommendationOperator] = useState(LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.operator);
  const [lteTiltRecommendationRsrp, setLteTiltRecommendationRsrp] = useState(-90);
  const [lteTiltRecommendationRsrq, setLteTiltRecommendationRsrq] = useState(-14);
  const [lteTiltRecommendationSinr, setLteTiltRecommendationSinr] = useState(0);
  const [lteTiltRecommendationRsrpWeight, setLteTiltRecommendationRsrpWeight] = useState(20);
  const [lteTiltRecommendationRsrqWeight, setLteTiltRecommendationRsrqWeight] = useState(20);
  const [lteTiltRecommendationSinrWeight, setLteTiltRecommendationSinrWeight] = useState(60);
  const [lteTiltRecommendationRadiusMeters, setLteTiltRecommendationRadiusMeters] = useState(LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.radiusMeters);
  const [lteTiltRecommendationGridResolutionMeters, setLteTiltRecommendationGridResolutionMeters] = useState(LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.gridResolutionMeters);
  const [lteTiltRecommendationFile, setLteTiltRecommendationFile] = useState(null);
  const lteTiltFileInputRef = useRef(null);
  const lteTiltRecommendationPollingRef = useRef(null);
  const lteTiltRecommendationToastIdRef = useRef(null);
  const lteTiltRecommendationJobIdRef = useRef(null);
  const [isRunningLteOptimisedPrediction, setIsRunningLteOptimisedPrediction] = useState(false);
  const [lteOptimisedSelectedOperators, setLteOptimisedSelectedOperators] = useState([]);
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

  const activePolygonIdsParam = useMemo(() => {
    if (!onlyInsidePolygons || !Array.isArray(filterPolygons)) return undefined;
    const ids = filterPolygons
      .map((poly) => Number(poly?.id ?? poly?.polygon_id ?? poly?.polygonId))
      .filter((id) => Number.isFinite(id) && id > 0);
    return ids.length > 0 ? Array.from(new Set(ids)).join(",") : undefined;
  }, [filterPolygons, onlyInsidePolygons]);

  const lteOptimisedOperatorOptions = useMemo(() => {
    const preferredProviders = Array.isArray(siteOperatorOptions) && siteOperatorOptions.length > 0
      ? siteOperatorOptions
      : Array.isArray(availableFilterOptions?.providers)
        ? availableFilterOptions.providers
        : [];
    const rawProviders = preferredProviders;
    const normalized = rawProviders
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    return unique.map((name) => ({
      value: name.toLowerCase(),
      label: name,
    }));
  }, [availableFilterOptions?.providers, siteOperatorOptions]);

  const ltePredictionOperatorOptions = useMemo(
    () => [
      { value: "auto", label: "Select Provider" },
      ...lteOptimisedOperatorOptions,
    ],
    [lteOptimisedOperatorOptions],
  );

  useEffect(() => {
    if (
      ltePredictionOperator !== "auto" &&
      !ltePredictionOperatorOptions.some((opt) => opt.value === ltePredictionOperator)
    ) {
      setLtePredictionOperator("auto");
    }
  }, [ltePredictionOperator, ltePredictionOperatorOptions]);

  useEffect(() => {
    setLteOptimisedSelectedOperators((prev) =>
      prev.filter((value) =>
        lteOptimisedOperatorOptions.some((opt) => opt.value === value),
      ),
    );
  }, [lteOptimisedOperatorOptions]);
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
  const normalizedStoredGridVersion = useMemo(() => {
    const normalizedVersion = String(storedGridVersion || "original").trim().toLowerCase();
    if (
      normalizedVersion === "updated" ||
      normalizedVersion === "optimized" ||
      normalizedVersion === "optimised"
    ) {
      return "updated";
    }
    if (normalizedVersion === "delta") return "delta";
    return "original";
  }, [storedGridVersion]);
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
  const handleStoredGridVersionChange = useCallback(
    (nextVersion) => {
      setStoredGridVersion?.(nextVersion);
      if (Boolean(deltaGridApiState?.gridVisible)) {
        onDeltaGridFetchStored?.({
          version: nextVersion,
          forceFetch: true,
        });
      }
    },
    [setStoredGridVersion, deltaGridApiState?.gridVisible, onDeltaGridFetchStored],
  );
  const handleStoredGridScenarioChange = useCallback(
    (nextScenarioId) => {
      const parsedScenarioId = Number(nextScenarioId);
      setStoredGridScenarioId?.(Number.isFinite(parsedScenarioId) && parsedScenarioId > 0 ? parsedScenarioId : null);
      if (Boolean(deltaGridApiState?.gridVisible)) {
        onDeltaGridFetchStored?.({
          version: normalizedStoredGridVersion,
          scenarioId: Number.isFinite(parsedScenarioId) && parsedScenarioId > 0 ? parsedScenarioId : undefined,
          forceFetch: true,
        });
      }
    },
    [
      setStoredGridScenarioId,
      deltaGridApiState?.gridVisible,
      onDeltaGridFetchStored,
      normalizedStoredGridVersion,
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
        const rowCount = [
          statusResponse?.inserted,
          statusResponse?.rows,
          statusResponse?.merged_rows,
          statusResponse?.optimized_rows,
        ]
          .map((value) => Number(value))
          .find((value) => Number.isFinite(value));
        const recommendationScenarioId = Number(statusResponse?.recommendation_scenario_id);
        const appliedRows = Number(statusResponse?.applied_recommendation_rows);
        const details = [
          Number.isFinite(rowCount) ? `${rowCount} rows` : "",
          Number.isFinite(recommendationScenarioId) ? `RF scenario ${recommendationScenarioId}` : "",
          Number.isFinite(appliedRows) ? `${appliedRows} recommendations applied` : "",
        ].filter(Boolean);
        const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
        toast.update(toastId, {
          render: `LTE prediction optimized completed${suffix}.`,
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
          render: `LTE prediction optimized failed: ${errorMessage}`,
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
        ? `LTE prediction optimized ${statusLabel}: ${progressText}`
        : `LTE prediction optimized ${statusLabel}...`;

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

  const startLteRecommendationOptimisedPrediction = useCallback(
    async (options = {}) => {
      if (!canRunPrediction) {
        toast.error("Prediction is disabled for your license.");
        return;
      }

      const numericProjectId = Number(projectId);
      if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
        toast.error("Please select a valid project before running LTE prediction optimized.");
        return;
      }

      if (isRunningLteOptimisedPrediction) {
        toast.info("LTE prediction optimized is already running.");
        return;
      }

      const runRadiusMeters =
        Number(options.radiusMeters ?? lteTiltRecommendationRadiusMeters) ||
        LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.radiusMeters;
      const runGridResolutionMeters =
        Number(options.gridResolutionMeters ?? lteTiltRecommendationGridResolutionMeters) ||
        LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.gridResolutionMeters;

      setIsRunningLteOptimisedPrediction(true);
      stopLteOptimisedPredictionMonitoring(true);
      const loadingToastId = toast.loading("Starting LTE prediction optimized from recommendation...", {
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      });
      lteOptimisedPredictionToastIdRef.current = loadingToastId;

      try {
        const response = await predictionApi.runLteRecommendationOptimisedPrediction({
          project_id: numericProjectId,
          region: "india",
          operator: String(lteTiltRecommendationOperator || "").trim() || LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.operator,
          recommendation_scenario_id: options.recommendationScenarioId,
          radius: runRadiusMeters,
          grid_resolution: runGridResolutionMeters,
          n_workers: LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.workers,
          impact_radius_m: runRadiusMeters,
          neighbor_site_count: LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.neighborSiteCount,
          max_interference_sites: LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.maxInterferenceSites,
          max_neighbors_per_update_cell: LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.maxNeighborsPerUpdateCell,
          polygon_ids: activePolygonIdsParam,
        });

        const jobId = response?.job_id || response?.jobId || response?.id;
        if (!jobId) {
          setIsRunningLteOptimisedPrediction(false);
          toast.update(loadingToastId, {
            render: "LTE prediction optimized started, but no job id was returned.",
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
          render: `LTE prediction optimized running. Job: ${jobId}. Monitoring progress...`,
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
        const failureMessage = error?.message || "Failed to start LTE prediction optimized.";
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
    },
    [
      canRunPrediction,
      projectId,
      isRunningLteOptimisedPrediction,
      lteTiltRecommendationOperator,
      lteTiltRecommendationRadiusMeters,
      lteTiltRecommendationGridResolutionMeters,
      stopLteOptimisedPredictionMonitoring,
      pollLteOptimisedPredictionStatus,
      activePolygonIdsParam,
    ],
  );
  const getStoredGridPublicScenarioId = useCallback((item) => {
    const publicScenarioId = Number(
      item?.public_scenario_id ??
        item?.publicScenarioId ??
        item?.display_scenario_id ??
        item?.displayScenarioId,
    );
    if (Number.isFinite(publicScenarioId) && publicScenarioId > 0) return publicScenarioId;

    const scenarioId = Number(item?.scenario_id ?? item?.scenarioId);
    return Number.isFinite(scenarioId) && scenarioId > 0 ? scenarioId : null;
  }, []);

  useEffect(() => {
    if (normalizedStoredGridVersion !== "updated" && normalizedStoredGridVersion !== "delta") return;

    const validScenarioIds = Array.isArray(storedGridScenarioOptions)
      ? storedGridScenarioOptions
          .map(getStoredGridPublicScenarioId)
          .filter((scenarioId) => Number.isFinite(scenarioId) && scenarioId > 0)
      : [];
    const currentScenarioId = Number(storedGridScenarioId);

    if (validScenarioIds.length === 0) {
      if (Number.isFinite(currentScenarioId) && currentScenarioId > 0) {
        setStoredGridScenarioId?.(null);
      }
      return;
    }

    if (
      !Number.isFinite(currentScenarioId) ||
      currentScenarioId <= 0 ||
      !validScenarioIds.includes(currentScenarioId)
    ) {
      setStoredGridScenarioId?.(validScenarioIds[0]);
    }
  }, [
    getStoredGridPublicScenarioId,
    normalizedStoredGridVersion,
    setStoredGridScenarioId,
    storedGridScenarioId,
    storedGridScenarioOptions,
  ]);

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

        const scenario = Number(statusResponse?.scenario);
        const outputFile = statusResponse?.output;
        const savedRecommendationRows = [
          statusResponse?.inserted,
          statusResponse?.recommendation_rows,
          statusResponse?.rows,
        ]
          .map((value) => Number(value))
          .find((value) => Number.isFinite(value));

        toast.update(toastId, {
          render: Number.isFinite(scenario) && scenario > 0
            ? `LTE tilt recommendation completed. Scenario ${scenario} saved.`
            : "LTE tilt recommendation completed.",
          type: "success",
          isLoading: false,
          autoClose: 5000,
          closeOnClick: true,
          draggable: true,
        });

        if (outputFile) {
          await predictionApi.downloadLteTiltRecommendation(outputFile).catch((error) => {
            toast.error(error?.message || "LTE recommendation file download failed.");
          });
        }

        lteTiltRecommendationToastIdRef.current = null;

        if (!Number.isFinite(scenario) || scenario <= 0 || !Number.isFinite(savedRecommendationRows) || savedRecommendationRows <= 0) {
          return;
        }

        const runRecommendationOptimizedFromCurrentInputs = () => {
          const parsedRadius =
            Number(lteTiltRecommendationRadiusMeters) ||
            LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.radiusMeters;
          if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
            toast.error("LTE prediction optimized radius must be a positive number.");
            return;
          }

          const parsedGrid =
            Number(lteTiltRecommendationGridResolutionMeters) ||
            LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.gridResolutionMeters;
          if (!Number.isFinite(parsedGrid) || parsedGrid <= 0) {
            toast.error("LTE prediction optimized grid resolution must be a positive number.");
            return;
          }

          startLteRecommendationOptimisedPrediction({
            recommendationScenarioId: scenario,
            radiusMeters: parsedRadius,
            gridResolutionMeters: parsedGrid,
          });
        };

        let actionToastId;
        actionToastId = toast.info(
          <div className="space-y-2">
            <div>
              LTE tilt recommendation is saved. Run LTE prediction optimized now?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(actionToastId);
                  runRecommendationOptimizedFromCurrentInputs();
                }}
                className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                Run
              </button>
              <button
                type="button"
                onClick={() => toast.dismiss(actionToastId)}
                className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-600"
              >
                Dismiss
              </button>
            </div>
          </div>,
          {
            autoClose: false,
            closeOnClick: false,
            draggable: false,
          },
        );
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
  }, [
    stopLteTiltRecommendationMonitoring,
    startLteRecommendationOptimisedPrediction,
    lteTiltRecommendationRadiusMeters,
    lteTiltRecommendationGridResolutionMeters,
  ]);

  const compactDriveRowsForPython = useCallback((rows = []) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const lat = Number(row.lat ?? row.latitude ?? row.Lat ?? row.Latitude);
        const lon = Number(row.lon ?? row.lng ?? row.longitude ?? row.Lng ?? row.Longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const rowType = String(row.log_type ?? row.connection_type ?? row.connectionType ?? "").trim().toLowerCase();
        if (row.is_wifi === true || rowType === "wifi" || rowType === "wi-fi") return null;
        return {
          lat,
          lon,
          latitude: lat,
          longitude: lon,
          rsrp: row.rsrp ?? row.RSRP ?? row.Rsrp ?? row.lte_rsrp ?? null,
          rsrq: row.rsrq ?? row.RSRQ ?? row.Rsrq ?? row.lte_rsrq ?? null,
          sinr: row.sinr ?? row.SINR ?? row.Sinr ?? row.snr ?? row.SNR ?? row.lte_sinr ?? null,
          cell_id: row.cell_id ?? row.cellId ?? row.CellId ?? row["Cell ID"] ?? "",
          nodeb_id: row.nodeb_id ?? row.node_b_id ?? row.NodeBId ?? row.NodebId ?? "",
          pci: row.pci ?? row.PCI ?? row.Pci ?? "",
          earfcn: row.earfcn ?? row.EARFCN ?? row.Earfcn ?? "",
          session_id: row.session_id ?? row.sessionId ?? row.SessionId ?? "",
          network: row.network ?? row.technology ?? row.Technology ?? "",
          provider: row.provider ?? row.m_alpha_long ?? row.m_alpha_short ?? row.operator ?? "",
          primary: row.primary ?? row.Primary ?? row.is_primary ?? "",
        };
      })
      .filter(Boolean);
  }, []);

  const extractNetworkLogRows = useCallback((response) => {
    const body = response?.data ?? response ?? {};
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.Data)) return body.Data;
    if (Array.isArray(body?.logs)) return body.logs;
    if (body?.data && typeof body.data === "object") {
      if (Array.isArray(body.data.data)) return body.data.data;
      if (Array.isArray(body.data.Data)) return body.data.Data;
    }
    return [];
  }, []);

  const resolveNetworkLogsForPython = useCallback(async (validSessionIds, numericProjectId) => {
    const cachedRows = compactDriveRowsForPython(
      typeof getCachedNetworkLogsForPrediction === "function"
        ? getCachedNetworkLogsForPrediction({
            projectId: numericProjectId,
            sessionIds: validSessionIds,
          })
        : [],
    );
    if (cachedRows.length > 0) {
      console.info("[LTE_PREDICTION_INPUT] source=frontend_memory_cache rows=", cachedRows.length);
      return { rows: cachedRows, source: "frontend_memory_cache" };
    }

    console.info("[LTE_PREDICTION_INPUT] source=frontend_memory_cache rows=0 fallback=MapView/GetNetworkLog");
    const PAGE_SIZE = 50000;
    const MAX_PAGES = 100;
    const fallbackRows = [];
    let totalCount = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await mapViewApi.getNetworkLog({
        session_ids: validSessionIds,
        project_id: numericProjectId,
        page,
        limit: PAGE_SIZE,
      });
      const rows = extractNetworkLogRows(response);
      if (page === 1) {
        const body = response?.data ?? response ?? {};
        totalCount = Number(body?.total_count ?? body?.totalCount ?? body?.TotalCount ?? rows.length) || rows.length;
      }
      fallbackRows.push(...rows);
      if (rows.length < PAGE_SIZE || (totalCount > 0 && fallbackRows.length >= totalCount)) break;
    }

    const compactRows = compactDriveRowsForPython(fallbackRows);
    console.info(
      "[LTE_PREDICTION_INPUT] source=mapview_get_network_log rows=",
      compactRows.length,
      "raw_rows=",
      fallbackRows.length,
    );
    return { rows: compactRows, source: "mapview_get_network_log" };
  }, [compactDriveRowsForPython, extractNetworkLogRows, getCachedNetworkLogsForPrediction]);

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
      let driveRowsPayload = [];
      let driveRowsSource = "python_backend_fallback";
      try {
        const resolvedDriveRows = await resolveNetworkLogsForPython(validSessionIds, numericProjectId);
        driveRowsPayload = resolvedDriveRows.rows;
        driveRowsSource = resolvedDriveRows.source;
      } catch (logError) {
        console.warn(
          "[LTE_PREDICTION_INPUT] frontend log resolve failed; Python will use backend fallback",
          logError,
        );
      }

      const response = await predictionApi.runLtePrediction({
        user_id: Number(user?.id) || 0,
        project_id: numericProjectId,
        session_ids: validSessionIds,
        grid_value: Number(lteGridSizeMeters) || 25,
        radius_m: Number(ltePredictionRadiusMeters) || 5000,
        building: Boolean(ltePredictionUseBuildings),
        operator: ltePredictionOperator,
        drive_rows: driveRowsPayload,
        drive_rows_source: driveRowsSource,
        polygon_ids: activePolygonIdsParam,
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
      }, 6000);
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
    ltePredictionOperator,
    resolveNetworkLogsForPython,
    stopLtePredictionMonitoring,
    pollLtePredictionStatus,
    activePolygonIdsParam,
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
      const selectedOperators = Array.isArray(lteOptimisedSelectedOperators)
        ? lteOptimisedSelectedOperators
        : [];
      const fallbackOperators = (Array.isArray(lteOptimisedOperatorOptions)
        ? lteOptimisedOperatorOptions
        : []
      )
        .map((opt) => String(opt?.value || "").trim().toLowerCase())
        .filter((value) => value && value !== "all");
      const effectiveOperators =
        selectedOperators.length > 0 ? selectedOperators : fallbackOperators;
      const selectedSitePredictionScenarioId = Number(sitePredictionScenarioId);
      const response = await predictionApi.runLteOptimisedPrediction({
        user_id: Number(user?.id) || 0,
        project_id: numericProjectId,
        grid_resolution: Number(lteGridSizeMeters) || 25,
        radius: Number(ltePredictionRadiusMeters) || 5000,
        operator: effectiveOperators.length > 0 ? effectiveOperators.join(",") : "all",
        operators: effectiveOperators,
        site_prediction_scenario_id:
          Number.isFinite(selectedSitePredictionScenarioId) && selectedSitePredictionScenarioId > 0
            ? selectedSitePredictionScenarioId
            : undefined,
        polygon_ids: activePolygonIdsParam,
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
    lteOptimisedSelectedOperators,
    lteOptimisedOperatorOptions,
    sitePredictionScenarioId,
    stopLteOptimisedPredictionMonitoring,
    pollLteOptimisedPredictionStatus,
    activePolygonIdsParam,
  ]);

  const handleRunLteTiltRecommendation = useCallback(async () => {
    if (!canRunPrediction) {
      toast.error("Prediction is disabled for your license.");
      return;
    }

    const numericProjectId = Number(projectId);
    const validSessionIds = (Array.isArray(sessionIds) ? sessionIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

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
        session_ids: validSessionIds,
        operator: lteTiltRecommendationOperator,
        rsrp: lteTiltRecommendationRsrp,
        rsrq: lteTiltRecommendationRsrq,
        sinr: lteTiltRecommendationSinr,
        rsrp_weight: Number.isFinite(Number(lteTiltRecommendationRsrpWeight))
          ? Number(lteTiltRecommendationRsrpWeight)
          : 20,
        rsrq_weight: Number.isFinite(Number(lteTiltRecommendationRsrqWeight))
          ? Number(lteTiltRecommendationRsrqWeight)
          : 20,
        sinr_weight: Number.isFinite(Number(lteTiltRecommendationSinrWeight))
          ? Number(lteTiltRecommendationSinrWeight)
          : 60,
        validate_candidates: true,
        radius_m:
          Number(lteTiltRecommendationRadiusMeters) ||
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.radiusMeters,
        grid_resolution_m:
          Number(lteTiltRecommendationGridResolutionMeters) ||
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.gridResolutionMeters,
        n_workers: 3,
        impact_radius_m:
          Number(lteTiltRecommendationRadiusMeters) ||
          LTE_RECOMMENDATION_OPTIMIZED_DEFAULTS.radiusMeters,
        neighbor_site_count: 2,
        max_interference_sites: 10,
        candidate_workers: 2,
        coordinate_passes: 2,
        bad_grid_coverage_pct: 60,
        max_group_cells: 0,
        max_neighbors_per_update_cell: 2,
        threshold_file: lteTiltRecommendationFile || undefined,
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
    sessionIds,
    lteTiltRecommendationOperator,
    lteTiltRecommendationRsrp,
    lteTiltRecommendationRsrq,
    lteTiltRecommendationSinr,
    lteTiltRecommendationRsrpWeight,
    lteTiltRecommendationRsrqWeight,
    lteTiltRecommendationSinrWeight,
    lteTiltRecommendationRadiusMeters,
    lteTiltRecommendationGridResolutionMeters,
    lteTiltRecommendationFile,
    stopLteTiltRecommendationMonitoring,
    pollLteTiltRecommendationStatus,
  ]);

  const selectedEnvironment = useMemo(() => {
    const current = dataFilters?.indoorOutdoor || [];
    if (current.includes("Indoor")) return "Indoor";
    if (current.includes("Outdoor")) return "Outdoor";
    return "all";
  }, [dataFilters?.indoorOutdoor]);

  const appFilterOptions = useMemo(() => {
    if (!Array.isArray(availableFilterOptions?.apps)) return [];
    return availableFilterOptions.apps
      .map((app) => String(app || "").trim())
      .filter(Boolean);
  }, [availableFilterOptions?.apps]);

  useEffect(() => {
    const selectedApps = Array.isArray(dataFilters?.apps) ? dataFilters.apps : [];
    if (selectedApps.length === 0 || appFilterOptions.length === 0) return;
    const available = new Set(appFilterOptions);
    const nextApps = selectedApps.filter((app) => available.has(app));
    if (nextApps.length === selectedApps.length) return;
    setDataFilters?.((prev) => ({
      ...prev,
      apps: nextApps,
    }));
  }, [appFilterOptions, dataFilters?.apps, setDataFilters]);

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
      <div
        className="relative h-full z-20 shrink-0 overflow-hidden transition-[width] duration-200 ease-out"
        style={sidebarShellStyle}
      >
        {open && (
          <Rnd
            disableDragging
            size={{ width: sidebarWidth, height: "100%" }}
            position={{ x: 0, y: 0 }}
            minWidth={280}
            maxWidth={620}
            enableResizing={{
              right: true,
              left: false,
              top: false,
              bottom: false,
              topRight: false,
              bottomRight: false,
              topLeft: false,
              bottomLeft: false,
            }}
            onResize={(event, direction, ref) => {
              setSidebarWidth(ref.offsetWidth);
            }}
            onResizeStop={(event, direction, ref) => {
              setSidebarWidth(ref.offsetWidth);
            }}
            className="h-full border-r border-slate-800 bg-slate-950 text-white overflow-hidden flex flex-col"
            style={sidebarPanelStyle}
            resizeHandleClasses={{
              right: "group/sidebar-resize-handle",
            }}
            resizeHandleStyles={{
              right: {
                width: "10px",
                right: "-5px",
                cursor: "col-resize",
              },
            }}
          >
            <div className="h-full min-h-0 flex flex-col">
              
              <div className="flex items-center justify-end  bg-slate-950 shrink-0">
                <button
                  className="p-1.5 rounded-md hover:bg-slate-800 transition-colors"
                  onClick={() => onOpenChange?.(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
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
                      <div className="pt-1 space-y-2">
                        {isEditingSessions ? (
                          <>
                            <Input
                              value={sessionInputValue}
                              onChange={(e) => setSessionInputValue(e.target.value)}
                              placeholder="Enter session ids: 1001,1002"
                              className="h-8 bg-slate-900 border-slate-700 text-xs text-white"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 min-w-0 justify-center gap-1.5 px-2 text-xs bg-blue-600 hover:bg-blue-500"
                                onClick={() => {
                                  const nextSessionIds = String(sessionInputValue || "")
                                    .split(/[;,|]/)
                                    .map((id) => id.trim())
                                    .filter(Boolean);
                                  onSessionIdsChange?.(nextSessionIds);
                                  setIsEditingSessions(false);
                                }}
                              >
                                <Check className="h-3.5 w-3.5 shrink-0" />
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 min-w-0 justify-center gap-1.5 px-2 text-xs border-slate-600 bg-slate-900/70 text-slate-200 hover:bg-slate-800 hover:text-white"
                                onClick={() => {
                                  setSessionInputValue(
                                    Array.isArray(sessionIds) ? sessionIds.join(", ") : "",
                                  );
                                  setIsEditingSessions(false);
                                }}
                              >
                                <X className="h-3.5 w-3.5 shrink-0" />
                                Cancel
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs bg-slate-800 border border-slate-600 text-slate-100 hover:bg-slate-700"
                            onClick={() => setIsEditingSessions(true)}
                          >
                            Add / Edit Sessions
                          </Button>
                        )}
                      </div>
                      {enableGrid && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <InfoBadge
                            label="Grid Cells"
                            value={gridAggregationSummary?.populatedCells ?? 0}
                            color="cyan"
                          />
                          <InfoBadge
                            label="Grid Size"
                            value={`${Number(gridSizeMeters) || 20}m`}
                            color="teal"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-700/60 bg-slate-900/70 p-1">
                <button
                  type="button"
                  onClick={() => setActiveSidebarTab("filter")}
                  className={`h-8 rounded-md text-xs font-semibold transition-colors ${
                    activeSidebarTab === "filter"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Filter
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSidebarTab("raster")}
                  className={`h-8 rounded-md text-xs font-semibold transition-colors ${
                    activeSidebarTab === "raster"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Raster
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSidebarTab("optimisation")}
                  className={`h-8 rounded-md text-xs font-semibold transition-colors ${
                    activeSidebarTab === "optimisation"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Optimisation
                </button>
              </div>

              {(activeSidebarTab === "filter" || activeSidebarTab === "raster") && (
                <>
              {activeSidebarTab === "filter" && (
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

                
            <ToggleRow
              label="Secondary Logs"
              description={
                sessionNeighborLoading
                  ? "Checking data..."
                  : neighborLogsAvailable
                    ? undefined
                    : "No secondary logs available"
              }
              checked={Boolean(showSessionNeighbors)}
              onChange={(checked) => {
                if (!neighborLogsAvailable) return;
                setShowSessionNeighbors?.(checked);
              }}
              disabled={!neighborLogsAvailable || sessionNeighborLoading}
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
                setPolygonSource?.(buildingBorderEnabled ? "save" : "map");
              }}
              useSwitch={true}
            />

            {Boolean(deltaGridApiState?.gridVisible) && (
              <ToggleRow
                label="Border"
                description="Color building edges from the stored grid under each edge"
                checked={Boolean(buildingBorderEnabled)}
                onChange={(checked) => {
                  setBuildingBorderEnabled?.(checked);
                  if (checked) setPolygonSource?.("save");
                  if (!checked && !showPolygons) setPolygonSource?.("map");
                }}
                useSwitch={true}
              />
            )}

            <ToggleRow
              label="Edit Polygon"
              description="Enable drag and reshape for the map boundary polygon"
              checked={Boolean(projectPolygonEditEnabled)}
              onChange={setProjectPolygonEditEnabled}
              useSwitch={true}
            />

            {Boolean(projectPolygonEditEnabled && editedProjectPolygonCount > 0) && (
              <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-950/25 p-2">
                <div className="text-xs font-medium text-blue-100">
                  {editedProjectPolygonCount} polygon{editedProjectPolygonCount === 1 ? "" : "s"} edited
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onSaveEditedProjectPolygons}
                    disabled={isSavingEditedProjectPolygons}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isSavingEditedProjectPolygons ? "Saving" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={onDiscardEditedProjectPolygons}
                    disabled={isSavingEditedProjectPolygons}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-600 bg-slate-900 px-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <ToggleRow
              label="Area Zone"
              checked={Boolean(areaEnabled)}
              onChange={(checked) => {
                if (checked) {
                  areaZoneAvailabilityToastPendingRef.current = true;
                  toast.info("Checking area zone availability...");
                } else {
                  areaZoneAvailabilityToastPendingRef.current = false;
                  toast.info("Area zones hidden.");
                }
                setAreaEnabled?.(checked);
              }}
              useSwitch={true}
            />
            {/*  yaha pe hum sub session ko toggle kar rahe hai */}
            <ToggleRow    
                  label="Sub Sessions"
                  checked={Boolean(showSubSession)}
                  onChange={(checked) => {
                    if (checked) {
                      subSessionAvailabilityToastPendingRef.current = true;
                      toast.info("Checking sub-session availability...");
                    } else {
                      subSessionAvailabilityToastPendingRef.current = false;
                      toast.info("Sub sessions hidden.");
                    }
                    setShowSubSession?.(checked);
                  }}
                  useSwitch={true}
                />

                {enableDataToggle && (
                  <>
                    <ToggleRow
                      label="Grid View"
                      description="Aggregate logs into threshold-colored cells"
                      checked={Boolean(enableGrid)}
                      onChange={setEnableGrid}
                      disabled={!canEnableGridView}
                      useSwitch={true}
                    />

                    {enableGrid && (
                      <div className="rounded-lg border border-cyan-700/40 bg-cyan-950/20 p-2 text-xs space-y-2">
                        <SelectRow
                          label="Grid Aggregate"
                          value={lteGridAggregationMethod || "median"}
                          onChange={setLteGridAggregationMethod}
                          options={[
                            { value: "avg", label: "Average" },
                            { value: "median", label: "Median" },
                            { value: "mean", label: "Mean" },
                            { value: "min", label: "Min" },
                            { value: "max", label: "Max" },
                          ]}
                          placeholder="Select grid aggregate"
                        />

                        <div className="rounded-lg bg-slate-900/40 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">Log Grid Size</span>
                          </div>
                          <ThresholdInput
                            value={Number(gridSizeMeters) || 20}
                            onChange={(next) =>
                              setGridSizeMeters?.(Math.round(next))
                            }
                            min={5}
                            max={1000}
                            step={5}
                            unit="m"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <ToggleRow
                  label="Sites"
                  checked={enableSiteToggle}
                  onChange={handleSiteToggleChange}
                  useSwitch={true}
                />

                <ToggleRow
                  label="Secondary Cell Count"
                  checked={showNumCells}
                  onChange={setShowNumCells}
                />

                <ToggleRow
                  label="Metric Labels"
                  description="Show selected KPI value beside each log"
                  checked={Boolean(showMetricLabels)}
                  onChange={setShowMetricLabels}
                  useSwitch={true}
                />

                <SelectRow
                  label="Overlapping Logs"
                  value={ui?.overlapDrawOrder || "original"}
                  onChange={(value) => onUIChange?.({ overlapDrawOrder: value })}
                  options={[
                    { value: "original", label: "Original order" },
                    { value: "latest", label: "Latest on top" },
                    { value: "earliest", label: "Earliest on top" },
                    { value: "highest_metric", label: "Highest KPI on top" },
                    { value: "lowest_metric", label: "Lowest KPI on top" },
                  ]}
                  placeholder="Choose top log"
                  disabled={!enableDataToggle}
                />
          </CollapsibleSection>
              )}

          {activeSidebarTab === "raster" && (
          <CollapsibleSection
            title="Raster"
            icon={Grid3X3}
            defaultOpen={true}
            badge={activeDataFiltersCount > 0 ? activeDataFiltersCount : null}
          >
            {shouldShowMetricSelector ? (
              <div className="space-y-3">
                 <span className="text-xs text-slate-400">KPI Filters</span>

                <SelectRow
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

                    <SelectRow
                      label="Cell ID"
                      value={dataFilters?.cellIds?.[0] || "all"}
                      onChange={(v) => updateDataFilter("cellIds", v)}
                      options={[
                        { value: "all", label: "All Cell IDs" },
                        ...(availableFilterOptions?.cellIds?.map((cellId) => ({
                          value: cellId,
                          label: cellId,
                        })) || []),
                      ]}
                      disabled={!enableDataToggle}
                    />

                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-white">
                        Remove KPI Value
                      </Label>
                      <Input
                        type="number"
                        value={dataFilters?.excludedMetricValue ?? ""}
                        onChange={(e) =>
                          setDataFilters?.((prev) => ({
                            ...prev,
                            excludedMetricValue: e.target.value,
                          }))
                        }
                        disabled={!enableDataToggle}
                        placeholder="e.g. -56"
                        className="h-8 bg-slate-800 border-slate-600 text-xs text-white placeholder:text-slate-500"
                      />
                      <div className="text-[10px] text-slate-500">
                        Removes logs where selected KPI equals this value
                      </div>
                    </div>

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
          )}
          {activeSidebarTab === "raster" && (
            <CollapsibleSection
              title="App"
              icon={Smartphone}
              defaultOpen={false}
              badge={activeAppFiltersCount > 0 ? activeAppFiltersCount : null}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-slate-400">
                    All Available Apps
                  </Label>
                  {activeAppFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDataFilters?.((prev) => ({
                          ...prev,
                          apps: [],
                        }))
                      }
                      className="text-[10px] text-blue-400 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {appFilterOptions.length > 0 ? (
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {appFilterOptions.map((appName) => {
                      const checked = Boolean(dataFilters?.apps?.includes(appName));
                      return (
                        <label
                          key={appName}
                          className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-200 ${
                            enableDataToggle
                              ? "cursor-pointer hover:bg-slate-800/70"
                              : "opacity-50"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!enableDataToggle}
                            onChange={(nextChecked) =>
                              toggleAppFilter(appName, nextChecked)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate" title={appName}>
                            {appName}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No app names found in loaded logs.
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
          {activeSidebarTab === "filter" && (
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
          )}

              </>
              )}

          {activeSidebarTab === "optimisation" && (
            <>
          {activeSidebarTab === "optimisation" && (
          <CollapsibleSection title="Site & Prediction" icon={Radio}>
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
                      { value: "none", label: "Label" },
                      { value: "site_id", label: "Site ID" },
                      { value: "cell_id", label: "Cell ID" },
                      { value: "technology", label: "Technology" },
                      { value: "nodeb_id", label: "NodeB ID" },
                      { value: "pci", label: "PCI" },
                      { value: "band", label: "Band" },
                    ]}
                    placeholder="Site label"
                  />
                  {siteToggle === "Cell" &&
                    String(sitePredictionVersion || "").trim().toLowerCase() === "updated" && (
                      <div className="pt-2 min-w-0 flex-1 space-y-1.5 relative">
                        <button
                          type="button"
                          onClick={() => setSiteScenarioMenuOpen((prev) => !prev)}
                          className="h-8 w-full min-w-0 bg-slate-800 border border-slate-600 rounded px-2 text-xs text-white flex items-center justify-between"
                        >
                          <span className="truncate">
                            {Number.isFinite(Number(sitePredictionScenarioId)) &&
                            Number(sitePredictionScenarioId) > 0
                              ? `Scenario ${sitePredictionScenarioId}`
                              : "No scenarios"}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        </button>
                        {siteScenarioMenuOpen && (
                          <div className="absolute left-0 right-0 z-[2300] mt-1 rounded border border-slate-600 bg-slate-900 shadow-lg max-h-56 overflow-y-auto">
                            {Array.isArray(sitePredictionScenarioOptions) &&
                            sitePredictionScenarioOptions.length > 0 ? (
                              sitePredictionScenarioOptions.map((item) => {
                                const scenarioId = Number(item?.scenario_id);
                                const isSelected =
                                  Number.isFinite(scenarioId) &&
                                  Number(sitePredictionScenarioId) === scenarioId;
                                return (
                                  <div
                                    key={`site-scenario-${scenarioId}`}
                                    className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800 last:border-b-0"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSitePredictionScenarioId?.(
                                          Number.isFinite(scenarioId) && scenarioId > 0 ? scenarioId : null,
                                        );
                                        setSiteScenarioMenuOpen(false);
                                      }}
                                      className={`flex-1 text-left text-xs truncate ${isSelected ? "text-cyan-300" : "text-white"}`}
                                    >
                                      {`Scenario ${scenarioId}`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteSitePredictionScenario?.(scenarioId)}
                                      className="h-6 w-6 rounded bg-red-600/90 hover:bg-red-500 text-white inline-flex items-center justify-center"
                                      title={`Delete Scenario ${scenarioId}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="px-2 py-2 text-xs text-slate-400">No scenarios</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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

                          <SelectRow
                            label="Provider"
                            value={ltePredictionOperator}
                            onChange={setLtePredictionOperator}
                            options={ltePredictionOperatorOptions}
                            placeholder="Select provider"
                            disabled={!canRunPrediction || isRunningLtePrediction}
                          />
                        
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
                              value={Number(ltePredictionRadiusMeters) || 500}
                              onChange={(next) =>
                                setLtePredictionRadiusMeters(Math.round(next))
                              }
                              min={100}
                              max={20000}
                              step={100}
                              unit="m"
                            />
                          </div>
                          <div className="pt-1 bg-slate-800/60 rounded-lg p-2 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Operators</span>
                              <button
                                type="button"
                                onClick={() => setLteOptimisedSelectedOperators([])}
                                className="text-[10px] text-cyan-400 hover:text-cyan-300"
                              >
                                All
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(lteOptimisedOperatorOptions.length > 0
                                ? lteOptimisedOperatorOptions
                                : [{ value: "all", label: "All" }]
                              ).map((opt) => {
                                const checked = lteOptimisedSelectedOperators.includes(opt.value);
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() =>
                                      setLteOptimisedSelectedOperators((prev) =>
                                        prev.includes(opt.value)
                                          ? prev.filter((v) => v !== opt.value)
                                          : [...prev, opt.value],
                                      )
                                    }
                                    className={`h-7 rounded border text-[11px] transition-colors ${
                                      checked
                                        ? "bg-emerald-600/30 border-emerald-400 text-emerald-200"
                                        : "bg-slate-900 border-slate-600 text-slate-300 hover:border-slate-500"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-slate-500">
                              No selection means all operators.
                            </p>
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
                label={`Show Stored ${
                  normalizedStoredGridVersion === "updated"
                    ? "Optimized"
                    : normalizedStoredGridVersion === "delta"
                      ? "Delta"
                      : "Baseline"
                } Grid`}
                description={
                  deltaGridApiState?.computing
                    ? "Computing grid..."
                    : deltaGridApiState?.fetching
                      ? "Fetching stored grid..."
                      : ""
                }
                checked={Boolean(deltaGridApiState?.gridVisible)}
                onChange={() =>
                  onDeltaGridFetchStored?.({ version: normalizedStoredGridVersion })
                }
                disabled={
                  deltaGridButtonsDisabled ||
                  Boolean(deltaGridApiState?.computing) ||
                  Boolean(deltaGridApiState?.fetching)
                }
                useSwitch={true}
              />
              {Boolean(deltaGridApiState?.gridVisible) && (
                <div className="pt-1 bg-slate-900/40 rounded-lg p-2 space-y-2">
                  <Label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                    <Grid3X3 className="w-3 h-3" /> Stored Grid Version
                  </Label>
                  <SegmentedControl
                    value={normalizedStoredGridVersion}
                    onChange={handleStoredGridVersionChange}
                    options={[
                      { value: "original", label: "Baseline" },
                      { value: "updated", label: "Optimized" },
                      { value: "delta", label: "Delta" },
                    ]}
                    disabled={
                      deltaGridButtonsDisabled ||
                      Boolean(deltaGridApiState?.computing) ||
                      Boolean(deltaGridApiState?.fetching)
                    }
                  />
                  {(normalizedStoredGridVersion === "updated" ||
                    normalizedStoredGridVersion === "delta") && (
                    <div className="min-w-0 flex-1 space-y-1.5 relative">
                      <Label className="text-sm font-semibold text-white">Scenario</Label>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            deltaGridButtonsDisabled ||
                            Boolean(deltaGridApiState?.computing) ||
                            Boolean(deltaGridApiState?.fetching) ||
                            !Array.isArray(storedGridScenarioOptions) ||
                            storedGridScenarioOptions.length === 0
                          ) return;
                          setStoredGridScenarioMenuOpen((prev) => !prev);
                        }}
                        className="h-8 w-full min-w-0 bg-slate-800 border border-slate-600 rounded px-2 text-xs text-white flex items-center justify-between disabled:opacity-50"
                        disabled={
                          deltaGridButtonsDisabled ||
                          Boolean(deltaGridApiState?.computing) ||
                          Boolean(deltaGridApiState?.fetching) ||
                          !Array.isArray(storedGridScenarioOptions) ||
                          storedGridScenarioOptions.length === 0
                        }
                      >
                        <span className="truncate">
                          {Number.isFinite(Number(storedGridScenarioId)) && Number(storedGridScenarioId) > 0
                            ? `Scenario ${storedGridScenarioId}`
                            : "No scenarios"}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                      </button>
                      {storedGridScenarioMenuOpen && (
                        <div className="absolute left-0 right-0 z-[2300] mt-1 rounded border border-slate-600 bg-slate-900 shadow-lg max-h-56 overflow-y-auto">
                          {Array.isArray(storedGridScenarioOptions) &&
                          storedGridScenarioOptions.length > 0 ? (
                            storedGridScenarioOptions.map((item) => {
                              const scenarioId = getStoredGridPublicScenarioId(item);
                              const internalScenarioId = Number(
                                item?.internal_scenario_id ?? item?.internalScenarioId,
                              );
                              const isSelected =
                                Number.isFinite(scenarioId) &&
                                Number(storedGridScenarioId) === scenarioId;
                              return (
                                <div
                                  key={`stored-grid-scenario-${scenarioId}`}
                                  className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800 last:border-b-0"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleStoredGridScenarioChange(String(scenarioId));
                                      setStoredGridScenarioMenuOpen(false);
                                    }}
                                    className={`flex-1 text-left text-xs truncate ${isSelected ? "text-cyan-300" : "text-white"}`}
                                  >
                                    {`Scenario ${scenarioId}${item?.status ? ` (${item.status})` : ""}`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteStoredGridScenario?.(scenarioId)}
                                    className="h-6 w-6 rounded bg-red-600/90 hover:bg-red-500 text-white inline-flex items-center justify-center"
                                    title={
                                      Number.isFinite(internalScenarioId) && internalScenarioId > 0
                                        ? `Delete Scenario ${scenarioId}`
                                        : `Delete Scenario ${scenarioId}`
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <div className="px-2 py-2 text-xs text-slate-400">No scenarios</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                        onClick={() =>
                          onDeltaGridComputeStore?.({
                            scenarioId:
                              normalizedStoredGridVersion === "updated" ||
                              normalizedStoredGridVersion === "optimized" ||
                              normalizedStoredGridVersion === "optimised" ||
                              normalizedStoredGridVersion === "delta"
                                ? storedGridScenarioId
                                : undefined,
                          })
                        }
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
          )}


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
          

          {activeSidebarTab === "optimisation" && (
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
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-slate-800/60 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">RSRP Weight</span>
                          </div>
                          <ThresholdInput
                            value={
                              Number.isFinite(Number(lteTiltRecommendationRsrpWeight))
                                ? Number(lteTiltRecommendationRsrpWeight)
                                : 20
                            }
                            onChange={(next) => setLteTiltRecommendationRsrpWeight(Number(next))}
                            min={0}
                            max={100}
                            step={5}
                            unit="%"
                            showButtons={false}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-800/60 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">RSRQ Weight</span>
                          </div>
                          <ThresholdInput
                            value={
                              Number.isFinite(Number(lteTiltRecommendationRsrqWeight))
                                ? Number(lteTiltRecommendationRsrqWeight)
                                : 20
                            }
                            onChange={(next) => setLteTiltRecommendationRsrqWeight(Number(next))}
                            min={0}
                            max={100}
                            step={5}
                            unit="%"
                            showButtons={false}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-800/60 p-2">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-400">SINR Weight</span>
                          </div>
                          <ThresholdInput
                            value={
                              Number.isFinite(Number(lteTiltRecommendationSinrWeight))
                                ? Number(lteTiltRecommendationSinrWeight)
                                : 60
                            }
                            onChange={(next) => setLteTiltRecommendationSinrWeight(Number(next))}
                            min={0}
                            max={100}
                            step={5}
                            unit="%"
                            showButtons={false}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-800/60 p-2 space-y-1.5">
                        <Label className="mb-1 block text-[11px] text-slate-400">
                          Threshold File (optional)
                        </Label>
                        <input
                          ref={lteTiltFileInputRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={(e) =>
                            setLteTiltRecommendationFile(e.target.files?.[0] || null)
                          }
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => lteTiltFileInputRef.current?.click()}
                          className="h-8 w-full rounded border border-slate-600 bg-slate-800 px-2 text-left text-xs text-slate-200 hover:border-slate-500"
                        >
                          {lteTiltRecommendationFile
                            ? lteTiltRecommendationFile.name
                            : "Choose .csv/.xlsx file"}
                        </button>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-slate-500 truncate">
                            {lteTiltRecommendationFile
                              ? `Selected: ${lteTiltRecommendationFile.name}`
                              : "No file selected"}
                          </p>
                          {lteTiltRecommendationFile && (
                            <button
                              type="button"
                              onClick={() => {
                                setLteTiltRecommendationFile(null);
                                if (lteTiltFileInputRef.current) {
                                  lteTiltFileInputRef.current.value = "";
                                }
                              }}
                              className="text-[10px] text-cyan-400 hover:text-cyan-300"
                            >
                              Clear
                            </button>
                          )}
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
          )}
            </>
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
          </Rnd>
        )}
      </div>
    </>
  );
};

export default memo(UnifiedMapSidebar);
