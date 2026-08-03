import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from 'recharts';
import ChartCard from '../ChartCard';
import { useMonthlySamples } from '@/hooks/useDashboardData.js';
import { formatNumber } from '@/utils/chartUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const value = payload[0]?.value ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Month
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-3 text-xs font-medium text-slate-500">Samples</div>
      <div className="text-xl font-bold text-sky-600">{formatNumber(value)}</div>
    </div>
  );
};

const ActivePoint = ({ cx, cy }) => {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill="rgba(14, 165, 233, 0.14)" />
      <circle cx={cx} cy={cy} r={7} fill="#ffffff" stroke="#0ea5e9" strokeWidth={3} />
    </g>
  );
};

const MonthlySamplesChart = ({ chartFilters, onChartFiltersChange, operators, networks }) => {
  const { data, isLoading, error } = useMonthlySamples(chartFilters);

  const peakPoint = Array.isArray(data) && data.length > 0
    ? data.reduce((best, item) => ((item?.count || 0) > (best?.count || 0) ? item : best), data[0])
    : null;

  return (
    <ChartCard
      title="Monthly Sample Trends"
      dataset={data}
      exportFileName="monthly_samples"
      isLoading={isLoading}
      error={error}
      chartFilters={chartFilters}
      onChartFiltersChange={onChartFiltersChange}
      operators={operators}
      networks={networks}
      showChartFilters={true}
    >
      <div className="h-full w-full rounded-[1.5rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%),linear-gradient(180deg,_rgba(248,250,252,0.95)_0%,_rgba(255,255,255,1)_100%)] p-3 sm:p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <AreaChart data={data} margin={{ top: 18, right: 18, left: -12, bottom: 8 }}>
            <defs>
              <linearGradient id="monthlyAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.42} />
                <stop offset="55%" stopColor="#38bdf8" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#e0f2fe" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="monthlyAreaStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="rgba(148, 163, 184, 0.18)"
              strokeDasharray="4 4"
            />

            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              dy={8}
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
              tickFormatter={formatNumber}
            />

            <Tooltip
              cursor={{ stroke: '#38bdf8', strokeDasharray: '4 4', strokeOpacity: 0.45 }}
              content={<CustomTooltip />}
            />

            {peakPoint ? (
              <ReferenceDot
                x={peakPoint.month}
                y={peakPoint.count}
                r={5}
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth={2}
                label={{
                  value: formatNumber(peakPoint.count),
                  position: 'top',
                  fill: '#0f172a',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            ) : null}

            <Area
              type="monotoneX"
              dataKey="count"
              stroke="url(#monthlyAreaStroke)"
              strokeWidth={3}
              fill="url(#monthlyAreaFill)"
              isAnimationActive
              animationBegin={120}
              animationDuration={1000}
              animationEasing="ease-out"
              dot={{ r: 0 }}
              activeDot={<ActivePoint />}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default MonthlySamplesChart;
