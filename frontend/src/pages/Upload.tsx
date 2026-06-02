import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { PageHeader, Spinner } from "../components/ui";
import {
  CheckIcon,
  FileIcon,
  FolderIcon,
  UploadIcon,
  XIcon,
} from "../components/icons";

type Status = "pending" | "uploading" | "done" | "error";

type Item = {
  id: string;
  file: File;
  path: string;
  status: Status;
  accepted?: number;
  format?: string | null;
  error?: string;
};

function fileId(f: File): string {
  const path = f.webkitRelativePath || f.name;
  return `${path}:${f.size}:${f.lastModified}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Upload() {
  const [sourceId, setSourceId] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [finished, setFinished] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` isn't in React's input prop types; set it imperatively.
  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).map<Item>((file) => ({
      id: fileId(file),
      file,
      path: file.webkitRelativePath || file.name,
      status: "pending",
    }));
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.id));
      const merged = [...prev];
      for (const it of incoming) if (!seen.has(it.id)) merged.push(it);
      return merged;
    });
    setFinished(false);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearAll() {
    setItems([]);
    setFinished(false);
    setProgress(null);
  }

  async function uploadAll() {
    const queue = items.filter((i) => i.status !== "done");
    if (queue.length === 0) return;
    setBusy(true);
    setFinished(false);
    setProgress({ done: 0, total: queue.length });

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "uploading", error: undefined } : it,
        ),
      );
      try {
        const r = await api.upload(item.file, sourceId, {
          description: description.trim() || undefined,
        });
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "done", accepted: r.accepted, format: r.format }
              : it,
          ),
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: "error",
                  error: e instanceof Error ? e.message : "Upload failed",
                }
              : it,
          ),
        );
      }
      setProgress({ done: i + 1, total: queue.length });
    }

    setBusy(false);
    setProgress(null);
    setFinished(true);
  }

  const doneItems = items.filter((i) => i.status === "done");
  const errorItems = items.filter((i) => i.status === "error");
  const totalAccepted = doneItems.reduce((s, i) => s + (i.accepted ?? 0), 0);
  const pendingCount = items.filter((i) => i.status !== "done").length;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Upload"
        subtitle="Bulk-load events from one or more files. Records are grouped by source."
      />

      {/* Completion summary — prominent so it's obvious the upload finished. */}
      {finished && (
        <div
          className={`card p-4 mb-5 border-l-4 ${
            errorItems.length === 0
              ? "border-l-emerald-500"
              : "border-l-amber-500"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`grid h-10 w-10 place-items-center rounded-full ${
                errorItems.length === 0
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {errorItems.length === 0 ? (
                <CheckIcon width={22} height={22} />
              ) : (
                <XIcon width={22} height={22} />
              )}
            </div>
            <div>
              <div className="font-semibold text-slate-900">
                {errorItems.length === 0
                  ? "Upload complete"
                  : "Upload finished with errors"}
              </div>
              <div className="text-sm text-slate-500">
                {doneItems.length} of {items.length} file
                {items.length === 1 ? "" : "s"} uploaded ·{" "}
                <span className="font-medium text-slate-700">
                  {totalAccepted.toLocaleString()}
                </span>{" "}
                record{totalAccepted === 1 ? "" : "s"} accepted
                {errorItems.length > 0 && ` · ${errorItems.length} failed`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default source ID
          </label>
          <input
            className="input"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. web-prod-logs"
            disabled={busy}
          />
          <p className="text-xs text-slate-400 mt-1">
            Applied to records that don't carry their own <code>source_id</code>{" "}
            — used for every file in this batch.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            className="input min-h-[64px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this data source? e.g. Accelerometer readings from device A"
            disabled={busy}
          />
        </div>

        {/* Dropzone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Files
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
              dragging
                ? "border-violet-400 bg-violet-50"
                : "border-slate-300 hover:border-violet-300 hover:bg-slate-50"
            }`}
          >
            <div className="grid h-11 w-11 place-items-center rounded-full bg-violet-50 text-violet-600">
              <UploadIcon />
            </div>
            <div className="text-sm font-medium text-slate-700">
              Drag files here, or click to browse
            </div>
            <div className="text-xs text-slate-400">
              CSV, TSV, NDJSON / JSONL, JSON array, Excel (.xlsx), or .gz
            </div>
            <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn-outline !py-1 !text-sm"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <FileIcon width={15} height={15} /> Add files
              </button>
              <button
                type="button"
                className="btn-outline !py-1 !text-sm"
                onClick={() => folderRef.current?.click()}
                disabled={busy}
              >
                <FolderIcon width={15} height={15} /> Add folder
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept=".csv,.tsv,.tab,.ndjson,.jsonl,.json,.xlsx,.xlsm,.gz,text/csv,application/json,application/x-ndjson,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Add files from as many folders as you like — selections accumulate.
            Format is auto-detected per file; CSV/TSV/Excel cells are typed
            automatically.
          </p>
        </div>

        {/* Staged file list */}
        {items.length > 0 && (
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 text-xs text-slate-500">
              <span>
                {items.length} file{items.length === 1 ? "" : "s"} ·{" "}
                {fmtSize(items.reduce((s, i) => s + i.file.size, 0))}
              </span>
              <button
                className="hover:text-slate-800 disabled:opacity-40"
                onClick={clearAll}
                disabled={busy}
              >
                Clear all
              </button>
            </div>
            <ul className="max-h-72 overflow-auto">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <StatusBadge status={it.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-800">{it.path}</div>
                    <div className="text-xs text-slate-400">
                      {fmtSize(it.file.size)}
                      {it.status === "done" &&
                        ` · ${it.accepted?.toLocaleString()} record(s)` +
                          (it.format ? ` · ${it.format.toUpperCase()}` : "")}
                      {it.status === "error" && (
                        <span className="text-rose-600"> · {it.error}</span>
                      )}
                    </div>
                  </div>
                  {!busy && it.status !== "done" && (
                    <button
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => removeItem(it.id)}
                      title="Remove"
                    >
                      <XIcon width={16} height={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={busy || pendingCount === 0}
            onClick={uploadAll}
          >
            {busy ? (
              <>
                <Spinner /> Uploading {progress?.done ?? 0} of{" "}
                {progress?.total ?? 0}…
              </>
            ) : (
              `Upload ${pendingCount || ""} file${pendingCount === 1 ? "" : "s"}`.trim()
            )}
          </button>
          {busy && progress && (
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-all"
                style={{
                  width: `${(progress.done / progress.total) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "uploading")
    return <Spinner className="text-violet-500 shrink-0" />;
  if (status === "done")
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckIcon width={13} height={13} />
      </span>
    );
  if (status === "error")
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
        <XIcon width={13} height={13} />
      </span>
    );
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
      <FileIcon width={13} height={13} />
    </span>
  );
}
