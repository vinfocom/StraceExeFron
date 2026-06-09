// src/components/map/MapLegend.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Layers, Settings2, X } from "lucide-react";
import { Rnd } from "react-rnd";
import {
  PCI_COLOR_PALETTE,
  getPciColor as getMetricPciColor,
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
  height: 320,
};

const LEGEND_VIEWPORT_MARGIN = 16;
const DEFAULT_LEGEND_TOP = 140;
const COLLAPSED_LEGEND_HEIGHT = 44;

const getViewportSize = () => ({
  width: typeof window === "undefined" ? 1024 : window.innerWidth,
  height: typeof window === "undefined" ? 768 : window.innerHeight,
});

const getInitialLegendPosition = () => {
  const viewport = getViewportSize();
  return {
    x: Math.max(
      LEGEND_VIEWPORT_MARGIN,
      viewport.width - DEFAULT_LEGEND_SIZE.width - LEGEND_VIEWPORT_MARGIN,
    ),
    y: Math.min(
      Math.max(LEGEND_VIEWPORT_MARGIN, DEFAULT_LEGEND_TOP),
      Math.max(
        LEGEND_VIEWPORT_MARGIN,
        viewport.height - DEFAULT_LEGEND_SIZE.height - LEGEND_VIEWPORT_MARGIN,
      ),
    ),
  };
};

