import { toast } from "react-toastify";

export const canonicalOperatorName = (raw) => {
  if (!raw && raw !== 0) return 'Unknown';
  let s = String(raw).trim();
  s = s.replace(/^IND[-\s]*/i, '');
  const lower = s.toLowerCase();
  if (lower === '//////' || lower === '404011') return 'Unknown';
  if (lower.includes('jio')) return 'JIO';
  if (lower.includes('airtel')) return 'Airtel';
  if (lower.includes('vodafone') || lower.startsWith('vi')) return 'Vi (Vodafone Idea)';
  if (lower.includes('bsnl')) return 'BSNL';
  return s;
};

export const toNumber = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const ensureNegative = (v) => {
  const n = toNumber(v, 0);
  if (!Number.isFinite(n)) return 0;
  return n > 0 ? -n : n;
};

export const groupOperatorSamplesByNetwork = (raw) => {
  if (!Array.isArray(raw)) return [];
  
  const grouped = new Map();
  
  for (const item of raw) {
    const operator = canonicalOperatorName(item?.operatorName || item?.name);
    const network = String(item?.network || '').trim();
    const count = toNumber(item?.value);
    
    if (!operator || !network) continue;
    
    if (!grouped.has(operator)) {
      grouped.set(operator, { name: operator });
    }
    
    const opData = grouped.get(operator);
    opData[network] = (opData[network] || 0) + count;
  }
  
  const result = Array.from(grouped.values()).map(op => ({
    ...op,
    total: Object.entries(op)
      .filter(([k]) => k !== 'name' && k !== 'total')
      .reduce((sum, [, v]) => sum + v, 0)
  }));
  
  return result.sort((a, b) => b.total - a.total);
};

export const buildRanking = (raw, { nameKey = 'name', countKey = 'count' } = {}) => {
  if (!Array.isArray(raw)) return [];
  const merged = new Map();
  for (const r of raw) {
    const name = canonicalOperatorName(r?.[nameKey]);
    const c = toNumber(r?.[countKey]);
    merged.set(name, (merged.get(name) || 0) + c);
  }
  const arr = [...merged.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return arr.map((x, i) => ({ ...x, rank: i + 1, label: `#${i + 1} ${x.name}` }));
};

export const sanitizeFileName = (s = 'chart') => 
  s.replace(/[^\w\d-_]+/g, '_').slice(0, 64);

export const downloadCSVFromData = (data = [], filename = 'data.csv') => {
  if (!Array.isArray(data) || data.length === 0) {
    toast.info("No data to export");
    return;
  }
  
  const cols = Array.from(
    data.reduce((set, row) => {
      Object.keys(row || {}).forEach(k => {
        const v = row[k];
        if (typeof v !== 'object' && typeof v !== 'function') set.add(k);
      });
      return set;
    }, new Set())
  );

  const escapeCsv = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [cols.join(',')];
  for (const row of data) {
    lines.push(cols.map(c => escapeCsv(row[c])).join(','));
  }
  
  const csvBlob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(csvBlob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const buildQueryString = (filters) => {
  const params = {};

  if (filters?.operators?.length > 0) {
    params.operatorName = filters.operators.join(',');
  }

  if (filters?.networks?.length > 0) {
    params.networkType = filters.networks.join(',');
  }

  if (filters?.dateFrom) {
    params.from = new Date(filters.dateFrom).toISOString();
  }

  if (filters?.dateTo) {
    params.to = new Date(filters.dateTo).toISOString();
  }

  return params;
};

export const applyTopN = (data, topN) => {
  if (!topN || topN === -1) return data;
  return data?.slice(0, topN) || [];
};
