import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
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

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Cost Records</h2>
        {canEdit && (
          <Link
            to={`/services/${service.id}/costs/new`}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add Cost Record
          </Link>
        )}
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-500">
          No cost records yet for this service.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Fiscal Year
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Payment Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Notes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Recorded By
                </th>
                {canEdit && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {r.fiscal_year}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {TYPE_LABELS[r.record_type] ?? r.record_type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                    ${Number(r.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {r.payment_method_name || "--"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-700">
                    {r.notes || "--"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {r.recorded_by_name || "--"}
                  </td>
                  {canEdit && (
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <Link
                        to={`/services/${service.id}/costs/${r.id}/edit`}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="ml-3 text-red-600 hover:text-red-800"
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
