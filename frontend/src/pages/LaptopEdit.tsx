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

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!laptop)
    return <p className="text-sm text-red-600">Laptop not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/hardware/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to {laptop.model_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          Edit {laptop.model_name}
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <LaptopForm initial={laptop} />
      </div>
    </div>
  );
}
