import { useCallback, useEffect, useRef, useState } from "react";
import client from "../../api/client";
import type { AdminExportJob } from "../../types/models";
import { useToast } from "../../context/useToast";
import { PageTransition } from "../../components/PageTransition";
import { Button } from "../../components/ui/Button";

const POLL_MS = 1500;

export function SettingsExport() {
  const { showToast } = useToast();
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<AdminExportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await client.get<AdminExportJob>(`/api/admin/export-jobs/${jobId}`);
        setJob(res.data);
        if (res.data.status === "failed") {
          clearPoll();
          setBusy(false);
          showToast({
            type: "error",
            text: res.data.error_message ?? "Export failed.",
          });
        } else if (res.data.status === "ready") {
          clearPoll();
          setBusy(false);
        }
      } catch {
        clearPoll();
        setBusy(false);
        showToast({ type: "error", text: "Failed to check export status." });
      }
    },
    [clearPoll, showToast],
  );

  const handlePrepare = async () => {
    setBusy(true);
    setJob(null);
    try {
      const res = await client.post<AdminExportJob>("/api/admin/export-jobs/", {
        include_attachments: includeAttachments,
      });
      setJob(res.data);
      clearPoll();
      pollRef.current = setInterval(() => {
        void pollJob(res.data.id);
      }, POLL_MS);
      void pollJob(res.data.id);
    } catch {
      setBusy(false);
      showToast({ type: "error", text: "Could not start export." });
    }
  };

  const handleDownload = async () => {
    if (!job || job.status !== "ready") {
      return;
    }
    try {
      const res = await client.get(`/api/admin/export-jobs/${job.id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catalogit-export.zip";
      a.rel = "noopener";
      const rawCd =
        typeof res.headers.get === "function"
          ? res.headers.get("content-disposition")
          : (res.headers as Record<string, string>)["content-disposition"];
      const cd = typeof rawCd === "string" ? rawCd : undefined;
      const m = cd?.match(/filename="([^"]+)"/);
      if (m?.[1]) {
        a.download = m[1];
      }
      a.click();
      URL.revokeObjectURL(url);
      setJob(null);
    } catch {
      showToast({ type: "error", text: "Download failed." });
    }
  };

  const phase =
    job?.status === "ready"
      ? "ready"
      : job?.status === "failed"
        ? "failed"
        : busy && job
          ? "running"
          : busy
            ? "starting"
            : "idle";

  return (
    <PageTransition>
    <div className="max-w-xl space-y-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Download all data</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Prepare a zip file with OpenAPI and reference-data metadata (JSON), CSV exports for
          services, hardware, and cost records, seed-style JSON snapshots under{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">data/seed-json/</code> (same
          filenames as <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">data/seed</code>{" "}
          in the repo, with live UUIDs), and optionally PDF attachments stored for services and
          laptops. Large datasets or many attachments can take several minutes.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 rounded border-gray-300 dark:border-gray-600"
          checked={includeAttachments}
          disabled={busy}
          onChange={(e) => setIncludeAttachments(e.target.checked)}
        />
        <span className="text-sm text-gray-700 dark:text-gray-200">
          Include PDF attachments (stored in object storage; increases size and time)
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy}
          onClick={() => void handlePrepare()}
        >
          {busy ? "Preparing…" : "Prepare download"}
        </Button>

        {phase === "running" || phase === "starting" ? (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {job?.status === "running"
              ? "Building archive…"
              : job?.status === "pending"
                ? "Queued…"
                : "Starting…"}
          </span>
        ) : null}

        {phase === "ready" ? (
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            Download zip
          </button>
        ) : null}

        {phase === "failed" && job?.error_message ? (
          <p className="text-sm text-red-600 dark:text-red-400">{job.error_message}</p>
        ) : null}
      </div>
    </div>
    </PageTransition>
  );
}
