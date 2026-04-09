import React, { useEffect, useMemo, useState } from "react";
import { Filter, X, SlidersHorizontal, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_SCHEMES } from "@/utils/colorUtils";
import { TimePicker } from "@/components/ui/TimePicker";

const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
};

const defaultFilters = {
  startDate: getYesterday(),
  endDate: new Date(),
  startTime: "00:00:00",
  endTime: "23:59:59",
  provider: "ALL",
  technology: "ALL",
  band: "ALL",
  measureIn: "rsrp",
  coverageHoleOnly: false,
  colorBy: null,
};

const isObjectNonEmpty = (obj) =>
  obj && typeof obj === "object" && Object.keys(obj).length > 0;

const PanelSection = ({ title, children, badge }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium text-slate-100">{title}</div>
      {badge && (
        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </div>
    <div className="rounded-lg border border-slate-700 p-3 bg-slate-900">
      {children}
    </div>
  </div>
);

const ColorLegend = ({ colorBy }) => {
  if (!colorBy) return null;
  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) return null;

  return (
    <div className="mt-2 p-2 bg-slate-800 rounded-md border border-slate-700">
      <div className="text-xs font-medium mb-2 text-slate-300">
        Color Legend ({colorBy})
      </div>
      <div className="space-y-1">
        {Object.entries(scheme).map(([key, color]) => (
          <div key={key} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border border-slate-600"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-slate-300">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function MapSidebarFloating({
  onApplyFilters,
  onClearFilters,
  onUIChange,
  ui,
  initialFilters,
  position = "left",
  autoCloseOnApply = true,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  thresholds = {},
  logs = [],
  availableFilterOptions = { providers: [], technologies: [], bands: [] },
  rawLogsCount = 0,
  isLoading = false,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [filters, setFilters] = useState(defaultFilters);
  const hasActiveFilters = isObjectNonEmpty(initialFilters);

  const { providers, technologies, bands } = availableFilterOptions;

  // Only sync initial filters when they change, not when component mounts
  useEffect(() => {
    if (initialFilters && isObjectNonEmpty(initialFilters)) {
      setFilters((prev) => ({ ...prev, ...initialFilters }));
    }
  }, [initialFilters]);

  const handleFilterChange = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const handleNeighChange = (event) => {
    const checked = event.target.checked;
    onUIChange?.({ showNeighbours: checked });
  };

  const handleColorByChange = (type) => {
    setFilters((prev) => ({
      ...prev,
      colorBy: prev.colorBy === type ? null : type,
    }));
  };

  const sideClasses = useMemo(() => {
    const base =
      "fixed top-16 h-[calc(100vh-4rem)] z-50 w-[90vw] sm:w-[320px] bg-slate-950 text-white shadow-2xl transition-transform duration-200 ease-out flex flex-col";
    if (position === "right") {
      return isOpen
        ? `${base} right-0 translate-x-0`
        : `${base} right-0 translate-x-full`;
    }
    return isOpen
      ? `${base} left-0 translate-x-0`
      : `${base} left-0 -translate-x-full`;
  }, [isOpen, position]);

  const fabPosition = useMemo(() => {
    const base = "fixed z-40";
    return position === "right"
      ? `${base} top-4 right-4`
      : `${base} top-4 left-4`;
  }, [position]);

  const applyAndClose = () => {
    onApplyFilters?.(filters);
    if (autoCloseOnApply) setOpen(false);
  };

  const clearAndClose = () => {
    setFilters(defaultFilters);
    onClearFilters?.();
    setOpen(false);
  };

  const hasLoadedLogs = rawLogsCount > 0;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className={`${fabPosition} inline-flex items-center gap-2 rounded-full px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 focus:outline-none shadow-lg`}
          onClick={() => setOpen(true)}
          aria-label="Open filters"
        >
          <Filter size={16} />
          Filters
          {hasActiveFilters && (
            <span
              className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400"
              title="Filters active"
            />
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-40  " onClick={() => setOpen(false)} />
      )}

      <div className={sideClasses}>
        {/* Header - Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            <h3 className="text-base font-semibold">Map Filters</h3>
          </div>
          <button
            className="p-1 rounded hover:bg-slate-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Logs Count Badge - Fixed */}
        {hasLoadedLogs && (
          <div className="flex-shrink-0 px-3 py-2 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-green-400" />
              <span className="text-slate-300">
                <span className="text-green-400 font-medium">
                  {rawLogsCount.toLocaleString()}
                </span>{" "}
                logs loaded
              </span>
            </div>
            {logs.length !== rawLogsCount && logs.length > 0 && (
              <div className="text-xs text-slate-400 mt-1">
                Showing {logs.length.toLocaleString()} after filters
              </div>
            )}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4">
          {/* Date Filter */}
          <PanelSection title="Date Filter">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-slate-300 mb-1 block">
                  Start Date
                </Label>
                <DatePicker
                  date={filters.startDate}
                  setDate={(d) => handleFilterChange("startDate", d)}
                  className="w-full"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-300 mb-1 block">
                  Start Time
                </Label>
                <TimePicker
                  time={filters.startTime}
                  setTime={(t) => handleFilterChange("startTime", t)}
                  showSeconds={true}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-300 mb-1 block">
                  End Date
                </Label>
                <DatePicker
                  date={filters.endDate}
                  setDate={(d) => handleFilterChange("endDate", d)}
                  className="w-full"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-300 mb-1 block">
                  End Time
                </Label>
                <TimePicker
                  time={filters.endTime}
                  setTime={(t) => handleFilterChange("endTime", t)}
                  showSeconds={true}
                />
              </div>
            </div>
          </PanelSection>

          {/* Filter Options */}
          <PanelSection
            title="Filter by"
            badge={hasLoadedLogs ? "From Data" : undefined}
          >
            <div className="space-y-3">
              {/* Provider */}
              <div>
                <Label className="text-xs text-slate-300 mb-1 flex items-center gap-2">
                  Provider
                  {providers.length > 0 && (
                    <span className="text-xs text-slate-500">
                      ({providers.length} available)
                    </span>
                  )}
                </Label>
                <Select
                  value={filters.provider}
                  onValueChange={(v) => handleFilterChange("provider", v)}
                  disabled={!hasLoadedLogs && providers.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        hasLoadedLogs
                          ? "Select Provider..."
                          : "Load data first..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">ALL Providers</SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Technology */}
              <div>
                <Label className="text-xs text-slate-300 mb-1 flex items-center gap-2">
                  Technology
                  {technologies.length > 0 && (
                    <span className="text-xs text-slate-500">
                      ({technologies.length} available)
                    </span>
                  )}
                </Label>
                <Select
                  value={filters.technology}
                  onValueChange={(v) => handleFilterChange("technology", v)}
                  disabled={!hasLoadedLogs && technologies.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        hasLoadedLogs
                          ? "Select Technology..."
                          : "Load data first..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">ALL Technologies</SelectItem>
                    {technologies.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Band */}
              <div>
                <Label className="text-xs text-slate-300 mb-1 flex items-center gap-2">
                  Band / Frequency
                  {bands.length > 0 && (
                    <span className="text-xs text-slate-500">
                      ({bands.length} available)
                    </span>
                  )}
                </Label>
                <Select
                  value={filters.band}
                  onValueChange={(v) => handleFilterChange("band", v)}
                  disabled={!hasLoadedLogs && bands.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        hasLoadedLogs ? "Select Band..." : "Load data first..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">ALL Bands</SelectItem>
                    {bands.map((b) => (
                      <SelectItem key={b.id} value={b.name}>
                        Band {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Metric */}
              <div>
                <Label className="text-xs text-slate-300 mb-1 block">
                  Visualize Metric
                </Label>
                <Select
                  value={filters.measureIn}
                  onValueChange={(v) => handleFilterChange("measureIn", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select metric..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rsrp">RSRP (dBm)</SelectItem>
                    <SelectItem value="rsrq">RSRQ (dB)</SelectItem>
                    <SelectItem value="sinr">SINR (dB)</SelectItem>
                    <SelectItem value="ul_tpt">UL Throughput (Mbps)</SelectItem>
                    <SelectItem value="dl_tpt">DL Throughput (Mbps)</SelectItem>
                    <SelectItem value="mos">MOS</SelectItem>
                    <SelectItem value="pci">PCI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PanelSection>

          {/* Layers */}
          <PanelSection title="Layers & Display">
            <div className="space-y-2.5 text-sm">
              <label className="flex items-start gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={filters.coverageHoleOnly || false}
                  onChange={(e) =>
                    handleFilterChange("coverageHoleOnly", e.target.checked)
                  }
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-100">
                    Coverage Holes
                  </div>
                  <div className="text-xs text-slate-400">
                    RSRP &lt; {thresholds?.coveragehole || -110} dBm
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={filters.colorBy === "provider"}
                  onChange={() => handleColorByChange("provider")}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-sm font-medium text-slate-100">
                  Color by Provider
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={filters.colorBy === "technology"}
                  onChange={() => handleColorByChange("technology")}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-sm font-medium text-slate-100">
                  Color by Technology
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={filters.colorBy === "band"}
                  onChange={() => handleColorByChange("band")}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-sm font-medium text-slate-100">
                  Color by Band
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={ui?.clusterSessions || false}
                  onChange={(e) =>
                    onUIChange?.({ clusterSessions: e.target.checked })
                  }
                  disabled={!ui?.showSessions || hasActiveFilters}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <div className="text-sm text-slate-100">Cluster Sessions</div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={ui?.showNeighbours || false}
                  onChange={handleNeighChange}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-sm text-slate-100">Show Neighbours</div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={ui?.showHeatmap || false}
                  onChange={(e) =>
                    onUIChange?.({ showHeatmap: e.target.checked })
                  }
                  disabled={!hasActiveFilters}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <div className="text-sm text-slate-100">Heatmap</div>
              </label>
            </div>
          </PanelSection>

          {/* Color Legend */}
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 p-3 border-t border-slate-700 bg-slate-900">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
              onClick={clearAndClose}
              disabled={isLoading}
            >
              Clear All
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={applyAndClose}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Filter className="h-4 w-4 mr-2" />
                  Apply
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
