import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { Attachments } from "../components/Attachments";
import { AuditTimeline } from "../components/AuditTimeline";
import { StatusBadge } from "../components/StatusBadge";
import type { Service } from "../types/models";

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

export function ServiceDetail() {
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

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!service) return <p className="text-sm text-red-600">Service not found.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/services" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to Services
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{service.name}</h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
          <Field label="Status">
            <StatusBadge status={service.status} />
          </Field>
          <Field label="Category">{service.category || "--"}</Field>
          <Field label="License Type">{service.license_type || "--"}</Field>
          <Field label="Billing Schedule">{service.billing_schedule || "--"}</Field>
          <Field label="Yearly Cost">
            {service.yearly_cost != null
              ? `$${Number(service.yearly_cost).toLocaleString()}`
              : "--"}
          </Field>
          <Field label="SSO Integrated">{service.sso_integrated ? "Yes" : "No"}</Field>
          <Field label="Auto Provisioning">
            {service.automated_provisioning ? "Yes" : "No"}
          </Field>
          <Field label="Owners">
            {service.owners.length > 0
              ? service.owners
                  .map((o) => `${o.first_name} ${o.last_name}`)
                  .join(", ")
              : "--"}
          </Field>
          {service.notes && (
            <div className="col-span-full">
              <Field label="Notes">{service.notes}</Field>
            </div>
          )}
        </dl>
      </div>

      <Attachments entityType="service" entityId={service.id} />

      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900">Change History</h2>
        <AuditTimeline tableName="services" recordId={service.id} />
      </div>
    </div>
  );
}
