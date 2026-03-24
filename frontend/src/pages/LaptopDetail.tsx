import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { Attachments } from "../components/Attachments";
import { AuditTimeline } from "../components/AuditTimeline";
import { StatusBadge } from "../components/StatusBadge";
import type { Laptop } from "../types/models";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export function LaptopDetail() {
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
  if (!laptop) return <p className="text-sm text-red-600">Laptop not found.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/hardware" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to Hardware
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          {laptop.model_name}
        </h1>
        <p className="text-sm text-gray-500">S/N: {laptop.serial_number}</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
          <Field label="Status">
            <StatusBadge status={laptop.status} />
          </Field>
          <Field label="CPU">{laptop.cpu || "--"}</Field>
          <Field label="RAM">{laptop.ram || "--"}</Field>
          <Field label="Storage">{laptop.storage_size || "--"}</Field>
          <Field label="Assigned To">
            {laptop.assigned_to
              ? `${laptop.assigned_to.first_name} ${laptop.assigned_to.last_name} (${laptop.assigned_to.email})`
              : "Unassigned"}
          </Field>
          {laptop.notes && (
            <div className="col-span-full">
              <Field label="Notes">{laptop.notes}</Field>
            </div>
          )}
        </dl>
      </div>

      <Attachments entityType="laptop" entityId={laptop.id} />

      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900">Change History</h2>
        <AuditTimeline tableName="laptops" recordId={laptop.id} />
      </div>
    </div>
  );
}
