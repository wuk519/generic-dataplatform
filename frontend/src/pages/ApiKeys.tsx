import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export default function ApiKeys() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["api-keys"],
    queryFn: api.listApiKeys,
  });
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => api.createApiKey(n),
    onSuccess: (d) => {
      setNewKey(d.key);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">API Keys</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name) create.mutate(name);
        }}
        className="bg-white rounded-lg border border-slate-200 p-4 flex gap-2"
      >
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Key name (e.g. prod-web)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-40"
          disabled={!name || create.isPending}
        >
          Create key
        </button>
      </form>

      {newKey && (
        <div className="bg-amber-50 border border-amber-300 rounded p-4">
          <div className="text-sm font-medium text-amber-900 mb-1">
            Copy this key — it will not be shown again.
          </div>
          <code className="block bg-white border rounded px-3 py-2 font-mono text-sm break-all">
            {newKey}
          </code>
          <button
            onClick={() => setNewKey(null)}
            className="mt-2 text-sm text-amber-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Prefix</th>
              <th className="text-left px-4 py-2">Created</th>
              <th className="text-left px-4 py-2">Last used</th>
              <th className="text-left px-4 py-2">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data && data.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  No API keys yet
                </td>
              </tr>
            )}
            {data?.map((k) => (
              <tr key={k.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{k.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{k.prefix}…</td>
                <td className="px-4 py-2 text-slate-600">
                  {new Date(k.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {k.last_used_at
                    ? new Date(k.last_used_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {k.revoked ? (
                    <span className="text-red-700">Revoked</span>
                  ) : (
                    <span className="text-emerald-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {!k.revoked && (
                    <button
                      onClick={() => revoke.mutate(k.id)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
