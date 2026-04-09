// src/components/MapView/MapViewSide.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Filter, X, SlidersHorizontal, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

const PanelSection = ({ title, children, className }) => (
  <div className={`space-y-2 ${className}`}>
    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
      {title}
    </div>
    <div className="rounded-lg border p-3 bg-white dark:bg-slate-900">
      {children}
    </div>
  </div>
);

export default function MapViewSide({
  loading,
  ui,
  onUIChange,
  position = "left",
  autoCloseOnApply = true,
  open: controlledOpen,
  onOpenChange,
  metric,
  setMetric,

  projectId,
  setProjectId,
  sessionId, // CSV for Session view
  reloadData,
  showPolys,
  setShowPolys,
  onlyInside,
  setOnlyInside,
}) {
  const navigate = useNavigate();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const sideClasses = useMemo(() => {
    const base =
      "fixed top-0 h-full z-50 w-[90vw] sm:w-[360px] text-white bg-slate-950 dark:text-white shadow-2xl transition-transform duration-200 ease-out";
    if (position === "right") {
      return isOpen
        ? `${base} right-0 translate-x-0`
        : `${base} right-0 translate-x-full`;
    }
    return isOpen
      ? `${base} left-0 translate-x-0`
      : `${base} left-0 -translate-x-full`;
  }, [isOpen, position]);

  const applyAndClose = () => {
    reloadData?.();
    if (autoCloseOnApply) setOpen(false);
  };

  const handleNavigate = () => {
    const q = new URLSearchParams();
    if (projectId) {
      q.set("project", String(projectId));
      navigate(
        `/prediction-map?project_id=${projectId}&session=${encodeURIComponent(
          sessionId
        )}`
      );
    }
    if (sessionId) q.set("session", String(sessionId)); // CSV safe
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      )}

      <div className={sideClasses}>
        <div className="flex items-center justify-between p-3 border-b dark:border-slate-700">
          <button
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-120px)] overflow-y-auto p-3 space-y-4">
          <PanelSection title="Project Details">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="pb-1 text-xs">Project ID</Label>
                <Input
                  type="number"
                  value={projectId ?? ""}
                  onChange={(e) =>
                    setProjectId?.(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full border rounded px-2 py-1 text-sm h-9 bg-slate-800 text-white border-slate-700"
                  placeholder="Enter Project ID"
                />
              </div>

              {!projectId && (
                <div>
                  <Label className="pb-1 text-xs">Session ID(s)</Label>
                  <Input
                    type="text"
                    value={sessionId ?? ""}
                    readOnly
                    className="w-full border rounded px-2 py-1 text-sm h-9 bg-slate-800 text-white border-slate-700 opacity-80"
                  />
                </div>
              )}
            </div>
          </PanelSection>

          <PanelSection title="Metric Display">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="pb-1 text-xs">Metric</Label>
                <Select value={metric} onValueChange={setMetric}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select Metric..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rsrp">RSRP</SelectItem>
                    <SelectItem value="rsrq">RSRQ</SelectItem>
                    <SelectItem value="sinr">SINR</SelectItem>

                    <SelectItem value="dl_thpt">DL Throughput</SelectItem>
                    <SelectItem value="ul_thpt">UL Throughput</SelectItem>
                    <SelectItem value="mos">MOS</SelectItem>
                    <SelectItem value="lte_bler">LTE BLER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PanelSection>

          <PanelSection title="Display Options">
            <div className="space-y-2 text-sm">
              {setShowPolys && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!showPolys}
                    onChange={(e) => setShowPolys(e.target.checked)}
                  />
                  Show Project Polygons
                </label>
              )}
              {setOnlyInside && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!onlyInside}
                    onChange={(e) => setOnlyInside(e.target.checked)}
                  />
                  Show Only Points Inside
                </label>
              )}

              <div className="pt-2 border-t mt-3 dark:border-slate-700">
                <Label className="pb-1 text-xs">Basemap Style</Label>
                <Select
                  value={ui?.basemapStyle || "roadmap"}
                  onValueChange={(v) => onUIChange?.({ basemapStyle: v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select style..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roadmap">Default (Roadmap)</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="terrain">Terrain</SelectItem>
                    <SelectItem value="clean">Clean (Custom)</SelectItem>
                    <SelectItem value="night">Night (Custom)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PanelSection>

          <PanelSection>
            <button
              className="border-1 border-white rounded-md p-2 m-2"
              onClick={handleNavigate}
            >
              Show Prediction
            </button>
            {/* Map Layers Section */}
            <div className="space-y-2 text-sm border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ui.showSectors ?? false}
                  onChange={(e) =>
                    onUIChange({ showSectors: e.target.checked })
                  }
                />
                Show Cell Sectors
              </label>
            </div>
          </PanelSection>
        </div>

        <div className="p-3 border-t border-slate-700 text-white flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={applyAndClose}
            disabled={loading || !projectId}
          >
            <Filter className="h-4 w-4 mr-2" />
            {loading ? "Loading..." : "Apply & Reload"}
          </Button>
        </div>
      </div>
    </>
  );
}
