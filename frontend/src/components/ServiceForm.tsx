import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { formatBillingSchedule } from "../service/serviceBilling";
import {
  SERVICE_FIELD_LABELS,
  SERVICE_VIEW_SECTIONS,
  type ServiceFieldKey,
} from "../service/serviceViewLayout";
import type {
  Service,
  User,
  Vendor,
  Category,
  CostCenter,
  PaymentMethod,
  ServiceStatus,
  ServiceClassification,
} from "../types/models";

interface Props {
  initial?: Service;
}

interface FormData {
  name: string;
  description: string;
  status: string;
  billing_schedule: string;
  renewal_date: string;
  subcategory: string;
  environment: string;
  sso_integrated: boolean;
  point_of_contact: string;
  notes: string;
  owner_ids: string[];
  related_service_ids: string[];
  vendor_id: string;
  category_id: string;
  cost_center_id: string;
  payment_method_id: string;
  service_status_id: string;
  classification_id: string;
  scim_enabled: boolean;
  criticality: string;
  nonprofit_pricing: boolean;
  renewal_reminders_enabled: boolean;
  renewal_use_custom_offsets: boolean;
  renewal_offsets_input: string;
  total_seats: string;
}

type RelatedServiceOption = Pick<Service, "id" | "name" | "is_active">;

type ServiceFieldErrorKey =
  | "name"
  | "owner_ids"
  | "renewal_offsets_input"
  | "total_seats";

const BILLING_OPTIONS = ["annually", "monthly", "na", "on_demand"] as const;
const CRITICALITY_OPTIONS = ["Critical", "High", "Medium", "Low"];

function toFormData(s?: Service): FormData {
  return {
    name: s?.name ?? "",
    description: s?.description ?? "",
    status: s?.status ?? "Contract",
    billing_schedule: s?.billing_schedule ?? "",
    renewal_date: s?.renewal_date ?? "",
    subcategory: s?.subcategory ?? "",
    environment: s?.environment ?? "",
    sso_integrated: s?.sso_integrated ?? false,
    point_of_contact: s?.point_of_contact ?? "",
    notes: s?.notes ?? "",
    owner_ids: s?.owners.map((o) => o.id) ?? [],
    related_service_ids: s?.related_services.map((related) => related.id) ?? [],
    vendor_id: s?.vendor_id ?? "",
    category_id: s?.category_id ?? "",
    cost_center_id: s?.cost_center_id ?? "",
    payment_method_id: s?.payment_method_id ?? "",
    service_status_id: s?.service_status_id ?? "",
    classification_id: s?.classification_id ?? "",
    scim_enabled: s?.scim_enabled ?? false,
    criticality: s?.criticality ?? "",
    nonprofit_pricing: s?.nonprofit_pricing ?? false,
    renewal_reminders_enabled: s?.renewal_reminders_enabled ?? true,
    renewal_use_custom_offsets: Boolean(
      s?.renewal_offsets_days && s.renewal_offsets_days.length > 0,
    ),
    renewal_offsets_input:
      s?.renewal_offsets_days?.join(", ") ?? "30, 14, 7, 1",
    total_seats: s?.total_seats != null ? String(s.total_seats) : "",
  };
}

