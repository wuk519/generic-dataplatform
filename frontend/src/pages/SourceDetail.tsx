import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { formatNumber } from "../lib/format";
import { ConfirmDialog, EmptyState, PageHeader, Spinner } from "../components/ui";
import { ArrowLeftIcon, PulseIcon, TrashIcon } from "../components/icons";
import BarChart from "../components/BarChart";
import AnalysisPanel from "../components/AnalysisPanel";

type Bucket = "minute" | "hour" | "day";

export default function SourceDetail() {
  const { id = "" } = useParams();
  const sourceId = decodeURIComponent(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [bucket, setBucket] = useState<Bucket>("hour");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"events" | "analysis">("events");
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState("");

  const sourcesQ = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const source = sourcesQ.data?.find((s) => s.source_id === sourceId);

  const saveDesc = useMutation({
    mutationFn: () => api.updateSource(sourceId, draftDesc.trim() || null),
    onSuccess: () => {
      setEditingDesc(false);
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const stats = useQuery({
    queryKey: ["stats", sourceId, bucket],
    queryFn: () => api.stats(sourceId, bucket),
  });

  const events = useQuery({
    queryKey: ["events", sourceId, from, to, cursor],
    queryFn: () =>
      api.listEvents(sourceId, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        cursor,
        limit: 100,
      }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteSource(sourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      navigate("/sources");
    },
  });

  const totalEvents = stats.data?.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <div>
      <Link
        to="/sources"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3"
      >
        <ArrowLeftIcon width={16} height={16} /> All sources
      </Link>

      <PageHeader
        title={<span className="font-mono">{sourceId}</span>}
        subtitle={
          stats.data
            ? `${formatNumber(totalEvents)} events in the selected buckets`
            : "Loading…"
        }
        actions={
          <button
            className="btn-outline !text-rose-600 !border-rose-200 hover:!bg-rose-50"
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon width={16} height={16} /> Delete source
          </button>
        }
      />

      {/* Description */}
      <div className="card p-4 mb-6">
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              className="input min-h-[72px] resize-y"
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="Describe this data source…"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                className="btn-primary"
                onClick={() => saveDesc.mutate()}
                disabled={saveDesc.isPending}
              >
                {saveDesc.isPending ? "Saving…" : "Save"}
              </button>
              <button
                className="btn-outline"
                onClick={() => setEditingDesc(false)}
                disabled={saveDesc.isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                Description
              </div>
              {source?.description ? (
                <p className="text-slate-700 whitespace-pre-wrap">
                  {source.description}
                </p>
              ) : (
                <p className="text-slate-400 italic">No description yet.</p>
              )}
            </div>
            <button
              className="btn-ghost !px-2 !py-1 text-sm text-violet-700 shrink-0"
              onClick={() => {
                setDraftDesc(source?.description ?? "");
                setEditingDesc(true);
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Volume chart */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <PulseIcon width={16} height={16} className="text-violet-500" />
            Event volume
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(["minute", "hour", "day"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  bucket === b
                    ? "bg-violet-600 text-white"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        {stats.isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 h-40 justify-center">
            <Spinner /> Loading…
          </div>
        ) : (
          <BarChart data={stats.data ?? []} bucket={bucket} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
        {(["events", "analysis"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize -mb-px border-b-2 transition-colors ${
              tab === t
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "analysis" && <AnalysisPanel sourceId={sourceId} />}

      {tab === "events" && (
        <>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-slate-500 mb-1">From</span>
          <input
            type="datetime-local"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-500 mb-1">To</span>
          <input
            type="datetime-local"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="btn-primary"
          onClick={() => {
            setCursor(undefined);
            events.refetch();
          }}
        >
          Apply
        </button>
        {(from || to) && (
          <button
            className="btn-outline"
            onClick={() => {
              setFrom("");
              setTo("");
              setCursor(undefined);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {events.error && (
        <div className="card p-4 text-rose-600 text-sm mb-4">
          {(events.error as Error).message}
        </div>
      )}

      {/* Event table */}
      <div className="card overflow-hidden">
        <table className="w-full table-fixed">
          <thead className="bg-slate-50">
            <tr>
              <th className="th w-60">Timestamp</th>
              <th className="th">Payload</th>
            </tr>
          </thead>
          <tbody>
            {events.data && events.data.items.length === 0 && (
              <tr>
                <td colSpan={2}>
                  <EmptyState
                    icon={<PulseIcon width={22} height={22} />}
                    title="No events"
                    description="No events match the current filters."
                  />
                </td>
              </tr>
            )}
            {events.data?.items.map((e) => (
              <tr
                key={e.id}
                className="border-t border-slate-100 align-top hover:bg-slate-50/70 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              >
                <td className="td font-mono text-xs text-slate-500 whitespace-nowrap">
                  {new Date(e.timestamp).toISOString()}
                </td>
                <td className="td font-mono text-xs text-slate-700">
                  {expanded === e.id ? (
                    <pre className="whitespace-pre-wrap break-words bg-slate-50 rounded-lg p-3 border border-slate-100">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  ) : (
                    <div className="truncate">{JSON.stringify(e.payload)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 flex justify-between items-center border-t border-slate-100">
          <span className="text-xs text-slate-400 flex items-center gap-2">
            {events.isFetching && <Spinner className="text-slate-400" />}
            {events.data ? `${events.data.items.length} events shown` : ""}
          </span>
          <button
            className="btn-outline"
            disabled={!events.data?.next_cursor}
            onClick={() => setCursor(events.data!.next_cursor!)}
          >
            Load more
          </button>
        </div>
      </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete source?"
        confirmLabel="Delete source"
        busy={del.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        message={
          <>
            This permanently deletes{" "}
            <span className="font-mono font-medium text-slate-800">
              {sourceId}
            </span>{" "}
            and all of its events. This cannot be undone.
            {del.error && (
              <div className="mt-2 text-rose-600">
                {(del.error as Error).message}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
