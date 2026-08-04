import React from "react";


export default function Spinner({
  size = 96,
  speed = 1.4,
  trackVisible = true,
}) {
  const cx = 256;
  const cy = 220;

  return (
    <div style={{ display: "inline-block" }}>
      <style>{`
        @keyframes spin-cw {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spin-ccw {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        .spinner-arc-outer {
          transform-box: view-box;
          transform-origin: ${cx}px ${cy}px;
          animation: spin-cw ${speed}s linear infinite;
        }
        .spinner-arc-inner {
          transform-box: view-box;
          transform-origin: ${cx}px ${cy}px;
          animation: spin-ccw ${speed * 0.62}s linear infinite;
        }
      `}</style>

      <svg
        width={size}
        height={size}
        viewBox="0 0 512 460"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="spin-grad-outer"
            gradientUnits="userSpaceOnUse"
            x1={cx - 165}
            y1={cy - 165}
            x2={cx + 165}
            y2={cy + 165}
          >
            <stop offset="0%" stopColor="#0B2A52" stopOpacity="0" />
            <stop offset="55%" stopColor="#1E4E8C" />
            <stop offset="100%" stopColor="#57C6D9" />
          </linearGradient>
          <linearGradient
            id="spin-grad-inner"
            gradientUnits="userSpaceOnUse"
            x1={cx - 100}
            y1={cy + 100}
            x2={cx + 100}
            y2={cy - 100}
          >
            <stop offset="0%" stopColor="#0B2A52" stopOpacity="0" />
            <stop offset="55%" stopColor="#2798C4" />
            <stop offset="100%" stopColor="#9DF0FA" />
          </linearGradient>
        </defs>

        {/* Faint static track for the modern-spinner look */}
        {trackVisible && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r="165"
              fill="none"
              stroke="#1E4E8C"
              strokeOpacity="0.12"
              strokeWidth="14"
            />
            <circle
              cx={cx}
              cy={cy}
              r="100"
              fill="none"
              stroke="#2798C4"
              strokeOpacity="0.12"
              strokeWidth="12"
            />
          </>
        )}

        {/* Outer rotating arc */}
        <g className="spinner-arc-outer">
          <circle
            cx={cx}
            cy={cy}
            r="165"
            fill="none"
            stroke="url(#spin-grad-outer)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray="500 1037"
          />
        </g>

        {/* Inner rotating arc — opposite direction, faster */}
        <g className="spinner-arc-inner">
          <circle
            cx={cx}
            cy={cy}
            r="100"
            fill="none"
            stroke="url(#spin-grad-inner)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="260 628"
          />
        </g>

        {/* Static mini logo mark held in the center */}
        <circle cx={cx} cy={cy} r="14" fill="#1E4E8C" />
        <path d="M256 280 L200 340" stroke="#57C6D9" strokeWidth="16" strokeLinecap="round" />
        <path d="M256 280 L312 340" stroke="#57C6D9" strokeWidth="16" strokeLinecap="round" />
      </svg>
    </div>
  );
}