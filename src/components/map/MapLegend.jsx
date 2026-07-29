import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Layers, Settings2, X } from "lucide-react";
import { Rnd } from "react-rnd";
import {
  PCI_COLOR_PALETTE,
  getPciColor as getMetricPciColor,
  getEarfcnColor,
  getMetricConfig,
  getMetricValueFromLog,
} from "@/utils/metrics";
import {
  normalizeProviderName,
  normalizeTechName,
  normalizeBandName,
  COLOR_SCHEMES,
  generateColorFromHash,
  getLogColor,
  registerColor,
} from "@/utils/colorUtils";
import { useSettingsDialog } from "@/context/SettingsDialogContext";

const MAP_COLOR_PRESETS = [
  "#facc15",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#14b8a6",
  "#64748b",
  "#111827",
  "#ffffff",
];

const DEFAULT_LEGEND_SIZE = {
  width: 280,
  height: 220,
};

const LEGEND_VIEWPORT_MARGIN = 16;
const DEFAULT_LEGEND_TOP = 140;
const COLLAPSED_LEGEND_HEIGHT = 44;
const MIN_LEGEND_WIDTH = 240;
const MIN_LEGEND_HEIGHT = 180;

const isWifiLogRow = (log) => {
  const type = String(
    log?.connection_type ?? log?.connectionType ?? log?.log_type ?? log?.type ?? "",
  ).trim().toLowerCase();
  if (type === "wifi" || type === "wi-fi" || log?.is_wifi === true) return true;

  const primaryInfo = String(log?.primary_cell_info_1 ?? log?.primaryCellInfo1 ?? "");
  return primaryInfo.includes("SSID:") || primaryInfo.includes("BSSID:");
};

const cleanWifiProviderName = (value) => {
  const text = String(value ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (!text) return null;
  if (/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(text)) return null;
  return text;
};

const resolveProviderDisplayName = (log) => {
  if (isWifiLogRow(log)) {
    return (
      cleanWifiProviderName(log?.provider) ||
      cleanWifiProviderName(log?.Provider) ||
      cleanWifiProviderName(log?.m_alpha_short) ||
      cleanWifiProviderName(log?.m_alpha_long) ||
      "Unknown"
    );
  }

  return normalizeProviderName(log.provider || log.Provider || log.carrier) || "Unknown";
};

const getViewportSize = () => ({
  width: typeof window === "undefined" ? 1024 : window.innerWidth,
  height: typeof window === "undefined" ? 768 : window.innerHeight,
});

// `bounds` is the size of the legend's own positioning container, not
// necessarily the browser window (e.g. a single map panel in Multi Map is
// only a fraction of the window, so positioning against window size would
// place the legend outside that panel and clip it via overflow-hidden).
const getInitialLegendPosition = (bounds) => {
  return {
    x: Math.max(
      LEGEND_VIEWPORT_MARGIN,
      bounds.width - DEFAULT_LEGEND_SIZE.width - LEGEND_VIEWPORT_MARGIN,
    ),
    y: Math.min(
      Math.max(LEGEND_VIEWPORT_MARGIN, DEFAULT_LEGEND_TOP),
      Math.max(
        LEGEND_VIEWPORT_MARGIN,
        bounds.height - DEFAULT_LEGEND_SIZE.height - LEGEND_VIEWPORT_MARGIN,
      ),
    ),
  };
};

const clampLegendPosition = (position, size, bounds) => {
  const width = Number(size?.width) || DEFAULT_LEGEND_SIZE.width;
  const height = Number(size?.height) || COLLAPSED_LEGEND_HEIGHT;
  const maxX = Math.max(
    LEGEND_VIEWPORT_MARGIN,
    bounds.width - width - LEGEND_VIEWPORT_MARGIN,
  );
  const maxY = Math.max(
    LEGEND_VIEWPORT_MARGIN,
    bounds.height - height - LEGEND_VIEWPORT_MARGIN,
  );

  return {
    x: Math.min(
      Math.max(Number(position?.x) || LEGEND_VIEWPORT_MARGIN, LEGEND_VIEWPORT_MARGIN),
      maxX,
    ),
    y: Math.min(
      Math.max(Number(position?.y) || LEGEND_VIEWPORT_MARGIN, LEGEND_VIEWPORT_MARGIN),
      maxY,
    ),
  };
};

const matchesMetricRange = (value, min, max, includeMax = false) => {
  if (!Number.isFinite(value)) return false;
  if (min === null && Number.isFinite(max)) return value < max;
  if (Number.isFinite(min) && max === null) return value >= min;
  if (![min, max].every(Number.isFinite)) return false;
  const lowerMatch = value >= min;
  const upperMatch = includeMax ? value <= max : value < max;
  return lowerMatch && upperMatch;
};

const isUnknownLegendKey = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "unknown" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "null" ||
    normalized === "undefined"
  );
};

