import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

function maskKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}${"•".repeat(16)}${key.slice(-4)}`;
}

export default function ApiKeys() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["api-keys"],
    queryFn: api.listApiKeys,
  });
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [justCopied, setJustCopied] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => api.createApiKey(n),
    onSuccess: (k) => {
      setName("");
      setRevealed((r) => ({ ...r, [k.id]: true })); // reveal the new one immediately
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  function copy(id: number, key: string) {
    navigator.clipboard.writeText(key);
    setJustCopied(id);
    window.setTimeout(() => setJustCopied((v) => (v === id ? null : v)), 1200);
  }

  function handleDelete(id: number, keyName: string) {
    if (
      window.confirm(
        `Delete API key "${keyName}"? Any client still using it will start failing with 401.`,
      )
    ) {
      remove.mutate(id);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
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

      <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-900">
        Keys are stored in plaintext so they remain visible. Anyone with database
        access can read them — keep this instance on a trusted machine.
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 w-40">Name</th>
              <th className="text-left px-4 py-2">Key</th>
              <th className="text-left px-4 py-2">Created</th>
              <th className="text-left px-4 py-2">Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data && data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No API keys yet — create one above.
                </td>
              </tr>
            )}
            {data?.map((k) => {
              const isRevealed = !!revealed[k.id];
              return (
                <tr key={k.id} className="border-t border-slate-100 align-middle">
                  <td className="px-4 py-2">{k.name}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 break-all">
                        {isRevealed ? k.key : maskKey(k.key)}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed((r) => ({ ...r, [k.id]: !isRevealed }))
                        }
                        className="text-xs text-slate-600 hover:text-slate-900 underline"
                      >
                        {isRevealed ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(k.id, k.key)}
                        className="text-xs text-slate-600 hover:text-slate-900 underline"
                      >
                        {justCopied === k.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {new Date(k.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
