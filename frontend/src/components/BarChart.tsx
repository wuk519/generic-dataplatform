import type { StatPoint } from "../api/client";

/**
 * Dependency-free bar chart for event-volume-over-time. Renders from a list
 * of {ts, count} buckets using flexbox columns (responsive, no width measuring).
 */
export default function BarChart({
  data,
  bucket,
}: {
  data: StatPoint[];
  bucket: "minute" | "hour" | "day";
}) {
  if (data.length === 0) {
    return (
      <div className="grid place-items-center h-40 text-sm text-slate-400">
        No data in range
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (bucket === "day") return d.toLocaleDateString();
    if (bucket === "minute")
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    });
  };

  return (
    <div>
      <div className="flex items-end gap-[2px] h-40">
        {data.map((d) => (
          <div
            key={d.ts}
            className="group relative flex-1 min-w-[2px] flex items-end h-full"
            title={`${fmt(d.ts)} — ${d.count.toLocaleString()} events`}
          >
            <div
              className="w-full rounded-t bg-gradient-to-t from-violet-500 to-violet-400
                hover:from-violet-600 hover:to-violet-500 transition-colors"
              style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-slate-400">
        <span>{fmt(data[0].ts)}</span>
        <span className="text-slate-500">
          {total.toLocaleString()} events · peak {max.toLocaleString()}
        </span>
        <span>{fmt(data[data.length - 1].ts)}</span>
      </div>
    </div>
  );
}
