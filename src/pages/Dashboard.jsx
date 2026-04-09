// src/pages/Dashboard.jsx
import React, { useMemo, useCallback, useState, useEffect, memo } from 'react';
import { 
  BarChart2, RefreshCw, Users, Car, Waypoints, FileText, 
  Wifi, Layers, Home, MapPin 
} from 'lucide-react';

import MonthlySamplesChart from '@/components/dashboard/charts/MonthlySamplesChart';
import OperatorNetworkChart from '@/components/dashboard/charts/OperatorNetworkChart';
import MetricChart from '@/components/dashboard/charts/BoxPlotChartSimple';
import BandDistributionChart from '@/components/dashboard/charts/BandDistributionChart';
import HandsetPerformanceChart from '@/components/dashboard/charts/HandsetPerformanceChart';
import QualityRankingChart from '@/components/dashboard/charts/QualityRankingChart';
import StatCardSkeleton from '@/components/dashboard/skeletons/StatCardSkeleton';
import { StatCard } from '@/components/dashboard';
import AppChart from '@/components/dashboard/charts/AppChart';
import HolesScatterChart from '@/components/dashboard/charts/IndoorOutdoorBarChart';

import { 
  useTotals, 
  useOperatorsAndNetworks, 
  useBandCount,
  useIndoorCount,
  useOutdoorCount,
  useRefreshDashboard
} from '@/hooks/useDashboardData.js';

import { usePersistedFilters } from '@/hooks/usePersistedFilters';

// ✅ Memoized components to prevent unnecessary re-renders
const MemoizedStatCard = memo(StatCard);
const MemoizedMonthlySamplesChart = memo(MonthlySamplesChart);
const MemoizedOperatorNetworkChart = memo(OperatorNetworkChart);
const MemoizedAppChart = memo(AppChart);
const MemoizedMetricChart = memo(MetricChart);
const MemoizedBandDistributionChart = memo(BandDistributionChart);
const MemoizedHandsetPerformanceChart = memo(HandsetPerformanceChart);
const MemoizedQualityRankingChart = memo(QualityRankingChart);
const MemoizedHolesScatterChart = memo(HolesScatterChart);

