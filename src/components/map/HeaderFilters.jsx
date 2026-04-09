// components/map/HeaderFilters.jsx
import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Filter, X, ChevronDown } from 'lucide-react';
import { useMapContext } from '@/context/MapContext';

// Default filters
const DEFAULT_FILTERS = {
  technology: 'ALL',
  metric: 'RSRP',
  band: 'all',        // ✅ Changed from '' to 'all'
  provider: 'all',
  startDate: null,
  endDate: null,
  minSignal: '',
  maxSignal: '',
  dataSource: 'all'
};

const HeaderFilters = () => {
  const context = useMapContext();

  const filters = context?.filters || DEFAULT_FILTERS;
  const updateFilter = context?.updateFilter || (() => {});
  const clearFilters = context?.clearFilters || (() => {});
  const activeFilterCount = context?.activeFilterCount || 0;
  const isFiltersOpen = context?.isFiltersOpen || false;
  const setIsFiltersOpen = context?.setIsFiltersOpen || (() => {});
  
  const availableFilters = context?.availableFilters || {
    providers: [],
    bands: [],
    technologies: []
  };

  const { providers, bands, technologies } = availableFilters;

  const metricOptions = ['RSRP', 'RSRQ', 'SINR', 'DL_THPT', 'UL_THPT', 'MOS', 'LTE_BLER', 'PCI', 'NUM_CELLS', 'LEVEL'];
  
  // ✅ FIX: Use 'all' instead of empty string ''
  const bandOptions = React.useMemo(() => {
    const options = [{ value: 'all', label: 'All Bands' }];  // ✅ Changed '' to 'all'
    
    bands.forEach(b => {
      if (b && b !== 'all') {  // Skip if already 'all'
        options.push({ 
          value: String(b), 
          label: `${b} ` 
        });
      }
    });
    
    return options;
  }, [bands]);

  // Technology options - ensure no empty values
  const technologyOptions = React.useMemo(() => {
    const options = ['ALL'];
    technologies.forEach(tech => {
      if (tech && tech !== 'ALL' && tech.trim() !== '' && !options.includes(tech)) {
        options.push(tech);
      }
    });
    return options;
  }, [technologies]);

  // Provider options - ensure no empty values
  const providerOptions = React.useMemo(() => {
    const options = [{ value: 'all', label: 'All Providers' }];
    providers.forEach(p => {
      if (p && p !== 'all' && p.trim() !== '') {
        options.push({ value: p, label: p });
      }
    });
    return options;
  }, [providers]);

  return (
    <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white relative gap-2"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold"
            >
              {activeFilterCount}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 bg-slate-900 border-slate-700 text-white p-0" 
        align="start"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-400" />
            Filters
          </h3>
          {activeFilterCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                clearFilters();
              }}
              className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
            >
              <X className="h-3 w-3 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        {/* Filter Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          
          {/* Technology */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 font-medium">Technology</Label>
            <Select 
              value={filters.technology || 'ALL'} 
              onValueChange={(value) => updateFilter('technology', value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-9 focus:ring-blue-500">
                <SelectValue placeholder="Select technology" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {technologyOptions.filter(tech => tech !== 'Unknown').map(tech => (
                  <SelectItem 
                    key={tech} 
                    value={tech}
                    className="text-white hover:bg-slate-700 focus:bg-slate-700"
                  >
                    {tech === 'ALL' ? 'All Technologies' : tech}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Metric */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 font-medium">Display Metric</Label>
            <Select 
              value={filters.metric || 'RSRP'} 
              onValueChange={(value) => updateFilter('metric', value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-9 focus:ring-blue-500">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {metricOptions.map(metric => (
                  <SelectItem 
                    key={metric} 
                    value={metric}
                    className="text-white hover:bg-slate-700 focus:bg-slate-700"
                  >
                    {metric}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency Band - ✅ FIXED */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 font-medium">Frequency Band</Label>
            <Select 
              value={filters.band || 'all'}  // ✅ Default to 'all' not ''
              onValueChange={(value) => updateFilter('band', value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-9 focus:ring-blue-500">
                <SelectValue placeholder="All bands" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {bandOptions.map(option => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}  // ✅ Never empty string
                    className="text-white hover:bg-slate-700 focus:bg-slate-700"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider */}
          {providers.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 font-medium">Provider</Label>
              <Select 
                value={filters.provider || 'all'} 
                onValueChange={(value) => updateFilter('provider', value)}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-9 focus:ring-blue-500">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {providerOptions.map(option => (
                    <SelectItem 
                      key={option.value} 
                      value={option.value}
                      className="text-white hover:bg-slate-700 focus:bg-slate-700"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Signal Strength Range */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 font-medium">
              Signal Strength Range (dBm)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min (e.g., -120)"
                value={filters.minSignal || ''}
                onChange={(e) => updateFilter('minSignal', e.target.value)}
                className="bg-slate-800 border-slate-600 text-white h-9 text-sm placeholder:text-slate-500 focus:ring-blue-500"
              />
              <Input
                type="number"
                placeholder="Max (e.g., -60)"
                value={filters.maxSignal || ''}
                onChange={(e) => updateFilter('maxSignal', e.target.value)}
                className="bg-slate-800 border-slate-600 text-white h-9 text-sm placeholder:text-slate-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50">
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 h-9 font-medium"
            onClick={() => setIsFiltersOpen(false)}
          >
            Apply Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HeaderFilters;