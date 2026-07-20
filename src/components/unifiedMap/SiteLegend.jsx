// src/components/unifiedMap/SiteLegend.jsx

import React, { useState, useMemo } from "react";
import { ChevronDown, TowerControl, Loader2, Layers } from "lucide-react";
import { 
  getProviderColor, 
  normalizeProviderName,
  getBandColor,
  normalizeBandName,
  getTechnologyColor,
  normalizeTechName
} from "@/utils/colorUtils";
import { getPciColor } from "@/utils/metrics";

const normalizeDeltaVariant = (value) => {
  const variant = String(value ?? "").trim().toLowerCase();
  if (variant === "optimised") return "optimized";
  return variant;
};

const getColorOverrideKey = (mode, value) =>
  `${String(mode || "").trim().toLowerCase()}:${String(value ?? "").trim().toLowerCase()}`;

const SITE_COLOR_PRESETS = [
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

const readSiteId = (row = {}) =>
  String(
    row.site_id ??
      row.siteId ??
      row.site ??
      row.site_key_inferred ??
      row.siteKeyInferred ??
      row.nodeb_id ??
      row.node_b_id ??
      row.nodebId ??
      "",
  ).trim();

const readValue = (row = {}, ...keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
};

const readLegendIdentityKey = (row = {}) => {
  const backendKey = readValue(
    row,
    "sitePredictionKey",
    "site_cell_sector_band_operator_key",
    "siteCellSectorBandOperatorKey",
  );
  if (backendKey) return backendKey;

  const site = readSiteId(row);
  const cellId = readValue(row, "cell_id", "cellId");
  const sector = readValue(row, "sector", "sector_id", "sectorId");
  const band = readValue(row, "band", "frequency_band", "Band");
  const operator = readValue(row, "provider", "operatorName", "operator_name", "network", "Network", "operator");

  if (!site || !cellId) return "";
  return [site, cellId, sector, band, operator].join("|");
};

const formatBandLegendLabel = (band) => {
  const normalized = normalizeBandName(band);
  if (normalized === "Unknown") return normalized;

  const match = String(normalized).match(/^B(\d+)$/i);
  return match ? match[1] : normalized;
};

export default function SiteLegend({
  enabled,
  sites = [],
  isLoading = false,
  colorMode = "Operator",
  sitePredictionVersion = "original",
  activeFilter = null,
  onFilterChange = null,
  colorOverrides = {},
  onColorChange = null,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [openColorKey, setOpenColorKey] = useState(null);
  const [customColorValue, setCustomColorValue] = useState("");

  const legendRows = useMemo(() => {
    if (!Array.isArray(sites) || sites.length === 0) return [];

    const seen = new Set();
    const result = [];

    sites.forEach((row) => {
      const identityKey = readLegendIdentityKey(row);
      if (!identityKey) return;

      const variant = normalizeDeltaVariant(
        row?.deltaVariant ?? row?.delta_variant ?? "",
      );
      const uniqueKey = variant ? `${identityKey}|${variant}` : identityKey;

      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);
      result.push(row);
    });

    return result;
  }, [sites]);

  const legendItems = useMemo(() => {
    if (!legendRows.length) return [];

    const isDeltaMode =
      String(sitePredictionVersion || "").trim().toLowerCase() === "delta" ||
      legendRows.some((site) => {
        const variant = normalizeDeltaVariant(site?.deltaVariant ?? site?.delta_variant ?? "");
        return variant === "baseline" || variant === "optimized" || variant === "optimised";
      });

    if (isDeltaMode) {
      let baselineCount = 0;
      let optimizedCount = 0;
      legendRows.forEach((site) => {
        const variant = normalizeDeltaVariant(site?.deltaVariant ?? site?.delta_variant ?? "");
        if (variant === "baseline") baselineCount += 1;
        if (variant === "optimized") optimizedCount += 1;
      });

      const items = [];
      if (baselineCount > 0) {
        items.push({ label: "Baseline", value: "baseline", mode: "delta", color: "#dc2626", count: baselineCount });
      }
      if (optimizedCount > 0) {
        items.push({ label: "Optimized", value: "optimized", mode: "delta", color: "#16a34a", count: optimizedCount });
      }
      return items.map((item) => ({
        ...item,
        color: colorOverrides[getColorOverrideKey(item.mode, item.value)] || item.color,
      }));
    }

    const itemMap = new Map();
    const mode = colorMode.toLowerCase();

    legendRows.forEach(site => {
      let rawName = "Unknown";
      let normalized = "Unknown";
      let color = "#9ca3af";

      if (mode === "pci") {
        rawName = site.pci || site.PCI || site.pci_or_psi || site.physical_cell_id || "Unknown";
        normalized = String(rawName ?? "").trim() || "Unknown";
        color = getPciColor(normalized);
      } else if (mode === "band") {
        rawName = site.band || site.frequency_band || site.Band || "Unknown";
        normalized = normalizeBandName(rawName);
        color = getBandColor(normalized);
      } else if (mode === "technology") {
        rawName = site.tech || site.technology || site.Technology || "Unknown";
        normalized = normalizeTechName(rawName);
        color = getTechnologyColor(normalized);
      } else {
        // Default to Operator
        rawName = site.network || site.Network || site.operator || "Unknown";
        normalized = normalizeProviderName(rawName) || "Unknown";
        color = getProviderColor(normalized);
      }
      
      if (!itemMap.has(normalized)) {
        const itemMode = mode === "operator" ? "operator" : mode;
        itemMap.set(normalized, {
          label: mode === "band" ? formatBandLegendLabel(rawName) : normalized,
          value: normalized,
          mode: itemMode,
          color: colorOverrides[getColorOverrideKey(itemMode, normalized)] || color,
          count: 1
        });
      } else {
        itemMap.get(normalized).count++;
      }
    });

    // Sort: Bands numerically if possible, otherwise alphabetical
    return Array.from(itemMap.values()).sort((a, b) => {
       if (mode === "pci") {
         const numA = parseInt(a.label, 10);
         const numB = parseInt(b.label, 10);
         if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
       }
       if (mode === "band") {
         const numA = parseInt(a.label.replace(/\D/g, ''));
         const numB = parseInt(b.label.replace(/\D/g, ''));
         if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
       }
       return a.label.localeCompare(b.label);
    });
  }, [legendRows, colorMode, sitePredictionVersion, colorOverrides]);

  const handleItemClick = (item) => {
    if (typeof onFilterChange !== "function") return;
    const nextFilter = {
      mode: item.mode,
      value: item.value ?? item.label,
      label: item.label,
    };
    const isActive =
      String(activeFilter?.mode || "").toLowerCase() === String(nextFilter.mode || "").toLowerCase() &&
      String(activeFilter?.value || "").toLowerCase() === String(nextFilter.value || "").toLowerCase();
    onFilterChange(isActive ? null : nextFilter);
  };

  const handleColorInputChange = (item, color) => {
    if (typeof onColorChange !== "function") return;
    onColorChange(item, color);
  };

  const toggleColorPalette = (event, item) => {
    event.stopPropagation();
    const key = getColorOverrideKey(item.mode, item.value ?? item.label);
    setOpenColorKey((current) => (current === key ? null : key));
    setCustomColorValue(item.color || "");
  };

  if (!enabled) return null;

  return (
    <div className="absolute bottom-38 right-4 z-[20]">
      <div className="bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl min-w-[180px]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-t-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <TowerControl className="w-4 h-4 text-blue-400" />
            <div className="flex flex-col items-start">
               <span className="text-xs font-bold text-gray-100">
                Cell Sectors
              </span>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                 by {String(sitePredictionVersion || "").trim().toLowerCase() === "delta" ? "Delta" : colorMode}
              </span>
            </div>
           
          </div>
          
          {!isLoading && <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${collapsed ? "" : "rotate-180"}`} />}
          {isLoading && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
            {legendItems.length > 0 ? (
              legendItems.map((item) => {
                const colorKey = getColorOverrideKey(item.mode, item.value ?? item.label);
                const isPaletteOpen = openColorKey === colorKey;

                return (
                  <div key={item.label} className="space-y-1">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleItemClick(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleItemClick(item);
                        }
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 rounded px-1.5 py-1 text-left transition-colors ${
                        String(activeFilter?.mode || "").toLowerCase() === String(item.mode || "").toLowerCase() &&
                        String(activeFilter?.value || "").toLowerCase() === String(item.value ?? item.label).toLowerCase()
                          ? "bg-blue-500/20 ring-1 ring-blue-400/40"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          aria-label={`Change ${item.label} color`}
                          title={`Change ${item.label} color`}
                          className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/10"
                          onClick={(event) => toggleColorPalette(event, item)}
                        >
                          <div
                            className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent"
                            style={{ borderBottomColor: item.color }}
                          />
                        </button>
                        <span className="text-xs text-gray-300 font-medium">{item.label}</span>
                      </div>
                      <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-full">
                        {item.count}
                      </span>
                    </div>

                    {isPaletteOpen && (
                      <div
                        className="rounded-md border border-gray-700 bg-gray-950/95 p-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="grid grid-cols-6 gap-1.5">
                          {SITE_COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              aria-label={`Use ${color}`}
                              className={`h-5 w-5 rounded border ${
                                color.toLowerCase() === item.color.toLowerCase()
                                  ? "border-white"
                                  : "border-gray-700"
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => handleColorInputChange(item, color)}
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
                            if (/^#[0-9a-f]{6}$/i.test(value)) {
                              handleColorInputChange(item, value);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-2 text-[10px] text-gray-500 italic text-center">
                {isLoading ? "Fetching site data..." : "No sites in view"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
