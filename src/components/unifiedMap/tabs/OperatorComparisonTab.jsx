import React from "react";
import { OperatorComparisonChart } from "../charts/signal/OperatorComparisonChart";

export const OperatorComparisonTab = ({ locations, chartRefs, expanded = false }) => {
  return (
    <div className="grid grid-cols-1 gap-4">
      <OperatorComparisonChart
        ref={chartRefs?.operator}
        locations={locations}
        separateMetricCharts
        showAllMetrics
        individualStatMode
        wrapMetricCharts={expanded}
        highContrastText
      />
    </div>
  );
};
