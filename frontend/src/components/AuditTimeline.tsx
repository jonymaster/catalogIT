import { useEffect, useState } from "react";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { AuditLogEntry } from "../types/models";
import { formatDateTime } from "../utils/formatting";

interface Props {
  tableName: string;
  recordId: string;
}

function formatChange(entry: AuditLogEntry): string {
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
  INSERT: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
};

export function AuditTimeline({ tableName, recordId }: Props) {
  const { preferences } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get<AuditLogEntry[]>(`/api/history/${tableName}/${recordId}`)
      .then((r) => setEntries(r.data))
      .finally(() => setLoading(false));
  }, [tableName, recordId]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading history...</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No history recorded yet.</p>;
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {entries.map((entry, idx) => (
          <li key={entry.id}>
            <div className="relative pb-8">
              {idx < entries.length - 1 && (
                <span
                  className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              )}
              <div className="relative flex space-x-3">
                <div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 ring-4 ring-white">
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${actionColors[entry.action] ?? "bg-gray-100 text-gray-800"}`}
                    >
                      {entry.action[0]}
                    </span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4">
                  <div>
                    <p className="text-sm text-gray-700">{formatChange(entry)}</p>
                    {entry.changed_by && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        by {entry.changed_by.first_name} {entry.changed_by.last_name}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right text-xs text-gray-500">
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
    </div>
  );
}
