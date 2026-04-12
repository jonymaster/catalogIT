import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { CostRecord, Service } from "../types/models";

const TYPE_LABELS: Record<string, string> = {
  actual: "Actual",
  estimated: "Estimated",
  budget: "Budget",
};

function recordTypeRowClass(recordType: string): string {
  switch (recordType) {
    case "actual":
      return "border-l-4 border-l-emerald-500 bg-emerald-50/90 dark:border-l-emerald-400 dark:bg-emerald-950/35";
    case "estimated":
      return "border-l-4 border-l-amber-500 bg-amber-50/90 dark:border-l-amber-400 dark:bg-amber-950/35";
    case "budget":
      return "border-l-4 border-l-sky-600 bg-sky-50/90 dark:border-l-sky-400 dark:bg-sky-950/35";
    default:
      return "bg-white dark:bg-gray-900";
  }
}

function recordTypeBadgeClass(recordType: string): string {
  switch (recordType) {
    case "actual":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100";
    case "estimated":
      return "bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50";
    case "budget":
      return "bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-100";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
}

export function ServiceCosts() {
  const { service } = useOutletContext<{ service: Service }>();
  const { canEdit } = useAuth();
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get<CostRecord[]>(`/api/services/${service.id}/cost-records/`)
      .then((r) => setRecords(r.data))
      .finally(() => setLoading(false));
  }, [service.id]);

  async function handleDelete(recordId: string) {
    if (!window.confirm("Delete this cost record?")) return;
    await client.delete(
      `/api/services/${service.id}/cost-records/${recordId}`,
    );
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
  }

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Cost Records</h2>
        {canEdit && (
          <Link
            to={`/services/${service.id}/costs/new`}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add Cost Record
          </Link>
        )}
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No cost records yet for this service.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-950">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Fiscal Year
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Purchase Year
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Payment Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Notes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Recorded By
                </th>
                {canEdit && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {records.map((r) => (
                <tr key={r.id} className={recordTypeRowClass(r.record_type)}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {r.fiscal_year}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.purchase_year ?? "--"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${recordTypeBadgeClass(r.record_type)}`}
                    >
                      {TYPE_LABELS[r.record_type] ?? r.record_type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900 dark:text-gray-100">
                    ${Number(r.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.payment_method_name || "--"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.notes || "--"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.recorded_by_name || "--"}
                  </td>
                  {canEdit && (
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <Link
                        to={`/services/${service.id}/costs/${r.id}/edit`}
                        className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="ml-3 text-red-600 hover:text-red-800 dark:text-red-200"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
