import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import client from "../api/client";
import { CostRecordForm } from "../components/CostRecordForm";
import type { CostRecord } from "../types/models";

export function CostRecordEdit() {
  const { id, costId } = useParams<{ id: string; costId: string }>();
  const [record, setRecord] = useState<CostRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !costId) return;
    client
      .get<CostRecord>(`/api/services/${id}/cost-records/${costId}`)
      .then((r) => setRecord(r.data))
      .finally(() => setLoading(false));
  }, [id, costId]);

  if (!id) return null;
  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!record)
    return <p className="text-sm text-red-600">Cost record not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/services/${id}/costs`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Costs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          Edit Cost Record
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <CostRecordForm serviceId={id} initial={record} />
      </div>
    </div>
  );
}
