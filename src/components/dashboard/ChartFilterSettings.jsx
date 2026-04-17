import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const ChartFilterSettings = ({ 
  operators = [], 
  networks = [], 
  value = {}, 
  onChange,
  showOperators = true,
  showNetworks = true,
  showDateRange = false,
}) => {
  const [localFilters, setLocalFilters] = useState({
    ...value,
    dateFrom: value?.dateFrom || '',
    dateTo: value?.dateTo || '',
  });

  useEffect(() => {
    setLocalFilters({
      ...value,
      dateFrom: value?.dateFrom || '',
      dateTo: value?.dateTo || '',
    });
  }, [value]);

  const toggleOperator = (op) => {
    const newOps = localFilters.operators?.includes(op)
      ? localFilters.operators.filter(o => o !== op)
      : [...(localFilters.operators || []), op];
    setLocalFilters(prev => ({ ...prev, operators: newOps }));
  };

  const toggleNetwork = (net) => {
    const newNets = localFilters.networks?.includes(net)
      ? localFilters.networks.filter(n => n !== net)
      : [...(localFilters.networks || []), net];
    setLocalFilters(prev => ({ ...prev, networks: newNets }));
  };

  const handleDateChange = (key, nextValue) => {
    setLocalFilters(prev => ({ ...prev, [key]: nextValue || '' }));
  };

  const handleApply = () => {
    onChange({
      ...localFilters,
      dateFrom: localFilters.dateFrom || undefined,
      dateTo: localFilters.dateTo || undefined,
    });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      {showOperators && operators.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-gray-800">Operators</label>
            <Badge variant="secondary" className="text-xs">
              {localFilters.operators?.length || 0} selected
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border border-gray-200 rounded-lg bg-gray-50">
            {operators.map(op => (
              <label key={op} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={localFilters.operators?.includes(op) || false}
                  onChange={() => toggleOperator(op)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{op}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {showNetworks && networks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-gray-800">Network Types</label>
            <Badge variant="secondary" className="text-xs">
              {localFilters.networks?.length || 0} selected
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {networks.map(net => (
              <label 
                key={net} 
                className={`
                  flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border-2 transition-all
                  ${localFilters.networks?.includes(net) 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={localFilters.networks?.includes(net) || false}
                  onChange={() => toggleNetwork(net)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium">{net}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {showDateRange && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-gray-800">Date Range</label>
            <Badge variant="secondary" className="text-xs">
              {localFilters.dateFrom || localFilters.dateTo ? 'Active' : 'All time'}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
            <div>
              <label className="text-xs text-gray-500 block mb-1">From</label>
              <Input
                type="date"
                value={localFilters.dateFrom || ''}
                onChange={(e) => handleDateChange('dateFrom', e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">To</label>
              <Input
                type="date"
                value={localFilters.dateTo || ''}
                onChange={(e) => handleDateChange('dateTo', e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t">
        <button
          onClick={() => setLocalFilters({ operators: [], networks: [], dateFrom: '', dateTo: '' })}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleApply}
          className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
        >
          Apply
        </button>
      </div>
    </div>
  );
};

export default ChartFilterSettings;
