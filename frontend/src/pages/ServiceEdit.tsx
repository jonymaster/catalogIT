import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { ServiceForm } from "../components/ServiceForm";
import type { Service } from "../types/models";

export function ServiceEdit() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    client
      .get<Service>(`/api/services/${id}`)
      .then((r) => setService(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  if (!service)
    return <p className="text-sm text-red-600">Service not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/services/${id}`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to {service.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Edit {service.name}
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <ServiceForm initial={service} />
      </div>
    </div>
  );
}
