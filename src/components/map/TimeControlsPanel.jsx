// src/components/map/TimeControlsPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Clock, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const getDayName = (index) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[index] || '';
};

const formatHour = (hour) => {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${ampm}`;
};

export default function TimeControlsPanel({ ui, onUIChange, hasLogs, onClose }) {
  const [mode, setMode] = useState(ui.timeMode || 'all');
  const playIntervalRef = useRef(null);

  // Auto-play animation
  useEffect(() => {
    if (ui.isTimePlaying && mode === 'single') {
      playIntervalRef.current = setInterval(() => {
        onUIChange?.({ currentHour: (ui.currentHour + 1) % 24 });
      }, 1000 / ui.timeSpeed);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [ui.isTimePlaying, ui.timeSpeed, mode, ui.currentHour, onUIChange]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    onUIChange?.({ timeMode: newMode });
    
    if (newMode === 'all') {
      onUIChange?.({ timeRange: [0, 23] });
    } else if (newMode === 'range' && !ui.timeRange) {
      onUIChange?.({ timeRange: [9, 17] });
    }
  };

  const toggleDay = (dayIndex) => {
    const newDays = ui.selectedDays.includes(dayIndex)
      ? ui.selectedDays.filter(d => d !== dayIndex)
      : [...ui.selectedDays, dayIndex].sort();
    onUIChange?.({ selectedDays: newDays });
  };

  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const isAllDaysSelected = ui.selectedDays.length === 7;

  return (
    <div className="absolute top-16 right-4 z-50 bg-white rounded-lg shadow-2xl p-4 w-80 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          Time-Based Filter
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!hasLogs && (
        <div className="mb-3 p-2 rounded bg-amber-50 text-amber-800 text-xs">
          ⚠️ Apply filters and load logs first
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="mb-4">
        <label className="flex items-center gap-2 font-medium text-sm">
          <input
            type="checkbox"
            checked={!!ui.timeFilterEnabled}
            onChange={(e) => onUIChange?.({ timeFilterEnabled: e.target.checked })}
            disabled={!hasLogs}
            className="w-4 h-4"
          />
          Enable Time-Based Filtering
        </label>
      </div>

      <div className={ui.timeFilterEnabled ? "space-y-4" : "opacity-50 pointer-events-none space-y-4"}>
        {/* Mode Selection */}
        <div>
          <Label className="text-xs text-gray-700 font-medium mb-2 block">
            Filter Mode
          </Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleModeChange('single')}
              className={`px-3 py-2 text-xs rounded transition-all ${
                mode === 'single'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              Single Hour
            </button>
            <button
              onClick={() => handleModeChange('range')}
              className={`px-3 py-2 text-xs rounded transition-all ${
                mode === 'range'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              Range
            </button>
            <button
              onClick={() => handleModeChange('all')}
              className={`px-3 py-2 text-xs rounded transition-all ${
                mode === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              All Day
            </button>
          </div>
        </div>

        {/* Single Hour Mode */}
        {mode === 'single' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-gray-700 font-medium">
                Hour: <span className="text-purple-600 font-bold">{formatHour(ui.currentHour)}</span>
              </Label>
              <div className="flex gap-1">
                <button
                  onClick={() => onUIChange?.({ isTimePlaying: !ui.isTimePlaying })}
                  className={`p-1.5 rounded transition-all ${
                    ui.isTimePlaying
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  {ui.isTimePlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => onUIChange?.({ currentHour: 0 })}
                  className="p-1.5 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="23"
              value={ui.currentHour}
              onChange={(e) => onUIChange?.({ currentHour: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>12 AM</span>
              <span>12 PM</span>
              <span>11 PM</span>
            </div>

            {/* Speed */}
            <div className="mt-3">
              <Label className="text-xs text-gray-700 font-medium mb-1 block">
                Speed: {ui.timeSpeed}x
              </Label>
              <div className="grid grid-cols-4 gap-1">
                {[0.5, 1, 2, 4].map((s) => (
                  <button
                    key={s}
                    onClick={() => onUIChange?.({ timeSpeed: s })}
                    className={`px-2 py-1 text-xs rounded ${
                      ui.timeSpeed === s
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Range Mode */}
        {mode === 'range' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">
                Start: {formatHour(ui.timeRange[0])}
              </Label>
              <input
                type="range"
                min="0"
                max="23"
                value={ui.timeRange[0]}
                onChange={(e) => onUIChange?.({ timeRange: [parseInt(e.target.value), ui.timeRange[1]] })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            <div>
              <Label className="text-xs text-gray-600 mb-1 block">
                End: {formatHour(ui.timeRange[1])}
              </Label>
              <input
                type="range"
                min="0"
                max="23"
                value={ui.timeRange[1]}
                onChange={(e) => onUIChange?.({ timeRange: [ui.timeRange[0], parseInt(e.target.value)] })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Presets */}
            <div>
              <Label className="text-xs text-gray-700 font-medium mb-2 block">Quick Presets</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUIChange?.({ timeRange: [9, 17] })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Business
                </button>
                <button
                  onClick={() => onUIChange?.({ timeRange: [6, 22] })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Daytime
                </button>
                <button
                  onClick={() => onUIChange?.({ timeRange: [22, 6] })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Night
                </button>
                <button
                  onClick={() => onUIChange?.({ timeRange: [7, 9] })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Rush
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Day of Week */}
        <div className="border-t border-gray-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-gray-700 font-medium flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Days of Week
            </Label>
            <button
              onClick={() => onUIChange?.({ selectedDays: isAllDaysSelected ? [] : allDays })}
              className="text-xs text-purple-600 hover:text-purple-700"
            >
              {isAllDaysSelected ? 'Clear' : 'All'}
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {allDays.map((dayIndex) => {
              const isSelected = ui.selectedDays.includes(dayIndex);
              return (
                <button
                  key={dayIndex}
                  onClick={() => toggleDay(dayIndex)}
                  className={`p-2 text-xs rounded transition-all ${
                    isSelected
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                  title={getDayName(dayIndex)}
                >
                  {getDayName(dayIndex)}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {ui.selectedDays.length === 0
              ? 'No days selected'
              : ui.selectedDays.length === 7
              ? 'All days'
              : `${ui.selectedDays.length} day${ui.selectedDays.length > 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Info */}
        <div className="text-xs text-gray-500 bg-purple-50 p-2 rounded">
          💡 {mode === 'single' && 'Animate through hours or select manually'}
          {mode === 'range' && 'Filter logs within time range'}
          {mode === 'all' && 'All hours included'}
        </div>
      </div>
    </div>
  );
}