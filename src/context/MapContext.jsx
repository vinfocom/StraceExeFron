// context/MapContext.jsx
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const MapContext = createContext(null);

// Default filters
const DEFAULT_FILTERS = {
  technology: 'ALL',
  metric: 'RSRP',
  band: '',
  provider: 'all',
  startDate: null,
  endDate: null,
  minSignal: '',
  maxSignal: '',
  dataSource: 'all'
};

const DEFAULT_AVAILABLE_FILTERS = {
  providers: [],
  bands: [],
  technologies: []
};

export function MapProvider({ children }) {
  // UI State
  const [ui, setUi] = useState({
    drawEnabled: false,
    shapeMode: 'polygon',
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
  });

  // Filters State
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // ✅ NEW: Available filter options from data
  const [availableFilters, setAvailableFilters] = useState(DEFAULT_AVAILABLE_FILTERS);

  // Download handlers
  const [downloadHandlers, setDownloadHandlers] = useState({});
  
  // Polygon stats
  const [polygonStats, setPolygonStats] = useState(null);
  const [hasLogs, setHasLogs] = useState(false);

  // Update UI
  const updateUI = useCallback((updates) => {
    setUi(prev => ({ ...prev, ...updates }));
  }, []);

  // Update single filter
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset single filter
  const resetFilter = useCallback((key) => {
    setFilters(prev => ({ ...prev, [key]: DEFAULT_FILTERS[key] }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ✅ NEW: Update available filter options
  const updateAvailableFilters = useCallback((options) => {
    setAvailableFilters(prev => ({ ...prev, ...options }));
  }, []);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.technology && filters.technology !== 'ALL') count++;
    if (filters.band && filters.band !== '' && filters.band !== 'all') count++;
    if (filters.provider && filters.provider !== 'all') count++;
    if (filters.minSignal !== '') count++;
    if (filters.maxSignal !== '') count++;
    if (filters.startDate) count++;
    if (filters.endDate) count++;
    if (filters.dataSource && filters.dataSource !== 'all') count++;
    return count;
  }, [filters]);

  // Check if any filters are active
  const hasActiveFilters = activeFilterCount > 0;

  const value = useMemo(() => ({
    // UI
    ui,
    updateUI,
    
    // Filters
    filters,
    updateFilter,
    resetFilter,
    clearFilters,
    activeFilterCount,
    hasActiveFilters,
    isFiltersOpen,
    setIsFiltersOpen,
    
    // ✅ NEW: Available filter options
    availableFilters,
    updateAvailableFilters,
    
    // Download handlers
    downloadHandlers,
    setDownloadHandlers,
    
    // Polygon stats
    polygonStats,
    setPolygonStats,
    hasLogs,
    setHasLogs,
  }), [
    ui, updateUI,
    filters, updateFilter, resetFilter, clearFilters, activeFilterCount, hasActiveFilters,
    isFiltersOpen, setIsFiltersOpen,
    availableFilters, updateAvailableFilters,
    downloadHandlers, setDownloadHandlers,
    polygonStats, setPolygonStats,
    hasLogs, setHasLogs
  ]);

  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
}

export default MapContext;