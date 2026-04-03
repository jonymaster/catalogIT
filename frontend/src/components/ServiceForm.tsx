import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import type {
  Service,
  User,
  Vendor,
  Category,
  PaymentMethod,
  ServiceStatus,
} from "../types/models";

interface Props {
  initial?: Service;
}

interface FormData {
  name: string;
  status: string;
  license_type: string;
  billing_schedule: string;
  renewal_date: string;
  yearly_cost: string;
  sso_integrated: boolean;
  automated_provisioning: boolean;
  notes: string;
  owner_ids: string[];
  vendor_id: string;
  category_id: string;
  payment_method_id: string;
  service_status_id: string;
  classification: string;
  service_type: string;
  scim_enabled: boolean;
  scim_notes: string;
  criticality: string;
  nonprofit_pricing: boolean;
}
const CLASSIFICATION_OPTIONS = ["core_saas", "subscription"];
const SERVICE_TYPE_OPTIONS = ["contract", "self_managed", "deprecated"];
const BILLING_OPTIONS = ["monthly", "annually", "on_demand", "na"];
const CRITICALITY_OPTIONS = ["Critical", "High", "Medium", "Low"];

function toFormData(s?: Service): FormData {
  return {
    name: s?.name ?? "",
    status: s?.status ?? "Contract",
    license_type: s?.license_type ?? "",
    billing_schedule: s?.billing_schedule ?? "",
    renewal_date: s?.renewal_date ?? "",
    yearly_cost: s?.yearly_cost != null ? String(s.yearly_cost) : "",
    sso_integrated: s?.sso_integrated ?? false,
    automated_provisioning: s?.automated_provisioning ?? false,
    notes: s?.notes ?? "",
    owner_ids: s?.owners.map((o) => o.id) ?? [],
    vendor_id: s?.vendor_id ?? "",
    category_id: s?.category_id ?? "",
    payment_method_id: s?.payment_method_id ?? "",
    service_status_id: s?.service_status_id ?? "",
    classification: s?.classification ?? "",
    service_type: s?.service_type ?? "",
    scim_enabled: s?.scim_enabled ?? false,
    scim_notes: s?.scim_notes ?? "",
    criticality: s?.criticality ?? "",
    nonprofit_pricing: s?.nonprofit_pricing ?? false,
  };
}

export function ServiceForm({ initial }: Props) {
  const navigate = useNavigate();
  const isEdit = !!initial;

  const [form, setForm] = useState<FormData>(() => toFormData(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [serviceStatuses, setServiceStatuses] = useState<ServiceStatus[]>([]);

  useEffect(() => {
    Promise.all([
      client.get<User[]>("/api/settings/users/"),
      client.get<Vendor[]>("/api/vendors/"),
      client.get<Category[]>("/api/categories/"),
      client.get<PaymentMethod[]>("/api/payment-methods/"),
      client.get<ServiceStatus[]>("/api/service-statuses/"),
    ]).then(([u, v, c, p, s]) => {
      setUsers(u.data);
      setVendors(v.data);
      setCategories(c.data);
      setPaymentMethods(p.data);
      setServiceStatuses(s.data);
    });
  }, []);

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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      status: form.status,
      license_type: form.license_type,
      billing_schedule: form.billing_schedule,
      renewal_date: form.renewal_date || null,
      yearly_cost: form.yearly_cost ? Number(form.yearly_cost) : null,
      sso_integrated: form.sso_integrated,
      automated_provisioning: form.automated_provisioning,
      notes: form.notes || null,
      owner_ids: form.owner_ids,
      vendor_id: form.vendor_id || null,
      category_id: form.category_id || null,
      payment_method_id: form.payment_method_id || null,
      service_status_id: form.service_status_id || null,
      classification: form.classification || null,
      service_type: form.service_type || null,
      scim_enabled: form.scim_enabled,
      scim_notes: form.scim_notes || null,
      criticality: form.criticality || null,
      nonprofit_pricing: form.nonprofit_pricing,
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
    "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500";
  const labelCls = "block text-sm font-medium text-gray-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Name *</label>
          <input
            required
            className={inputCls}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Status</label>
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

        <div>
          <label className={labelCls}>Classification</label>
          <select
            className={inputCls}
            value={form.classification}
            onChange={(e) => set("classification", e.target.value)}
          >
            <option value="">-- None --</option>
            {CLASSIFICATION_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o === "core_saas" ? "Core SaaS" : "Subscription"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Criticality</label>
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

        <div>
          <label className={labelCls}>Vendor</label>
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

        <div>
          <label className={labelCls}>Category</label>
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

        <div>
          <label className={labelCls}>License Type</label>
          <input
            className={inputCls}
            value={form.license_type}
            onChange={(e) => set("license_type", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Service Type</label>
          <select
            className={inputCls}
            value={form.service_type}
            onChange={(e) => set("service_type", e.target.value)}
          >
            <option value="">-- None --</option>
            {SERVICE_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Billing Schedule</label>
          <select
            className={inputCls}
            value={form.billing_schedule}
            onChange={(e) => set("billing_schedule", e.target.value)}
          >
            <option value="">-- None --</option>
            {BILLING_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Renewal Date</label>
          <input
            type="date"
            className={inputCls}
            value={form.renewal_date}
            onChange={(e) => set("renewal_date", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Yearly Cost ($)</label>
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={form.yearly_cost}
            onChange={(e) => set("yearly_cost", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Payment Method</label>
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

        <div>
          <label className={labelCls}>Owners</label>
          <select
            multiple
            className={inputCls + " h-28"}
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
          <p className="mt-1 text-xs text-gray-500">Hold Ctrl/Cmd to select multiple</p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.sso_integrated}
              onChange={(e) => set("sso_integrated", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            SSO Integrated
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.automated_provisioning}
              onChange={(e) => set("automated_provisioning", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Automated Provisioning
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.scim_enabled}
              onChange={(e) => set("scim_enabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            SCIM Enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.nonprofit_pricing}
              onChange={(e) => set("nonprofit_pricing", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Nonprofit Pricing
          </label>
        </div>
      </div>

      <div>
        <label className={labelCls}>SCIM Notes</label>
        <input
          className={inputCls}
          value={form.scim_notes}
          onChange={(e) => set("scim_notes", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          className={inputCls}
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Update Service" : "Create Service"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
