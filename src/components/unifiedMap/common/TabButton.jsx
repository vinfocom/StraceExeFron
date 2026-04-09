import React from "react";

export const TabButton = ({ 
  active, 
  onClick, 
  children, 
  icon: Icon,
  badge 
}) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-2 px-4 py-2 text-sm font-medium 
      transition-all whitespace-nowrap rounded-lg
      ${active
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }
    `}
  >
    {Icon && <Icon className="h-4 w-4" />}
    {children}
    {badge && (
      <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500/20 rounded-full">
        {badge}
      </span>
    )}
  </button>
);