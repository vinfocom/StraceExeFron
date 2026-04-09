"use client"

import * as React from "react"
import { Clock, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function TimePicker({ 
  time, 
  setTime, 
  className, 
  showSeconds = true,
  placeholder = "Select time..."
}) {
  const [open, setOpen] = React.useState(false);

  // Parse time string "HH:mm:ss"
  const parseTime = (timeStr) => {
    if (!timeStr) return { hours: 0, minutes: 0, seconds: 0 };
    const parts = timeStr.split(':');
    return {
      hours: parseInt(parts[0]) || 0,
      minutes: parseInt(parts[1]) || 0,
      seconds: parseInt(parts[2]) || 0,
    };
  };

  const { hours, minutes, seconds } = parseTime(time);

  const formatTime = (h, m, s) => {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  };

  const updateTime = (type, delta) => {
    let newHours = hours;
    let newMinutes = minutes;
    let newSeconds = seconds;

    switch (type) {
      case 'hours':
        newHours = (hours + delta + 24) % 24;
        break;
      case 'minutes':
        newMinutes = (minutes + delta + 60) % 60;
        break;
      case 'seconds':
        newSeconds = (seconds + delta + 60) % 60;
        break;
    }

    setTime(formatTime(newHours, newMinutes, newSeconds));
  };

  const setDirectValue = (type, value) => {
    let newHours = hours;
    let newMinutes = minutes;
    let newSeconds = seconds;

    switch (type) {
      case 'hours':
        newHours = Math.min(23, Math.max(0, value));
        break;
      case 'minutes':
        newMinutes = Math.min(59, Math.max(0, value));
        break;
      case 'seconds':
        newSeconds = Math.min(59, Math.max(0, value));
        break;
    }

    setTime(formatTime(newHours, newMinutes, newSeconds));
  };

  const TimeColumn = ({ value, type, max }) => (
    <div className="flex flex-col items-center">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-10 p-0 hover:bg-slate-700"
        onClick={() => updateTime(type, 1)}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      
      <input
        type="number"
        min={0}
        max={max}
        value={value.toString().padStart(2, '0')}
        onChange={(e) => setDirectValue(type, parseInt(e.target.value) || 0)}
        className="w-12 h-10 text-center text-lg font-mono bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
      />
      
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-10 p-0 hover:bg-slate-700"
        onClick={() => updateTime(type, -1)}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal bg-slate-800 border-slate-700 hover:bg-slate-700 text-white",
            !time && "text-slate-400",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {time || placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-4 bg-slate-900 border-slate-700">
        <div className="flex items-center gap-2">
          <TimeColumn value={hours} type="hours" max={23} />
          <span className="text-2xl text-slate-400 font-bold pb-1">:</span>
          <TimeColumn value={minutes} type="minutes" max={59} />
          {showSeconds && (
            <>
              <span className="text-2xl text-slate-400 font-bold pb-1">:</span>
              <TimeColumn value={seconds} type="seconds" max={59} />
            </>
          )}
        </div>

        {/* Quick Presets */}
        <div className="mt-4 pt-3 border-t border-slate-700">
          <div className="text-xs text-slate-400 mb-2">Quick Select</div>
          <div className="flex flex-wrap gap-1">
            {[
              { label: "00:00", h: 0, m: 0, s: 0 },
              { label: "06:00", h: 6, m: 0, s: 0 },
              { label: "12:00", h: 12, m: 0, s: 0 },
              { label: "18:00", h: 18, m: 0, s: 0 },
              { label: "23:59", h: 23, m: 59, s: 59 },
            ].map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="text-xs bg-slate-800 border-slate-600 hover:bg-slate-700 text-white"
                onClick={() => {
                  setTime(formatTime(preset.h, preset.m, preset.s));
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Now Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 bg-blue-600 border-blue-600 hover:bg-blue-700 text-white"
          onClick={() => {
            const now = new Date();
            setTime(formatTime(now.getHours(), now.getMinutes(), now.getSeconds()));
          }}
        >
          Now
        </Button>
      </PopoverContent>
    </Popover>
  );
}