// DrawingDistanceTooltip.jsx
import React from 'react';

export default function DrawingDistanceTooltip({ 
  position, 
  distance, 
  totalDistance,
  pointCount 
}) {
  if (!position) return null;

  const formatDistance = (meters) => {
    if (meters < 1000) {
      return `${meters.toFixed(1)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  };

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: `${position.x + 15}px`,
        top: `${position.y - 40}px`,
      }}
    >
      <div className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-lg text-xs font-semibold">
        <div className="flex items-center gap-2">
          <span>📏</span>
          <div>
            {distance !== null && (
              <div className="whitespace-nowrap">
                Distance: {formatDistance(distance)}
              </div>
            )}
            {totalDistance > 0 && pointCount > 1 && (
              <div className="whitespace-nowrap text-[10px] opacity-90">
                Total: {formatDistance(totalDistance)} ({pointCount} points)
              </div>
            )}
          </div>
        </div>
        <div className="text-[9px] opacity-75 mt-0.5">
          Click to add point
        </div>
      </div>
      {/* Arrow pointer */}
      <div 
        className="absolute w-0 h-0 border-t-[6px] border-t-blue-600 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent"
        style={{
          left: '10px',
          bottom: '-6px'
        }}
      />
    </div>
  );
}