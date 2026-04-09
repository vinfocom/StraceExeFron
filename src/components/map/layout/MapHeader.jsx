import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  ChevronDown,
  ChevronUp,
  PenTool,
  XCircle,
  Download,
  SlidersHorizontal,
  Search,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import MapSidebarFloating from "./MapSidebarFloating";
import DrawingControlsPanel from "./DrawingControlsPanel";

export default function MapHeader({
  ui,
  onUIChange,
  hasLogs,
  polygonStats,
  onDownloadStatsCsv,
  onDownloadRawCsv,
  onApplyFilters,
  onClearFilters,
  initialFilters,
  isSearchOpen,
  onSearchToggle,
  thresholds = {},
  logs = [],
  onFetchLogs,
  availableFilterOptions = { providers: [], technologies: [], bands: [] },
  rawLogsCount = 0,
  isLoading = false,
}) {
  const { user, logout } = useAuth();
  const [dropOpen, setDropOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const safeUi = {
    drawEnabled: false,
    shapeMode: "polygon",
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    ...ui,
  };

  useEffect(() => {
    const onOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const clearDrawings = () => {
    onUIChange?.({ drawClearSignal: (safeUi.drawClearSignal || 0) + 1 });
  };

  return (
    <header className="h-16 bg-slate-900 text-white shadow-lg flex items-center justify-between px-4 sm:px-6 relative z-50">
      <div className="flex items-center gap-4">
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          onClick={() => setFiltersOpen(true)}
          title="Open filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {rawLogsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-500 rounded-full font-medium">
              {rawLogsCount > 1000 ? `${(rawLogsCount / 1000).toFixed(1)}k` : rawLogsCount}
            </span>
          )}
        </Button>
      </div>

     

      <div className="relative">
        <DrawingControlsPanel
          ui={ui}
          onUIChange={onUIChange}
          hasLogs={hasLogs}
          polygonStats={polygonStats}
          onDownloadStatsCsv={onDownloadStatsCsv}
          onDownloadRawCsv={onDownloadRawCsv}
          onFetchLogs={onFetchLogs} // Pass the fetch handler
          position="relative" // Custom prop to handle positioning inside header if needed
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={isSearchOpen ? "default" : "secondary"}
          onClick={onSearchToggle}
          className={
            isSearchOpen
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-slate-700 hover:bg-slate-600"
          }
          title={isSearchOpen ? "Close search" : "Open search"}
        >
          {isSearchOpen ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="text-sm font-medium text-white">
            {user?.name || "User"}
          </span>
        </div>

        <Button
          onClick={logout}
          variant="default"
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <LogOut className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>

      {/* ⭐ THIS COMPONENT NEEDS THE THREE PROPS DEFINED ABOVE ⭐ */}
      <MapSidebarFloating
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        hideTrigger={true}
        onApplyFilters={onApplyFilters}
        onClearFilters={onClearFilters}
        onUIChange={onUIChange}
        ui={ui}
        initialFilters={initialFilters}
        position="left"
        autoCloseOnApply={true}
        thresholds={thresholds}
        logs={logs}
        availableFilterOptions={availableFilterOptions}
        rawLogsCount={rawLogsCount}
        isLoading={isLoading}
      />
    </header>
  );
}