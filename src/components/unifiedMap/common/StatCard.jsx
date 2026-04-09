import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { COLORS } from "@/utils/constants";

export const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  color = "blue",
  trend,
  className = "",
}) => {
  return (
    <div
      className={`
        rounded-lg border p-3 transition-all hover:scale-105 
        ${COLORS.STAT_CARD[color]} 
        ${className}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs opacity-80 mb-1 font-medium">{label}</p>
          <p className="text-2xl font-bold flex items-center gap-2">
            {value}
            {trend && (
              trend > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )
            )}
          </p>
          {subValue && (
            <p className="text-xs opacity-70 mt-1">{subValue}</p>
          )}
        </div>
        {Icon && <Icon className="h-5 w-5 opacity-60" />}
      </div>
    </div>
  );
};