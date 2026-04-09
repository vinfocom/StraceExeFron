// src/components/multiMap/Header.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { LogOut, Plus, BarChart3 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { mapViewApi } from "@/api/apiEndpoints";
import MultiAnalytics from "./MultiAnalytics";
import DrawingControlsPanel from "@/components/map/layout/DrawingControlsPanel";
import {
  findProjectInProjectsCache,
  upsertProjectInProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

export default function Header({
  projectId,
  project,
  sessionIds,
  addMap,
  locations,
  rawLocations,
  neighborData,
  rawNeighborData,
  thresholds,
  metchOnly = false,
  onMetchOnlyChange,
  displayMode = "logs",
  onDisplayModeChange,
  ui,
  onUIChange,
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const effectiveProjectId =
    projectId || searchParams.get("project_id") || searchParams.get("project");

  const [fetchedProject, setFetchedProject] = useState(null);

  const displayProject = project || fetchedProject;

  useEffect(() => {
    const fetchProject = async () => {
      if (project) return;

      if (!effectiveProjectId) return;
      const cachedProject = findProjectInProjectsCache(effectiveProjectId);
      if (cachedProject) {
        setFetchedProject(cachedProject);
        upsertProjectInProjectsCache(cachedProject);
      }
      try {
        const response = await mapViewApi.getProjects();
        const allProjects = response?.Data || [];

        if (Array.isArray(allProjects)) {
          writeProjectsListCache(allProjects);
          const matchedProject = allProjects.find(
            (p) => p.id === Number(effectiveProjectId),
          );
          if (matchedProject) {
            setFetchedProject(matchedProject);
            upsertProjectInProjectsCache(matchedProject);
          }
        }
      } catch (error) {
        console.error("Failed to fetch project info", error);
      }
    };

    fetchProject();
  }, [effectiveProjectId, project]);

  const handleUnifiedNavigation = () => {
    const locationsToPass =
      Array.isArray(rawLocations) && rawLocations.length > 0
        ? rawLocations
        : locations;
    const neighborsToPass =
      Array.isArray(rawNeighborData) && rawNeighborData.length > 0
        ? rawNeighborData
        : neighborData;

    navigate(`/unified-map?${searchParams.toString()}`, {
      state: {
        locations: locationsToPass,
        neighborData: neighborsToPass,
        thresholds,
        project: displayProject,
        sessionIds,
      },
    });
  };

  return (
    <header className="h-14 bg-slate-800 border-b flex items-center justify-between px-4 shadow-sm z-10 flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-lg text-white">
          {displayProject
            ? `${displayProject.project_name || displayProject.name}`
            : ""}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <DrawingControlsPanel position="relative" onUIChange={onUIChange} ui={ui} />
        <div className="flex items-center gap-2 rounded bg-slate-700 px-2 py-1">
          <button
            type="button"
            onClick={() => onDisplayModeChange?.("logs")}
            className={`rounded px-2 py-1 text-xs font-semibold ${
              displayMode === "logs"
                ? "bg-blue-600 text-white"
                : "bg-transparent text-slate-200 hover:bg-slate-600"
            }`}
          >
            Logs
          </button>
          <button
            type="button"
            onClick={() => onDisplayModeChange?.("site")}
            className={`rounded px-2 py-1 text-xs font-semibold ${
              displayMode === "site"
                ? "bg-blue-600 text-white"
                : "bg-transparent text-slate-200 hover:bg-slate-600"
            }`}
          >
            Site
          </button>
        </div>

        {/* Navigation Buttons */}
        <Button
          size="sm"
          className="bg-blue-600 text-white"
          onClick={() => navigate("/dashboard")}
        >
          Dashboard
        </Button>

        {/* Unified Map Button */}
        <Button
          size="sm"
          className="bg-blue-600 text-white"
          onClick={handleUnifiedNavigation}
        >
          Unified Map
        </Button>

        <div className="h-6 w-px bg-gray-500 mx-1" />

        {/* Analytics Dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" className="text-white bg-blue-600 hover:bg-blue-700 text-sm flex items-center gap-2"> 
              <BarChart3 size={16} /> Analytics
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl bg-slate-50"> 
            <MultiAnalytics 
              locations={locations} 
              sessionIds={sessionIds} 
              projectId={effectiveProjectId} 
            />
          </DialogContent>
        </Dialog>

        <button
          onClick={addMap}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm font-medium"
        >
          <Plus size={16} /> Add View
        </button>

        

        <label className="flex items-center gap-2 text-xs text-white ml-2">
          <input
            type="checkbox"
            checked={metchOnly}
            onChange={(e) => onMetchOnlyChange?.(e.target.checked)}
          />
          Matched
        </label>

        <Button
          onClick={logout}
          variant="destructive"
          size="sm"
          className="ml-2 bg-red-600 hover:bg-red-700"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </header>
  );
}
