import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useParams,
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import {
  PencilSquareIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "../components/Icons";
import { DetailPageSkeleton } from "../components/Skeleton";
import { AuditTimeline } from "../components/AuditTimeline";
import { Monogram } from "../components/ui/Monogram";
import {
  ColoredReferenceBadge,
  ClassificationBadge,
} from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import {
  toDraft,
  validateDraft,
  type ServiceDetailContext,
  type ServiceDraft,
  type ServiceValidationErrors,
} from "../service/serviceDetailContext";
import type { Service } from "../types/models";

type ExtraTab = "activity" | null;

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [errors, setErrors] = useState<ServiceValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraTab, setExtraTab] = useState<ExtraTab>(null);

  useEffect(() => {
    if (!id) {
      setService(null);
      setDraft(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    client
      .get<Service>(`/api/services/${id}`)
      .then((r) => {
        if (cancelled) return;
        setService(r.data);
        setDraft(toDraft(r.data));
      })
      .catch(() => {
        if (cancelled) return;
        setService(null);
        setDraft(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const reloadService = useCallback(() => {
    if (!id) return;
    client.get<Service>(`/api/services/${id}`).then((r) => {
      setService(r.data);
      setDraft(toDraft(r.data));
    });
  }, [id]);

  const setDraftField = useCallback(
    <K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const setEditing = useCallback(
    (next: boolean) => {
      setEditingState(next);
      setSaveError(null);
      setErrors({});
      if (!next && service) {
        setDraft(toDraft(service));
      }
    },
    [service],
  );

  async function handleSave() {
    if (!service || !draft) return;
    const validationErrors = validateDraft(draft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      notes: draft.notes.trim() || null,
      point_of_contact: draft.point_of_contact.trim() || null,
      vendor_id: draft.vendor_id || null,
      category_id: draft.category_id || null,
      cost_center_id: draft.cost_center_id || null,
      payment_method_id: draft.payment_method_id || null,
      service_status_id: draft.service_status_id || null,
      classification_id: draft.classification_id || null,
      billing_schedule: draft.billing_schedule,
      renewal_date: draft.renewal_date || null,
      yearly_cost:
        draft.yearly_cost.trim() === "" ? null : Number(draft.yearly_cost),
      criticality: draft.criticality || null,
      total_seats:
        draft.total_seats.trim() === "" ? null : Number(draft.total_seats),
      sso_integrated: draft.sso_integrated,
      scim_enabled: draft.scim_enabled,
      nonprofit_pricing: draft.nonprofit_pricing,
      owner_ids: draft.owner_ids,
    };
    try {
      const res = await client.put<Service>(
        `/api/services/${service.id}`,
        payload,
      );
      setService(res.data);
      setDraft(toDraft(res.data));
      setEditingState(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save service";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  // Leave edit mode if the route moves off the overview tab. The check mirrors
  // React's new guidance to only setState when the external value genuinely changed.
  const pathname = location.pathname;
  const lastPathRef = useRef(pathname);
  if (lastPathRef.current !== pathname) {
    lastPathRef.current = pathname;
    if (editing) setEditingState(false);
  }

  const isOverviewRoute =
    pathname === `/services/${id}` || pathname === `/services/${id}/`;
  const activeExtra = isOverviewRoute ? extraTab : null;

  const outletContext = useMemo<ServiceDetailContext | null>(() => {
    if (!service || !draft) return null;
    return {
      service,
      reloadService,
      editing,
      setEditing,
      draft,
      setDraftField,
      errors,
      saving,
      saveError,
    };
  }, [
    service,
    draft,
    editing,
    errors,
    reloadService,
    setDraftField,
    setEditing,
    saving,
    saveError,
  ]);

  if (loading) return <DetailPageSkeleton />;
  if (!service || !draft || !outletContext)
    return <p className="text-sm text-danger">Service not found.</p>;

  const statusName = service.service_status?.name ?? service.status;
  const seatsCount = service.assignees?.length ?? 0;

  function openRoutedTab(path: string | null) {
    setExtraTab(null);
    if (path != null && location.pathname !== path) {
      navigate(path);
    }
  }

  function openExtraTab(tab: Exclude<ExtraTab, null>) {
    if (!isOverviewRoute) {
      navigate(`/services/${id}`);
    }
    setExtraTab(tab);
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-1.5 text-xs text-fg-3">
          <Link to="/services" className="hlink">
            Services
          </Link>
          <ChevronRightIcon className="h-3 w-3" />
          <span className="text-fg-2">{service.name}</span>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="shrink-0">
            <Monogram name={service.name} seed={service.id} size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-[22px] font-semibold text-fg"
              style={{ letterSpacing: "-0.02em" }}
            >
              {service.name}
            </h1>
            {service.vendor?.name && (
              <p className="mt-0.5 text-sm text-fg-3">{service.vendor.name}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {service.service_status ? (
                <ColoredReferenceBadge
                  label={service.service_status.name}
                  color={service.service_status.color}
                />
              ) : (
                <StatusBadge status={statusName} />
              )}
              {service.service_classification && (
                <ClassificationBadge
                  classification={service.service_classification}
                />
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg-2 shadow-sm transition-colors hover:bg-surface-2"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit
              </button>
            )}
            {canEdit && editing && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void handleSave();
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}
            {!editing && <KebabMenu />}
          </div>
        </div>

        {saveError && editing && (
          <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            {saveError}
          </div>
        )}

        <div className="border-b border-border">
          <nav className="-mb-px flex flex-wrap gap-1">
            <TabLink
              to="."
              end
              label="Overview"
              active={isOverviewRoute && activeExtra === null}
              onClick={() => openRoutedTab(null)}
            />
            <TabLink
              to="assignments"
              end={false}
              label="Seats"
              count={seatsCount}
              active={location.pathname.endsWith("/assignments")}
              onClick={() => openRoutedTab(`/services/${id}/assignments`)}
            />
            <TabLink
              to="costs"
              end={false}
              label="Costs"
              active={location.pathname.endsWith("/costs")}
              onClick={() => openRoutedTab(`/services/${id}/costs`)}
            />
            <TabLink
              to="attachments"
              end={false}
              label="Attachments"
              active={location.pathname.endsWith("/attachments")}
              onClick={() => openRoutedTab(`/services/${id}/attachments`)}
            />
            <TabButton
              label="Activity"
              active={activeExtra === "activity"}
              onClick={() => openExtraTab("activity")}
            />
          </nav>
        </div>

        {activeExtra === "activity" ? (
          <ActivityPanel serviceId={service.id} />
        ) : (
          <Outlet context={outletContext} />
        )}
      </div>
    </PageTransition>
  );
}

interface TabLinkProps {
  to: string;
  end: boolean;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}

function TabLink({ to, end, label, count, active, onClick }: TabLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={() =>
        `inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
          active
            ? "border-accent text-fg"
            : "border-transparent text-fg-3 hover:border-border-strong hover:text-fg"
        }`
      }
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold text-fg-3">
          {count}
        </span>
      )}
    </NavLink>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-accent text-fg"
          : "border-transparent text-fg-3 hover:border-border-strong hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}

function KebabMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-fg-2 transition-colors hover:bg-surface-2"
      >
        <span className="sr-only">More actions</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-md"
          >
            <MenuItem label="Duplicate" onClick={() => setOpen(false)} />
            <MenuItem label="Archive" onClick={() => setOpen(false)} />
            <MenuItem
              label="Delete"
              variant="danger"
              onClick={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 ${
        variant === "danger" ? "text-danger" : "text-fg-2"
      }`}
    >
      {label}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-fg">{title}</h2>
      {children}
    </div>
  );
}

function ActivityPanel({ serviceId }: { serviceId: string }) {
  return (
    <Panel title="Activity">
      <p className="mb-4 text-sm text-fg-3">Recent changes to this service.</p>
      <AuditTimeline tableName="services" recordId={serviceId} perPage={20} />
    </Panel>
  );
}
