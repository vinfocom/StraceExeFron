// src/pages/Dashboard.jsx
import React, { useMemo, useCallback, useState, useEffect, memo } from 'react';
import {
  RefreshCw, Users, Car, Waypoints, FileText,
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
import { useAuth } from '@/hooks/useAuth';

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
  const { user } = useAuth();

  const [monthlySamplesFilters, setMonthlySamplesFilters] = usePersistedFilters('monthlySamples');
  const [operatorSamplesFilters, setOperatorSamplesFilters] = usePersistedFilters('operatorSamples');
  const [metricFilters, setMetricFilters] = usePersistedFilters('metric');
  const [bandDistFilters] = usePersistedFilters('bandDist');
  const [indoorOutdoorFilters, setIndoorOutdoorFilters] = usePersistedFilters('indoorOutdoor');
  const [coverageRankingFilters, setCoverageRankingFilters] = usePersistedFilters('coverageRanking');

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

  const totalLocationSamples = useMemo(() => {
    return (Number(indoorCount) || 0) + (Number(outdoorCount) || 0);
  }, [indoorCount, outdoorCount]);

  const isKPILoading = isTotalsLoading || isOperatorsLoading || isBandCountLoading || isIndoorLoading || isOutdoorLoading;

  const firstName = useMemo(() => {
    const rawName =
      user?.firstName ||
      user?.firstname ||
      user?.first_name ||
      user?.FirstName ||
      user?.name ||
      user?.Name ||
      user?.username ||
      user?.Username ||
      'User';

    return String(rawName).trim().split(/\s+/)[0] || 'User';
  }, [user]);

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

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await refreshDashboard();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refreshDashboard]);

  const handleMonthlySamplesFilterChange = useCallback((filters) => {
    setMonthlySamplesFilters(filters);
  }, [setMonthlySamplesFilters]);

  const handleOperatorSamplesFilterChange = useCallback((filters) => {
    setOperatorSamplesFilters(filters);
  }, [setOperatorSamplesFilters]);

  const handleMetricFilterChange = useCallback((filters) => {
    setMetricFilters(filters);
  }, [setMetricFilters]);

  const handleIndoorOutdoorFilterChange = useCallback((filters) => {
    setIndoorOutdoorFilters(filters);
  }, [setIndoorOutdoorFilters]);

  const handleCoverageRankingFilterChange = useCallback((filters) => {
    setCoverageRankingFilters(filters);
  }, [setCoverageRankingFilters]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-blue-100/70">
      <div className="mx-auto max-w-[1920px] space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
        <div className="overflow-hidden rounded-[2rem] border border-sky-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.98)_52%,rgba(224,242,254,0.92)_100%)] p-4 shadow-[0_18px_55px_rgba(14,165,233,0.10)] sm:p-5 lg:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-clamp-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Hey {firstName}
              </p>
              <p className="text-clamp-2 text-sm font-medium text-slate-600 sm:text-base">
                Your latest insights are ready.
              </p>
            </div>

            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className={`
                inline-flex items-center gap-2 rounded-full border px-4 py-2.5
                text-sm font-semibold shadow-sm transition-all
                ${isRefreshing
                  ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'border-sky-200 bg-white/90 text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700'
                }
              `}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh All'}
            </button>
          </div>

          <div className="rounded-[1.5rem] border border-white/80 bg-white/70 p-3 backdrop-blur-sm sm:p-4 lg:p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 sm:gap-6">
              {isKPILoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="min-w-0">
                    <StatCardSkeleton />
                  </div>
                ))
              ) : (
                stats.map(s => (
                  <div key={s.title} className="min-w-0">
                    <MemoizedStatCard {...s} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

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
          {chartStage >= 3 && (
            <MemoizedHolesScatterChart
              chartFilters={indoorOutdoorFilters}
              onChartFiltersChange={handleIndoorOutdoorFilterChange}
            />
          )}
          {chartStage >= 3 && (
            <MemoizedQualityRankingChart
              chartFilters={coverageRankingFilters}
              onChartFiltersChange={handleCoverageRankingFilterChange}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
