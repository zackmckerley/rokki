/**
 * Tiny inline sparkline. Pure SVG, no chart lib — matches the
 * codebase's avoid-libs pattern. Renders a polyline scaled into the
 * given box. Empty input collapses to an axis line so the cell never
 * jumps in height.
 */
export function Sparkline({
  points,
  width = 120,
  height = 24,
  className,
  ariaLabel,
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  if (points.length === 0) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel ?? "no data"}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const dx = points.length === 1 ? 0 : width / (points.length - 1);
  const y = (v: number) => {
    // 1px padding so the line never clips the top/bottom border.
    const pad = 1;
    const usable = height - pad * 2;
    return pad + (1 - (v - min) / range) * usable;
  };

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * dx).toFixed(2)},${y(p).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={
        ariaLabel ??
        `sparkline, ${points.length} points, min ${min}, max ${max}`
      }
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
