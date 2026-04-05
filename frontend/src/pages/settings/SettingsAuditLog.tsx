import { Fragment, useCallback, useEffect, useState } from "react";
import client from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { formatDateTime } from "../../utils/formatting";
import type { GlobalAuditEventRow, PaginatedGlobalAudit } from "../../types/models";

const PER_PAGE = 50;

const categories = [
  { value: "", label: "All" },
  { value: "data_change", label: "Data" },
  { value: "security", label: "Security" },
  { value: "notification", label: "Notifications" },
  { value: "error", label: "Errors" },
];

function categoryClass(cat: string): string {
  switch (cat) {
    case "data_change":
      return "bg-blue-100 text-blue-800";
    case "security":
      return "bg-amber-100 text-amber-900";
    case "notification":
      return "bg-green-100 text-green-800";
    case "error":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function hasDetailsPayload(row: GlobalAuditEventRow): boolean {
  return (
    row.details != null &&
    typeof row.details === "object" &&
    Object.keys(row.details).length > 0
  );
}

function AuditEventDetails({ row }: { row: GlobalAuditEventRow }) {
  const parts: string[] = [];
  if (row.entity_table) {
    parts.push(
      `Table: ${row.entity_table}${row.entity_key != null && row.entity_key !== "" ? ` / ${row.entity_key}` : ""}`,
    );
  }
  if (row.request_id) {
    parts.push(`Request: ${row.request_id}`);
  }

  return (
    <div className="space-y-2 text-left">
      {parts.length > 0 && (
        <p className="text-xs text-gray-600">{parts.join(" · ")}</p>
      )}
      {hasDetailsPayload(row) ? (
        <pre className="max-h-96 overflow-auto rounded border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
          {JSON.stringify(row.details, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-gray-500">No JSON payload for this event.</p>
      )}
    </div>
  );
}

export function SettingsAuditLog() {
  const { preferences } = useAuth();
  const [items, setItems] = useState<GlobalAuditEventRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const load = useCallback(async (pageNum: number) => {
    const params = new URLSearchParams();
    params.set("page", String(pageNum));
    params.set("per_page", String(PER_PAGE));
    if (category) params.set("category", category);
    const r = await client.get<PaginatedGlobalAudit>(
      `/api/settings/audit-events?${params.toString()}`,
    );
    setItems(r.data.items);
    setTotalPages(r.data.total_pages);
    setTotalCount(r.data.total_count);
    setPage(r.data.page);
  }, [category]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpandedIds(new Set());
    load(1)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load audit log");
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [category]);

  async function goToPage(next: number) {
    if (next < 1 || (totalPages > 0 && next > totalPages)) return;
    setLoading(true);
    setError(null);
    setExpandedIds(new Set());
    try {
      await load(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load page");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-gray-900">Audit log</h2>
      <p className="text-sm text-gray-500">
        Sign-ins, data changes, notifications, integration tests, and application errors for
        this deployment. Events older than the retention window (90 days by default) are removed when
        the server runs the scheduled audit-retention job.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          Category
          <select
            className="ml-2 rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.value || "all"} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No events yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-2" aria-label="Expand details" />
                <th className="px-3 py-2 text-left font-medium text-gray-700">Time</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Category</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Event</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Summary</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {items.map((row) => {
                const open = expandedIds.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td className="px-2 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(row.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          aria-expanded={open}
                          aria-label={open ? "Hide details" : "Show details"}
                        >
                          <span className="text-xs" aria-hidden>
                            {open ? "▼" : "▶"}
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {formatDateTime(row.occurred_at, preferences, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryClass(row.category)}`}
                        >
                          {row.category}
                        </span>
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-xs text-gray-800">
                        {row.event_type}
                      </td>
                      <td className="max-w-md px-3 py-2 text-gray-800">{row.summary ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {row.actor
                          ? `${row.actor.first_name} ${row.actor.last_name}`.trim() ||
                            row.actor.email
                          : "—"}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-3 py-3">
                          <AuditEventDetails row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600">
            {totalCount} event{totalCount === 1 ? "" : "s"}
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
              disabled={page <= 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => void goToPage(page + 1)}
              disabled={totalPages === 0 || page >= totalPages}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
