// src/components/prediction/PredictionHeader.jsx
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, SlidersHorizontal, ChartBar } from "lucide-react";
import MapSideFilter from "./PredictionSide";

export default function PredictionHeader({
  projectId,
  setProjectId,
  metric,
  setMetric,
  reloadData,
  showPolys,
  setShowPolys,
  onlyInside,
  setOnlyInside,
  loading,
  ui,
  onUIChange,
  isSearchOpen,
  onSearchToggle,
  // New props for details panel
  showDetailsPanel,
  onToggleDetailsPanel,
}) {
  const { user, logout } = useAuth();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <header className="h-16 bg-slate-900 text-white shadow flex items-center justify-between px-4 sm:px-6">
      {/* Left: Logo + Title */}
      <div className="flex items-center space-x-3">
        <span className="font-semibold text-lg tracking-wide">Prediction Viewer</span>
      </div>

      {/* Center: Placeholder */}
      <div></div>

      {/* Right: Header controls + User */}
      <div className="flex items-center space-x-4">
        {/* Toggle Details Panel Button */}
        <Button
          size="sm"
          className={`${
            showDetailsPanel 
              ? "bg-green-600 hover:bg-green-700" 
              : "bg-gray-600 hover:bg-gray-500"
          } text-white`}
          onClick={onToggleDetailsPanel}
          title={showDetailsPanel ? "Hide analytics panel" : "Show analytics panel"}
        >
          <ChartBar className="h-4 w-4 mr-2" />
          {showDetailsPanel ? "Hide Analytics" : "Show Analytics"}
        </Button>

        {/* Open Filters Button */}
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setFiltersOpen(true)}
          title="Open filters & view options"
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filters
        </Button>

        {/* MapSideFilter */}
        <MapSideFilter
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          projectId={projectId}
          setProjectId={setProjectId}
          metric={metric}
          setMetric={setMetric}
          reloadData={reloadData}
          showPolys={showPolys}
          setShowPolys={setShowPolys}
          onlyInside={onlyInside}
          setOnlyInside={setOnlyInside}
          loading={loading}
          onUIChange={onUIChange}
          ui={ui}
          position="right"
          autoCloseOnApply={true}
        />

        <p className="text-gray-300 text-sm hidden md:block">
          Welcome,&nbsp;<span className="font-semibold text-white">{user?.name || "User"}</span>
        </p>
        
        <Button 
          onClick={logout} 
          variant="default" 
          size="sm" 
          className="bg-gray-700 hover:bg-gray-600 text-white"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </header>
  );
}