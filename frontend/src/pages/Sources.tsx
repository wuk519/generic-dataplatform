import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function Sources() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sources"],
    queryFn: api.listSources,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Sources</h1>
      {isLoading && <div className="text-slate-500">Loading…</div>}
      {error && (
        <div className="text-red-600">{(error as Error).message}</div>
      )}
      {data && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">Source ID</th>
                <th className="text-right px-4 py-2">Events</th>
                <th className="text-left px-4 py-2">First seen</th>
                <th className="text-left px-4 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No sources yet — push some data to get started.
                  </td>
                </tr>
              )}
              {data.map((s) => (
                <tr
                  key={s.source_id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/sources/${encodeURIComponent(s.source_id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {s.source_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.event_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {new Date(s.first_seen).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {new Date(s.last_seen).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
