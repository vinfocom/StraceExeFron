// src/components/common/ChartContainer.jsx
import React, { useState, useCallback } from "react";
import { 
  Maximize2, 
  Minimize2, 
  ChevronDown, 
  ChevronUp, 
  Download,
  RefreshCw,
  MoreVertical,
  X
} from "lucide-react";

export const ChartContainer = React.forwardRef(
  ({ 
    title, 
    icon: Icon, 
    children, 
    actions,
    headerExtra,
    
    // New props
    subtitle,
    collapsible = false,
    defaultCollapsed = false,
    expandable = false,
    loading = false,
    error = null,
    onRefresh,
    onExport,
    className = "",
    headerClassName = "",
    contentClassName = "",
    minHeight,
    maxHeight,
    noPadding = false,
    bordered = true,
    showDivider = true,
    badge,
    tooltip,
    variant = "default", // "default" | "compact" | "large"
  }, ref) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const toggleCollapse = useCallback(() => {
      setIsCollapsed(prev => !prev);
    }, []);

    const toggleExpand = useCallback(() => {
      setIsExpanded(prev => !prev);
    }, []);

    const handleExport = useCallback(() => {
      onExport?.();
      setShowMenu(false);
    }, [onExport]);

    const handleRefresh = useCallback(() => {
      onRefresh?.();
      setShowMenu(false);
    }, [onRefresh]);

    // Variant styles
    const variantStyles = {
      default: {
        container: "p-4",
        title: "text-sm font-semibold",
        icon: "h-4 w-4",
      },
      compact: {
        container: "p-3",
        title: "text-xs font-semibold",
        icon: "h-3.5 w-3.5",
      },
      large: {
        container: "p-5",
        title: "text-base font-bold",
        icon: "h-5 w-5",
      },
    };

    const styles = variantStyles[variant] || variantStyles.default;

    // Expanded modal overlay
    if (isExpanded) {
      return (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4">
          <div 
            ref={ref}
            className={`
              bg-slate-900 rounded-xl border border-slate-600 
              w-full max-w-6xl max-h-[90vh] overflow-hidden
              flex flex-col shadow-2xl
              ${className}
            `}
          >
            {/* Expanded Header */}
            <div className={`
              flex items-center justify-between p-4 
              border-b border-slate-700 bg-slate-800/50
              ${headerClassName}
            `}>
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Icon className="h-5 w-5 text-blue-400" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  {subtitle && (
                    <p className="text-xs text-slate-100 mt-0.5">{subtitle}</p>
                  )}
                </div>
                {badge && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
                    {badge}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {headerExtra}
                {actions}
                <button
                  onClick={toggleExpand}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-100 hover:text-white"
                  title="Exit fullscreen"
                >
                  <Minimize2 className="h-5 w-5" />
                </button>
                <button
                  onClick={toggleExpand}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-slate-100 hover:text-red-400"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Expanded Content */}
            <div className={`flex-1 overflow-auto p-6 ${contentClassName}`}>
              {loading ? (
                <LoadingState />
              ) : error ? (
                <ErrorState error={error} onRetry={onRefresh} />
              ) : (
                children
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={ref}
        className={`
          bg-slate-900 rounded-lg 
          ${bordered ? 'border border-slate-700 hover:border-slate-600' : ''}
          transition-all duration-200
          ${noPadding ? '' : styles.container}
          ${className}
        `}
        style={{
          minHeight: minHeight,
          maxHeight: maxHeight,
        }}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between 
          ${showDivider && !isCollapsed ? 'mb-3 pb-3 border-b border-slate-800' : 'mb-2'}
          ${headerClassName}
        `}>
          {/* Left Side - Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {collapsible && (
              <button
                onClick={toggleCollapse}
                className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-100 hover:text-white flex-shrink-0"
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
            )}
            
            {Icon && (
              <div className="flex-shrink-0">
                <Icon className={`${styles.icon} text-blue-400`} />
              </div>
            )}
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 
                  className={`${styles.title} text-slate-200 truncate`}
                  title={tooltip || title}
                >
                  {title}
                </h4>
                {badge && (
                  <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-medium rounded-full flex-shrink-0">
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && !isCollapsed && (
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right Side - Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {/* Header Extra Content (for dropdowns, settings, etc.) */}
            {headerExtra && !isCollapsed && (
              <div className="relative">
                {headerExtra}
              </div>
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="p-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              </div>
            )}

            {/* Refresh Button */}
            {onRefresh && !loading && !isCollapsed && (
              <button
                onClick={handleRefresh}
                className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-slate-300"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Export Button */}
            {onExport && !isCollapsed && (
              <button
                onClick={handleExport}
                className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-slate-300"
                title="Export"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Expand Button */}
            {expandable && !isCollapsed && (
              <button
                onClick={toggleExpand}
                className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-slate-300"
                title="Fullscreen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Custom Actions */}
            {actions && !isCollapsed && (
              <div className="flex items-center gap-1">
                {actions}
              </div>
            )}

            {/* More Menu (for additional options) */}
            {(onRefresh || onExport) && !isCollapsed && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-slate-300 sm:hidden"
                  title="More options"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
                
                {showMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowMenu(false)} 
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[120px]">
                      {onRefresh && (
                        <button
                          onClick={handleRefresh}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Refresh
                        </button>
                      )}
                      {onExport && (
                        <button
                          onClick={handleExport}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export
                        </button>
                      )}
                      {expandable && (
                        <button
                          onClick={() => { toggleExpand(); setShowMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                          Fullscreen
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div 
            className={`
              transition-all duration-200
              ${contentClassName}
            `}
            style={{
              maxHeight: maxHeight ? `calc(${maxHeight} - 60px)` : undefined,
              overflow: maxHeight ? 'auto' : undefined,
            }}
          >
            {loading ? (
              <LoadingState variant={variant} />
            ) : error ? (
              <ErrorState error={error} onRetry={onRefresh} variant={variant} />
            ) : (
              children
            )}
          </div>
        )}

        {/* Collapsed Indicator */}
        {isCollapsed && collapsible && (
          <div 
            className="text-center py-2 text-slate-500 text-xs cursor-pointer hover:text-slate-100 transition-colors"
            onClick={toggleCollapse}
          >
            Click to expand
          </div>
        )}
      </div>
    );
  }
);

ChartContainer.displayName = "ChartContainer";

// Loading State Component
const LoadingState = ({ variant = "default" }) => {
  const heights = {
    compact: "h-24",
    default: "h-40",
    large: "h-56",
  };

  return (
    <div className={`flex items-center justify-center ${heights[variant] || heights.default}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 border-2 border-slate-700 rounded-full" />
          <div className="absolute top-0 left-0 w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <span className="text-xs text-slate-500">Loading...</span>
      </div>
    </div>
  );
};

// Error State Component
const ErrorState = ({ error, onRetry, variant = "default" }) => {
  const heights = {
    compact: "h-24",
    default: "h-40",
    large: "h-56",
  };

  const errorMessage = typeof error === 'string' ? error : error?.message || 'An error occurred';

  return (
    <div className={`flex items-center justify-center ${heights[variant] || heights.default}`}>
      <div className="flex flex-col items-center gap-3 text-center px-4">
        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
          <X className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <p className="text-sm text-red-400 font-medium">Error</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[200px]">{errorMessage}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

// Export helper components
export { LoadingState, ErrorState };