import { useEffect, useState, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import client from "../api/client";
import {
  BooleanYesNoBadge,
  ClassificationBadge,
  ColoredReferenceBadge,
  CriticalityBadge,
} from "../components/Badge";
import { Avatar } from "../components/ui/Avatar";
import { useAuth } from "../context/useAuth";
import { formatBillingSchedule } from "../service/serviceBilling";
import type {
  Category,
  CostCenter,
  PaymentMethod,
  Service,
  ServiceClassification,
  UserPreferences,
  Vendor,
} from "../types/models";
import { UserDirectoryCheckboxPicker } from "../components/UserDirectoryCheckboxPicker";
import { formatDateOnly } from "../utils/formatting";
import type {
  ServiceDetailContext,
  ServiceDraft,
  ServiceValidationErrors,
} from "../service/serviceDetailContext";

const BILLING_OPTIONS = ["annually", "monthly", "na", "on_demand"] as const;
const CRITICALITY_OPTIONS = ["Critical", "High", "Medium", "Low"] as const;

interface RefData {
  vendors: Vendor[];
  categories: Category[];
  costCenters: CostCenter[];
  paymentMethods: PaymentMethod[];
  classifications: ServiceClassification[];
}

function Row({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger">
          <span
            aria-hidden
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white"
          >
            !
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

function fieldClass(hasError: boolean): string {
  return `block w-full rounded-md bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-4 transition-shadow focus:outline-none focus:ring-2 focus:ring-accent/30 ${
    hasError
      ? "border border-danger shadow-[0_0_0_3px_var(--danger-soft)]"
      : "border border-border-strong focus:border-accent"
  }`;
}

function useRefData(editing: boolean): RefData | null {
  const [data, setData] = useState<RefData | null>(null);
  useEffect(() => {
    if (!editing || data) return;
    let cancelled = false;
    Promise.all([
      client.get<Vendor[]>("/api/vendors/"),
      client.get<Category[]>("/api/categories/"),
      client.get<CostCenter[]>("/api/cost-centers/"),
      client.get<PaymentMethod[]>("/api/payment-methods/"),
      client.get<ServiceClassification[]>("/api/service-classifications/"),
    ]).then(([v, c, cc, p, cl]) => {
      if (cancelled) return;
      setData({
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
  }, [editing, data]);
  return data;
}

interface LeftColumnProps {
  service: Service;
  preferences: UserPreferences | null;
  editing: boolean;
  draft: ServiceDraft;
  setField: ServiceDetailContext["setDraftField"];
  errors: ServiceValidationErrors;
  refData: RefData | null;
}

function LeftColumn({
  service,
  preferences,
  editing,
  draft,
  setField,
  errors,
  refData,
}: LeftColumnProps) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-fg">General</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Row label="Description">
            {editing ? (
              <textarea
                rows={3}
                maxLength={255}
                value={draft.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="What is this service for, who depends on it, any context…"
                className={fieldClass(false)}
              />
            ) : service.description ? (
              <p className="leading-relaxed text-fg">{service.description}</p>
            ) : (
              <span className="text-fg-4">No description yet.</span>
            )}
          </Row>
        </div>

        <Row label="Spending Category">
          {editing ? (
            <select
              value={draft.category_id}
              onChange={(e) => setField("category_id", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {refData?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : service.category_rel ? (
            <ColoredReferenceBadge
              label={service.category_rel.name}
              color={service.category_rel.color}
            />
          ) : (
            <span className="text-fg-4">—</span>
          )}
        </Row>

        <Row label="Classification">
          {editing ? (
            <select
              value={draft.classification_id}
              onChange={(e) => setField("classification_id", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {refData?.classifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <ClassificationBadge classification={service.service_classification} />
          )}
        </Row>

        <Row label="Criticality">
          {editing ? (
            <select
              value={draft.criticality}
              onChange={(e) => setField("criticality", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {CRITICALITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <CriticalityBadge value={service.criticality} />
          )}
        </Row>

        <Row label="Vendor">
          {editing ? (
            <select
              value={draft.vendor_id}
              onChange={(e) => setField("vendor_id", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {refData?.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            service.vendor?.name ?? <span className="text-fg-4">—</span>
          )}
        </Row>

        <div className="sm:col-span-2">
          <Row
            label="Point of contact"
            error={editing ? errors.point_of_contact : undefined}
          >
            {editing ? (
              <input
                type="text"
                value={draft.point_of_contact}
                onChange={(e) => setField("point_of_contact", e.target.value)}
                placeholder="e.g. Jane Doe (Vendor Account Manager)"
                className={fieldClass(false)}
              />
            ) : service.point_of_contact?.trim() ? (
              service.point_of_contact
            ) : (
              <span className="text-fg-4">—</span>
            )}
          </Row>
        </div>

        <Row label="Cost Center">
          {editing ? (
            <select
              value={draft.cost_center_id}
              onChange={(e) => setField("cost_center_id", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {refData?.costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.name}
                </option>
              ))}
            </select>
          ) : (
            service.cost_center?.name ?? <span className="text-fg-4">—</span>
          )}
        </Row>

        <Row label="Payment Method">
          {editing ? (
            <select
              value={draft.payment_method_id}
              onChange={(e) => setField("payment_method_id", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {refData?.paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : service.payment_method ? (
            <ColoredReferenceBadge
              label={service.payment_method.name}
              color={service.payment_method.color}
            />
          ) : (
            <span className="text-fg-4">—</span>
          )}
        </Row>

        <Row label="Billing Schedule">
          {editing ? (
            <select
              value={draft.billing_schedule}
              onChange={(e) => setField("billing_schedule", e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">— None —</option>
              {BILLING_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {formatBillingSchedule(o)}
                </option>
              ))}
            </select>
          ) : (
            formatBillingSchedule(service.billing_schedule)
          )}
        </Row>

        <Row
          label="Renewal Date"
          error={editing ? errors.renewal_date : undefined}
        >
          {editing ? (
            <input
              type="date"
              value={draft.renewal_date}
              onChange={(e) => setField("renewal_date", e.target.value)}
              className={fieldClass(Boolean(errors.renewal_date))}
            />
          ) : (
            formatDateOnly(service.renewal_date, preferences)
          )}
        </Row>

        <Row
          label="Yearly Cost"
          error={editing ? errors.yearly_cost : undefined}
        >
          {editing ? (
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.yearly_cost}
              onChange={(e) => setField("yearly_cost", e.target.value)}
              placeholder="0"
              className={fieldClass(Boolean(errors.yearly_cost))}
            />
          ) : service.yearly_cost != null ? (
            `$${Number(service.yearly_cost).toLocaleString()}`
          ) : (
            <span className="text-fg-4">—</span>
          )}
        </Row>

        <Row
          label="Number of seats"
          error={editing ? errors.total_seats : undefined}
        >
          {editing ? (
            <input
              type="number"
              min={1}
              value={draft.total_seats}
              onChange={(e) => setField("total_seats", e.target.value)}
              placeholder="Unlimited if empty"
              className={fieldClass(Boolean(errors.total_seats))}
            />
          ) : (
            <>
              {service.assignees?.length ?? 0} /{" "}
              {service.total_seats != null ? service.total_seats : "∞"}
            </>
          )}
        </Row>
      </dl>
    </section>
  );
}

interface RightColumnProps {
  service: Service;
  editing: boolean;
  draft: ServiceDraft;
  setField: ServiceDetailContext["setDraftField"];
}

function RightColumn({
  service,
  editing,
  draft,
  setField,
}: RightColumnProps) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-fg">Owners</h2>
        {!editing ? (
          service.owners.length === 0 ? (
            <p className="text-sm text-fg-4">No owners assigned.</p>
          ) : (
            <ul className="space-y-1.5">
              {service.owners.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-sm">
                  <Avatar user={o} size={22} />
                  <Link to={`/users/${o.id}`} className="hlink text-fg">
                    {o.first_name} {o.last_name}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          <UserDirectoryCheckboxPicker
            variant="overview"
            value={draft.owner_ids}
            onChange={(ids) => setField("owner_ids", ids)}
            seedUsers={service.owners}
          />
        )}
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
              {editing ? (
                <Toggle
                  checked={draft.sso_integrated}
                  onChange={(v) => setField("sso_integrated", v)}
                />
              ) : (
                <BooleanYesNoBadge value={service.sso_integrated} />
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
              SCIM provisioning
            </dt>
            <dd>
              {editing ? (
                <Toggle
                  checked={draft.scim_enabled}
                  onChange={(v) => setField("scim_enabled", v)}
                />
              ) : (
                <BooleanYesNoBadge value={service.scim_enabled} />
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
              Nonprofit pricing
            </dt>
            <dd>
              {editing ? (
                <Toggle
                  checked={draft.nonprofit_pricing}
                  onChange={(v) => setField("nonprofit_pricing", v)}
                />
              ) : (
                <BooleanYesNoBadge value={service.nonprofit_pricing} />
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
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

export function ServiceOverview() {
  const ctx = useOutletContext<ServiceDetailContext>();
  const { preferences } = useAuth();
  const refData = useRefData(ctx.editing);
  const { service, editing, draft, setDraftField, errors } = ctx;

  return (
    <div className="space-y-6">
      {editing && Object.keys(errors).length > 0 && (
        <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          Please fix the highlighted fields before saving.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeftColumn
            service={service}
            preferences={preferences}
            editing={editing}
            draft={draft}
            setField={setDraftField}
            errors={errors}
            refData={refData}
          />
        </div>
        <div className="lg:col-span-1">
          <RightColumn
            service={service}
            editing={editing}
            draft={draft}
            setField={setDraftField}
          />
        </div>
      </div>

      {!editing && (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-fg">Notes</h2>
          {service.notes?.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-fg">
              {service.notes}
            </p>
          ) : (
            <p className="text-sm text-fg-4">No notes yet.</p>
          )}
        </section>
      )}

      {editing && (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-fg">Notes</h2>
          <textarea
            rows={4}
            value={draft.notes}
            onChange={(e) => setDraftField("notes", e.target.value)}
            className={fieldClass(false)}
            placeholder="Internal notes about this service…"
          />
        </section>
      )}
    </div>
  );
}
