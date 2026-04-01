import { Link, useParams } from "react-router-dom";
import { CostRecordForm } from "../components/CostRecordForm";

export function CostRecordCreate() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

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
          Add Cost Record
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <CostRecordForm serviceId={id} />
      </div>
    </div>
  );
}