const clampLegendPosition = (position, size) => {
  const viewport = getViewportSize();
  const width = Number(size?.width) || DEFAULT_LEGEND_SIZE.width;
  const height = Number(size?.height) || COLLAPSED_LEGEND_HEIGHT;
  const maxX = Math.max(
    LEGEND_VIEWPORT_MARGIN,
    viewport.width - width - LEGEND_VIEWPORT_MARGIN,
  );
  const maxY = Math.max(
    LEGEND_VIEWPORT_MARGIN,
    viewport.height - height - LEGEND_VIEWPORT_MARGIN,
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

const getNormalizedKey = (log, colorBy, scheme) => {
  switch (colorBy) {
    case "provider":
      return (
        normalizeProviderName(log.provider || log.Provider || log.carrier) ||
        "Unknown"
      );

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
          : scheme[key] || getLogColor(colorBy, key)),
      ]);

    return { counts: tempCounts, total: logs?.length || 0, usedEntries: used };
  }, [logs, colorBy, scheme, colorOverrides]);

  
  const handleRowClick = (key) => {
    if (activeFilter?.type === "category" && activeFilter?.value === key) {
      onFilterChange(null);
    } else {
      onFilterChange({ type: "category", value: key, key: colorBy });
    }
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
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
        {usedEntries.map(([key, color]) => {
          const isActive =
            activeFilter?.type === "category" && activeFilter?.value === key;
          const isDimmed = activeFilter && !isActive;
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
      if (activeFilter?.type === "tac" && activeFilter?.value === val) {
        onFilterChange(null);
      } else {
        onFilterChange({ type: "tac", value: val });
      }
    };

    if (stats.sorted.length === 0) {
      return (
        <div className="text-xs text-gray-500 text-center py-3">
          No TAC data
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
          {stats.sorted.map(({ label, count, color }) => {
            const isActive =
              activeFilter?.type === "tac" && activeFilter?.value === label;
            const isDimmed = activeFilter && !isActive;

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
    if (activeFilter?.type === "pci" && activeFilter?.value === pci) {
      onFilterChange(null);
    } else {
      onFilterChange({ type: "pci", value: pci });
    }
  };

  if (!pciStats.allPcis.length) {
    return (
      <div className="text-xs text-gray-500 text-center py-3">
        No PCI data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
        {pciStats.allPcis.map(([pci, count]) => {
          const isActive =
            activeFilter?.type === "pci" && activeFilter?.value === pci;
          const isDimmed = activeFilter && !isActive;

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

  const { validCount, invalidCount, unmatchedCount, usedThresholds } = useMemo(() => {
    if (!logs?.length || !normalizedThresholds.length) {
      return {
        validCount: 0,
        invalidCount: 0,
        unmatchedCount: 0,
        usedThresholds: [],
      };
    }

    const tempCounts = new Array(normalizedThresholds.length).fill(0);
    let valid = 0,
      invalid = 0,
      unmatched = 0;

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
        unmatched++;
      }
    });

    return {
      validCount: valid,
      invalidCount: invalid,
      unmatchedCount: unmatched,
      usedThresholds: normalizedThresholds
        .map((t, idx) => ({ ...t, idx, count: tempCounts[idx] }))
        .filter((t) => t.count > 0),
    };
  }, [logs, normalizedThresholds, selectedMetric]);

  const handleRowClick = (threshold) => {
    const id = `metric-${threshold.min}-${threshold.max}`;
    if (activeFilter?.id === id) {
      onFilterChange(null);
    } else {
      onFilterChange({
        type: "metric",
        id,
        min: parseFloat(threshold.min),
        max: parseFloat(threshold.max),
        includeMax: Boolean(threshold.isLast),
        metric: selectedMetric,
      });
    }
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
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
        {usedThresholds.map((t) => {
          const id = `metric-${t.min}-${t.max}`;
          const isActive = activeFilter?.id === id;
          const isDimmed = activeFilter && !isActive;

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
          <LegendRow
            key="metric-unmatched"
            color="#808080"
            label="No Range Match"
            count={unmatchedCount}
            total={validCount}
            onClick={() => {}}
            isActive={false}
            isDimmed={false}
          />
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
      className={`flex items-center gap-3 py-1.5 px-1 rounded transition-all cursor-pointer border border-transparent
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
      <span className="text-sm tabular-nums text-white min-w-[96px] text-right">
        {safeCount.toLocaleString()}
        {percentage !== null ? ` (${percentage.toFixed(1)}%)` : ""}
      </span>
    </div>
  );
};

// ✅ Reusable Legend Footer Component
const LegendFooter = ({
  total,
  uniqueCount,
  invalidCount,
  invalidLabel = "No PCI",
}) => (
  <div className="pt-2 mt-2 border-t border-gray-700/50 space-y-1 px-1">
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
  const [collapsed, setCollapsed] = useState(false);
  const [legendSize, setLegendSize] = useState(DEFAULT_LEGEND_SIZE);
  const [legendPosition, setLegendPosition] = useState(getInitialLegendPosition);
  const visibleLegendSize = useMemo(
    () => ({
      width: legendSize.width,
      height: collapsed ? COLLAPSED_LEGEND_HEIGHT : legendSize.height,
    }),
    [collapsed, legendSize],
  );

  const clampCurrentPosition = useCallback(
    () =>
      setLegendPosition((position) =>
        clampLegendPosition(position, visibleLegendSize),
      ),
    [visibleLegendSize],
  );

  useEffect(() => {
    clampCurrentPosition();
  }, [clampCurrentPosition]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", clampCurrentPosition);
    return () => window.removeEventListener("resize", clampCurrentPosition);
  }, [clampCurrentPosition]);

  // Clear filter button if active
  const clearFilter = (e) => {
    e.stopPropagation();
    onFilterChange(null);
  };

  const openSettings = (e) => {
    e.stopPropagation();
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("stracer:utility-action", {
        detail: { action: "settings" },
      }),
    );
  };

  const { content, title } = useMemo(() => {
    if (colorBy) {
      return {
        content: (
          <ColorSchemeLegend
            colorBy={colorBy}
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: colorBy.charAt(0).toUpperCase() + colorBy.slice(1),
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
        title: String(selectedMetric || "").toLowerCase() === "best_pci" ? "Best PCI" : "PCI",
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

  if (!content) return null;

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
      `}</style>

      {/* Full-window layer keeps the draggable legend recoverable inside the viewport. */}
      <div className={className || "fixed inset-0 z-10 pointer-events-none"}>
        <Rnd
          position={legendPosition}
          size={
            collapsed
              ? { width: legendSize.width, height: "auto" }
              : legendSize
          }
          minWidth={240}
          minHeight={160}
          bounds="parent"
          dragHandleClassName="map-legend-drag-handle"
          enableResizing={!collapsed}
          onDragStop={(event, data) => {
            setLegendPosition(
              clampLegendPosition({ x: data.x, y: data.y }, visibleLegendSize),
            );
          }}
          onResize={(event, direction, ref, delta, position) => {
            const nextSize = {
              width: ref.offsetWidth,
              height: ref.offsetHeight,
            };
            setLegendSize(nextSize);
            setLegendPosition(clampLegendPosition(position, nextSize));
          }}
          onResizeStop={(event, direction, ref, delta, position) => {
            const nextSize = {
              width: ref.offsetWidth,
              height: ref.offsetHeight,
            };
            setLegendSize(nextSize);
            setLegendPosition(clampLegendPosition(position, nextSize));
          }}
          className="pointer-events-auto"
          resizeHandleStyles={{
            bottomRight: {
              bottom: "3px",
              right: "3px",
              width: "12px",
              height: "12px",
              cursor: "nwse-resize",
            },
          }}
        >
          <div
            className={`flex h-full min-h-0 flex-col bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl shadow-black/20 transition-all duration-200 ${
              collapsed ? "" : "min-w-[240px]"
            }`}
          >
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="map-legend-drag-handle w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-lg transition-colors group cursor-move select-none"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-100">{title}</span>
                {activeFilter && (
                  <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse ml-1" />
                )}
              </div>

              <div className="flex items-center gap-1">
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
              <div className="min-h-0 flex-1 px-2 pb-2">
                <div className="flex h-full min-h-0 flex-col pt-1 border-t border-gray-700/40">{content}</div>
              </div>
            )}
          </div>
        </Rnd>
      </div>
    </>
  );
}
