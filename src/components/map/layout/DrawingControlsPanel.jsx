import React, { useState, useCallback, memo, useMemo, useEffect } from "react";
import { 
  MousePointer2, 
  Hexagon, 
  Square, 
  Circle, 
  Ruler, 
  Settings2, 
  Download, 
  Trash2, 
  Search,
  PenTool, 
  X
} from "lucide-react";
import { useMapContext } from "@/context/MapContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ToolButton = ({ icon: Icon, active, onClick, title, variant = "ghost" }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(e); }}
    title={title}
    className={`
      p-2 rounded-full transition-all duration-200 flex items-center justify-center flex-shrink-0
      ${active 
        ? "bg-blue-100 text-blue-700 shadow-sm ring-1 ring-blue-200" 
        : variant === "destructive" 
          ? "hover:bg-red-50 text-gray-600 hover:text-red-600" 
          : "hover:bg-slate-100 text-gray-700"
      }
    `}
  >
    <Icon size={18} strokeWidth={active ? 2.5 : 2} />
  </button>
);

const DrawingControlsPanel = memo(function DrawingControlsPanel({
  ui: propUi,
  onUIChange: propOnUIChange,
  polygonStats: propPolygonStats,
  onDownloadStatsCsv: propOnDownloadStatsCsv,
  onDownloadRawCsv: propOnDownloadRawCsv,
  onFetchLogs: propOnFetchLogs,
  position = "top-right",
}) {
  const context = useMapContext();
  const ui = propUi || context?.ui || {};
  const onUIChange = propOnUIChange || context?.updateUI;
  const polygonStats = propPolygonStats || context?.polygonStatsRef?.current;
  const downloadHandlers = context?.downloadHandlersRef?.current || {};

  const [isExpanded, setIsExpanded] = useState(false);

  const handleDownloadStatsCsv = propOnDownloadStatsCsv || downloadHandlers.onDownloadStatsCsv;
  const handleDownloadRawCsv = propOnDownloadRawCsv || downloadHandlers.onDownloadRawCsv;
  const handleFetchLogs = propOnFetchLogs || downloadHandlers.onFetchLogs;

  const safeUi = useMemo(() => ({
    drawEnabled: false,
    shapeMode: null, 
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
    ...ui,
  }), [ui]);

  useEffect(() => {
    if (safeUi.drawEnabled) {
      setIsExpanded(true);
    }
  }, [safeUi.drawEnabled]);

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

  const positionClasses = {
    "top-right": "absolute top-3 right-16",
    "top-left": "absolute top-4 left-4",
    "bottom-right": "absolute bottom-8 right-4",
    "bottom-left": "absolute bottom-8 left-4",
    "relative": "relative inline-block",
    
  };

  const hasShape = polygonStats && (polygonStats.area > 0 || polygonStats.length > 0);
  const sessionCount = polygonStats?.intersectingSessions?.length || 0;

  return (
    <div className={`${positionClasses[position]} z-40 flex flex-col gap-3 items-end`}>
      
      <div
        className={`
          relative backdrop-blur-md shadow-xl border border-white/20 ring-1 ring-black/5
          transition-all duration-500 ease-out
          flex items-center overflow-hidden rounded-full
          ${isExpanded 
            ? "bg-white/95 p-1.5" 
            : "bg-slate-700/95 w-11 h-11 cursor-pointer hover:bg-slate-600/95"
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
          <PenTool size={20} className="text-white" />
        </div>

        {/* TOOLBAR CONTENT (Visible when expanded) */}
        <div 
          className={`
            flex items-center gap-1 transition-all duration-300 whitespace-nowrap
            ${isExpanded 
              ? "opacity-100 translate-x-0" 
              : "opacity-0 translate-x-10 pointer-events-none"
            }
          `}
        >
            <div className="w-px h-5 bg-gray-300 mx-1 flex-shrink-0" />

            {/* Cursor / Select */}
            <ToolButton 
              icon={MousePointer2} 
              title="Cursor / Pan (Escape Drawing)"
              active={!safeUi.drawEnabled}
              onClick={deactivateTool}
            />
            
            <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

            {/* Drawing Tools */}
            <ToolButton 
              icon={Hexagon} 
              title="Draw Polygon"
              active={safeUi.drawEnabled && safeUi.shapeMode === "polygon"}
              onClick={() => activateTool("polygon")}
            />
            <ToolButton 
              icon={Square} 
              title="Draw Rectangle"
              active={safeUi.drawEnabled && safeUi.shapeMode === "rectangle"}
              onClick={() => activateTool("rectangle")}
            />
            <ToolButton 
              icon={Circle} 
              title="Draw Circle"
              active={safeUi.drawEnabled && safeUi.shapeMode === "circle"}
              onClick={() => activateTool("circle")}
            />
            <ToolButton 
              icon={Ruler} 
              title="Measure Distance"
              active={safeUi.drawEnabled && safeUi.shapeMode === "polyline"}
              onClick={() => activateTool("polyline")}
            />

            <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

            {/* Settings Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className={`
                    p-2 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0
                    ${safeUi.drawPixelateRect ? 'text-blue-600' : 'text-gray-700'}
                  `}
                >
                  <Settings2 size={18} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-3">
                    <h4 className="font-medium text-sm text-gray-900 border-b pb-2">Analysis Settings</h4>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={safeUi.drawPixelateRect}
                        onChange={(e) => updateSetting('drawPixelateRect', e.target.checked)}
                        disabled={safeUi.shapeMode === "polyline"}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Pixelate Grid Analysis</span>
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
                          <span className="text-xs text-gray-600">Colorize by Metric</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-12">Cell Size:</span>
                          <input
                            type="number"
                            min={10}
                            step={10}
                            value={safeUi.drawCellSizeMeters}
                            onChange={(e) => updateSetting('drawCellSizeMeters', Number(e.target.value))}
                            className="flex-1 border rounded px-2 py-1 text-xs"
                          />
                          <span className="text-xs text-gray-500">m</span>
                        </div>
                      </div>
                    )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Export Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-full hover:bg-slate-100 text-gray-700 transition-colors flex-shrink-0" 
                  title="Export Data"
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

            <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

            {/* Clear Button */}
            <ToolButton 
              icon={Trash2} 
              title="Clear All Drawings"
              variant="destructive"
              onClick={clearDrawings}
            />
            
            {/* Close Button */}
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
              title="Close Toolbar"
            >
              <X size={18} />
            </button>
        </div>
      </div>

      {/* Contextual Action Button (Fetch Logs) */}
      {hasShape && !context?.isDrawing && sessionCount > 0 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <Button 
            size="sm" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg gap-2 rounded-full px-4"
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