const DashboardPage = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartStage, setChartStage] = useState(1);

  // Persisted filters for each chart
  const [monthlySamplesFilters, setMonthlySamplesFilters] = usePersistedFilters('monthlySamples');
  const [operatorSamplesFilters, setOperatorSamplesFilters] = usePersistedFilters('operatorSamples');
  const [metricFilters, setMetricFilters] = usePersistedFilters('metric');
  const [bandDistFilters] = usePersistedFilters('bandDist');

  // ✅ Fetch ONLY KPI data on initial load - no chart data yet
  const { data: totalsData, isLoading: isTotalsLoading } = useTotals();
  const { operators, networks, operatorCount, isLoading: isOperatorsLoading } = useOperatorsAndNetworks();
  const { data: bandCount, isLoading: isBandCountLoading } = useBandCount();
  const { data: indoorCount, isLoading: isIndoorLoading } = useIndoorCount();
  const { data: outdoorCount, isLoading: isOutdoorLoading } = useOutdoorCount();
  
  const refreshDashboard = useRefreshDashboard();

  useEffect(() => {
    const t1 = setTimeout(() => setChartStage(2), 700);
    const t2 = setTimeout(() => setChartStage(3), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Calculate total samples
  const totalLocationSamples = useMemo(() => {
    return (Number(indoorCount) || 0) + (Number(outdoorCount) || 0);
  }, [indoorCount, outdoorCount]);

  // Check if any KPI data is loading
  const isKPILoading = isTotalsLoading || isOperatorsLoading || isBandCountLoading || isIndoorLoading || isOutdoorLoading;

  const stats = useMemo(() => {
    const totals = totalsData || {};
    
    return [
      {
        title: "Total Users",
        value: totals.totalUsers ?? totals.TotalUsers ?? 0,
        icon: Users,
        color: "bg-gradient-to-br from-purple-500 to-purple-600",
        description: "Registered users"
      },
      {
        title: "Drive Sessions",
        value: totals.totalSessions ?? totals.TotalSessions ?? 0,
        icon: Car,
        color: "bg-gradient-to-br from-teal-500 to-teal-600",
        description: "Total drive sessions"
      },
      {
        title: "Online Sessions",
        value: totals.totalOnlineSessions ?? totals.TotalOnlineSessions ?? 0,
        icon: Waypoints,
        color: "bg-gradient-to-br from-orange-500 to-orange-600",
        description: "Currently active"
      },
      {
        title: "Total Samples",
        value: totalLocationSamples,
        icon: FileText,
        color: "bg-gradient-to-br from-amber-500 to-amber-600",
        description: "Network log samples"
      },
      {
        title: "Operators",
        value: operatorCount || 0,
        icon: Wifi,
        color: "bg-gradient-to-br from-sky-500 to-sky-600",
        description: "Unique network operators"
      },
      {
        title: "Bands",
        value: bandCount || 0,
        icon: Layers,
        color: "bg-gradient-to-br from-indigo-500 to-indigo-600",
        description: "Frequency bands detected"
      },
      {
        title: "Indoor Samples",
        value: indoorCount || 0,
        icon: Home,
        color: "bg-gradient-to-br from-green-500 to-green-600",
        description: "Indoor measurements"
      },
      {
        title: "Outdoor Samples",
        value: outdoorCount || 0,
        icon: MapPin,
        color: "bg-gradient-to-br from-blue-500 to-blue-600",
        description: "Outdoor measurements"
      },
    ];
  }, [totalsData, operatorCount, bandCount, indoorCount, outdoorCount, totalLocationSamples]);

  // ✅ Optimized refresh without page reload
  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    
    try {
      // Trigger SWR revalidation
      await refreshDashboard();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refreshDashboard]);

  // ✅ Stable filter handlers
  const handleMonthlySamplesFilterChange = useCallback((filters) => {
    setMonthlySamplesFilters(filters);
  }, [setMonthlySamplesFilters]);

  const handleOperatorSamplesFilterChange = useCallback((filters) => {
    setOperatorSamplesFilters(filters);
  }, [setOperatorSamplesFilters]);

  const handleMetricFilterChange = useCallback((filters) => {
    setMetricFilters(filters);
  }, [setMetricFilters]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <div className="max-w-[1920px] mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
       
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <BarChart2 className="h-6 w-6 text-white" />
              </div>
              Dashboard Analytics
            </h1>
          </div>
          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className={`
              px-5 py-2.5 rounded-lg border-2 flex items-center gap-2 
              transition-all font-medium shadow-sm
              ${isRefreshing 
                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50 hover:shadow-md'
              }
            `}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="flex flex-wrap gap-4 sm:gap-6">
          {isKPILoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-1 min-w-[240px] sm:min-w-[280px] max-w-[320px]">
                <StatCardSkeleton />
              </div>
            ))
          ) : (
            stats.map(s => (
              <div key={s.title} className="flex-1 min-w-[240px] sm:min-w-[280px] max-w-[320px]">
                <MemoizedStatCard {...s} />
              </div>
            ))
          )}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {chartStage >= 1 && (
            <MemoizedMonthlySamplesChart
              chartFilters={monthlySamplesFilters}
              onChartFiltersChange={handleMonthlySamplesFilterChange}
              operators={operators}
              networks={networks}
            />
          )}

          {chartStage >= 1 && (
            <MemoizedOperatorNetworkChart
              chartFilters={operatorSamplesFilters}
              onChartFiltersChange={handleOperatorSamplesFilterChange}
              operators={operators}
              networks={networks}
            />
          )}

          {chartStage >= 2 && <MemoizedAppChart />}

          {chartStage >= 2 && (
            <MemoizedMetricChart
              chartFilters={metricFilters}
              onChartFiltersChange={handleMetricFilterChange}
              operators={operators}
              networks={networks}
            />
          )}

          {chartStage >= 2 && (
            <MemoizedBandDistributionChart
              filters={bandDistFilters}
            />
          )}

          {chartStage >= 3 && <MemoizedHandsetPerformanceChart />}

          {chartStage >= 3 && <MemoizedHolesScatterChart />}

          {chartStage >= 3 && <MemoizedQualityRankingChart />}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
