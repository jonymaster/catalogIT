import { useCallback, useEffect, useRef, useState } from "react";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { Attachment, PaginatedAttachments } from "../types/models";
import { formatDateTime } from "../utils/formatting";

const PER_PAGE = 5;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentsProps {
  entityType: string;
  entityId: string;
}

export function Attachments({ entityType, entityId }: AttachmentsProps) {
  const { canEdit, preferences } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("per_page", String(PER_PAGE));
      const r = await client.get<PaginatedAttachments>(
        `/api/attachments/${entityType}/${entityId}?${params.toString()}`,
      );
      setAttachments(r.data.items);
      setPage(r.data.page);
      setTotalPages(r.data.total_pages);
      setTotalCount(r.data.total_count);
    },
    [entityType, entityId],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPage(1)
      .catch(() => setError("Failed to load attachments"))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  async function goToPage(next: number) {
    if (next < 1 || (totalPages > 0 && next > totalPages)) return;
    setLoading(true);
    setError(null);
    try {
      await fetchPage(next);
    } catch {
      setError("Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Only PDF files are allowed.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("File exceeds 20 MB limit.");
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await client.post(
        `/api/attachments/${entityType}/${entityId}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      await fetchPage(1);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      const response = await client.get(
        `/api/attachments/download/${att.id}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.original_filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Download failed.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this attachment?")) return;
    try {
      await client.delete(`/api/attachments/remove/${id}`);
      const nextPage =
        attachments.length === 1 && page > 1 ? page - 1 : page;
      setLoading(true);
      await fetchPage(nextPage);
    } catch {
      setError("Failed to delete attachment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Attachments</h2>
        {canEdit && (
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 ${uploading ? "pointer-events-none opacity-50" : ""}`}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            {uploading ? "Uploading..." : "Upload PDF"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}

      {loading && attachments.length === 0 ? (
        <p className="text-sm text-gray-500">Loading attachments...</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-gray-400">No attachments yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {attachments.map((att) => (
              <li
                key={att.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleDownload(att)}
                    className="truncate text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    title={att.original_filename}
                  >
                    {att.original_filename}
                  </button>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(att.file_size)} &middot;{" "}
                    {formatDateTime(att.created_at, preferences, {
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(att.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-red-600"
                    title="Delete attachment"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {totalCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                {totalCount} file{totalCount === 1 ? "" : "s"}
                {totalPages > 0 && (
                  <>
                    {" "}
                    · Page {page} of {totalPages}
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void goToPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => void goToPage(page + 1)}
                  disabled={totalPages === 0 || page >= totalPages || loading}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
