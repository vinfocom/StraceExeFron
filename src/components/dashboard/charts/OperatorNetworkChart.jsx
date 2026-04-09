import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Settings, Activity, BarChart3 } from "lucide-react";
import ChartCard from "../ChartCard";
import {
  useOperatorMetrics,
  useOperatorsAndNetworks,
} from "@/hooks/useDashboardData.js";
import { formatNumber } from "@/utils/chartUtils";
import Spinner from "@/components/common/Spinner";
import {
  getProviderColor,
  normalizeProviderName,
  getTechnologyColor,
  normalizeTechName,
  COLOR_SCHEMES,
} from "@/utils/colorUtils";

const FALLBACK_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#7d1b49",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#EC4899",
  "#84CC16",
  "#F97316",
  "#6366F1",
];

const NEGATIVE_VALUE_METRICS = ["rsrp", "rsrq"];

const isValidName = (name) => {
  if (!name || typeof name !== "string") return false;
  const cleanName = name.toLowerCase().trim();
  return (
    cleanName !== "" &&
    cleanName !== "unknown" &&
    cleanName !== "null" &&
    cleanName !== "undefined" &&
    cleanName !== "n/a" &&
    cleanName !== "na" &&
    cleanName !== "-" &&
    cleanName !== "000 000" &&
    cleanName !== "000000" &&
    !/^0+[\s]*0*$/.test(cleanName) &&
    !/^[\s0\-]+$/.test(cleanName) &&
    !cleanName.includes("unknown") &&
    cleanName.length > 1
  );
};

const hasValidValue = (value) => {
  return typeof value === "number" && !isNaN(value) && value !== 0;
};

