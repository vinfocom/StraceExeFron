import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ChartCardSkeleton = () => (
  <Card className="bg-white border-gray-200 shadow-sm">
    <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </CardHeader>
    <CardContent className="h-[380px] p-6">
      <div className="space-y-4 h-full flex flex-col justify-end">
        {[24, 32, 20, 28, 16].map((h, i) => (
          <Skeleton key={i} className={`h-${h} w-full`} />
        ))}
      </div>
    </CardContent>
  </Card>
);

export default ChartCardSkeleton;