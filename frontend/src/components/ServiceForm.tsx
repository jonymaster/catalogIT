import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { useToast } from "../context/useToast";
import type { ServiceDraft, ServiceValidationErrors } from "../service/serviceDetailContext";
import { validateDraft } from "../service/serviceDetailContext";
import { RenewalConfigField } from "./RenewalConfigField";
import { parseRenewalOffsets } from "../service/renewalConfig";
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

type RelatedServiceOption = Pick<Service, "id" | "name" | "is_active">;

interface RefData {
  vendors: Vendor[];
  categories: Category[];
  costCenters: CostCenter[];
  paymentMethods: PaymentMethod[];
  classifications: ServiceClassification[];
}

// Extra fields carried by this form beyond ServiceDraft. The backend accepts
// them but the shared ServiceDraft/Service types haven't been extended yet.
interface ExtraFields {
  renewal_date: string;
  subcategory: string;
  environment: string;
  related_service_ids: string[];
  renewal_reminders_enabled: boolean;
  renewal_offsets_text: string;
  notification_recipient_ids: string[];
}

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
    renewal_config: s?.renewal_config ?? null,
    criticality: s?.criticality ?? "",
    total_seats: s?.total_seats != null ? String(s.total_seats) : "",
    sso_integrated: s?.sso_integrated ?? false,
    scim_enabled: s?.scim_enabled ?? false,
    nonprofit_pricing: s?.nonprofit_pricing ?? false,
    owner_ids: s?.owners.map((o) => o.id) ?? [],
    tags: s?.tags ?? [],
  };
}

