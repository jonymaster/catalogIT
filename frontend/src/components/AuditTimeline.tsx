import { useCallback, useEffect, useState } from "react";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { AuditLogEntry, PaginatedHistoryResponse } from "../types/models";
import { formatDateTime } from "../utils/formatting";

interface Props {
  tableName: string;
  recordId: string;
  /** History entries per page (default 20). */
  perPage?: number;
}

const DEFAULT_PER_PAGE = 10;

function formatChange(entry: AuditLogEntry): string {
  if (entry.table_name === "attachments") {
    if (entry.action === "INSERT") return "Attachment added";
    if (entry.action === "DELETE") return "Attachment removed";
  }
  if (entry.action === "INSERT") return "Record created";
  if (entry.action === "DELETE") return "Record deleted";

  const oldVals = entry.old_values ?? {};
  const newVals = entry.new_values ?? {};
  const parts: string[] = [];
  for (const key of Object.keys(newVals)) {
    const from = oldVals[key] ?? "(empty)";
    const to = newVals[key] ?? "(empty)";
    parts.push(`${key}: ${from} -> ${to}`);
  }
  return parts.length > 0 ? parts.join(", ") : "Record updated";
}

const actionColors: Record<string, string> = {
  INSERT: "bg-green-100 text-green-800 dark:text-green-200",
  UPDATE: "bg-blue-100 text-blue-800 dark:text-blue-200",
  DELETE: "bg-red-100 text-red-800 dark:text-red-200",
};

export function AuditTimeline({
  tableName,
  recordId,
  perPage = DEFAULT_PER_PAGE,
}: Props) {
  const { preferences } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("per_page", String(perPage));
      const r = await client.get<PaginatedHistoryResponse>(
        `/api/history/${tableName}/${recordId}?${params.toString()}`,
      );
      setEntries(r.data.items);
      setPage(r.data.page);
      setTotalPages(r.data.total_pages);
      setTotalCount(r.data.total_count);
    },
    [tableName, recordId, perPage],
  );

  useEffect(() => {
    setLoading(true);
    load(1)
      .catch(() => {
        setEntries([]);
        setTotalPages(0);
        setTotalCount(0);
      })
      .finally(() => setLoading(false));
  }, [load]);

  async function goToPage(next: number) {
    if (next < 1 || (totalPages > 0 && next > totalPages)) return;
    setLoading(true);
    try {
      await load(next);
    } finally {
      setLoading(false);
    }
  }

  if (loading && entries.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading history...</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No history recorded yet.</p>;
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {entries.map((entry, idx) => (
          <li key={entry.id}>
            <div className="relative pb-8">
              {idx < entries.length - 1 && (
                <span
                  className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                  aria-hidden="true"
                />
              )}
              <div className="relative flex space-x-3">
                <div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 ring-4 ring-white">
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${actionColors[entry.action] ?? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"}`}
                    >
                      {entry.action[0]}
                    </span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-200">{formatChange(entry)}</p>
                    {entry.changed_by && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        by {entry.changed_by.first_name} {entry.changed_by.last_name}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right text-xs text-gray-500 dark:text-gray-400">
                    {formatDateTime(entry.timestamp, preferences, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {totalCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {totalCount} entr{totalCount === 1 ? "y" : "ies"}
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
              className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => void goToPage(page + 1)}
              disabled={totalPages === 0 || page >= totalPages || loading}
              className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
