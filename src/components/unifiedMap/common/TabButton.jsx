import React from "react";

export const TabButton = ({ 
  active, 
  onClick, 
  children, 
  icon: Icon,
  badge,
  className = "",
}) => (
  <button
    onClick={onClick}
    className={`
      flex flex-none items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium
      transition-all whitespace-nowrap min-w-max sm:px-4 sm:text-sm
      ${active
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }
      ${className}
    `}
    style={{ overflowWrap: "normal" }}
  >
    {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
    <span className="whitespace-nowrap">{children}</span>
    {badge && (
      <span className="ml-1 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs whitespace-nowrap">
        {badge}
      </span>
    )}
  </button>
);
