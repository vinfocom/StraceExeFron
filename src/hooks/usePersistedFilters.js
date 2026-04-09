import { useState, useEffect } from 'react';

const TIME_FILTER_KEYS = ['dateFrom', 'dateTo', 'from', 'to', 'startDate', 'endDate', 'startTime', 'endTime'];

const stripTimeFilters = (filters) => {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
  const next = { ...filters };
  TIME_FILTER_KEYS.forEach((key) => {
    if (key in next) {
      delete next[key];
    }
  });
  return next;
};

export const usePersistedFilters = (chartKey, initialFilters = {}) => {
  const storageKey = `chart_filters_${chartKey}`;
  
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return stripTimeFilters(parsed);
      }
    } catch (error) {
    }
    return stripTimeFilters(initialFilters);
  });

  useEffect(() => {
    try {
      if (Object.keys(filters).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(filters));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
    }
  }, [filters, storageKey, chartKey]);

  return [filters, setFilters];
};

export const clearAllPersistedFilters = () => {
  const keys = Object.keys(localStorage).filter(key => key.startsWith('chart_filters_'));
  keys.forEach(key => localStorage.removeItem(key));
};
