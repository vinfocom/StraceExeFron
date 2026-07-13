import React from "react";

export const FilterChips = ({ categories = [], active, onSelect }) => (
  <div className="flex flex-wrap gap-2">
    {["All", ...categories].map((category) => (
      <button
        key={category}
        type="button"
        onClick={() => onSelect(category)}
        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
          active === category
            ? "bg-blue-600 text-white border-blue-500"
            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
        }`}
      >
        {category}
      </button>
    ))}
  </div>
);
