import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import StatCardSkeleton from './skeletons/StatCardSkeleton';

const StatCard = ({ title, value, icon: Icon, color, isLoading, trend, description }) => {
  if (isLoading) {
    return <StatCardSkeleton />;
  }

  return (
    <Card className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer">
      <CardContent className="p-4 sm:p-5 lg:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color} text-white shadow-lg flex-shrink-0 sm:h-14 sm:w-14`}>
            <Icon className="h-5 w-5 sm:h-7 sm:w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-clamp-1 text-2xl font-bold text-gray-900 leading-tight sm:text-3xl">
              {Number(value ?? 0).toLocaleString()}
            </p>
            <p className="text-clamp-2 text-sm text-gray-800 font-semibold mt-1">{title}</p>
            {description && (
              <p className="text-clamp-2 text-xs text-gray-500 mt-0.5">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-clamp-1 text-xs text-green-600 font-semibold">{trend}% increase</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
