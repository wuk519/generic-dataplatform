import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function SourceDetail() {
  const { id = "" } = useParams();
  const sourceId = decodeURIComponent(id);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["events", sourceId, from, to, cursor],
    queryFn: () =>
      api.listEvents(sourceId, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        cursor,
        limit: 100,
      }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold break-all">{sourceId}</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-slate-600">From</span>
          <input
            type="datetime-local"
            className="block border rounded px-2 py-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">To</span>
          <input
            type="datetime-local"
            className="block border rounded px-2 py-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            setCursor(undefined);
            refetch();
          }}
          className="px-3 py-1.5 bg-slate-900 text-white rounded text-sm"
        >
          Apply
        </button>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setCursor(undefined);
            }}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-600">{(error as Error).message}</div>
      )}

      {data && (
        <div className="bg-white rounded-lg border border-slate-200">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 w-56">Timestamp</th>
                <th className="text-left px-4 py-2">Payload</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No events
                  </td>
                </tr>
              )}
              {data.items.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-slate-100 align-top hover:bg-slate-50 cursor-pointer"
                  onClick={() =>
                    setExpanded(expanded === e.id ? null : e.id)
                  }
                >
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                    {new Date(e.timestamp).toISOString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {expanded === e.id ? (
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    ) : (
                      <div className="truncate">
                        {JSON.stringify(e.payload)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 flex justify-between items-center">
            <span className="text-xs text-slate-500">
              {isFetching ? "Loading…" : `${data.items.length} events`}
            </span>
            <button
              disabled={!data.next_cursor}
              onClick={() => setCursor(data.next_cursor!)}
              className="px-3 py-1.5 bg-slate-900 text-white rounded text-sm disabled:opacity-30"
            >
              Load more
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
