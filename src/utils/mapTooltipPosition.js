export const getMapTooltipPosition = ({ x, y, width, height, tooltipWidth, tooltipHeight }) => {
  const gap = 12;
  const padding = 8;
  const left = x + gap + tooltipWidth > width - padding ? x - tooltipWidth - gap : x + gap;
  const top = y + gap + tooltipHeight > height - padding ? y - tooltipHeight - gap : y + gap;
  return {
    left: Math.max(padding, Math.min(left, width - tooltipWidth - padding)),
    top: Math.max(padding, Math.min(top, height - tooltipHeight - padding)),
  };
};
