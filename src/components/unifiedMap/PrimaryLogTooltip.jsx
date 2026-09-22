import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getMapTooltipPosition } from "@/utils/mapTooltipPosition";

const PrimaryLogTooltip = React.memo(React.forwardRef(function PrimaryLogTooltip({
  map, containerRef, Content, getLogDetails, onLogChange, resolveColor, selectedMetric, colorBy,
}, ref) {
  const [hover, setHover] = useState(null);
  const tooltipRef = useRef(null);
  const pendingRef = useRef(null);
  const frameRef = useRef(null);
  const movingRef = useRef(false);
  const notifiedLogRef = useRef(null);
  const onLogChangeRef = useRef(onLogChange);

  useLayoutEffect(() => {
    onLogChangeRef.current = onLogChange;
  }, [onLogChange]);

  const notifyLog = useCallback((log) => {
    if (notifiedLogRef.current === log) return;
    notifiedLogRef.current = log;
    onLogChangeRef.current?.(log);
  }, []);

  const clear = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = null;
    setHover(null);
    notifyLog(null);
  }, [notifyLog]);

  useImperativeHandle(ref, () => ({
    clear,
    update(info) {
      if (movingRef.current || !info?.object || !Number.isFinite(info.x) || !Number.isFinite(info.y)) {
        clear();
        return;
      }
      pendingRef.current = { log: info.object, x: info.x, y: info.y };
      // Coalesce pointer moves without updating the map parent's state.
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const next = pendingRef.current;
        setHover((previous) => previous?.log === next.log && previous.x === next.x && previous.y === next.y ? previous : next);
        notifyLog(next.log);
      });
    },
  }), [clear, notifyLog]);

  useEffect(() => {
    const hideWhileMoving = () => {
      movingRef.current = true;
      clear();
    };
    const listeners = [
      map.addListener("dragstart", hideWhileMoving),
      map.addListener("zoom_changed", hideWhileMoving),
      map.addListener("bounds_changed", hideWhileMoving),
      map.addListener("idle", () => { movingRef.current = false; }),
    ];
    const container = containerRef.current;
    container?.addEventListener("mouseleave", clear);
    return () => {
      listeners.forEach((listener) => listener.remove());
      container?.removeEventListener("mouseleave", clear);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      notifyLog(null);
    };
  }, [map, containerRef, clear, notifyLog]);

  // Overlap lookup and content rendering only need to change with the log.
  const log = useMemo(() => hover?.log ? getLogDetails(hover.log) : null, [hover?.log, getLogDetails]);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    const container = containerRef.current;
    if (!hover || !tooltip || !container) return;
    const position = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      tooltip.style.maxWidth = `${Math.max(0, width - 16)}px`;
      tooltip.style.maxHeight = `${Math.max(0, height - 16)}px`;
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const { left, top } = getMapTooltipPosition({
        x: hover.x, y: hover.y, width, height, tooltipWidth, tooltipHeight,
      });
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(container);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [hover, log, containerRef, selectedMetric, colorBy]);

  if (!log) return null;
  return (
    <div ref={tooltipRef} role="tooltip" className="pointer-events-none absolute z-[1000000] w-max overflow-hidden rounded-lg bg-white p-2 shadow-lg ring-1 ring-black/10">
      <Content log={log} resolveColor={resolveColor} selectedMetric={selectedMetric} colorBy={colorBy} />
    </div>
  );
}));

export default PrimaryLogTooltip;
