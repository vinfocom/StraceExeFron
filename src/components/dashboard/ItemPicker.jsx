import React, { useState, useMemo } from 'react';

/**
 * Checkbox list for choosing which items a chart shows.
 * An empty `selected` array means "use the chart's default (top N)".
 */
const ItemPicker = ({ label, options, selected, onChange, emptyHint = 'Showing default selection' }) => {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => String(o).toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (option) => {
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option]
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange([...new Set([...selected, ...visible])])}
            className="text-blue-600 hover:underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-gray-500 hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
      />

      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
        {visible.length === 0 ? (
          <p className="p-2 text-xs text-gray-400">No matches</p>
        ) : (
          visible.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700 truncate">{option}</span>
            </label>
          ))
        )}
      </div>

      <p className="text-xs text-gray-500">
        {selected.length > 0 ? `${selected.length} selected` : emptyHint}
      </p>
    </div>
  );
};

export default ItemPicker;