function toExtraFields(s?: Service): ExtraFields {
  return {
    renewal_date: s?.renewal_date ?? "",
    subcategory: s?.subcategory ?? "",
    environment: s?.environment ?? "",
    related_service_ids: s?.related_services.map((rs) => rs.id) ?? [],
    renewal_reminders_enabled: s?.renewal_reminders_enabled ?? true,
    renewal_offsets_text: s?.renewal_offsets_days?.join(", ") ?? "",
    notification_recipient_ids:
      s?.notification_recipients.map((u) => u.id) ?? [],
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
  const [extras, setExtras] = useState<ExtraFields>(() => toExtraFields(initial));
  const [offsetsError, setOffsetsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ServiceValidationErrors>({});
  const submitLockRef = useRef(false);
  const [refData, setRefData] = useState<RefData | null>(null);
  const [serviceOptions, setServiceOptions] = useState<RelatedServiceOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.get<Vendor[]>("/api/vendors/"),
      client.get<Category[]>("/api/categories/"),
      client.get<CostCenter[]>("/api/cost-centers/"),
      client.get<PaymentMethod[]>("/api/payment-methods/"),
      client.get<ServiceClassification[]>("/api/service-classifications/"),
      client.get<Service[]>("/api/services/"),
    ]).then(([v, c, cc, p, cl, svcRes]) => {
      if (cancelled) return;
      setRefData({
        vendors: v.data,
        categories: c.data,
        costCenters: cc.data,
        paymentMethods: p.data,
        classifications: cl.data,
      });
      setServiceOptions(svcRes.data);
    });
    return () => {
      cancelled = true;
    };
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

  function set<K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setExtra<K extends keyof ExtraFields>(key: K, value: ExtraFields[K]) {
    setExtras((prev) => ({ ...prev, [key]: value }));
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
    const parsedOffsets = parseRenewalOffsets(extras.renewal_offsets_text);
    if (!parsedOffsets.ok) {
      setOffsetsError(parsedOffsets.message);
      return;
    }
    setOffsetsError(null);
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
      renewal_config: draft.renewal_config,
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
      tag_ids: draft.tags.map((tag) => tag.id),
      // Extra fields supported by backend but not yet on ServiceDraft.
      renewal_date: extras.renewal_date || null,
      subcategory: extras.subcategory.trim() || null,
      environment: extras.environment.trim() || null,
      related_service_ids: extras.related_service_ids,
      // Renewal notification config — aligned with the ServiceNotifications
      // page so the create and edit flows expose the same controls.
      renewal_reminders_enabled: extras.renewal_reminders_enabled,
      renewal_offsets_days: parsedOffsets.value,
      notification_recipient_ids: extras.notification_recipient_ids,
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
                Subcategory
              </label>
              <input
                type="text"
                value={extras.subcategory}
                onChange={(e) => setExtra("subcategory", e.target.value)}
                placeholder="e.g. Collaboration"
                className={fieldClass(false) + " mt-1"}
              />
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
                Environment
              </label>
              <input
                type="text"
                value={extras.environment}
                onChange={(e) => setExtra("environment", e.target.value)}
                placeholder="e.g. Production"
                className={fieldClass(false) + " mt-1"}
              />
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
                Renewal Date
              </label>
              <input
                type="date"
                value={extras.renewal_date}
                onChange={(e) => setExtra("renewal_date", e.target.value)}
                className={fieldClass(false) + " mt-1"}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Renewal
              </label>
              <div className="mt-1">
                <RenewalConfigField
                  value={draft.renewal_config}
                  onChange={(cfg) => set("renewal_config", cfg)}
                  error={errors.renewal_config}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Related Services
              </label>
              <select
                multiple
                value={extras.related_service_ids}
                onChange={(e) =>
                  setExtra(
                    "related_service_ids",
                    Array.from(e.target.selectedOptions, (option) => option.value),
                  )
                }
                className={fieldClass(false) + " mt-1 h-28"}
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
              <p className="mt-1 text-xs text-fg-3">
                Hold Ctrl/Cmd to select multiple related services.
              </p>
            </div>

            {isEdit && initial && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
                  Yearly Cost
                </label>
                <p className="mt-1">
                  <Link
                    to={`/services/${initial.id}/costs`}
                    className="inline-flex text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {initial.yearly_cost != null
                      ? `$${Number(initial.yearly_cost).toLocaleString()}`
                      : "Costs page"}
                  </Link>
                </p>
              </div>
            )}

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
        <h2 className="mb-1 text-base font-semibold text-fg">
          Renewal notifications
        </h2>
        <p className="mb-4 text-xs text-fg-3">
          Owners and admins always receive reminders. Use the controls below
          to enable or silence this service's reminders, override the global
          offsets, and add extra recipients. Global defaults live in Settings
          &rarr; Notifications.
        </p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-fg-3">
                Reminders enabled
              </div>
              <p className="mt-1 text-xs text-fg-3">
                Turn off to silence renewal reminders for this service.
              </p>
            </div>
            <Toggle
              checked={extras.renewal_reminders_enabled}
              onChange={(v) =>
                setExtra("renewal_reminders_enabled", v)
              }
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
              Offsets override (days before renewal)
            </label>
            <input
              type="text"
              value={extras.renewal_offsets_text}
              onChange={(e) => {
                setExtra("renewal_offsets_text", e.target.value);
                if (offsetsError) setOffsetsError(null);
              }}
              placeholder="e.g. 30, 14, 7, 1"
              className={fieldClass(Boolean(offsetsError)) + " mt-1"}
            />
            <p className="mt-1 text-xs text-fg-3">
              Comma-separated positive integers. Leave empty to use the
              global defaults.
            </p>
            {offsetsError && (
              <p className="mt-1 text-xs text-danger">{offsetsError}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
              Extra recipients
            </label>
            <p className="mt-1 text-xs text-fg-3">
              Users added here receive reminders for this service only, in
              addition to owners, admins, and globally-configured
              recipients.
            </p>
            <div className="mt-2">
              <UserDirectoryCheckboxPicker
                variant="overview"
                value={extras.notification_recipient_ids}
                onChange={(ids) =>
                  setExtra("notification_recipient_ids", ids)
                }
                seedUsers={initial?.notification_recipients}
              />
            </div>
          </div>
        </div>
      </section>

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
