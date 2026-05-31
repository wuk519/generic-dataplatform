import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Source } from "../api/client";
import { compactNumber, formatNumber, relativeTime } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";
import {
  ChevronRightIcon,
  DatabaseIcon,
  PulseIcon,
  SearchIcon,
  TrashIcon,
} from "../components/icons";

export default function Sources() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sources"],
    queryFn: api.listSources,
  });
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Source | null>(null);

  const del = useMutation({
    mutationFn: (sourceId: string) => api.deleteSource(sourceId),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q
      ? data.filter((s) => s.source_id.toLowerCase().includes(q))
      : data;
  }, [data, search]);

  const totals = useMemo(() => {
    if (!data) return { sources: 0, events: 0, lastSeen: null as string | null };
    return {
      sources: data.length,
      events: data.reduce((sum, s) => sum + s.event_count, 0),
      lastSeen: data.reduce<string | null>(
        (latest, s) =>
          !latest || new Date(s.last_seen) > new Date(latest)
            ? s.last_seen
            : latest,
        null,
      ),
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Sources"
        subtitle="Every data source that has ingested events into the platform."
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Loading sources…
        </div>
      )}
      {error && (
        <div className="card p-4 text-rose-600 text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              label="Sources"
              value={formatNumber(totals.sources)}
              icon={<DatabaseIcon />}
            />
            <StatCard
              label="Total events"
              value={compactNumber(totals.events)}
              hint={`${formatNumber(totals.events)} records`}
              icon={<PulseIcon />}
            />
            <StatCard
              label="Last activity"
              value={totals.lastSeen ? relativeTime(totals.lastSeen) : "—"}
              icon={<SearchIcon />}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-100">
              <div className="relative w-full max-w-xs">
                <SearchIcon
                  width={16}
                  height={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="input pl-9"
                  placeholder="Filter sources…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="text-sm text-slate-400 whitespace-nowrap">
                {filtered.length} of {data.length}
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<DatabaseIcon width={22} height={22} />}
                title={
                  data.length === 0 ? "No sources yet" : "No matching sources"
                }
                description={
                  data.length === 0
                    ? "Push data via the API or the Upload page to get started."
                    : "Try a different search term."
                }
              />
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Source ID</th>
                    <th className="th text-right">Events</th>
                    <th className="th">First seen</th>
                    <th className="th">Last seen</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.source_id}
                      className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="td">
                        <Link
                          to={`/sources/${encodeURIComponent(s.source_id)}`}
                          className="inline-flex items-center gap-1.5 font-medium text-violet-700 hover:text-violet-900"
                        >
                          <span className="font-mono text-[13px]">
                            {s.source_id}
                          </span>
                          <ChevronRightIcon width={14} height={14} />
                        </Link>
                        {s.description && (
                          <div className="text-xs text-slate-400 mt-0.5 max-w-md truncate">
                            {s.description}
                          </div>
                        )}
                      </td>
                      <td className="td text-right tabular-nums font-medium">
                        {formatNumber(s.event_count)}
                      </td>
                      <td className="td text-slate-500">
                        {relativeTime(s.first_seen)}
                      </td>
                      <td className="td text-slate-500">
                        {relativeTime(s.last_seen)}
                      </td>
                      <td className="td text-right">
                        <button
                          onClick={() => setToDelete(s)}
                          className="btn-ghost !px-2 !py-1 text-slate-400 hover:!text-rose-600"
                          title="Delete source"
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete source?"
        confirmLabel="Delete source"
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.source_id)}
        message={
          toDelete && (
            <>
              This permanently deletes{" "}
              <span className="font-mono font-medium text-slate-800">
                {toDelete.source_id}
              </span>{" "}
              and all{" "}
              <span className="font-medium">
                {formatNumber(toDelete.event_count)}
              </span>{" "}
              of its events. This cannot be undone.
              {del.error && (
                <div className="mt-2 text-rose-600">
                  {(del.error as Error).message}
                </div>
              )}
            </>
          )
        }
      />
    </div>
  );
}
