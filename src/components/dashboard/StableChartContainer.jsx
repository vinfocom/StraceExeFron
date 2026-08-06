import React, { useEffect, useRef, useState } from "react";

const DEFAULT_MIN_HEIGHT = 220;

const StableChartContainer = ({
  className = "",
  minHeight = DEFAULT_MIN_HEIGHT,
  children,
}) => {
  const containerRef = useRef(null);
  const [size, setSize] = useState({
    width: 0,
    height: minHeight,
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    let frameId = null;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.max(0, Math.floor(rect.width));
      const nextHeight = Math.max(minHeight, Math.floor(rect.height));

      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    const scheduleMeasure = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(measure);
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(scheduleMeasure);
      observer.observe(node);

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
        observer.disconnect();
      };
    }

    window.addEventListener("resize", scheduleMeasure);
    frameId = window.requestAnimationFrame(measure);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [minHeight]);

  const isReady = size.width > 0 && size.height >= minHeight;

  return (
    <div
      ref={containerRef}
      className={`h-full w-full min-w-0 ${className}`.trim()}
      style={{ minHeight }}
    >
      {isReady ? (
        children(size)
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 text-sm text-slate-500">
          Preparing chart...
        </div>
      )}
    </div>
  );
};

export default StableChartContainer;