const getLegendFilterItems = (filter) => {
  if (!filter) return [];
  if (Array.isArray(filter.filters)) return filter.filters.filter(Boolean);
  return [filter];
};

const getLegendFilterSignature = (filter) => {
  if (!filter) return "";

  return [
    filter.type,
    filter.key ?? "",
    filter.metric ?? "",
    filter.id ?? "",
    filter.value ?? "",
    filter.min ?? "",
    filter.max ?? "",
    filter.includeMax ? "1" : "0",
  ].join("|");
};

const canCombineLegendFilters = (a, b) => {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "category") return a.key === b.key;
  if (a.type === "metric") return a.metric === b.metric;
  return true;
};

const hasLegendFilter = (activeFilter, filter) => {
  const signature = getLegendFilterSignature(filter);
  return getLegendFilterItems(activeFilter).some(
    (item) => getLegendFilterSignature(item) === signature,
  );
};

const toggleLegendFilter = (activeFilter, nextFilter, onFilterChange) => {
  const activeItems = getLegendFilterItems(activeFilter);
  const compatibleItems = activeItems.every((item) =>
    canCombineLegendFilters(item, nextFilter),
  )
    ? activeItems
    : [];
  const nextSignature = getLegendFilterSignature(nextFilter);
  const exists = compatibleItems.some(
    (item) => getLegendFilterSignature(item) === nextSignature,
  );
  const nextItems = exists
    ? compatibleItems.filter(
        (item) => getLegendFilterSignature(item) !== nextSignature,
      )
    : [...compatibleItems, nextFilter];

  if (nextItems.length === 0) {
    onFilterChange(null);
  } else if (nextItems.length === 1) {
    onFilterChange(nextItems[0]);
  } else {
    onFilterChange({ type: "multi", filters: nextItems });
  }
};

const getNormalizedKey = (log, colorBy, scheme) => {
  switch (colorBy) {
    case "provider":
      return resolveProviderDisplayName(log);

    case "technology":
      const tech =
        log.network || log.Network || log.technology || log.networkType;
      const band =
        log.band ||
        log.Band ||
        log.neighbourBand ||
        log.neighborBand ||
        log.neighbour_band;
      return normalizeTechName(tech, band);

    case "band": {
      const b = String(
        log.neighbourBand ||
          log.neighborBand ||
          log.neighbour_band ||
          log.band ||
          log.Band ||
          "",
      ).trim();

      const normalizedBand = normalizeBandName(b);

      return normalizedBand === "-1" || normalizedBand === ""
        ? "Unknown"
        : normalizedBand;
    }
    case "pci": {
      const pci = Number.parseInt(log.pci ?? log.PCI ?? log.best_pci, 10);
      return Number.isFinite(pci) ? String(pci) : "Unknown";
    }
    case "nodebid": {
      const raw =
        log.nodebid ??
        log.nodeb_id ??
        log.nodebId ??
        log.NodeBID ??
        log.NodeBId ??
        log.NodebId;
      const nodeb = String(raw ?? "").trim();
      return nodeb || "Unknown";
    }
    case "cell_id": {
      const raw = log.cell_id ?? log.cellId ?? log.CellId ?? log.CELL_ID;
      const cellId = String(raw ?? "").trim();
      return cellId || "Unknown";
    }
    case "earfcn": {
      const raw = log.earfcn ?? log.EARFCN ?? log.Earfcn;
      const earfcn = String(raw ?? "").trim();
      return earfcn || "Unknown";
    }
    default:
      return "Unknown";
  }
};

