import React from 'react';
import { METRICS } from '@/components/constants/dashboardConstants';

const MetricSelectorSettings = ({ value, onChange }) => {
  return (
    <div className="space-y-3 text-sm">
      <div className="font-semibold text-gray-800 text-base">Select Metric</div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {METRICS.map((metric) => (
          <label 
            key={metric.value} 
            className={`
              flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-all
              ${value === metric.value 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <input
              type="radio"
              name="metric"
              value={metric.value}
              checked={value === metric.value}
              onChange={(e) => onChange(e.target.value)}
              className="w-4 h-4 text-blue-600 mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">{metric.icon}</span>
                <div className="text-gray-900 font-semibold">{metric.label}</div>
              </div>
              <div className="text-xs text-gray-600 mt-1">{metric.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default MetricSelectorSettings;