import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getMapTooltipPosition } from "@/utils/mapTooltipPosition";

const PrimaryLogTooltip = React.memo(React.forwardRef(function PrimaryLogTooltip({
  map, containerRef, Content, getLogDetails, onLogChange, resolveColor, selectedMetric, colorBy,
}, ref) {
  const [selection, setSelection] = useState(null);
  const tooltipRef = useRef(null);
  const onLogChangeRef = useRef(onLogChange);

  useLayoutEffect(() => {
    onLogChangeRef.current = onLogChange;
  }, [onLogChange]);

  const notifyLog = useCallback((log) => {
    onLogChangeRef.current?.(log);
  }, []);

  const clear = useCallback(() => {
    setSelection(null);
    notifyLog(null);
  }, [notifyLog]);

  useImperativeHandle(ref, () => ({
    clear,
    select(info) {
      if (!info?.object || !Number.isFinite(info.x) || !Number.isFinite(info.y)) {
        clear();
        return;
      }
      setSelection({ log: info.object, x: info.x, y: info.y });
      notifyLog(info.object);
    },
  }), [clear, notifyLog]);

  useEffect(() => {
    const clearWhileMoving = () => clear();
    const listeners = [
      map.addListener("dragstart", clearWhileMoving),
      map.addListener("zoom_changed", clearWhileMoving),
      map.addListener("bounds_changed", clearWhileMoving),
    ];
    return () => {
      listeners.forEach((listener) => listener.remove());
      notifyLog(null);
    };
  }, [map, clear, notifyLog]);

  const log = useMemo(() => selection?.log ? getLogDetails(selection.log) : null, [selection?.log, getLogDetails]);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    const container = containerRef.current;
    if (!selection || !tooltip || !container) return;
    const position = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      tooltip.style.maxWidth = `${Math.max(0, width - 16)}px`;
      tooltip.style.maxHeight = `${Math.max(0, height - 16)}px`;
      const { left, top } = getMapTooltipPosition({
        x: selection.x,
        y: selection.y,
        width,
        height,
        tooltipWidth: tooltip.offsetWidth,
        tooltipHeight: tooltip.offsetHeight,
      });
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(container);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [selection, log, containerRef, selectedMetric, colorBy]);

  if (!log) return null;
  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      className="pointer-events-auto absolute z-[1000000] w-max overflow-auto rounded-lg bg-white p-2 pr-8 shadow-lg ring-1 ring-black/10"
    >
      <button
        type="button"
        aria-label="Close log details"
        onClick={clear}
        className="absolute right-1 top-1 rounded px-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        ×
      </button>
      <Content log={log} resolveColor={resolveColor} selectedMetric={selectedMetric} colorBy={colorBy} />
    </div>
  );
}));

export default PrimaryLogTooltip;
