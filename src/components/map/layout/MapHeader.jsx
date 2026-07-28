import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  XCircle,
  SlidersHorizontal,
  Search,
} from "lucide-react";
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
  neighbourLogsCount = 0,
  isLoading = false,
}) {
  const { user, logout } = useAuth();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <header className="relative z-50 flex flex-wrap items-center gap-3 bg-slate-900 px-3 py-3 text-white shadow-lg sm:px-4 lg:px-6">
      <div className="order-1 flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
        <Button
          size="sm"
          className="flex h-9 items-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => setFiltersOpen(true)}
          title="Open filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="inline">Filters</span>
          {rawLogsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-500 rounded-full font-medium">
              {rawLogsCount > 1000 ? `${(rawLogsCount / 1000).toFixed(1)}k` : rawLogsCount}
            </span>
          )}
        </Button>
      </div>

      <div className="order-3 w-full min-w-0 lg:order-2 lg:flex-1">
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

      <div className="order-2 ml-auto flex items-center gap-2 sm:gap-3 lg:order-3 lg:ml-0">
        <Button
          size="sm"
          variant={isSearchOpen ? "default" : "secondary"}
          onClick={onSearchToggle}
          className={
            isSearchOpen
              ? "h-9 bg-blue-600 hover:bg-blue-700"
              : "h-9 bg-slate-700 hover:bg-slate-600"
          }
          title={isSearchOpen ? "Close search" : "Open search"}
        >
          {isSearchOpen ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>

        <div className="hidden min-w-0 items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 xl:flex">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="max-w-[180px] truncate text-sm font-medium text-white">
            {user?.name || "User"}
          </span>
        </div>

        <Button
          onClick={logout}
          variant="default"
          size="sm"
          className="h-9 bg-red-600 text-white hover:bg-red-700"
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
        secondaryLogsCount={neighbourLogsCount}
        isLoading={isLoading}
      />
    </header>
  );
}
