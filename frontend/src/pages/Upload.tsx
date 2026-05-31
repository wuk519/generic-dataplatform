import { useRef, useState } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui";
import { UploadIcon } from "../components/icons";

export default function Upload() {
  const [sourceId, setSourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await api.upload(file, sourceId);
      const fmt = r.format ? ` as ${r.format.toUpperCase()}` : "";
      setStatus({ ok: true, msg: `Accepted ${r.accepted} record(s)${fmt}.` });
      setFile(null);
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
    <div className="max-w-2xl">
      <PageHeader
        title="Upload"
        subtitle="Bulk-load events from a file. Records are grouped by source."
      />

      <form onSubmit={submit} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default source ID
          </label>
          <input
            className="input"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. web-prod-logs"
          />
          <p className="text-xs text-slate-400 mt-1">
            Used for records that don't carry their own <code>source_id</code>.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            File
          </label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
              dragging
                ? "border-violet-400 bg-violet-50"
                : "border-slate-300 hover:border-violet-300 hover:bg-slate-50"
            }`}
          >
            <div className="grid h-11 w-11 place-items-center rounded-full bg-violet-50 text-violet-600">
              <UploadIcon />
            </div>
            {file ? (
              <div className="text-sm font-medium text-slate-800">
                {file.name}{" "}
                <span className="text-slate-400">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium text-slate-700">
                  Drag a file here, or click to browse
                </div>
                <div className="text-xs text-slate-400">
                  CSV, NDJSON / JSONL, or JSON array
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".csv,.ndjson,.jsonl,.json,text/csv,application/json,application/x-ndjson"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Format is auto-detected from the extension. CSV values are typed
            (numbers, booleans, <code>null</code>) automatically.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button disabled={busy || !file} className="btn-primary">
            {busy ? "Uploading…" : "Upload"}
          </button>
          {status && (
            <span
              className={`text-sm ${
                status.ok ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {status.msg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
