import { useCallback, useEffect, useRef, useState } from "react";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { Attachment } from "../types/models";

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
  const { canEdit } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(() => {
    client
      .get<Attachment[]>(`/api/attachments/${entityType}/${entityId}`)
      .then((r) => setAttachments(r.data))
      .catch(() => setError("Failed to load attachments"))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

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
      fetchAttachments();
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
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("Failed to delete attachment.");
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

      {loading ? (
        <p className="text-sm text-gray-500">Loading attachments...</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-gray-400">No attachments yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => handleDownload(att)}
                  className="truncate text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  title={att.original_filename}
                >
                  {att.original_filename}
                </button>
                <p className="text-xs text-gray-400">
                  {formatFileSize(att.file_size)} &middot;{" "}
                  {new Date(att.created_at).toLocaleDateString()}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(att.id)}
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
      )}
    </div>
  );
}
