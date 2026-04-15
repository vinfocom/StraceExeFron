export const calculateStats = (locations, metric) => {
  if (!locations?.length) return null;

  const values = locations
    .map(loc => loc[metric])
    .filter(val => val != null && !isNaN(val) && val !== '');

  if (!values.length) return null;

  // Convert all values to numbers
  const numericValues = values.map(val => Number(val));
  
  const sorted = [...numericValues].sort((a, b) => a - b);
  const sum = numericValues.reduce((acc, val) => acc + val, 0);
  const avg = sum / numericValues.length;
  const mid = Math.floor(sorted.length / 2);
  
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return {
    avg: Number(avg.toFixed(2)),
    min: Number(Math.min(...numericValues).toFixed(2)),
    max: Number(Math.max(...numericValues).toFixed(2)),
    median: Number(median.toFixed(2)),
    count: numericValues.length,
  };
};

export const calculateIOSummary = (logArea) => {
  if (!logArea || typeof logArea !== "object") return null;

  const normalizeIOLabel = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return null;

    const beforeBracket = raw.split("(")[0].trim();
    if (!beforeBracket) return null;

    if (["ouotdot", "outdot", "oudoor", "outdor"].includes(beforeBracket)) {
      return "outdoor";
    }
    if (["indor", "indoorr", "inodor"].includes(beforeBracket)) {
      return "indoor";
    }

    if (beforeBracket.includes("indoor")) return "indoor";
    if (beforeBracket.includes("outdoor")) return "outdoor";
    if (beforeBracket === "in") return "indoor";
    if (beforeBracket === "out") return "outdoor";
    return null;
  };

  const toCount = (value) => {
    const parsed = Number(
      value?.inputCount ??
        value?.InputCount ??
        value?.count ??
        value?.Count ??
        value?.outputCount ??
        value?.OutputCount ??
        0,
    );
    return Number.isFinite(parsed) ? parsed : 0;
  };

  let totalIndoor = 0;
  let totalOutdoor = 0;

  Object.entries(logArea).forEach(([key, session]) => {
    if (!session || typeof session !== "object") return;

    const hasNestedBuckets = session.Indoor || session.Outdoor;
    if (hasNestedBuckets) {
      totalIndoor += toCount(session.Indoor);
      totalOutdoor += toCount(session.Outdoor);
      return;
    }

    const label = normalizeIOLabel(key);
    const count = toCount(session);
    if (label === "indoor") totalIndoor += count;
    if (label === "outdoor") totalOutdoor += count;
  });

  return {
    indoor: totalIndoor,
    outdoor: totalOutdoor,
    total: totalIndoor + totalOutdoor,
  };
};

export const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
};

export const filterValidData = (data, field) => {
  return data.filter(item => {
    const name = item[field]?.toLowerCase() || '';
    return !name.includes('unknown') && !name.includes('no service');
  });
};

export const buildCdfRows = (
  providerValuesMap,
  bucketCount = 80,
  options = {},
) => {
  const direction = options?.direction === "desc" ? "desc" : "asc";
  const providerEntries = Object.entries(providerValuesMap || {})
    .map(([operator, values]) => ({
      operator,
      values: Array.isArray(values)
        ? [...values].sort((a, b) => (direction === "desc" ? b - a : a - b))
        : [],
    }))
    .filter((entry) => entry.values.length > 0);

  if (!providerEntries.length) {
    return { rows: [], series: [], min: null, max: null };
  }

  const allValues = providerEntries.flatMap((entry) => entry.values);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);

  const xValues = [];
  if (min === max) {
    xValues.push(min);
  } else {
    const buckets = Math.max(20, Math.min(bucketCount, allValues.length));
    const step = (max - min) / (buckets - 1);
    for (let i = 0; i < buckets; i++) {
      xValues.push(direction === "desc" ? max - step * i : min + step * i);
    }
  }

  const pointers = providerEntries.reduce((acc, entry) => {
    acc[entry.operator] = 0;
    return acc;
  }, {});

  const rows = xValues.map((x) => {
    const row = { rsrp: parseFloat(x.toFixed(2)) };
    providerEntries.forEach((entry) => {
      let idx = pointers[entry.operator];
      if (direction === "desc") {
        while (idx < entry.values.length && entry.values[idx] >= x) idx++;
      } else {
        while (idx < entry.values.length && entry.values[idx] <= x) idx++;
      }
      pointers[entry.operator] = idx;
      row[entry.operator] = parseFloat(
        ((idx / entry.values.length) * 100).toFixed(2),
      );
    });
    return row;
  });

  const series = providerEntries.map((entry) => ({
    operator: entry.operator,
    samples: entry.values.length,
  }));

  return { rows, series, min, max };
};
