import { useOutletContext } from "react-router-dom";
import { Attachments } from "../components/Attachments";
import { AuditTimeline } from "../components/AuditTimeline";
import {
  BooleanYesNoBadge,
  ClassificationBadge,
  ColoredReferenceBadge,
  CriticalityBadge,
} from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import { formatBillingSchedule } from "../service/serviceBilling";
import {
  SERVICE_FIELD_LABELS,
  SERVICE_VIEW_SECTIONS,
  type ServiceFieldKey,
} from "../service/serviceViewLayout";
import type { Service, UserPreferences } from "../types/models";
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
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function renderField(
  key: ServiceFieldKey,
  service: Service,
  preferences: UserPreferences | null,
) {
  switch (key) {
    case "status": {
      const label = service.service_status?.name ?? service.status;
      return (
        <Field label={SERVICE_FIELD_LABELS.status}>
          {service.service_status ? (
            <ColoredReferenceBadge
              label={service.service_status.name}
              color={service.service_status.color}
            />
          ) : (
            <StatusBadge status={label} />
          )}
        </Field>
      );
    }
    case "owners":
      return (
        <Field label={SERVICE_FIELD_LABELS.owners}>
          {service.owners.length > 0
            ? service.owners
                .map((o) => `${o.first_name} ${o.last_name}`)
                .join(", ")
            : "--"}
        </Field>
      );
    case "total_seats": {
      const occupied = service.assignees?.length ?? 0;
      const cap = service.total_seats;
      const second = cap != null ? String(cap) : "∞";
      return (
        <Field label="Seat usage">
          {occupied} / {second}
        </Field>
      );
    }
    case "classification":
      return (
        <Field label={SERVICE_FIELD_LABELS.classification}>
          <ClassificationBadge classification={service.service_classification} />
        </Field>
      );
    case "criticality":
      return (
        <Field label={SERVICE_FIELD_LABELS.criticality}>
          <CriticalityBadge value={service.criticality} />
        </Field>
      );
    case "sso_integrated":
      return (
        <Field label={SERVICE_FIELD_LABELS.sso_integrated}>
          <BooleanYesNoBadge value={service.sso_integrated} />
        </Field>
      );
    case "scim_enabled":
      return (
        <Field label={SERVICE_FIELD_LABELS.scim_enabled}>
          <BooleanYesNoBadge value={service.scim_enabled} />
        </Field>
      );
    case "vendor":
      return (
        <Field label={SERVICE_FIELD_LABELS.vendor}>
          {service.vendor?.name ?? "--"}
        </Field>
      );
    case "spending_category":
      return (
        <Field label={SERVICE_FIELD_LABELS.spending_category}>
          {service.category_rel ? (
            <ColoredReferenceBadge
              label={service.category_rel.name}
              color={service.category_rel.color}
            />
          ) : (
            "--"
          )}
        </Field>
      );
    case "cost_center":
      return (
        <Field label={SERVICE_FIELD_LABELS.cost_center}>
          {service.cost_center?.name ?? "--"}
        </Field>
      );
    case "billing_schedule":
      return (
        <Field label={SERVICE_FIELD_LABELS.billing_schedule}>
          {formatBillingSchedule(service.billing_schedule)}
        </Field>
      );
    case "renewal_reminders": {
      const custom =
        service.renewal_offsets_days && service.renewal_offsets_days.length > 0;
      const detail = custom
        ? `Custom offsets: ${service.renewal_offsets_days!.join(", ")} days before renewal`
        : "Using global default reminder schedule from Settings";
      return (
        <div className="sm:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {SERVICE_FIELD_LABELS.renewal_reminders}
          </p>
          <p className="mt-2 text-sm text-gray-900 dark:text-gray-100">
            Email reminders:{" "}
            {service.renewal_reminders_enabled ? "Enabled" : "Disabled"}
          </p>
          {service.renewal_reminders_enabled && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{detail}</p>
          )}
        </div>
      );
    }
    case "renewal_date":
      return (
        <Field label={SERVICE_FIELD_LABELS.renewal_date}>
          {formatDateOnly(service.renewal_date, preferences)}
        </Field>
      );
    case "yearly_cost":
      return (
        <Field label={SERVICE_FIELD_LABELS.yearly_cost}>
          {service.yearly_cost != null
            ? `$${Number(service.yearly_cost).toLocaleString()}`
            : "--"}
        </Field>
      );
    case "payment_method":
      return (
        <Field label={SERVICE_FIELD_LABELS.payment_method}>
          {service.payment_method ? (
            <ColoredReferenceBadge
              label={service.payment_method.name}
              color={service.payment_method.color}
            />
          ) : (
            "--"
          )}
        </Field>
      );
    case "nonprofit_pricing":
      return (
        <Field label={SERVICE_FIELD_LABELS.nonprofit_pricing}>
          <BooleanYesNoBadge value={service.nonprofit_pricing} />
        </Field>
      );
    case "notes":
      return (
        <Field label={SERVICE_FIELD_LABELS.notes}>
          {service.notes?.trim() ? service.notes : "—"}
        </Field>
      );
    case "point_of_contact":
      return (
        <Field label={SERVICE_FIELD_LABELS.point_of_contact}>
          {service.point_of_contact?.trim() ? service.point_of_contact : "—"}
        </Field>
      );
    default:
      return null;
  }
}

export function ServiceOverview() {
  const { service } = useOutletContext<{ service: Service }>();
  const { preferences } = useAuth();

  return (
    <div className="space-y-8">
      {SERVICE_VIEW_SECTIONS.map((section) => (
        <div
          key={section.id}
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
        >
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            {section.title}
          </h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((key) => (
              <div
                key={key}
                className={
                  key === "notes" ||
                  key === "renewal_reminders" ||
                  key === "point_of_contact"
                    ? "col-span-full"
                    : undefined
                }
              >
                {renderField(key, service, preferences)}
              </div>
            ))}
          </dl>
        </div>
      ))}

      <Attachments entityType="service" entityId={service.id} />

      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-100">
          Change History
        </h2>
        <AuditTimeline
          tableName="services"
          recordId={service.id}
          perPage={10}
        />
      </div>
    </div>
  );
}
