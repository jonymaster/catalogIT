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
            className="rounded-md bg-gray-900 dark:bg-gray-100 px-3 py-1.5 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
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
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
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
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {r.fiscal_year}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.purchase_year ?? "--"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {TYPE_LABELS[r.record_type] ?? r.record_type}
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
