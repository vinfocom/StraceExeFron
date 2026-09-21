import React, { useState, useCallback, memo, useMemo, useEffect } from "react";
import { 
  MousePointer2, 
  Hexagon, 
  Square, 
  Circle, 
  Ruler, 
  Crosshair,
  Settings2, 
  Download, 
  Trash2, 
  Search,
  PaintBucket,
  PenTool, 
  X
} from "lucide-react";
import { useMapContext } from "@/context/MapContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ToolButton = ({ icon: Icon, active, onClick, title, variant = "ghost", dark = false }) => {
  const idle = variant === "destructive"
    ? dark ? "text-red-300 hover:bg-red-500/20 hover:text-red-200" : "text-slate-700 hover:bg-red-50 hover:text-red-600"
    : dark ? "text-slate-100 hover:bg-white/15" : "text-slate-800 hover:bg-slate-100";
  const on = dark
    ? "bg-blue-500/30 text-blue-200 ring-1 ring-blue-300/50"
    : "bg-blue-100 text-blue-700 ring-1 ring-blue-200";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title={title}
      aria-label={title}
      aria-pressed={Boolean(active)}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${active ? on : idle}`}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
    </button>
  );
};

const DrawingControlsPanel = memo(function DrawingControlsPanel({
  ui: propUi,
  onUIChange: propOnUIChange,
  polygonStats: propPolygonStats,
  onDownloadStatsCsv: propOnDownloadStatsCsv,
  onDownloadRawCsv: propOnDownloadRawCsv,
  onFetchLogs: propOnFetchLogs,
  onFillWithLogs: propOnFillWithLogs,
  position = "top-right",
}) {
  const context = useMapContext();
  const ui = propUi || context?.ui || {};
  const onUIChange = propOnUIChange || context?.updateUI;
  const polygonStats = propPolygonStats || context?.polygonStatsRef?.current;
  const downloadHandlers = context?.downloadHandlersRef?.current || {};

  const [isExpanded, setIsExpanded] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1180 : false,
  );

  const handleDownloadStatsCsv = propOnDownloadStatsCsv || downloadHandlers.onDownloadStatsCsv;
  const handleDownloadRawCsv = propOnDownloadRawCsv || downloadHandlers.onDownloadRawCsv;
  const handleFetchLogs = propOnFetchLogs || downloadHandlers.onFetchLogs;
  const handleFillWithLogs =
    propOnFillWithLogs ||
    downloadHandlers.onFillWithLogs ||
    (() => {});

  const safeUi = useMemo(() => ({
    drawEnabled: false,
    shapeMode: null, 
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawLogPolygonOffsetMeters: 50,
    drawClearSignal: 0,
    colorizeCells: true,
    ...ui,
  }), [ui]);

  useEffect(() => {
    if (safeUi.drawEnabled) {
      setIsExpanded(true);
    }
  }, [safeUi.drawEnabled]);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 1180);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const activateTool = useCallback((mode) => {
    onUIChange?.({ 
      drawEnabled: true, 
      shapeMode: mode 
    });
  }, [onUIChange]);

  const deactivateTool = useCallback(() => {
    onUIChange?.({ 
      drawEnabled: false, 
      shapeMode: null 
    });
  }, [onUIChange]);

  const clearDrawings = useCallback(() => {
    onUIChange?.({ 
      drawClearSignal: (safeUi.drawClearSignal || 0) + 1,
      drawEnabled: false, 
      shapeMode: null
    });
  }, [onUIChange, safeUi.drawClearSignal]);

  const updateSetting = useCallback((key, value) => {
    onUIChange?.({ [key]: value });
  }, [onUIChange]);

  // Black text on map/terrain, light text on satellite/hybrid.
  const dark = ["satellite", "hybrid"].includes(safeUi.basemapStyle);
  const plainBtn = dark ? "text-slate-100 hover:bg-white/15" : "text-slate-800 hover:bg-slate-100";
  const divider = <div className={`mx-1 h-5 w-px flex-shrink-0 ${dark ? "bg-white/25" : "bg-slate-300"}`} />;

  const positionClasses = {
    "top-right": "absolute top-3 right-16",
    "top-left": "absolute top-4 left-4",
    "bottom-right": "absolute bottom-8 right-4",
    "bottom-left": "absolute bottom-8 left-4",
    "relative": "relative block w-full",
    
  };

  const hasShape = polygonStats && (polygonStats.area > 0 || polygonStats.length > 0);
  const sessionCount = polygonStats?.intersectingSessions?.length || 0;

  return (
    <div className={`${positionClasses[position]} z-40 flex flex-col gap-3 ${position === "relative" ? "items-stretch" : "items-end"}`}>
      
      <div
        className={`
          relative backdrop-blur-md shadow-xl border
          transition-all duration-300 ease-out
          flex items-center overflow-hidden
          ${dark ? "border-white/15 bg-slate-900/80" : "border-slate-200 bg-white/95"}
          ${isExpanded 
            ? `${isCompactViewport ? "w-full rounded-2xl p-1.5" : "rounded-full p-1.5"}`
            : `h-11 w-11 cursor-pointer rounded-full ${dark ? "hover:bg-slate-800/90" : "hover:bg-slate-100"}`
          }
        `}
        onClick={!isExpanded ? () => setIsExpanded(true) : undefined}
      >
        
        {/* PEN ICON (Visible when minimized) */}
        <div 
          className={`
            absolute inset-0 flex items-center justify-center transition-all duration-300
            ${isExpanded 
              ? "opacity-0 scale-50 pointer-events-none" 
              : "opacity-100 scale-100"
            }
          `}
        >
          <PenTool size={20} className={dark ? "text-slate-100" : "text-slate-800"} />
        </div>

        {/* TOOLBAR CONTENT (Visible when expanded) */}
        <div 
          className={`
            flex items-center gap-1 transition-all duration-300
            ${isCompactViewport ? "w-full overflow-x-auto whitespace-nowrap scrollbar-hide" : "whitespace-nowrap"}
            ${isExpanded 
              ? "opacity-100 translate-x-0" 
              : "opacity-0 translate-x-10 pointer-events-none"
            }
          `}
        >
            {/* Close Button (kept first so it's always reachable) */}
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${plainBtn}`}
              title="Close Toolbar"
              aria-label="Close Toolbar"
            >
              <X size={18} />
            </button>

            {divider}

            {/* Cursor / Select */}
            <ToolButton 
              dark={dark}
              icon={MousePointer2} 
              title="Cursor / Pan (Escape Drawing)"
              active={!safeUi.drawEnabled}
              onClick={deactivateTool}
            />
            
            {divider}

            {/* Drawing Tools */}
            <ToolButton 
              dark={dark}
              icon={Hexagon} 
              title="Draw Polygon (area, blue)"
              active={safeUi.drawEnabled && safeUi.shapeMode === "polygon"}
              onClick={() => activateTool("polygon")}
            />
            <ToolButton 
              dark={dark}
              icon={Square} 
              title="Draw Rectangle (area, blue)"
              active={safeUi.drawEnabled && safeUi.shapeMode === "rectangle"}
              onClick={() => activateTool("rectangle")}
            />
            <ToolButton 
              dark={dark}
              icon={Circle} 
              title="Draw Circle (area, blue)"
              active={safeUi.drawEnabled && safeUi.shapeMode === "circle"}
              onClick={() => activateTool("circle")}
            />
            <ToolButton 
              dark={dark}
              icon={Ruler} 
              title="Draw Line / Measure Distance (orange)"
              active={safeUi.drawEnabled && safeUi.shapeMode === "polyline"}
              onClick={() => activateTool("polyline")}
            />
            <ToolButton
              dark={dark}
              icon={Crosshair}
              title="Select Logs and Draw Offset Route Polygon (teal)"
              active={safeUi.drawEnabled && safeUi.shapeMode === "log-polygon"}
              onClick={() => activateTool("log-polygon")}
            />

            {divider}

            {/* Settings Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  onClick={(e) => e.stopPropagation()}
                  title="Analysis Settings"
                  aria-label="Analysis Settings"
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                    safeUi.drawPixelateRect ? (dark ? "bg-blue-500/30 text-blue-200" : "bg-blue-100 text-blue-700") : plainBtn
                  }`}
                >
                  <Settings2 size={18} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-3">
                    <h4 className="font-medium text-sm text-slate-900 border-b pb-2">Analysis Settings</h4>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={safeUi.drawPixelateRect}
                        onChange={(e) => updateSetting('drawPixelateRect', e.target.checked)}
                        disabled={safeUi.shapeMode === "polyline"}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-900">Pixelate Grid Analysis</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-800 w-20">Fill Gap:</span>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={safeUi.drawCellSizeMeters}
                        onChange={(e) => updateSetting('drawCellSizeMeters', Number(e.target.value))}
                        className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-700">m</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-800 w-20">Route Offset:</span>
                      <input
                        type="number"
                        min={1}
                        step={5}
                        value={safeUi.drawLogPolygonOffsetMeters}
                        onChange={(e) => updateSetting('drawLogPolygonOffsetMeters', Number(e.target.value))}
                        className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-700">m</span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(safeUi.showSegmentLabels)}
                        onChange={(e) => updateSetting('showSegmentLabels', e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-900">Segment lengths (zoom 15+)</span>
                    </label>

                    {safeUi.drawPixelateRect && (
                      <div className="pl-6 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={safeUi.colorizeCells}
                            onChange={(e) => updateSetting('colorizeCells', e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span className="text-xs text-slate-800">Colorize by Metric</span>
                        </label>
                      </div>
                    )}
                </div>
              </PopoverContent>
            </Popover>

            <ToolButton
              dark={dark}
              icon={PaintBucket}
              title="Fill latest drawing with generated logs"
              active={false}
              onClick={handleFillWithLogs}
            />

            {/* Export Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${plainBtn}`}
                  title="Export Data"
                  aria-label="Export Data"
                >
                    <Download size={18} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" className="justify-start h-8" onClick={handleDownloadStatsCsv} disabled={!hasShape}>
                      Stats CSV
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start h-8" onClick={handleDownloadRawCsv} disabled={!hasShape}>
                      Raw Logs CSV
                    </Button>
                </div>
              </PopoverContent>
            </Popover>

            {divider}

            <ToolButton 
              dark={dark}
              icon={Trash2} 
              title="Clear All Drawings"
              variant="destructive"
              onClick={clearDrawings}
            />
            
        </div>
      </div>

      {/* Contextual Action Button (Fetch Logs) */}
      {hasShape && !context?.isDrawing && sessionCount > 0 && (
        <div className={`animate-in fade-in slide-in-from-right-4 duration-300 ${position === "relative" ? "self-start" : ""}`}>
          <Button 
            size="sm" 
            className="gap-2 rounded-full bg-indigo-600 px-4 text-white shadow-lg hover:bg-indigo-700"
            onClick={handleFetchLogs}
          >
            <Search size={14} />
            Fetch {sessionCount} Sessions
          </Button>
        </div>
      )}
    </div>
  );
});

export default DrawingControlsPanel;
