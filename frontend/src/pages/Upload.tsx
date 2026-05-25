import { useState } from "react";
import { api } from "../api/client";

export default function Upload() {
  const [sourceId, setSourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await api.upload(file, sourceId);
      const fmt = r.format ? ` as ${r.format.toUpperCase()}` : "";
      setStatus({ ok: true, msg: `Accepted ${r.accepted} record(s)${fmt}.` });
    } catch (e) {
      setStatus({
        ok: false,
        msg: e instanceof Error ? e.message : "Upload failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">Upload</h1>
      <form
        onSubmit={submit}
        className="space-y-4 bg-white rounded-lg border border-slate-200 p-6"
      >
        <div>
          <label className="block text-sm mb-1">
            Default source ID{" "}
            <span className="text-slate-500">
              (used when records lack one)
            </span>
          </label>
          <input
            className="w-full border rounded px-3 py-2"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. web-prod-logs"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">File</label>
          <input
            type="file"
            accept=".csv,.ndjson,.jsonl,.json,text/csv,application/json,application/x-ndjson"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Format is auto-detected from the file extension
            (<code>.csv</code>, <code>.ndjson</code>/<code>.jsonl</code>,{" "}
            <code>.json</code>). CSV values are typed (numbers, booleans,{" "}
            <code>null</code>) automatically.
          </p>
        </div>
        <button
          disabled={busy || !file}
          className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-40"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        {status && (
          <div
            className={`text-sm ${
              status.ok ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {status.msg}
          </div>
        )}
      </form>
    </div>
  );
}
