import React from "react";
import { BandDistributionChart } from "../charts/network/BandDistributionChart";
import { OperatorComparisonChart } from "../charts/network/OperatorComparisonChart";
import { PciColorLegend } from "../charts/network/PciColorLegend";
import { ProviderPerformanceChart } from "../charts/network/ProviderPerformanceChart";

export const NetworkTab = ({ locations, expanded, chartRefs, metricLabels }) => {
  return (
    <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
      <PciColorLegend 
        ref={chartRefs.pciColorLegend}
        locations={locations}
        metricLabels={metricLabels}
      />
      <ProviderPerformanceChart 
        ref={chartRefs.providerPerf}
        locations={locations}
        metricLabels={metricLabels}
      />
    </div>
  );
};
