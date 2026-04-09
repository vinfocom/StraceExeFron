// src/hooks/useBestNetworkCalculation.js
import { useMemo } from 'react';

// ============================================
// EXPORTS - Make sure these are exported
// ============================================
export const DEFAULT_WEIGHTS = {
  rsrp: 0.25,
  rsrq: 0.15,
  sinr: 0.25,
  dl_tpt: 0.20,
  ul_tpt: 0.10,
  mos: 0.05,
};

export const statisticalHelpers = {
  median: (arr) => {
    if (!arr?.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },

  percentile: (arr, p) => {
    if (!arr?.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  },

  removeOutliers: (arr, multiplier = 1.5) => {
    if (!arr?.length || arr.length < 4) return arr;
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - iqr * multiplier;
    const upper = q3 + iqr * multiplier;
    return arr.filter((v) => v >= lower && v <= upper);
  },

  average: (arr) => {
    if (!arr?.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },
};

// ============================================
// METRIC CONFIGURATION
// ============================================
const METRIC_RANGES = {
  rsrp: { min: -140, max: -44 },
  rsrq: { min: -20, max: -3 },
  sinr: { min: -10, max: 30 },
  dl_tpt: { min: 0, max: 500 },
  ul_tpt: { min: 0, max: 100 },
  mos: { min: 1, max: 5 },
  lte_bler: { min: 0, max: 100, inverse: true },
};

// ============================================
// PROVIDER COLORS
// ============================================
const PROVIDER_COLORS = {
  // Jio variants
  JIO: "#3B82F6",
  jio: "#3B82F6",
  Jio: "#3B82F6",
  "Jio True5G": "#3B82F6",
  "JIO 4G": "#3B82F6",
  JIO4G: "#3B82F6",
  "IND-JIO": "#3B82F6",
  "IND JIO": "#3B82F6",
  
  // Airtel variants
  "IND airtel": "#EF4444",
  "IND Airtel": "#EF4444",
  airtel: "#EF4444",
  Airtel: "#EF4444",
  AIRTEL: "#EF4444",
  "Airtel 5G": "#EF4444",
  "IND AIRTEL": "#EF4444",
  
  // VI variants
  "VI India": "#22C55E",
  "Vi India": "#22C55E",
  VI: "#22C55E",
  Vi: "#22C55E",
  vi: "#22C55E",
  "Vodafone IN": "#22C55E",
  Vodafone: "#22C55E",
  Idea: "#22C55E",
  
  // BSNL
  BSNL: "#F59E0B",
  bsnl: "#F59E0B",
  Bsnl: "#F59E0B",
  
  // Default
  Unknown: "#6B7280",
};

// ============================================
// HELPER FUNCTIONS
// ============================================
export const getProviderColor = (provider) => {
  if (!provider) return PROVIDER_COLORS.Unknown;
  
  // Direct match
  if (PROVIDER_COLORS[provider]) {
    return PROVIDER_COLORS[provider];
  }
  
  // Case-insensitive partial match
  const lowerProvider = provider.toLowerCase();
  if (lowerProvider.includes('jio')) return "#3B82F6";
  if (lowerProvider.includes('airtel')) return "#EF4444";
  if (lowerProvider.includes('vi') || lowerProvider.includes('vodafone') || lowerProvider.includes('idea')) return "#22C55E";
  if (lowerProvider.includes('bsnl')) return "#F59E0B";
  
  return PROVIDER_COLORS.Unknown;
};

const normalizeValue = (value, metric) => {
  const range = METRIC_RANGES[metric];
  if (!range || value == null || isNaN(value)) return null;

  let normalized = (value - range.min) / (range.max - range.min);
  normalized = Math.max(0, Math.min(1, normalized));

  // Invert for metrics where lower is better (e.g., BLER)
  if (range.inverse) {
    normalized = 1 - normalized;
  }

  return normalized;
};

const calculateNetworkScore = (point, weights, minMetrics = 2) => {
  let totalWeight = 0;
  let weightedSum = 0;
  let metricsUsed = 0;

  Object.entries(weights).forEach(([metric, weight]) => {
    if (weight <= 0) return;

    const value = parseFloat(point[metric]);
    if (value == null || isNaN(value)) return;

    const normalized = normalizeValue(value, metric);
    if (normalized == null) return;

    weightedSum += normalized * weight;
    totalWeight += weight;
    metricsUsed++;
  });

  if (totalWeight === 0 || metricsUsed < minMetrics) return null;

  return (weightedSum / totalWeight) * 100; // Scale to 0-100
};

// Check if a point is inside a polygon using ray casting algorithm
export const isPointInPolygon = (point, polygon) => {
  const path = polygon?.paths?.[0];
  if (!path?.length) return false;

  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

// Calculate best network for a single polygon
export const calculatePolygonBestNetwork = (polygon, allPoints, weights, options = {}) => {
  const {
    minSamples = 3,
    minMetrics = 2,
    removeOutliersEnabled = true,
    outlierMultiplier = 1.5,
    calculationMethod = 'median',
    percentileValue = 50,
  } = options;

  // Step 1: Filter points that are INSIDE this polygon
  const pointsInside = allPoints.filter((pt) => isPointInPolygon(pt, polygon));

  // No points inside this polygon
  if (pointsInside.length === 0) {
    return {
      ...polygon,
      pointCount: 0,
      bestProvider: null,
      bestScore: null,
      fillColor: "#cccccc",
      fillOpacity: 0.3,
      strokeWeight: 2,
      providerBreakdown: {},
      hasEnoughData: false,
    };
  }

  // Step 2: Group points by provider and calculate scores
  const providerGroups = {};

  pointsInside.forEach((pt) => {
    const provider = pt.provider?.trim() || "Unknown";
    const score = calculateNetworkScore(pt, weights, minMetrics);

    if (!providerGroups[provider]) {
      providerGroups[provider] = {
        count: 0,
        scores: [],
        metrics: {
          rsrp: [],
          rsrq: [],
          sinr: [],
          dl_tpt: [],
          ul_tpt: [],
          mos: [],
          lte_bler: [],
        },
      };
    }

    providerGroups[provider].count++;

    if (score != null && !isNaN(score)) {
      providerGroups[provider].scores.push(score);
    }

    // Collect individual metric values
    Object.keys(providerGroups[provider].metrics).forEach((metric) => {
      const val = parseFloat(pt[metric]);
      if (!isNaN(val)) {
        providerGroups[provider].metrics[metric].push(val);
      }
    });
  });

  // Step 3: Calculate stats for each provider and find the best
  let bestProvider = null;
  let bestScore = -Infinity;
  const providerBreakdown = {};

  Object.entries(providerGroups).forEach(([provider, data]) => {
    // Check if provider has enough samples
    const hasEnoughSamples = data.count >= minSamples && data.scores.length >= minSamples;
    
    // Process scores (optionally remove outliers)
    let scoresToUse = data.scores;
    if (removeOutliersEnabled && scoresToUse.length >= 4) {
      scoresToUse = statisticalHelpers.removeOutliers(scoresToUse, outlierMultiplier);
    }

    // Calculate representative score based on method
    let representativeScore = null;
    if (scoresToUse.length > 0) {
      switch (calculationMethod) {
        case 'average':
          representativeScore = statisticalHelpers.average(scoresToUse);
          break;
        case 'percentile':
          representativeScore = statisticalHelpers.percentile(scoresToUse, percentileValue);
          break;
        case 'median':
        default:
          representativeScore = statisticalHelpers.median(scoresToUse);
      }
    }

    // Calculate metric statistics
    const metricStats = {};
    Object.entries(data.metrics).forEach(([metric, values]) => {
      if (values.length > 0) {
        let valuesToUse = values;
        if (removeOutliersEnabled && values.length >= 4) {
          valuesToUse = statisticalHelpers.removeOutliers(values, outlierMultiplier);
        }
        metricStats[metric] = {
          median: statisticalHelpers.median(valuesToUse),
          average: statisticalHelpers.average(valuesToUse),
          count: values.length,
          min: Math.min(...valuesToUse),
          max: Math.max(...valuesToUse),
        };
      }
    });

    // Store provider breakdown
    providerBreakdown[provider] = {
      count: data.count,
      color: getProviderColor(provider),
      medianScore: representativeScore,
      avgScore: statisticalHelpers.average(scoresToUse),
      metrics: metricStats,
      hasEnoughSamples,
      scoresUsed: scoresToUse.length,
    };

    // Update best provider (only if has enough samples)
    if (hasEnoughSamples && representativeScore != null && representativeScore > bestScore) {
      bestScore = representativeScore;
      bestProvider = provider;
    }
  });

  // If no provider has enough samples, pick the one with most samples
  if (!bestProvider && Object.keys(providerBreakdown).length > 0) {
    const sortedByCount = Object.entries(providerBreakdown)
      .filter(([_, d]) => d.medianScore != null)
      .sort((a, b) => b[1].count - a[1].count);
    
    if (sortedByCount.length > 0) {
      bestProvider = sortedByCount[0][0];
      bestScore = sortedByCount[0][1].medianScore;
    }
  }

  // Determine fill color based on best provider
  const fillColor = bestProvider ? getProviderColor(bestProvider) : "#cccccc";

  return {
    ...polygon,
    pointCount: pointsInside.length,
    bestProvider,
    bestScore: bestScore === -Infinity ? null : bestScore,
    fillColor,
    fillOpacity: 0.65,
    strokeWeight: 3,
    providerBreakdown,
    hasEnoughData: pointsInside.length >= minSamples,
  };
};

// ============================================
// MAIN HOOK
// ============================================
export const useBestNetworkCalculation = (
  locations = [],
  weights = DEFAULT_WEIGHTS,
  enabled = false,
  options = {},
  areaPolygons = []
) => {
  const {
    minSamples = 3,
    minMetrics = 2,
    removeOutliersEnabled = true,
    outlierMultiplier = 1.5,
    calculationMethod = 'median',
    percentileValue = 50,
  } = options;

  // Process each polygon individually
  const processedPolygons = useMemo(() => {
    if (!enabled) {
      return [];
    }

    if (!areaPolygons?.length) {
      return [];
    }

    if (!locations?.length) {
      return areaPolygons.map((p) => ({
        ...p,
        pointCount: 0,
        bestProvider: null,
        bestScore: null,
        fillColor: "#cccccc",
        fillOpacity: 0.3,
        providerBreakdown: {},
        hasEnoughData: false,
      }));
    }

    // Process each polygon
    const results = areaPolygons.map((polygon) => {
      return calculatePolygonBestNetwork(polygon, locations, weights, {
        minSamples,
        minMetrics,
        removeOutliersEnabled,
        outlierMultiplier,
        calculationMethod,
        percentileValue,
      });
    });

    return results;
  }, [
    enabled,
    areaPolygons,
    locations,
    weights,
    minSamples,
    minMetrics,
    removeOutliersEnabled,
    outlierMultiplier,
    calculationMethod,
    percentileValue,
  ]);

  // Calculate overall statistics (how many zones each provider wins)
  const stats = useMemo(() => {
    if (!enabled || !processedPolygons?.length) return {};

    const providerWins = {};
    let totalPolygonsWithData = 0;

    processedPolygons.forEach((polygon) => {
      if (polygon.bestProvider && polygon.hasEnoughData) {
        totalPolygonsWithData++;

        if (!providerWins[polygon.bestProvider]) {
          providerWins[polygon.bestProvider] = {
            locationsWon: 0,
            totalPoints: 0,
            scores: [],
            color: getProviderColor(polygon.bestProvider),
          };
        }

        providerWins[polygon.bestProvider].locationsWon++;
        providerWins[polygon.bestProvider].totalPoints += polygon.pointCount;
        if (polygon.bestScore != null) {
          providerWins[polygon.bestProvider].scores.push(polygon.bestScore);
        }
      }
    });

    // Calculate percentages
    Object.keys(providerWins).forEach((provider) => {
      const data = providerWins[provider];
      data.percentage = totalPolygonsWithData > 0
        ? (data.locationsWon / totalPolygonsWithData) * 100
        : 0;
      data.avgWinningScore = statisticalHelpers.average(data.scores);
    });

    return providerWins;
  }, [enabled, processedPolygons]);

  // Provider colors from all locations
  const providerColors = useMemo(() => {
    if (!locations?.length) return {};

    const colors = {};
    const providers = [...new Set(
      locations.map((p) => p.provider?.trim()).filter(Boolean)
    )];

    providers.forEach((provider) => {
      colors[provider] = getProviderColor(provider);
    });

    return colors;
  }, [locations]);

  // Summary
  const summary = useMemo(() => {
    if (!enabled || !stats || Object.keys(stats).length === 0) return null;

    const sortedProviders = Object.entries(stats)
      .sort((a, b) => b[1].locationsWon - a[1].locationsWon);

    if (!sortedProviders.length) return null;

    const [topProvider, topData] = sortedProviders[0];

    return {
      topProvider,
      zonesWon: topData.locationsWon,
      totalZones: processedPolygons.filter((p) => p.hasEnoughData).length,
      winPercentage: topData.percentage,
      providerRanking: sortedProviders.map(([name, data]) => ({
        name,
        zonesWon: data.locationsWon,
        percentage: data.percentage,
        avgScore: data.avgWinningScore,
        color: data.color,
      })),
    };
  }, [enabled, stats, processedPolygons]);

  return {
    processedPolygons,
    stats,
    providerColors,
    summary,
  };
};

// Default export
export default useBestNetworkCalculation;