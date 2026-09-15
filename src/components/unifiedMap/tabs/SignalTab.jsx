import React from "react";
import { SignalDistributionChart } from "../charts/signal/SignalDistributionChart";
import { TechnologyBreakdown } from "../charts/signal/TechnologyBreakdown";
import { OperatorComparisonChart } from "../charts/signal/OperatorComparisonChart";

export const SignalTab = ({ 
  locations, 
  selectedMetric, 
  thresholds, 
  expanded,
  chartRefs,
  metricLabels,
}) => {
  return (
    <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
      <SignalDistributionChart
        ref={chartRefs.distribution}
        locations={locations}
        metric={selectedMetric}
        thresholds={thresholds}
        metricLabels={metricLabels}
      />
      <TechnologyBreakdown 
        ref={chartRefs.tech}
        locations={locations}
        metricLabels={metricLabels}
      />

      <OperatorComparisonChart
        ref={chartRefs.comparison}
        locations={locations}
        metric={selectedMetric}
        thresholds={thresholds}
        showCdf={false}
        metricLabels={metricLabels}
      />
    </div>
  );
};
