export type Point = { x: number; y: number };

/**
 * Dependency-free X/Y chart (SVG). Renders a line (good for time series) or a
 * scatter of points. Scales are linear and auto-fit to the data.
 */
export default function ScatterChart({
  points,
  mode = "scatter",
  xLabel,
  yLabel,
  xIsTime = false,
  height = 300,
}: {
  points: Point[];
  mode?: "line" | "scatter";
  xLabel?: string;
  yLabel?: string;
  xIsTime?: boolean;
  height?: number;
}) {
  const clean = points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (clean.length === 0) {
    return (
      <div
        className="grid place-items-center text-sm text-slate-400"
        style={{ height }}
      >
        No numeric data to plot for this selection
      </div>
    );
  }

  const W = 720;
  const H = height;
  const padL = 56;
  const padB = 34;
  const padT = 12;
  const padR = 14;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xs = clean.map((p) => p.x);
  const ys = clean.map((p) => p.y);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  const fmtNum = (n: number) => {
    const abs = Math.abs(n);
    if (abs !== 0 && (abs < 0.01 || abs >= 100000)) return n.toExponential(1);
    return Number(n.toFixed(2)).toString();
  };
  const fmtX = (n: number) =>
    xIsTime ? new Date(n).toLocaleString() : fmtNum(n);

  const yTicks = 4;
  const yTickVals = Array.from(
    { length: yTicks + 1 },
    (_, i) => yMin + ((yMax - yMin) * i) / yTicks,
  );
  const xTickVals = [xMin, (xMin + xMax) / 2, xMax];

  const sorted = mode === "line" ? [...clean].sort((a, b) => a.x - b.x) : clean;
  const path = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      {/* Y grid + labels */}
      {yTickVals.map((v, i) => {
        const y = sy(v);
        return (
          <g key={`y${i}`}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="rgb(226 232 240)"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              fill="rgb(148 163 184)"
            >
              {fmtNum(v)}
            </text>
          </g>
        );
      })}

      {/* X labels */}
      {xTickVals.map((v, i) => (
        <text
          key={`x${i}`}
          x={sx(v)}
          y={H - padB + 16}
          textAnchor={i === 0 ? "start" : i === xTickVals.length - 1 ? "end" : "middle"}
          fontSize={10}
          fill="rgb(148 163 184)"
        >
          {fmtX(v)}
        </text>
      ))}

      {/* Axis titles */}
      {yLabel && (
        <text
          x={14}
          y={padT + plotH / 2}
          fontSize={11}
          fill="rgb(100 116 139)"
          textAnchor="middle"
          transform={`rotate(-90 14 ${padT + plotH / 2})`}
        >
          {yLabel}
        </text>
      )}
      {xLabel && (
        <text
          x={padL + plotW / 2}
          y={H - 2}
          fontSize={11}
          fill="rgb(100 116 139)"
          textAnchor="middle"
        >
          {xLabel}
        </text>
      )}

      {/* Data */}
      {mode === "line" ? (
        <path
          d={path}
          fill="none"
          stroke="rgb(124 58 237)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        sorted.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={2.5}
            fill="rgb(124 58 237)"
            fillOpacity={0.65}
          />
        ))
      )}
    </svg>
  );
}
