import { useOutletContext } from "react-router-dom";
import { Attachments } from "../components/Attachments";
import { AuditTimeline } from "../components/AuditTimeline";
import { ClassificationBadge, CriticalityBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import type { Service } from "../types/models";
import { formatDateOnly } from "../utils/formatting";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export function ServiceOverview() {
  const { service } = useOutletContext<{ service: Service }>();
  const { preferences } = useAuth();

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
          <Field label="Status">
            <StatusBadge status={service.status} />
          </Field>
          <Field label="Category">{service.category || "--"}</Field>
          <Field label="License Type">{service.license_type || "--"}</Field>
          <Field label="Billing Schedule">
            {service.billing_schedule || "--"}
          </Field>
          <Field label="Renewal Date">
            {formatDateOnly(service.renewal_date, preferences)}
          </Field>
          <Field label="Yearly Cost">
            {service.yearly_cost != null
              ? `$${Number(service.yearly_cost).toLocaleString()}`
              : "--"}
          </Field>
          <Field label="SSO Integrated">
            {service.sso_integrated ? "Yes" : "No"}
          </Field>
          <Field label="Auto Provisioning">
            {service.automated_provisioning ? "Yes" : "No"}
          </Field>
          <Field label="Classification">
            <ClassificationBadge value={service.classification} />
          </Field>
          <Field label="Criticality">
            <CriticalityBadge value={service.criticality} />
          </Field>
          <Field label="Nonprofit Pricing">
            {service.nonprofit_pricing ? "Yes" : "No"}
          </Field>
          {service.vendor && (
            <Field label="Vendor">{service.vendor.name}</Field>
          )}
          <Field label="SCIM Enabled">
            {service.scim_enabled == null
              ? "--"
              : service.scim_enabled
                ? "Yes"
                : "No"}
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
        <h2 className="mb-4 text-lg font-medium text-gray-900">
          Change History
        </h2>
        <AuditTimeline tableName="services" recordId={service.id} />
      </div>
    </div>
  );
}
