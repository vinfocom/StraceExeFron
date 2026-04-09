// Create a separate legend component or add to your existing one
// src/components/map/PCILegend.jsx

import React from 'react';
import { PCI_COLOR_PALETTE } from './layers/MultiColorCirclesLayer';

export default function PCILegend({ show }) {
  if (!show) return null;

  return (
   <div className="absolute bottom-20 left-4 z-10 bg-white p-3 rounded-lg shadow-lg max-w-xs">
      <div className="font-semibold text-sm mb-2">PCI Color Map</div>
      <div className="text-xs text-gray-600 mb-2">
        Each PCI value is assigned a unique color (cycling every 20)
      </div>
      <div className="grid grid-cols-5 gap-1">
        {PCI_COLOR_PALETTE.map((color, idx) => (
          <div key={idx} className="flex flex-col items-center">
            <div
              className="w-6 h-6 rounded-full border border-gray-300"
              style={{ backgroundColor: color }}
            />
            <span className="text-[9px] text-gray-600 mt-0.5">
              {idx}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-gray-500 mt-2">
        PCI range: 0-503 (colors repeat every 20)
      </div>
    </div>
  );
}