const ColorSchemeLegend = ({ colorBy, logs, activeFilter, onFilterChange }) => {
  const scheme = COLOR_SCHEMES[colorBy] || {};
  const [openColorKey, setOpenColorKey] = useState(null);
  const [customColorValue, setCustomColorValue] = useState("");
  const [colorOverrides, setColorOverrides] = useState({});

  const { counts, total, usedEntries } = useMemo(() => {
    const tempCounts = {};

    logs?.forEach((log) => {
      const key = getNormalizedKey(log, colorBy, scheme);
      tempCounts[key] = (tempCounts[key] || 0) + 1;
    });

    const used = Object.entries(tempCounts)
      .filter(([key, count]) => count > 0 && !isUnknownLegendKey(key))
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => [
        key,
        colorOverrides[key] ||
        (colorBy === "pci"
          ? getMetricPciColor(key)
          : colorBy === "earfcn"
          ? getEarfcnColor(key)
          : scheme[key] || getLogColor(colorBy, key)),
      ]);

    return { counts: tempCounts, total: logs?.length || 0, usedEntries: used };
  }, [logs, colorBy, scheme, colorOverrides]);

  
  const handleRowClick = (key) => {
    toggleLegendFilter(
      activeFilter,
      { type: "category", value: key, key: colorBy },
      onFilterChange,
    );
  };

  const handleColorChange = (key, color) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    registerColor(colorBy, key, color);
    setColorOverrides((prev) => ({ ...prev, [key]: color }));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("stracer:map-category-color-change", {
          detail: { colorBy, value: key, color },
        }),
      );
    }
  };

  const toggleColorPalette = (event, key, color) => {
    event.stopPropagation();
    setOpenColorKey((current) => (current === key ? null : key));
    setCustomColorValue(color || "");
  };

  if (!usedEntries.length) {
    return (
      <div className="text-xs text-white text-center py-3">
        No data available
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-64 overflow-y-auto space-y-px custom-scrollbar">
        {usedEntries.map(([key, color]) => {
          const isActive = hasLegendFilter(activeFilter, {
            type: "category",
            value: key,
            key: colorBy,
          });
          const isDimmed = getLegendFilterItems(activeFilter).length > 0 && !isActive;
          const isPaletteOpen = openColorKey === key;

          return (
            <div key={key} className="space-y-1">
              <LegendRow
                color={color}
                label={key}
                count={counts[key]}
                total={total}
                onClick={() => handleRowClick(key)}
                isActive={isActive}
                isDimmed={isDimmed}
                onColorClick={(event) => toggleColorPalette(event, key, color)}
              />
              {isPaletteOpen && (
                <div
                  className="rounded-md border border-gray-700 bg-gray-950/95 p-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="grid grid-cols-6 gap-1.5">
                    {MAP_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-label={`Use ${preset}`}
                        className={`h-5 w-5 rounded border ${
                          preset.toLowerCase() === color.toLowerCase()
                            ? "border-white"
                            : "border-gray-700"
                        }`}
                        style={{ backgroundColor: preset }}
                        onClick={() => handleColorChange(key, preset)}
                      />
                    ))}
                  </div>
                  <input
                    type="text"
                    value={customColorValue}
                    placeholder="#facc15"
                    className="mt-2 h-7 w-full rounded border border-gray-700 bg-gray-900 px-2 text-[11px] text-gray-100 outline-none focus:border-blue-400"
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomColorValue(value);
                      handleColorChange(key, value);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <LegendFooter total={total} />
    </div>
  );
};

const TacLegend = ({ logs, activeFilter, onFilterChange }) => {
    const stats = useMemo(() => {
      const counts = {};
      let validCount = 0;

      logs?.forEach((log) => {
        const val = log.tac || log.TAC;
        if (val !== undefined && val !== null && val !== "") {
          counts[val] = (counts[val] || 0) + 1;
          validCount++;
        }
      });

      const sorted = Object.entries(counts)
        .map(([label, count]) => ({
          label,
          count,
          color: generateColorFromHash(String(label)), 
        }))
        .sort((a, b) => b.count - a.count);

      return { sorted, validCount, uniqueCount: sorted.length };
    }, [logs]);

    const handleRowClick = (val) => {
      toggleLegendFilter(activeFilter, { type: "tac", value: val }, onFilterChange);
    };

    if (stats.sorted.length === 0) {
      return (
        <div className="text-xs text-gray-500 text-center py-3">
          No TAC data
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        <div className="max-h-64 overflow-y-auto space-y-px custom-scrollbar">
          {stats.sorted.map(({ label, count, color }) => {
            const isActive = hasLegendFilter(activeFilter, {
              type: "tac",
              value: label,
            });
            const isDimmed = getLegendFilterItems(activeFilter).length > 0 && !isActive;

            return (
              <LegendRow
                key={label}
                color={color}
                label={label}
                count={count}
                total={stats.validCount}
                onClick={() => handleRowClick(label)}
                isActive={isActive}
                isDimmed={isDimmed}
              />
            );
          })}
        </div>
        <LegendFooter
          total={stats.validCount}
          uniqueCount={stats.uniqueCount}
          invalidLabel="No TAC"
        />
      </div>
    );
  };

// ✅ PCI Legend
const PciLegend = ({ logs, activeFilter, onFilterChange }) => {
  const pciStats = useMemo(() => {
    const pciMap = new Map();
    let validCount = 0,
      invalidCount = 0;

    logs?.forEach((log) => {
      const pci = getMetricValueFromLog(log, "pci");
      if (Number.isFinite(pci)) {
        pciMap.set(Math.floor(pci), (pciMap.get(Math.floor(pci)) || 0) + 1);
        validCount++;
      } else {
        invalidCount++;
      }
    });

    return {
      allPcis: [...pciMap.entries()].sort((a, b) => a[0] - b[0]),
      uniqueCount: pciMap.size,
      validCount,
      invalidCount,
    };
  }, [logs]);

  const getPciColor = (pci) =>
    PCI_COLOR_PALETTE[Math.abs(Math.floor(pci)) % PCI_COLOR_PALETTE.length];

  const handleRowClick = (pci) => {
    toggleLegendFilter(activeFilter, { type: "pci", value: pci }, onFilterChange);
  };

  if (!pciStats.allPcis.length) {
    return (
      <div className="text-xs text-gray-500 text-center py-3">
        No PCI data available
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-64 overflow-y-auto space-y-px custom-scrollbar">
        {pciStats.allPcis.map(([pci, count]) => {
          const isActive = hasLegendFilter(activeFilter, {
            type: "pci",
            value: pci,
          });
          const isDimmed = getLegendFilterItems(activeFilter).length > 0 && !isActive;

          return (
            <LegendRow
              key={pci}
              color={getPciColor(pci)}
              label={pci}
              count={count}
              total={pciStats.validCount}
              onClick={() => handleRowClick(pci)}
              isActive={isActive}
              isDimmed={isDimmed}
            />
          );
        })}
      </div>
      <LegendFooter
        total={pciStats.validCount}
        uniqueCount={pciStats.uniqueCount}
        invalidCount={pciStats.invalidCount}
      />
    </div>
  );
};

const MetricThresholdLegend = ({
  thresholds,
  selectedMetric,
  logs,
  activeFilter,
  onFilterChange,
}) => {
  const config = getMetricConfig(selectedMetric);
  const list = thresholds?.[config.thresholdKey] || [];
  const normalizedThresholds = useMemo(
    () =>
      (Array.isArray(list) ? list : [])
        .map((t, idx) => ({
          ...t,
          idx,
          minNum: Number.parseFloat(t?.min),
          maxNum: Number.parseFloat(t?.max),
        }))
        .filter((t) => Number.isFinite(t.minNum) && Number.isFinite(t.maxNum))
        .sort((a, b) => a.minNum - b.minNum)
        .map((t, idx, arr) => ({
          ...t,
          isLast: idx === arr.length - 1,
        })),
    [list],
  );

  const { validCount, invalidCount, belowRangeCount, aboveRangeCount, unmatchedCount, usedThresholds } = useMemo(() => {
    if (!logs?.length || !normalizedThresholds.length) {
      return {
        validCount: 0,
        invalidCount: 0,
        belowRangeCount: 0,
        aboveRangeCount: 0,
        unmatchedCount: 0,
        usedThresholds: [],
      };
    }

    const tempCounts = new Array(normalizedThresholds.length).fill(0);
    let valid = 0,
      invalid = 0,
      belowRange = 0,
      aboveRange = 0,
      unmatched = 0;
    const lowestMin = normalizedThresholds[0]?.minNum;
    const highestMax = normalizedThresholds[normalizedThresholds.length - 1]?.maxNum;

    logs.forEach((log) => {
      const val = getMetricValueFromLog(log, selectedMetric);

      if (!Number.isFinite(val)) {
        invalid++;
        return;
      }

      valid++;
      const idx = normalizedThresholds.findIndex((t) =>
        matchesMetricRange(val, t.minNum, t.maxNum, t.isLast),
      );

      if (idx !== -1) {
        tempCounts[idx]++;
      } else {
        if (Number.isFinite(lowestMin) && val < lowestMin) {
          belowRange++;
        } else if (Number.isFinite(highestMax) && val > highestMax) {
          aboveRange++;
        }
        unmatched++;
      }
    });

    return {
      validCount: valid,
      invalidCount: invalid,
      belowRangeCount: belowRange,
      aboveRangeCount: aboveRange,
      unmatchedCount: unmatched,
      usedThresholds: normalizedThresholds
        .map((t, idx) => ({ ...t, idx, count: tempCounts[idx] }))
        .filter((t) => t.count > 0),
    };
  }, [logs, normalizedThresholds, selectedMetric]);

  const handleRowClick = (threshold) => {
    const id = `metric-${threshold.min}-${threshold.max}`;
    toggleLegendFilter(
      activeFilter,
      {
        type: "metric",
        id,
        min: parseFloat(threshold.min),
        max: parseFloat(threshold.max),
        includeMax: Boolean(threshold.isLast),
        metric: selectedMetric,
      },
      onFilterChange,
    );
  };

  if (!list.length) {
    return (
      <div className="text-xs text-gray-500 text-center py-3">
        No thresholds configured
      </div>
    );
  }

  if (!usedThresholds.length && unmatchedCount === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-3">
        No data available
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-64 overflow-y-auto space-y-px custom-scrollbar">
        {usedThresholds.map((t) => {
          const id = `metric-${t.min}-${t.max}`;
          const isActive = hasLegendFilter(activeFilter, {
            type: "metric",
            id,
            min: parseFloat(t.min),
            max: parseFloat(t.max),
            includeMax: Boolean(t.isLast),
            metric: selectedMetric,
          });
          const isDimmed = getLegendFilterItems(activeFilter).length > 0 && !isActive;

          return (
            <LegendRow
              key={t.idx}
              color={t.color}
              label={t.range || t.label || `${t.min} → ${t.max}`}
              count={t.count}
              total={validCount}
              onClick={() => handleRowClick(t)}
              isActive={isActive}
              isDimmed={isDimmed}
            />
          );
        })}
        {unmatchedCount > 0 ? (
          <>
            {belowRangeCount > 0 && (
              <LegendRow
                key="metric-below-range"
                color="#64748b"
                label={`Less than ${normalizedThresholds[0]?.minNum}`}
                count={belowRangeCount}
                total={validCount}
                onClick={() => {}}
                isActive={false}
                isDimmed={false}
              />
            )}
            {aboveRangeCount > 0 && (
              <LegendRow
                key="metric-above-range"
                color="#111827"
                label={`More than ${normalizedThresholds[normalizedThresholds.length - 1]?.maxNum}`}
                count={aboveRangeCount}
                total={validCount}
                onClick={() => {}}
                isActive={false}
                isDimmed={false}
              />
            )}
            {unmatchedCount - belowRangeCount - aboveRangeCount > 0 && (
              <LegendRow
                key="metric-outside-range"
                color="#808080"
                label="Outside configured ranges"
                count={unmatchedCount - belowRangeCount - aboveRangeCount}
                total={validCount}
                onClick={() => {}}
                isActive={false}
                isDimmed={false}
              />
            )}
          </>
        ) : null}
      </div>
      <LegendFooter
        total={validCount}
        invalidCount={invalidCount}
        invalidLabel="No value"
      />
    </div>
  );
};

// ✅ Reusable Legend Row Component
const LegendRow = ({
  color,
  label,
  count,
  total,
  onClick,
  isActive,
  isDimmed,
  onColorClick,
}) => {
  const safeTotal = Number(total);
  const safeCount = Number(count) || 0;
  const percentage =
    Number.isFinite(safeTotal) && safeTotal > 0
      ? (safeCount / safeTotal) * 100
      : null;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 py-1 px-0.5 rounded transition-all cursor-pointer border border-transparent
        ${isActive ? "bg-white/10 border-white/20" : "hover:bg-white/5"}
        ${isDimmed ? "opacity-30 hover:opacity-50" : "opacity-100"}
      `}
    >
      {onColorClick ? (
        <button
          type="button"
          aria-label={`Change ${label} color`}
          title={`Change ${label} color`}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:bg-white/10"
          onClick={(event) => {
            event.stopPropagation();
            onColorClick(event);
          }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        </button>
      ) : (
        <span
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="text-[11px] text-white flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-white min-w-[84px] text-right">
        {safeCount.toLocaleString()}
        {percentage !== null ? ` (${percentage.toFixed(1)}%)` : ""}
      </span>
    </div>
  );
};

const LegendFooter = ({
  total,
  uniqueCount,
  invalidCount,
  invalidLabel = "No PCI",
}) => (
  <div className="mt-1.5 border-t border-gray-700/50 px-0.5 pt-1.5 space-y-0.5">
    {uniqueCount !== undefined && (
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">Unique</span>
        <span className="text-[10px] tabular-nums text-gray-400">
          {uniqueCount}
        </span>
      </div>
    )}
    <div className="flex justify-between">
      <span className="text-[10px] text-gray-500">Total</span>
      <span className="text-[10px] tabular-nums text-gray-400">
        {total.toLocaleString()}
      </span>
    </div>
    {invalidCount > 0 && (
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">{invalidLabel}</span>
        <span className="text-[10px] tabular-nums text-amber-400/80">
          {invalidCount.toLocaleString()}
        </span>
      </div>
    )}
  </div>
);

// ✅ Main MapLegend Component
export default function MapLegend({
  thresholds,
  selectedMetric,
  colorBy = null,
  logs = [],
  activeFilter = null,
  onFilterChange = () => {},
  className, // Added className prop
}) {
  const { openSettings: openSettingsDialog } = useSettingsDialog();
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const bodyRef = useRef(null);
  const hasManualResizeRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [legendSize, setLegendSize] = useState(DEFAULT_LEGEND_SIZE);
  const [legendPosition, setLegendPosition] = useState(() =>
    getInitialLegendPosition(getViewportSize()),
  );
  const visibleLegendSize = useMemo(
    () => ({
      width: legendSize.width,
      height: collapsed ? COLLAPSED_LEGEND_HEIGHT : legendSize.height,
    }),
    [collapsed, legendSize],
  );

 
  const getContainerBounds = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
      }
    }
    return getViewportSize();
  }, []);

  const clampCurrentPosition = useCallback(
    () =>
      setLegendPosition((position) =>
        clampLegendPosition(position, visibleLegendSize, getContainerBounds()),
      ),
    [visibleLegendSize, getContainerBounds],
  );

  // Snap to the correct corner of the actual container as soon as it's
  // mounted and measurable (the initial state above only has the window
  // size to go on, since the ref isn't attached yet on first render).
  useLayoutEffect(() => {
    setLegendPosition(getInitialLegendPosition(getContainerBounds()));
  }, []);

  useEffect(() => {
    clampCurrentPosition();
  }, [clampCurrentPosition]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", clampCurrentPosition);
    return () => window.removeEventListener("resize", clampCurrentPosition);
  }, [clampCurrentPosition]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => clampCurrentPosition());
    observer.observe(el);
    return () => observer.disconnect();
  }, [clampCurrentPosition]);

  const containerBounds = getContainerBounds();
  const maxLegendWidth = Math.max(
    MIN_LEGEND_WIDTH,
    containerBounds.width - LEGEND_VIEWPORT_MARGIN * 2,
  );
  const maxLegendHeight = Math.max(
    collapsed ? COLLAPSED_LEGEND_HEIGHT : MIN_LEGEND_HEIGHT,
    containerBounds.height - LEGEND_VIEWPORT_MARGIN * 2,
  );

  // Clear filter button if active
  const clearFilter = (e) => {
    e.stopPropagation();
    onFilterChange(null);
  };

  const openSettings = (e) => {
    e.stopPropagation();
    if (openSettingsDialog) {
      openSettingsDialog();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("stracer:utility-action", {
          detail: { action: "settings" },
        }),
      );
    }
  };

  const { content, title } = useMemo(() => {
    if (colorBy) {
      const colorByTitle =
        colorBy === "earfcn"
          ? "EARFCN/BCCH"
          : colorBy === "cell_id"
          ? "Cell ID"
          : colorBy === "nodebid"
          ? "NodeB ID"
          : colorBy.charAt(0).toUpperCase() + colorBy.slice(1);
      return {
        content: (
          <ColorSchemeLegend
            colorBy={colorBy}
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: colorByTitle,
      };
    }

    if (["pci", "best_pci"].includes(String(selectedMetric || "").toLowerCase())) {
      return {
        content: (
          <PciLegend
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: String(selectedMetric || "").toLowerCase() === "best_pci" ? "Best PCI" : "PCI/BSIC",
      };
    }

    if (selectedMetric?.toLowerCase() === "tac") {
      return {
        content: (
          <TacLegend
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: "TAC",
      };
    }

    if (selectedMetric?.toLowerCase() === "cell_id") {
      return {
        content: (
          <ColorSchemeLegend
            colorBy="cell_id"
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: "Cell ID",
      };
    }

    if (selectedMetric?.toLowerCase() === "earfcn") {
      return {
        content: (
          <ColorSchemeLegend
            colorBy="earfcn"
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: "EARFCN/BCCH",
      };
    }

    const config = getMetricConfig(selectedMetric);
    return {
      content: (
        <MetricThresholdLegend
          thresholds={thresholds}
          selectedMetric={selectedMetric}
          logs={logs}
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
        />
      ),
      title: `${config.label}${config.unit ? ` (${config.unit})` : ""}`,
    };
  }, [colorBy, selectedMetric, thresholds, logs, activeFilter, onFilterChange]);

  useLayoutEffect(() => {
    if (collapsed || hasManualResizeRef.current) return;

    const headerHeight = headerRef.current?.offsetHeight || 0;
    const bodyHeight = bodyRef.current?.scrollHeight || 0;
    const nextHeight = Math.max(
      MIN_LEGEND_HEIGHT,
      Math.min(maxLegendHeight, Math.ceil(headerHeight + bodyHeight + 8)),
    );

    setLegendSize((prev) => {
      if (Math.abs((Number(prev.height) || 0) - nextHeight) < 1) return prev;
      return { ...prev, height: nextHeight };
    });
  }, [collapsed, content, maxLegendHeight, title]);

  if (!content) return null;

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
      `}</style>

      <div
        ref={containerRef}
        className={className || "fixed inset-0 z-10 pointer-events-none"}
      >
        <Rnd
          position={legendPosition}
          size={
            collapsed
              ? { width: legendSize.width, height: COLLAPSED_LEGEND_HEIGHT }
              : { width: legendSize.width, height: legendSize.height }
          }
          minWidth={MIN_LEGEND_WIDTH}
          maxWidth={maxLegendWidth}
          minHeight={collapsed ? COLLAPSED_LEGEND_HEIGHT : MIN_LEGEND_HEIGHT}
          maxHeight={maxLegendHeight}
          bounds="parent"
          dragHandleClassName="map-legend-drag-handle"
          enableResizing={
            collapsed
              ? false
              : {
                  top: true,
                  right: true,
                  bottom: true,
                  left: true,
                  topRight: true,
                  bottomRight: true,
                  bottomLeft: true,
                  topLeft: true,
                }
          }
          onDragStop={(event, data) => {
            setLegendPosition(
              clampLegendPosition(
                { x: data.x, y: data.y },
                visibleLegendSize,
                getContainerBounds(),
              ),
            );
          }}
          onResize={(event, direction, ref, delta, position) => {
            hasManualResizeRef.current = true;
            const nextSize = {
              width: ref.offsetWidth,
              height: ref.offsetHeight,
            };
            setLegendSize(nextSize);
            setLegendPosition(
              clampLegendPosition(position, nextSize, getContainerBounds()),
            );
          }}
          onResizeStop={(event, direction, ref, delta, position) => {
            hasManualResizeRef.current = true;
            const nextSize = {
              width: ref.offsetWidth,
              height: ref.offsetHeight,
            };
            setLegendSize(nextSize);
            setLegendPosition(
              clampLegendPosition(position, nextSize, getContainerBounds()),
            );
          }}
          className="pointer-events-auto"
          resizeHandleStyles={{
            top: {
              top: "-3px",
              left: "10px",
              right: "10px",
              height: "8px",
              cursor: "ns-resize",
            },
            right: {
              top: "10px",
              right: "-3px",
              bottom: "10px",
              width: "8px",
              cursor: "ew-resize",
            },
            bottom: {
              left: "10px",
              right: "10px",
              bottom: "-3px",
              height: "8px",
              cursor: "ns-resize",
            },
            left: {
              top: "10px",
              left: "-3px",
              bottom: "10px",
              width: "8px",
              cursor: "ew-resize",
            },
            topLeft: {
              top: "-3px",
              left: "-3px",
              width: "12px",
              height: "12px",
              cursor: "nwse-resize",
            },
            topRight: {
              top: "-3px",
              right: "-3px",
              width: "12px",
              height: "12px",
              cursor: "nesw-resize",
            },
            bottomRight: {
              bottom: "-3px",
              right: "-3px",
              width: "12px",
              height: "12px",
              cursor: "nwse-resize",
            },
            bottomLeft: {
              bottom: "-3px",
              left: "-3px",
              width: "12px",
              height: "12px",
              cursor: "nesw-resize",
            },
          }}
        >
          <div
            className={`flex h-full flex-col overflow-hidden bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl shadow-black/20 transition-all duration-200 ${
              collapsed ? "" : "min-w-[240px]"
            }`}
          >
            <button
              ref={headerRef}
              onClick={() => setCollapsed(!collapsed)}
            className="map-legend-drag-handle w-full px-2 py-2 flex items-center justify-between gap-2 hover:bg-white/5 rounded-lg transition-colors group cursor-move select-none"
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-100">{title}</span>
                {activeFilter && (
                  <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse ml-1" />
                )}
              </div>

              <div className="flex items-center gap-0.5">
                <div
                  onClick={openSettings}
                  className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  title="Settings"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </div>
                {activeFilter && (
                  <div
                    onClick={clearFilter}
                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white mr-1"
                    title="Clear filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </div>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                    collapsed ? "" : "rotate-180"
                  }`}
                />
              </div>
            </button>

            {!collapsed && (
              <div className="flex-1 overflow-hidden px-1.5 pb-1.5">
                <div
                  ref={bodyRef}
                  className="flex h-full flex-col overflow-y-auto border-t border-gray-700/40 pt-0.5 custom-scrollbar"
                >
                  {content}
                </div>
              </div>
            )}
          </div>
        </Rnd>
      </div>
    </>
  );
}