const getChartTechColor = (tech, index) => {
  const color = getTechnologyColor(tech);
  if (color) return color;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

const METRICS = {
  samples: {
    label: "Sample Count",
    unit: "samples",
    yAxisLabel: "Samples",
    format: (val) => formatNumber(val),
    icon: Activity,
    reversed: false,
  },
  rsrp: {
    label: "RSRP",
    unit: "dBm",
    yAxisLabel: "RSRP (dBm)",
    format: (val) => `${val?.toFixed(1) || 0} dBm`,
    icon: Activity,
    reversed: true,
  },
  rsrq: {
    label: "RSRQ",
    unit: "dB",
    yAxisLabel: "RSRQ (dB)",
    format: (val) => `${val?.toFixed(1) || 0} dB`,
    icon: Activity,
    reversed: true,
  },
  sinr: {
    label: "SINR",
    unit: "dB",
    yAxisLabel: "SINR (dB)",
    format: (val) => `${val?.toFixed(1) || 0} dB`,
    icon: Activity,
    reversed: false,
  },
  mos: {
    label: "MOS",
    unit: "",
    yAxisLabel: "MOS Score",
    format: (val) => val?.toFixed(2) || "0",
    icon: Activity,
    reversed: false,
  },
  jitter: {
    label: "Jitter",
    unit: "ms",
    yAxisLabel: "Jitter (ms)",
    format: (val) => `${val?.toFixed(1) || 0} ms`,
    icon: Activity,
    reversed: false,
  },
  latency: {
    label: "Latency",
    unit: "ms",
    yAxisLabel: "Latency (ms)",
    format: (val) => `${val?.toFixed(1) || 0} ms`,
    icon: Activity,
    reversed: false,
  },
  packetLoss: {
    label: "Packet Loss",
    unit: "",
    yAxisLabel: "Packet Loss (%)",
    format: (val) => `${val?.toFixed(2) || 0}`,
    icon: Activity,
    reversed: false,
  },
};

const OperatorNetworkChart = ({ chartFilters, onChartFiltersChange }) => {
  const {
    operators: apiOperators,
    networks: apiNetworks,
    isLoading: metaLoading,
  } = useOperatorsAndNetworks();

  const [selectedMetric, setSelectedMetric] = useState("samples");

  const { data: allData, isLoading } = useOperatorMetrics(selectedMetric, chartFilters || {});

 

  // 
  const availableTechnologies = useMemo(() => {
    if (!apiNetworks || !Array.isArray(apiNetworks)) return [];
    return apiNetworks.filter((tech) => {
      if (!isValidName(tech)) return false;
      const normalized = normalizeTechName(tech);
      return normalized !== "2G" && normalized !== "Unknown";
    });
  }, [apiNetworks]);

  // Extract available operators from API
  const availableOperators = useMemo(() => {
    if (!apiOperators || !Array.isArray(apiOperators)) return [];

    const validOperators = apiOperators.filter((operator) =>
      isValidName(operator),
    );

    const uniqueBrands = new Map();
    validOperators.forEach((operator) => {
      const brandName = normalizeProviderName(operator);
      if (brandName && !uniqueBrands.has(brandName)) {
        uniqueBrands.set(brandName, {
          original: operator,
          brand: brandName,
          color: getProviderColor(operator) || COLOR_SCHEMES.provider.Unknown,
        });
      }
    });

    return Array.from(uniqueBrands.values()).map((op) => op.brand);
  }, [apiOperators]);

  // Apply chart filters to data
  const filteredData = useMemo(() => {
    if (!allData || allData.length === 0) return [];

    let filtered = allData.filter((item) => isValidName(item.name));

    // Group by brand
    const groupedByBrand = new Map();

    filtered.forEach((item) => {
      const brandName = normalizeProviderName(item.name);
      if (!brandName) return;

      if (!groupedByBrand.has(brandName)) {
        groupedByBrand.set(brandName, {
          name: item.name,
          displayName: brandName,
          operatorColor:
            getProviderColor(item.name) || COLOR_SCHEMES.provider.Unknown,
          techData: {},
          techCounts: {},
        });
      }

      const brandItem = groupedByBrand.get(brandName);

      Object.keys(item).forEach((key) => {
        if (
          [
            "name",
            "total",
            "displayName",
            "operatorColor",
            "_networkCounts",
          ].includes(key)
        )
          return;
        if (!isValidName(key)) return;

        const normalizedTech = normalizeTechName(key);
        if (normalizedTech === "2G" || normalizedTech === "Unknown") return;

        const value = item[key];
        if (!hasValidValue(value)) return;

        if (brandItem.techData[normalizedTech] !== undefined) {
          const currentCount = brandItem.techCounts[normalizedTech] || 1;
          const currentSum = brandItem.techData[normalizedTech] * currentCount;

          brandItem.techCounts[normalizedTech] = currentCount + 1;
          brandItem.techData[normalizedTech] =
            (currentSum + value) / (currentCount + 1);
        } else {
          brandItem.techData[normalizedTech] = value;
          brandItem.techCounts[normalizedTech] = 1;
        }
      });
    });

    filtered = Array.from(groupedByBrand.values()).map((item) => ({
      name: item.name,
      displayName: item.displayName,
      operatorColor: item.operatorColor,
      ...item.techData,
    }));

    // Apply operator filters from chartFilters
    if (chartFilters?.operators && chartFilters.operators.length > 0) {
      filtered = filtered.filter((item) =>
        chartFilters.operators.includes(item.displayName),
      );
    }

    // Apply network/technology filters from chartFilters
    if (chartFilters?.networks && chartFilters.networks.length > 0) {
      filtered = filtered
        .map((item) => {
          const newItem = {
            name: item.name,
            displayName: item.displayName,
            operatorColor: item.operatorColor,
          };
          chartFilters.networks.forEach((tech) => {
            if (hasValidValue(item[tech])) {
              newItem[tech] = item[tech];
            }
          });
          return newItem;
        })
        .filter((item) => {
          const techKeys = Object.keys(item).filter(
            (k) => !["name", "displayName", "operatorColor"].includes(k),
          );
          return techKeys.length > 0;
        });
    }

    // Calculate totals
    filtered = filtered
      .map((item) => {
        const techs = Object.keys(item).filter(
          (k) => !["name", "total", "displayName", "operatorColor"].includes(k),
        );
        const validValues = techs.filter((tech) => hasValidValue(item[tech]));

        let total = 0;
        if (validValues.length > 0) {
          const sum = validValues.reduce((acc, tech) => acc + item[tech], 0);
          total = sum / validValues.length;
        }

        return { ...item, total };
      })
      .filter((item) => {
        const techs = Object.keys(item).filter(
          (k) => !["name", "total", "displayName", "operatorColor"].includes(k),
        );
        return techs.some((tech) => hasValidValue(item[tech]));
      });

    return filtered;
  }, [allData, chartFilters, selectedMetric]);

  // Get technology types from filtered data
  const technologyTypes = useMemo(() => {
    if (!filteredData?.length) return [];
    const techs = new Set();
    filteredData.forEach((item) => {
      Object.entries(item).forEach(([key, value]) => {
        if (
          !["name", "displayName", "operatorColor", "total"].includes(key) &&
          hasValidValue(value)
        ) {
          techs.add(key);
        }
      });
    });
    return [...techs];
  }, [filteredData]);

  // Prepare export dataset
  const exportDataset = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];

    const metricConfig = METRICS[selectedMetric];

    return filteredData.map((item) => {
      const row = {
        Operator: item.displayName || item.name,
      };

      technologyTypes.forEach((tech) => {
        if (hasValidValue(item[tech])) {
          row[tech] = item[tech];
        }
      });

      row[`Average_${metricConfig.label}`] = item.total;

      return row;
    });
  }, [filteredData, technologyTypes, selectedMetric]);

  const formatYAxis = (value) => {
    if (selectedMetric === "samples") return formatNumber(value);
    return value?.toFixed(1) || "0";
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const metricConfig = METRICS[selectedMetric];
    const validPayload = payload.filter((p) => hasValidValue(p.value));
    if (validPayload.length === 0) return null;

    const currentOperator = filteredData.find(
      (item) => item.name === label || item.displayName === label,
    );
    const operatorColor =
      currentOperator?.operatorColor || COLOR_SCHEMES.provider.Unknown;
    const displayName = currentOperator?.displayName || label;

    const sum = validPayload.reduce((acc, p) => acc + (p.value || 0), 0);
    const total =
      selectedMetric === "samples" ? sum : sum / validPayload.length;

    return (
      <div
        className="bg-white rounded-lg shadow-xl border-2 p-3"
        style={{ borderColor: operatorColor, minWidth: "180px", zIndex: 99999 }}
      >
        <div
          className="text-lg font-bold mb-2 pb-2 border-b"
          style={{ color: operatorColor, borderColor: `${operatorColor}30` }}
        >
          {displayName}
        </div>

        <div className="space-y-1.5">
          {validPayload
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-base font-semibold text-gray-700">
                    {entry.name}
                  </span>
                </div>
                <span className="text-base font-bold text-gray-900">
                  {metricConfig.format(entry.value)}
                </span>
              </div>
            ))}
        </div>

        <div
          className="mt-2 pt-2 border-t flex justify-between items-center"
          style={{ borderColor: `${operatorColor}30` }}
        >
          <span className="text-base font-semibold text-gray-600">
            {selectedMetric === "samples" ? "Total" : "Avg"}
          </span>
          <span className="text-lg font-bold" style={{ color: operatorColor }}>
            {metricConfig.format(total)}
          </span>
        </div>
      </div>
    );
  };

  const CustomLegend = ({ payload }) => {
    if (!payload || payload.length === 0) return null;

    const validLegendItems = payload.filter((entry) => {
      return filteredData.some((item) => hasValidValue(item[entry.value]));
    });

    if (validLegendItems.length === 0) return null;

    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-3 border-t border-gray-200">
        {validLegendItems.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm font-bold text-gray-700">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Metric settings component
  const MetricSettings = () => (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-700 mb-2 block">
        Select Metric
      </label>
      {Object.entries(METRICS).map(([key, config]) => (
        <label
          key={key}
          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50"
        >
          <input
            type="radio"
            name="metric"
            value={key}
            checked={selectedMetric === key}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700 flex-1">{config.label}</span>
          <span className="text-xs text-gray-500">{config.unit}</span>
        </label>
      ))}
    </div>
  );

  const currentMetric = METRICS[selectedMetric];
  const isReversedAxis = currentMetric?.reversed || false;

  const chartContent = (
    <div className="h-full flex flex-col">
      
      {/* Chart */}
      <div className="flex-1 min-h-0">
        {isLoading || metaLoading ? (
          <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl">
            <div className="text-center">
              <Spinner />
              <p className="text-sm text-gray-500 mt-3">
                Loading chart data...
              </p>
            </div>
          </div>
        ) : filteredData &&
          filteredData.length > 0 &&
          technologyTypes.length > 0 ? (
          <div className="bg-gray-50 rounded-xl p-4 h-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <BarChart
                data={filteredData}
                margin={{ top: 20, right: 30, left: 50, bottom: 60 }}
                barGap={2}
                barCategoryGap="25%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E5E7EB"
                />
                <XAxis
                  dataKey="displayName"
                  tick={{ fill: "#111827", fontSize: 14, fontWeight: 700 }}
                  axisLine={{ stroke: "#D1D5DB" }}
                  tickLine={{ stroke: "#D1D5DB" }}
                />
                <YAxis
                  reversed={isReversedAxis}
                  tick={{ fill: "#6B7280", fontSize: 12, fontWeight: 500 }}
                  tickFormatter={formatYAxis}
                  axisLine={{ stroke: "#D1D5DB" }}
                  tickLine={{ stroke: "#D1D5DB" }}
                  label={{
                    value: currentMetric?.yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#374151", fontSize: 12, fontWeight: 600 },
                    offset: 0,
                  }}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                  wrapperStyle={{ zIndex: 99999 }}
                />
                <Legend content={<CustomLegend />} />
                {technologyTypes.map((tech, idx) => (
                  <Bar
                    key={tech}
                    dataKey={tech}
                    name={tech}
                    fill={getChartTechColor(tech, idx)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                  >
                    {filteredData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          hasValidValue(entry[tech])
                            ? getChartTechColor(tech, idx)
                            : "transparent"
                        }
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <ChartCard
      title="Operator Network Comparison"
      dataset={exportDataset}
      exportFileName={`operator-network-${selectedMetric}`}
      isLoading={isLoading || metaLoading}
      chartFilters={chartFilters}
      onChartFiltersChange={onChartFiltersChange}
      operators={availableOperators}
      networks={availableTechnologies}
      showChartFilters={true}
      settings={{
        title: "Metric Settings",
        render: <MetricSettings />,
        onApply: () => {
          // Metric is applied in real-time
        },
      }}
      headerActions={
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-medium">
            {filteredData?.length || 0} operators
          </span>
          <span>•</span>
          <span className="font-medium">
            {technologyTypes?.length || 0} networks
          </span>
        </div>
      }
    >
      {chartContent}
    </ChartCard>
  );
};

export default OperatorNetworkChart;
