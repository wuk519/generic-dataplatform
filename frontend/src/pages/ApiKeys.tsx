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
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  function handleDelete(id: number, name: string) {
    if (
      window.confirm(
        `Delete API key "${name}"? Any client still using this key will start failing with 401.`,
      )
    ) {
      remove.mutate(id);
    }
  }

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
            Copy this key — it will not be shown again. The server only stores a
            SHA-256 hash; there's no way to recover it later.
          </div>
          <div className="flex gap-2 items-stretch">
            <code className="flex-1 bg-white border rounded px-3 py-2 font-mono text-sm break-all">
              {newKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="px-3 py-2 text-sm bg-amber-100 border border-amber-300 rounded hover:bg-amber-200"
              type="button"
            >
              Copy
            </button>
          </div>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {data && data.length === 0 && (
              <tr>
                <td
                  colSpan={5}
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
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(k.id, k.name)}
                    disabled={remove.isPending}
                    className="text-red-600 hover:underline text-sm disabled:opacity-40"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
