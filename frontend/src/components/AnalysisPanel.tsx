import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FieldStat } from "../api/client";
import ScatterChart, { type Point } from "./ScatterChart";
import { Spinner } from "./ui";

const TIME = "__time__";

const typeBadge: Record<FieldStat["type"], string> = {
  number: "bg-violet-50 text-violet-700",
  string: "bg-slate-100 text-slate-600",
  boolean: "bg-amber-50 text-amber-700",
  object: "bg-blue-50 text-blue-700",
  mixed: "bg-rose-50 text-rose-700",
};

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.01 || abs >= 100000)) return n.toExponential(2);
  return Number(n.toFixed(3)).toString();
}

export default function AnalysisPanel({ sourceId }: { sourceId: string }) {
  const profile = useQuery({
    queryKey: ["fields", sourceId],
    queryFn: () => api.fields(sourceId),
  });

  const numericFields = useMemo(
    () => (profile.data?.fields ?? []).filter((f) => f.type === "number"),
    [profile.data],
  );

  const [xField, setXField] = useState<string>(TIME);
  const [yField, setYField] = useState<string>("");

  // Default Y to the first numeric field once the profile loads.
  const effectiveY = yField || numericFields[0]?.name || "";
  const mode = xField === TIME ? "line" : "scatter";

  const seriesFields = useMemo(() => {
    const f = [effectiveY];
    if (xField !== TIME && xField) f.push(xField);
    return f.filter(Boolean);
  }, [effectiveY, xField]);

  const series = useQuery({
    queryKey: ["series", sourceId, seriesFields.join(",")],
    queryFn: () => api.series(sourceId, seriesFields, { limit: 5000 }),
    enabled: !!effectiveY,
  });

  const points: Point[] = useMemo(() => {
    if (!series.data) return [];
    return series.data.points
      .map((p) => {
        const y = Number(p[effectiveY]);
        const x =
          xField === TIME ? Date.parse(p.ts) : Number(p[xField]);
        return { x, y };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [series.data, effectiveY, xField]);

  if (profile.isLoading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-slate-400">
        <Spinner /> Profiling fields…
      </div>
    );
  }

  const fields = profile.data?.fields ?? [];

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="text-sm font-medium text-slate-700">
            Metric explorer
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Y</span>
            <select
              className="input !py-1 !w-auto"
              value={effectiveY}
              onChange={(e) => setYField(e.target.value)}
            >
              {numericFields.length === 0 && <option value="">—</option>}
              {numericFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="text-slate-500 ml-2">X</span>
            <select
              className="input !py-1 !w-auto"
              value={xField}
              onChange={(e) => setXField(e.target.value)}
            >
              <option value={TIME}>Time</option>
              {numericFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {numericFields.length === 0 ? (
          <div className="grid place-items-center h-48 text-sm text-slate-400">
            No numeric fields detected to plot.
          </div>
        ) : series.isFetching ? (
          <div className="grid place-items-center h-48 text-slate-400">
            <Spinner />
          </div>
        ) : (
          <ScatterChart
            points={points}
            mode={mode}
            xIsTime={xField === TIME}
            xLabel={xField === TIME ? "Time" : xField}
            yLabel={effectiveY}
          />
        )}
        <p className="text-xs text-slate-400 mt-2">
          Plotting up to 5,000 most-recent events.
        </p>
      </div>

      {/* Field stats */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">
            Field metrics
          </div>
          <div className="text-xs text-slate-400">
            sampled {profile.data?.sampled_events.toLocaleString()} events
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Field</th>
              <th className="th">Type</th>
              <th className="th text-right">Present</th>
              <th className="th text-right">Min</th>
              <th className="th text-right">Max</th>
              <th className="th text-right">Mean</th>
              <th className="th text-right">Std dev</th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 && (
              <tr>
                <td colSpan={7} className="td text-center text-slate-400 py-6">
                  No fields found.
                </td>
              </tr>
            )}
            {fields.map((f) => (
              <tr key={f.name} className="border-t border-slate-100">
                <td className="td font-mono text-[13px]">{f.name}</td>
                <td className="td">
                  <span className={`badge ${typeBadge[f.type]}`}>{f.type}</span>
                </td>
                <td className="td text-right tabular-nums text-slate-500">
                  {f.present.toLocaleString()}
                </td>
                <td className="td text-right tabular-nums">
                  {f.numeric ? fmt(f.numeric.min) : "—"}
                </td>
                <td className="td text-right tabular-nums">
                  {f.numeric ? fmt(f.numeric.max) : "—"}
                </td>
                <td className="td text-right tabular-nums">
                  {f.numeric ? fmt(f.numeric.mean) : "—"}
                </td>
                <td className="td text-right tabular-nums">
                  {f.numeric ? fmt(f.numeric.stddev) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
