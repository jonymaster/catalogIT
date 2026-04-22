import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useToast } from "../context/useToast";
import { formatBillingSchedule } from "../service/serviceBilling";
import type { ServiceDraft, ServiceValidationErrors } from "../service/serviceDetailContext";
import { validateDraft } from "../service/serviceDetailContext";
import { TagPicker } from "./TagPicker";
import { UserDirectoryCheckboxPicker } from "./UserDirectoryCheckboxPicker";
import { Button } from "./ui/Button";
import type {
  Vendor,
  Category,
  CostCenter,
  PaymentMethod,
  ServiceClassification,
  Service,
} from "../types/models";

interface Props {
  initial?: Service;
}

interface ApiErrorDetail {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

interface CreateServiceResponse {
  id?: string | null;
}

interface RefData {
  vendors: Vendor[];
  categories: Category[];
  costCenters: CostCenter[];
  paymentMethods: PaymentMethod[];
  classifications: ServiceClassification[];
}

const BILLING_OPTIONS = ["annually", "monthly", "na", "on_demand"] as const;
const CRITICALITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const FLASH_TOAST_KEY = "catalogit:flash-toast";

function toDraft(s?: Service): ServiceDraft {
  return {
    name: s?.name ?? "",
    description: s?.description ?? "",
    notes: s?.notes ?? "",
    point_of_contact: s?.point_of_contact ?? "",
    vendor_id: s?.vendor_id ?? "",
    category_id: s?.category_id ?? "",
    cost_center_id: s?.cost_center_id ?? "",
    payment_method_id: s?.payment_method_id ?? "",
    service_status_id: s?.service_status_id ?? "",
    classification_id: s?.classification_id ?? "",
    billing_schedule: s?.billing_schedule ?? "",
    renewal_date: s?.renewal_date ?? "",
    yearly_cost: s?.yearly_cost != null ? String(s.yearly_cost) : "",
    criticality: s?.criticality ?? "",
    total_seats: s?.total_seats != null ? String(s.total_seats) : "",
    sso_integrated: s?.sso_integrated ?? false,
    scim_enabled: s?.scim_enabled ?? false,
    nonprofit_pricing: s?.nonprofit_pricing ?? false,
    owner_ids: s?.owners.map((o) => o.id) ?? [],
    tags: s?.tags ?? [],
  };
}

function fieldClass(hasError: boolean): string {
  return `block w-full rounded-md bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-4 transition-shadow focus:outline-none focus:ring-2 focus:ring-accent/30 ${
    hasError
      ? "border border-danger shadow-[0_0_0_3px_var(--danger-soft)]"
      : "border border-border-strong focus:border-accent"
  }`;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
        checked
          ? "border-accent bg-accent"
          : "border-border-strong bg-surface-3"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function ServiceForm({ initial }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEdit = !!initial;

  const [draft, setDraft] = useState<ServiceDraft>(() => toDraft(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ServiceValidationErrors>({});
  const submitLockRef = useRef(false);
  const [refData, setRefData] = useState<RefData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.get<Vendor[]>("/api/vendors/"),
      client.get<Category[]>("/api/categories/"),
      client.get<CostCenter[]>("/api/cost-centers/"),
      client.get<PaymentMethod[]>("/api/payment-methods/"),
      client.get<ServiceClassification[]>("/api/service-classifications/"),
    ]).then(([v, c, cc, p, cl]) => {
      if (cancelled) return;
      setRefData({
        vendors: v.data,
        categories: c.data,
        costCenters: cc.data,
        paymentMethods: p.data,
        classifications: cl.data,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function set<K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function getErrorMessage(err: unknown): string {
    const apiDetail = (err as ApiErrorDetail)?.response?.data?.detail;
    if (typeof apiDetail === "string" && apiDetail.trim()) {
      return apiDetail;
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return "Failed to save service";
  }

  function hardRedirect(path: string) {
    window.location.assign(path);
  }

  function queueSuccessToast(text: string) {
    try {
      sessionStorage.setItem(
        FLASH_TOAST_KEY,
        JSON.stringify({ type: "success", text }),
      );
    } catch {
      // Ignore storage failures; direct toast still gives feedback.
    }
  }

  function extractIdFromLocationHeader(locationHeader: unknown): string | null {
    if (typeof locationHeader !== "string" || !locationHeader.trim()) {
      return null;
    }
    const match = locationHeader.match(
      /\/api\/services\/([0-9a-fA-F-]{36})\/?$/,
    );
    return match?.[1] ?? null;
  }

  async function resolveCreatedServiceId(
    responseData: CreateServiceResponse | undefined,
    responseHeaders: unknown,
    expectedName: string,
    expectedDescription: string | null,
  ): Promise<string | null> {
    if (typeof responseData?.id === "string" && responseData.id.trim()) {
      return responseData.id;
    }

    const locationHeader =
      (responseHeaders as Record<string, unknown> | undefined)?.location ?? null;
    const fromLocation = extractIdFromLocationHeader(locationHeader);
    if (fromLocation) {
      return fromLocation;
    }

    const listRes = await client.get<Service[]>("/api/services/", {
      params: { archived: false },
    });
    const candidates = listRes.data
      .filter((service) => {
        const sameName = service.name.trim() === expectedName;
        const sameDescription =
          (service.description?.trim() ?? null) === expectedDescription;
        return sameName && sameDescription;
      })
      .sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    return candidates[0]?.id ?? null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLockRef.current) return;
    const validationErrors = validateDraft(draft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    submitLockRef.current = true;
    setSaving(true);
    setError(null);

    let total_seats: number | null = null;
    if (draft.total_seats.trim() !== "") {
      const n = parseInt(draft.total_seats, 10);
      if (Number.isNaN(n) || n < 1) {
        setError("Number of seats must be a positive integer, or leave blank for unlimited.");
        setSaving(false);
        submitLockRef.current = false;
        return;
      }
      total_seats = n;
    }

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      billing_schedule: draft.billing_schedule,
      renewal_date: draft.renewal_date || null,
      sso_integrated: draft.sso_integrated,
      point_of_contact: draft.point_of_contact.trim() || null,
      notes: draft.notes.trim() || null,
      owner_ids: draft.owner_ids,
      assignee_ids: isEdit
        ? (initial?.assignees ?? []).map((a) => a.id)
        : [],
      total_seats,
      vendor_id: draft.vendor_id || null,
      category_id: draft.category_id || null,
      cost_center_id: draft.cost_center_id || null,
      payment_method_id: draft.payment_method_id || null,
      service_status_id: draft.service_status_id || null,
      classification_id: draft.classification_id || null,
      scim_enabled: draft.scim_enabled,
      criticality: draft.criticality || null,
      nonprofit_pricing: draft.nonprofit_pricing,
      renewal_reminders_enabled: true,
      renewal_offsets_days: null,
      tag_ids: draft.tags.map((tag) => tag.id),
    };

    try {
      if (isEdit) {
        await client.put(`/api/services/${initial.id}`, payload);
        showToast({ type: "success", text: "Service updated." });
        queueSuccessToast("Service updated.");
        hardRedirect(`/services/${encodeURIComponent(initial.id)}`);
      } else {
        const res = await client.post<CreateServiceResponse>("/api/services/", payload);
        const createdServiceId = await resolveCreatedServiceId(
          res.data,
          res.headers,
          draft.name.trim(),
          draft.description.trim() || null,
        );
        if (createdServiceId) {
          showToast({ type: "success", text: "Service created." });
          queueSuccessToast("Service created.");
          hardRedirect(`/services/${encodeURIComponent(createdServiceId)}`);
        } else {
          showToast({ type: "success", text: "Service created." });
          queueSuccessToast("Service created.");
          hardRedirect("/services");
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
      submitLockRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          Please fix the highlighted fields before saving.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-fg">Name *</label>
        <input
          required
          className={fieldClass(Boolean(errors.name)) + " mt-1 max-w-xl"}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-danger">{errors.name}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-fg">General</h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Description
              </label>
              <textarea
                rows={3}
                maxLength={255}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What is this service for, who depends on it, any context..."
                className={fieldClass(false) + " mt-1"}
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Spending Category
              </label>
              <select
                value={draft.category_id}
                onChange={(e) => set("category_id", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {refData?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Classification
              </label>
              <select
                value={draft.classification_id}
                onChange={(e) => set("classification_id", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {refData?.classifications.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Criticality
              </label>
              <select
                value={draft.criticality}
                onChange={(e) => set("criticality", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {CRITICALITY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Vendor
              </label>
              <select
                value={draft.vendor_id}
                onChange={(e) => set("vendor_id", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {refData?.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Point of contact
              </label>
              <input
                type="text"
                value={draft.point_of_contact}
                onChange={(e) => set("point_of_contact", e.target.value)}
                placeholder="e.g. Jane Doe (Vendor Account Manager)"
                className={fieldClass(false) + " mt-1"}
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Cost Center
              </label>
              <select
                value={draft.cost_center_id}
                onChange={(e) => set("cost_center_id", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {refData?.costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Payment Method
              </label>
              <select
                value={draft.payment_method_id}
                onChange={(e) => set("payment_method_id", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {refData?.paymentMethods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Billing Schedule
              </label>
              <select
                value={draft.billing_schedule}
                onChange={(e) => set("billing_schedule", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              >
                <option value="">- None -</option>
                {BILLING_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {formatBillingSchedule(o)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Renewal Date
              </label>
              <input
                type="date"
                value={draft.renewal_date}
                onChange={(e) => set("renewal_date", e.target.value)}
                className={fieldClass(Boolean(errors.renewal_date)) + " mt-1"}
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Yearly Cost
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.yearly_cost}
                onChange={(e) => set("yearly_cost", e.target.value)}
                placeholder="0"
                className={fieldClass(Boolean(errors.yearly_cost)) + " mt-1"}
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Number of seats
              </label>
              <input
                type="number"
                min={1}
                value={draft.total_seats}
                onChange={(e) => set("total_seats", e.target.value)}
                placeholder="Unlimited if empty"
                className={fieldClass(Boolean(errors.total_seats)) + " mt-1"}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-5 lg:col-span-1">
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-fg">Owners</h2>
            <UserDirectoryCheckboxPicker
              variant="overview"
              value={draft.owner_ids}
              onChange={(ids) => set("owner_ids", ids)}
              seedUsers={initial?.owners}
            />
          </section>

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-fg">Tags</h2>
            <TagPicker
              value={draft.tags}
              onChange={(tags) => set("tags", tags)}
            />
          </section>

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-fg">
              Access &amp; Provisioning
            </h2>
            <dl className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
                  SSO integrated
                </dt>
                <dd>
                  <Toggle
                    checked={draft.sso_integrated}
                    onChange={(v) => set("sso_integrated", v)}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
                  SCIM provisioning
                </dt>
                <dd>
                  <Toggle
                    checked={draft.scim_enabled}
                    onChange={(v) => set("scim_enabled", v)}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
                  Nonprofit pricing
                </dt>
                <dd>
                  <Toggle
                    checked={draft.nonprofit_pricing}
                    onChange={(v) => set("nonprofit_pricing", v)}
                  />
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-fg">Notes</h2>
        <textarea
          rows={4}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={fieldClass(false)}
          placeholder="Internal notes about this service..."
        />
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update Service" : "Create Service"}
        </Button>
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
