import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiKey } from "../api/client";
import { relativeTime } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Spinner,
} from "../components/ui";
import { CopyIcon, EyeIcon, EyeOffIcon, KeyIcon } from "../components/icons";

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
  const [toDelete, setToDelete] = useState<ApiKey | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => api.createApiKey(n),
    onSuccess: (k) => {
      setName("");
      setRevealed((r) => ({ ...r, [k.id]: true }));
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteApiKey(id),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  function copy(id: number, key: string) {
    navigator.clipboard.writeText(key);
    setJustCopied(id);
    window.setTimeout(() => setJustCopied((v) => (v === id ? null : v)), 1200);
  }

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Keys authenticate programmatic ingest and read access."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name) create.mutate(name);
        }}
        className="card p-4 flex gap-2 mb-4"
      >
        <input
          className="input flex-1"
          placeholder="Key name (e.g. prod-web)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary" disabled={!name || create.isPending}>
          {create.isPending ? <Spinner /> : <KeyIcon width={16} height={16} />}
          Create key
        </button>
      </form>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-4">
        Keys are stored in plaintext so they stay visible here. Anyone with
        database access can read them — keep this instance on a trusted machine.
      </div>

      <div className="card overflow-hidden">
        {data && data.length === 0 ? (
          <EmptyState
            icon={<KeyIcon width={22} height={22} />}
            title="No API keys yet"
            description="Create one above to start ingesting data."
          />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th w-40">Name</th>
                <th className="th">Key</th>
                <th className="th">Created</th>
                <th className="th">Last used</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data?.map((k) => {
                const isRevealed = !!revealed[k.id];
                return (
                  <tr key={k.id} className="border-t border-slate-100">
                    <td className="td font-medium">{k.name}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 break-all">
                          {isRevealed ? k.key : maskKey(k.key)}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            setRevealed((r) => ({ ...r, [k.id]: !isRevealed }))
                          }
                          className="btn-ghost !px-1.5 !py-1 text-slate-400"
                          title={isRevealed ? "Hide" : "Show"}
                        >
                          {isRevealed ? (
                            <EyeOffIcon width={16} height={16} />
                          ) : (
                            <EyeIcon width={16} height={16} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => copy(k.id, k.key)}
                          className="btn-ghost !px-1.5 !py-1 text-slate-400"
                          title="Copy"
                        >
                          {justCopied === k.id ? (
                            <span className="text-xs text-emerald-600 px-1">
                              Copied
                            </span>
                          ) : (
                            <CopyIcon width={16} height={16} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="td text-slate-500 whitespace-nowrap">
                      {relativeTime(k.created_at)}
                    </td>
                    <td className="td text-slate-500 whitespace-nowrap">
                      {k.last_used_at ? relativeTime(k.last_used_at) : "—"}
                    </td>
                    <td className="td text-right">
                      <button
                        onClick={() => setToDelete(k)}
                        className="text-sm text-rose-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete API key?"
        confirmLabel="Delete key"
        busy={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        message={
          toDelete && (
            <>
              Any client still using{" "}
              <span className="font-medium">"{toDelete.name}"</span> will start
              failing with 401. This cannot be undone.
            </>
          )
        }
      />
    </div>
  );
}
