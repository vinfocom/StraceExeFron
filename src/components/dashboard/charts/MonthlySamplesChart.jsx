import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import ChartCard from '../ChartCard';
import { TOOLTIP_STYLE } from '@/components/constants/dashboardConstants';
import { useMonthlySamples } from '@/hooks/useDashboardData.js';
import { formatNumber } from '@/utils/chartUtils';

const MonthlySamplesChart = ({ chartFilters, onChartFiltersChange, operators, networks }) => {
  const { data, isLoading } = useMonthlySamples(chartFilters);

  return (
    <ChartCard
      title="Monthly Sample Trends"
      dataset={data}
      exportFileName="monthly_samples"
      isLoading={isLoading}
      chartFilters={chartFilters}
      onChartFiltersChange={onChartFiltersChange}
      operators={operators}
      networks={networks}
      showChartFilters={false}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
        <AreaChart data={data} margin={{ top: 16, right: 24, left: -10, bottom: 8 }}>
          <defs>
            <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.08)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
            tickFormatter={formatNumber}
          />
          <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} contentStyle={TOOLTIP_STYLE} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#3B82F6"
            strokeWidth={3}
            fill="url(#gradBlue)"
            dot={{ r: 3, stroke: '#3B82F6', strokeWidth: 2, fill: '#fff' }}
            activeDot={{ r: 5, stroke: '#3B82F6', strokeWidth: 2, fill: '#fff' }}
          >
            <LabelList
    dataKey="count"
    position="top"
    style={{ fill: '#374151', fontSize: 11, fontWeight: 600 }}
    formatter={(value) => formatNumber(value)} // optional
  />
            </Area >
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default MonthlySamplesChart;
