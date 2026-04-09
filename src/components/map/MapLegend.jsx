// src/components/map/MapLegend.jsx
import React, { useMemo, useState } from "react";
import { ChevronDown, Layers, X } from "lucide-react";
import {
  PCI_COLOR_PALETTE,
  getMetricConfig,
  getMetricValueFromLog,
} from "@/utils/metrics";
import {
  normalizeProviderName,
  normalizeTechName,
  normalizeBandName,
  COLOR_SCHEMES,
  generateColorFromHash
} from "@/utils/colorUtils";

const METRIC_RANGE_EPSILON = 1e-9;

const matchesMetricRange = (value, min, max, includeMax = false) => {
  if (![value, min, max].every(Number.isFinite)) return false;
  const lowerMatch = value >= min - METRIC_RANGE_EPSILON;
  const upperMatch = includeMax
    ? value <= max + METRIC_RANGE_EPSILON
    : value < max - METRIC_RANGE_EPSILON;
  return lowerMatch && upperMatch;
};

// Helper to get normalized key for counting
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
        : scheme[normalizedBand]
          ? normalizedBand
          : "Unknown";
    }
    default:
      return "Unknown";
  }
};

// ✅ Color Scheme Legend
const ColorSchemeLegend = ({ colorBy, logs, activeFilter, onFilterChange }) => {
  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) return null;

  const { counts, total, usedEntries } = useMemo(() => {
    const tempCounts = Object.fromEntries(
      Object.keys(scheme).map((k) => [k, 0]),
    );

    logs?.forEach((log) => {
      const key = getNormalizedKey(log, colorBy, scheme);
      if (key in tempCounts) tempCounts[key]++;
    });

    const used = Object.entries(scheme)
      .filter(([key]) => tempCounts[key] > 0 && key !== "Unknown")
      .sort((a, b) => tempCounts[b[0]] - tempCounts[a[0]]);

    return { counts: tempCounts, total: logs?.length || 0, usedEntries: used };
  }, [logs, colorBy, scheme]);

  
  const handleRowClick = (key) => {
    // Toggle: if already active, clear it.
    if (activeFilter?.type === "category" && activeFilter?.value === key) {
      onFilterChange(null);
    } else {
      onFilterChange({ type: "category", value: key, key: colorBy });
    }
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
      <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
        {usedEntries.map(([key, color]) => {
          const isActive =
            activeFilter?.type === "category" && activeFilter?.value === key;
          const isDimmed = activeFilter && !isActive;

          return (
            <LegendRow
              key={key}
              color={color}
              label={key}
              count={counts[key]}
              total={total}
              onClick={() => handleRowClick(key)}
              isActive={isActive}
              isDimmed={isDimmed}
            />
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
        // Handle both uppercase and lowercase
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
          color: generateColorFromHash(String(label)), // Dynamic color from palette
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
        <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
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
      allPcis: [...pciMap.entries()].sort((a, b) => b[1] - a[1]),
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
      <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
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

// ✅ Metric Threshold Legend
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
      return { validCount: 0, invalidCount: 0, unmatchedCount: 0, usedThresholds: [] };
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
        const mins = normalizedThresholds.map((t) => t.minNum);
        const maxs = normalizedThresholds.map((t) => t.maxNum);

        if (mins.length && maxs.length) {
          const globalMin = Math.min(...mins);
          const globalMax = Math.max(...maxs);

          if (val < globalMin) {
            const i = normalizedThresholds.findIndex((t) => t.minNum === globalMin);
            if (i !== -1) tempCounts[i]++;
          } else if (val >= globalMax) {
            const i = normalizedThresholds.findIndex((t) => t.maxNum === globalMax);
            if (i !== -1) tempCounts[i]++;
          } else {
            unmatched++;
          }
        } else {
          unmatched++;
        }
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

  if (!usedThresholds.length) {
    return (
      <div className="text-xs text-gray-500 text-center py-3">
        No data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
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
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
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

  // Clear filter button if active
  const clearFilter = (e) => {
    e.stopPropagation();
    onFilterChange(null);
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

    if (selectedMetric?.toLowerCase() === "pci") {
      return {
        content: (
          <PciLegend
            logs={logs}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        ),
        title: "PCI",
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

      {/* Used the className prop or default to absolute if not provided */}
      <div className={className || "absolute top-35 right-4 z-10"}>
        <div
          className={`bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl shadow-black/20 transition-all duration-200 ${
            collapsed ? "w-auto" : "min-w-[240px] max-w-[280px]"
          }`}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-lg transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-100">{title}</span>
              {activeFilter && (
                <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse ml-1" />
              )}
            </div>

            <div className="flex items-center gap-1">
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
            <div className="px-2 pb-2">
              <div className="pt-1 border-t border-gray-700/40">{content}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