export function ServiceForm({ initial }: Props) {
  const navigate = useNavigate();
  const isEdit = !!initial;

  const [form, setForm] = useState<FormData>(() => toFormData(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ServiceFieldErrorKey, string>>
  >({});

  const [users, setUsers] = useState<User[]>([]);
  const [serviceOptions, setServiceOptions] = useState<RelatedServiceOption[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [serviceStatuses, setServiceStatuses] = useState<ServiceStatus[]>([]);
  const [serviceClassifications, setServiceClassifications] = useState<
    ServiceClassification[]
  >([]);

  useEffect(() => {
    Promise.all([
      client.get<User[]>("/api/users/"),
      client.get<Service[]>("/api/services/"),
      client.get<Vendor[]>("/api/vendors/"),
      client.get<Category[]>("/api/categories/"),
      client.get<CostCenter[]>("/api/cost-centers/"),
      client.get<PaymentMethod[]>("/api/payment-methods/"),
      client.get<ServiceStatus[]>("/api/service-statuses/"),
      client.get<ServiceClassification[]>("/api/service-classifications/"),
    ]).then(([u, serviceRes, v, c, cc, p, s, cl]) => {
      setUsers(u.data);
      setServiceOptions(serviceRes.data);
      setVendors(v.data);
      setCategories(c.data);
      setCostCenters(cc.data);
      setPaymentMethods(p.data);
      setServiceStatuses(s.data);
      setServiceClassifications(cl.data);
    });
  }, []);

  const relatedServiceOptions = useMemo(() => {
    const merged = new Map<string, RelatedServiceOption>();

    serviceOptions.forEach((service) => {
      merged.set(service.id, service);
    });
    initial?.related_services.forEach((service) => {
      if (!merged.has(service.id)) {
        merged.set(service.id, service);
      }
    });

    return Array.from(merged.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [initial?.related_services, serviceOptions]);

  useEffect(() => {
    if (serviceStatuses.length === 0) {
      return;
    }

    setForm((current) => {
      if (
        current.service_status_id &&
        serviceStatuses.some((status) => status.id === current.service_status_id)
      ) {
        return current;
      }

      const matchedStatus = serviceStatuses.find(
        (status) => status.name === current.status,
      );
      if (!matchedStatus) {
        return current;
      }

      return {
        ...current,
        service_status_id: matchedStatus.id,
        status: matchedStatus.name,
      };
    });
  }, [serviceStatuses]);

  const selectedStatusValue = useMemo(() => {
    if (form.service_status_id) {
      return form.service_status_id;
    }
    if (form.status) {
      return `legacy:${form.status}`;
    }
    return "";
  }, [form.service_status_id, form.status]);

  const hasLegacyStatusOption = useMemo(
    () =>
      Boolean(
        form.status &&
          !serviceStatuses.some((status) => status.name === form.status),
      ),
    [form.status, serviceStatuses],
  );

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in fieldErrors) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as ServiceFieldErrorKey];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const nextErrors: Partial<Record<ServiceFieldErrorKey, string>> = {};
    const trimmedName = form.name.trim();

    if (!trimmedName) {
      nextErrors.name = "Name is required.";
    }

    if (form.owner_ids.length === 0) {
      nextErrors.owner_ids = "Select at least one owner.";
    }

    let renewal_offsets_days: number[] | null = null;
    if (form.renewal_use_custom_offsets) {
      const parts = form.renewal_offsets_input.split(/[\s,]+/).filter(Boolean);
      renewal_offsets_days = [];
      for (const p of parts) {
        const n = parseInt(p, 10);
        if (Number.isNaN(n) || n <= 0) {
          nextErrors.renewal_offsets_input =
            "Custom reminder offsets must be positive integers (e.g. 30, 14, 7, 1).";
          break;
        }
        renewal_offsets_days.push(n);
      }
      if (!nextErrors.renewal_offsets_input && renewal_offsets_days.length === 0) {
        nextErrors.renewal_offsets_input =
          "Enter at least one reminder offset, or turn off custom offsets.";
      }
      if (
        !nextErrors.renewal_offsets_input &&
        new Set(renewal_offsets_days).size !== renewal_offsets_days.length
      ) {
        nextErrors.renewal_offsets_input =
          "Custom reminder offsets must not contain duplicates.";
      }
    }

    let total_seats: number | null = null;
    if (form.total_seats.trim() !== "") {
      const n = parseInt(form.total_seats, 10);
      if (Number.isNaN(n) || n < 1) {
        nextErrors.total_seats =
          "Number of seats must be a positive integer, or leave blank for unlimited.";
      } else {
        total_seats = n;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Fix the highlighted fields and try again.");
      setSaving(false);
      return;
    }

    setFieldErrors({});

    const payload = {
      name: trimmedName,
      description: form.description.trim() || null,
      status: form.status,
      billing_schedule: form.billing_schedule,
      renewal_date: form.renewal_date || null,
      subcategory: form.subcategory.trim() || null,
      environment: form.environment.trim() || null,
      sso_integrated: form.sso_integrated,
      point_of_contact: form.point_of_contact.trim() || null,
      notes: form.notes || null,
      owner_ids: form.owner_ids,
      related_service_ids: form.related_service_ids,
      assignee_ids: isEdit
        ? (initial?.assignees ?? []).map((a) => a.id)
        : [],
      total_seats,
      vendor_id: form.vendor_id || null,
      category_id: form.category_id || null,
      cost_center_id: form.cost_center_id || null,
      payment_method_id: form.payment_method_id || null,
      service_status_id: form.service_status_id || null,
      classification_id: form.classification_id || null,
      scim_enabled: form.scim_enabled,
      criticality: form.criticality || null,
      nonprofit_pricing: form.nonprofit_pricing,
      renewal_reminders_enabled: form.renewal_reminders_enabled,
      renewal_offsets_days: renewal_offsets_days,
    };

    try {
      if (isEdit) {
        await client.put(`/api/services/${initial.id}`, payload);
        navigate(`/services/${initial.id}`);
      } else {
        const res = await client.post<Service>("/api/services/", payload);
        navigate(`/services/${res.data.id}`);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save service";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-200";
  const withError = (key: ServiceFieldErrorKey, extra = "") =>
    [
      inputCls,
      fieldErrors[key] ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "",
      extra,
    ]
      .filter(Boolean)
      .join(" ");
  const sectionCardCls =
    "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm";

  function renderFieldControl(key: ServiceFieldKey) {
    switch (key) {
      case "status":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.status}</label>
            <select
              className={inputCls}
              value={selectedStatusValue}
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith("legacy:")) {
                  set("service_status_id", "");
                  set("status", value.replace("legacy:", ""));
                  return;
                }

                const selectedStatus = serviceStatuses.find(
                  (status) => status.id === value,
                );
                set("service_status_id", value);
                set("status", selectedStatus?.name ?? "");
              }}
            >
              {serviceStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
              {hasLegacyStatusOption && (
                <option value={`legacy:${form.status}`}>
                  {form.status} (legacy value)
                </option>
              )}
            </select>
          </div>
        );
      case "owners":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.owners}</label>
            <select
              multiple
              className={withError("owner_ids", "h-28")}
              value={form.owner_ids}
              onChange={(e) =>
                set(
                  "owner_ids",
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Hold Ctrl/Cmd to select multiple
            </p>
            {fieldErrors.owner_ids && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.owner_ids}</p>
            )}
          </div>
        );
      case "classification":
        return (
          <div>
            <label className={labelCls}>
              {SERVICE_FIELD_LABELS.classification}
            </label>
            <select
              className={inputCls}
              value={form.classification_id}
              onChange={(e) => set("classification_id", e.target.value)}
            >
              <option value="">-- None --</option>
              {serviceClassifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "related_services":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.related_services}</label>
            <select
              multiple
              className={inputCls + " h-28"}
              value={form.related_service_ids}
              onChange={(e) =>
                set(
                  "related_service_ids",
                  Array.from(e.target.selectedOptions, (option) => option.value),
                )
              }
            >
              {relatedServiceOptions
                .filter((service) => service.id !== initial?.id)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                    {service.is_active ? "" : " (archived)"}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Hold Ctrl/Cmd to select multiple related services.
            </p>
          </div>
        );
      case "criticality":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.criticality}</label>
            <select
              className={inputCls}
              value={form.criticality}
              onChange={(e) => set("criticality", e.target.value)}
            >
              <option value="">-- None --</option>
              {CRITICALITY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        );
      case "sso_integrated":
        return (
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.sso_integrated}
                onChange={(e) => set("sso_integrated", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              {SERVICE_FIELD_LABELS.sso_integrated}
            </label>
          </div>
        );
      case "scim_enabled":
        return (
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.scim_enabled}
                onChange={(e) => set("scim_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              {SERVICE_FIELD_LABELS.scim_enabled}
            </label>
          </div>
        );
      case "vendor":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.vendor}</label>
            <select
              className={inputCls}
              value={form.vendor_id}
              onChange={(e) => set("vendor_id", e.target.value)}
            >
              <option value="">-- None --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "spending_category":
        return (
          <div>
            <label className={labelCls}>
              {SERVICE_FIELD_LABELS.spending_category}
            </label>
            <select
              className={inputCls}
              value={form.category_id}
              onChange={(e) => set("category_id", e.target.value)}
            >
              <option value="">-- None --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "subcategory":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.subcategory}</label>
            <input
              type="text"
              className={inputCls}
              value={form.subcategory}
              onChange={(e) => set("subcategory", e.target.value)}
              placeholder="e.g. Collaboration"
            />
          </div>
        );
      case "environment":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.environment}</label>
            <input
              type="text"
              className={inputCls}
              value={form.environment}
              onChange={(e) => set("environment", e.target.value)}
              placeholder="e.g. Production"
            />
          </div>
        );
      case "cost_center":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.cost_center}</label>
            <select
              className={inputCls}
              value={form.cost_center_id}
              onChange={(e) => set("cost_center_id", e.target.value)}
            >
              <option value="">-- None --</option>
              {costCenters.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "billing_schedule":
        return (
          <div>
            <label className={labelCls}>
              {SERVICE_FIELD_LABELS.billing_schedule}
            </label>
            <select
              className={inputCls}
              value={form.billing_schedule}
              onChange={(e) => set("billing_schedule", e.target.value)}
            >
              <option value="">-- None --</option>
              {BILLING_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {formatBillingSchedule(o)}
                </option>
              ))}
            </select>
          </div>
        );
      case "renewal_reminders":
        return (
          <div className="col-span-full space-y-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {SERVICE_FIELD_LABELS.renewal_reminders}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Owners receive emails at the configured days before renewal (global
              defaults in Settings → Notifications). Override the schedule for this
              service only if needed.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.renewal_reminders_enabled}
                onChange={(e) =>
                  set("renewal_reminders_enabled", e.target.checked)
                }
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              Send renewal reminder emails for this service
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.renewal_use_custom_offsets}
                onChange={(e) => {
                  set("renewal_use_custom_offsets", e.target.checked);
                  if (!e.target.checked) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.renewal_offsets_input;
                      return next;
                    });
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              Use custom reminder offsets (instead of global defaults)
            </label>
            {form.renewal_use_custom_offsets && (
              <div>
                <label className={labelCls}>Custom days before renewal</label>
                <input
                  type="text"
                  className={withError("renewal_offsets_input")}
                  value={form.renewal_offsets_input}
                  onChange={(e) =>
                    set("renewal_offsets_input", e.target.value)
                  }
                  placeholder="30, 14, 7, 1"
                />
                {fieldErrors.renewal_offsets_input && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.renewal_offsets_input}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      case "renewal_date":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.renewal_date}</label>
            <input
              type="date"
              className={inputCls}
              value={form.renewal_date}
              onChange={(e) => set("renewal_date", e.target.value)}
            />
          </div>
        );
      case "yearly_cost": {
        const linkCls =
          "inline-flex text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline";
        if (isEdit && initial) {
          return (
            <div>
              <span className={labelCls}>{SERVICE_FIELD_LABELS.yearly_cost}</span>
              <p className="mt-1">
                <Link
                  to={`/services/${initial.id}/costs`}
                  className={linkCls}
                >
                  {initial.yearly_cost != null
                    ? `$${Number(initial.yearly_cost).toLocaleString()}`
                    : "Costs page"}
                </Link>
              </p>
            </div>
          );
        }
        return (
          <div>
            <span className={labelCls}>{SERVICE_FIELD_LABELS.yearly_cost}</span>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              After you create this service, add fiscal amounts on its Costs tab.
            </p>
          </div>
        );
      }
      case "payment_method":
        return (
          <div>
            <label className={labelCls}>
              {SERVICE_FIELD_LABELS.payment_method}
            </label>
            <select
              className={inputCls}
              value={form.payment_method_id}
              onChange={(e) => set("payment_method_id", e.target.value)}
            >
              <option value="">-- None --</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "nonprofit_pricing":
        return (
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.nonprofit_pricing}
                onChange={(e) => set("nonprofit_pricing", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              {SERVICE_FIELD_LABELS.nonprofit_pricing}
            </label>
          </div>
        );
      case "total_seats":
        return (
          <div>
            <label className={labelCls}>{SERVICE_FIELD_LABELS.total_seats}</label>
            <input
              type="number"
              min={1}
              className={withError("total_seats")}
              value={form.total_seats}
              onChange={(e) => set("total_seats", e.target.value)}
              placeholder="Unlimited if empty"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Total licensed seats for this service. Leave empty if not capped.
            </p>
            {fieldErrors.total_seats && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.total_seats}</p>
            )}
          </div>
        );
      case "notes":
        return (
          <div className="col-span-full">
            <label className={labelCls}>{SERVICE_FIELD_LABELS.notes}</label>
            <textarea
              className={inputCls}
              rows={4}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        );
      case "point_of_contact":
        return (
          <div className="col-span-full">
            <label className={labelCls}>
              {SERVICE_FIELD_LABELS.point_of_contact}
            </label>
            <input
              type="text"
              className={inputCls}
              value={form.point_of_contact}
              onChange={(e) => set("point_of_contact", e.target.value)}
              placeholder="e.g. Jane Doe (Vendor Account Manager)"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Main person to contact for account management or vendor support.
            </p>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className={sectionCardCls}>
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          Service Summary
        </h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              required
              className={withError("name", "mt-1")}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <input
              maxLength={255}
              className={inputCls + " mt-1"}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Short service description"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {form.description.length}/255 characters
            </p>
          </div>
        </div>
      </div>

      {SERVICE_VIEW_SECTIONS.map((section) => (
        <div key={section.id} className={sectionCardCls}>
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                {renderFieldControl(key)}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Update Service" : "Create Service"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
