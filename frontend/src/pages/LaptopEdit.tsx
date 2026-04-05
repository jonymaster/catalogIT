import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { LaptopForm } from "../components/LaptopForm";
import type { Laptop } from "../types/models";

export function LaptopEdit() {
  const { id } = useParams<{ id: string }>();
  const [laptop, setLaptop] = useState<Laptop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    client
      .get<Laptop>(`/api/laptops/${id}`)
      .then((r) => setLaptop(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  if (!laptop)
    return <p className="text-sm text-red-600">Laptop not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/hardware/${id}`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to {laptop.model_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Edit {laptop.model_name}
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <LaptopForm initial={laptop} />
      </div>
    </div>
  );
}
