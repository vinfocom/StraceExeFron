export const DASHBOARD_DATE_RANGE_STORAGE_KEY = 'dashboard_date_range_config';
export const DASHBOARD_DATE_RANGE_UPDATED_EVENT = 'dashboard-date-range-updated';

const DEFAULT_CONFIG = {
  dateFrom: '',
  dateTo: '',
};

const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const safeParseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeDashboardDateRangeConfig = (config) => {
  const normalized = { ...DEFAULT_CONFIG, ...(config || {}) };

  const from = safeParseDate(normalized.dateFrom);
  const to = safeParseDate(normalized.dateTo);

  normalized.dateFrom = from ? toDateInput(from) : '';
  normalized.dateTo = to ? toDateInput(to) : '';

  if (normalized.dateFrom && normalized.dateTo) {
    const fromDate = new Date(normalized.dateFrom);
    const toDate = new Date(normalized.dateTo);
    if (fromDate > toDate) {
      normalized.dateTo = normalized.dateFrom;
    }
  }

  return normalized;
};

export const loadDashboardDateRangeConfig = () => {
  try {
    const raw = localStorage.getItem(DASHBOARD_DATE_RANGE_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return normalizeDashboardDateRangeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const saveDashboardDateRangeConfig = (config) => {
  const normalized = normalizeDashboardDateRangeConfig(config);
  localStorage.setItem(DASHBOARD_DATE_RANGE_STORAGE_KEY, JSON.stringify(normalized));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_DATE_RANGE_UPDATED_EVENT, {
        detail: { config: normalized, updatedAt: Date.now() },
      }),
    );
  }

  return normalized;
};

export const resolveDashboardDateFilters = (config) => {
  const normalized = normalizeDashboardDateRangeConfig(config);
  return {
    dateFrom: normalized.dateFrom || undefined,
    dateTo: normalized.dateTo || undefined,
  };
};
