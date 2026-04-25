import { useState } from "react";
import { api } from "../api/client";

export default function Upload() {
  const [sourceId, setSourceId] = useState("");
  const [format, setFormat] = useState("ndjson");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await api.upload(file, sourceId, format);
      setStatus({ ok: true, msg: `Accepted ${r.accepted} record(s).` });
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
          <label className="block text-sm mb-1">Format</label>
          <select
            className="border rounded px-3 py-2"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="ndjson">NDJSON (one JSON object per line)</option>
            <option value="json">JSON array</option>
            <option value="csv">CSV (header row required)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
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
