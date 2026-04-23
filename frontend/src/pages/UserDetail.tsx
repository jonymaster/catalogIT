import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import {
  ChevronRightIcon,
  ComputerDesktopIcon,
  PencilSquareIcon,
  ServerStackIcon,
  XMarkIcon,
} from "../components/Icons";
import { Badge, ColoredReferenceBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { DetailPageSkeleton } from "../components/Skeleton";
import { Days } from "../components/ui/Days";
import { Monogram } from "../components/ui/Monogram";
import { formatMoneyCompact, formatMoneyFull } from "../components/ui/money-format";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { PERMISSION_FINANCIAL_VIEW } from "../constants/permissions";
import type { Laptop, Service, User } from "../types/models";

const TABS = [
  { id: "assigned", label: "Assigned services" },
  { id: "owned", label: "Owned services" },
  { id: "hardware", label: "Hardware" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];
const ROLES = ["admin", "editor", "viewer"] as const;

type UserDraft = {
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  department: string;
  role: string;
  is_active: boolean;
  receive_renewal_notifications: boolean;
  financial_view: boolean;
};

function toDraft(user: User): UserDraft {
  return {
    first_name: user.first_name,
    last_name: user.last_name,
    display_name: user.display_name ?? "",
    email: user.email,
    department: user.department ?? "",
    role: user.role,
    is_active: user.is_active,
    receive_renewal_notifications: user.receive_renewal_notifications ?? true,
    financial_view: user.permissions?.includes(PERMISSION_FINANCIAL_VIEW) ?? false,
  };
}

function formatApiError(err: unknown): string {
  const ax = err as {
    response?: { data?: { detail?: string | { message?: string } } };
  };
  const d = ax.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  return "Request failed.";
}

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function userInitials(user: User): string {
  const first = user.first_name?.[0] ?? "";
  const last = user.last_name?.[0] ?? "";
  if (first || last) return (first + last).toUpperCase();
  const display = user.display_name ?? user.email ?? "";
  return display.slice(0, 2).toUpperCase();
}

function displayName(user: User): string {
  return user.display_name?.trim() || `${user.first_name} ${user.last_name}`.trim() || user.email;
}

function provisioningChip(source: User["provisioning_source"]) {
  const label = `via ${source}`;
  const base =
    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium";
  if (source === "scim")
    return (
      <span
        className={base}
        style={{
          background: "var(--purple-soft)",
          color: "var(--purple)",
          borderColor: "var(--purple-soft)",
        }}
      >
        {label}
      </span>
    );
  if (source === "oidc")
    return (
      <span
        className={base}
        style={{
          background: "var(--accent-soft)",
          color: "var(--accent-strong)",
          borderColor: "var(--accent-soft)",
        }}
      >
        {label}
      </span>
    );
  return (
    <span
      className={base}
      style={{
        background: "var(--surface-2)",
        color: "var(--fg-3)",
        borderColor: "var(--border)",
      }}
    >
      {label}
    </span>
  );
}

function statusChip(active: boolean) {
  const label = active ? "Active" : "Inactive";
  if (active)
    return (
      <span
        className="inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium"
        style={{ background: "var(--success-soft)", color: "var(--success)" }}
      >
        <span
          className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--success)" }}
        />
        {label}
      </span>
    );
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium"
      style={{ background: "var(--surface-2)", color: "var(--fg-3)" }}
    >
      {label}
    </span>
  );
}

function neutralChip(label: string) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--fg-3)",
        borderColor: "var(--border)",
      }}
    >
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string | number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div
        className="text-[11px] uppercase text-fg-3"
        style={{ letterSpacing: "0.04em" }}
      >
        {label}
      </div>
      <div
        className="tnum mt-1 font-semibold text-fg"
        style={{ fontSize: 22, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
    </>
  );
  const interactive =
    "w-full rounded-[10px] border border-border bg-surface p-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={interactive}>
        {body}
      </button>
    );
  }
  return <div className="rounded-[10px] border border-border bg-surface p-3.5">{body}</div>;
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-border bg-surface px-6 py-14 text-center">
      <div
        className="flex items-center justify-center rounded-md text-fg-3"
        style={{ width: 44, height: 44, background: "var(--surface-2)" }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-[14px] font-medium text-fg">{title}</div>
      <div className="mt-1 text-[12.5px] text-fg-3">{subtitle}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

const fieldClass =
  "block w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-4 transition-shadow focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function GeneralPanel({
  user,
  editing,
  draft,
  setDraft,
}: {
  user: User;
  editing: boolean;
  draft: UserDraft;
  setDraft: React.Dispatch<React.SetStateAction<UserDraft | null>>;
}) {
  const isLocal = user.provisioning_source === "local";
  const setField = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };
  const financialValue = draft.role === "admin" ? false : draft.financial_view;

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-fg">General</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        {editing && isLocal && (
          <>
            <Row label="First name">
              <input
                value={draft.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
                className={fieldClass}
              />
            </Row>
            <Row label="Last name">
              <input
                value={draft.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
                className={fieldClass}
              />
            </Row>
            <Row label="Display name">
              <input
                value={draft.display_name}
                onChange={(e) => setField("display_name", e.target.value)}
                className={fieldClass}
              />
            </Row>
            <Row label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setField("email", e.target.value)}
                className={fieldClass}
              />
            </Row>
          </>
        )}

        <Row label="Department">
          {editing && isLocal ? (
            <input
              value={draft.department}
              onChange={(e) => setField("department", e.target.value)}
              className={fieldClass}
              placeholder="—"
            />
          ) : user.department?.trim() ? (
            <span>{user.department}</span>
          ) : (
            <span className="text-fg-4">—</span>
          )}
        </Row>

        <Row label="Role">
          {editing ? (
            <select
              value={draft.role}
              onChange={(e) =>
                setField("role", e.target.value as UserDraft["role"])
              }
              className={fieldClass}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <span className="capitalize">{user.role}</span>
          )}
        </Row>

        <Row label="Financial view permissions">
          {draft.role === "admin" && !editing ? (
            <span className="text-fg-4">
              Granted implicitly to admins
            </span>
          ) : editing ? (
            draft.role === "admin" ? (
              <span className="text-fg-4">
                Granted implicitly to admins
              </span>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={financialValue}
                  onChange={(e) => setField("financial_view", e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm text-fg-2">
                  Granted (IT Financial Report and dashboard cost data)
                </span>
              </label>
            )
          ) : (
            <Badge
              color={
                user.permissions?.includes(PERMISSION_FINANCIAL_VIEW)
                  ? "blue"
                  : "gray"
              }
            >
              {user.permissions?.includes(PERMISSION_FINANCIAL_VIEW)
                ? "Granted"
                : "Not granted"}
            </Badge>
          )}
        </Row>

        <Row label="Renewal emails">
          {editing ? (
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.receive_renewal_notifications}
                onChange={(e) =>
                  setField("receive_renewal_notifications", e.target.checked)
                }
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm text-fg-2">
                Receive service renewal notifications
              </span>
            </label>
          ) : (
            <Badge
              color={user.receive_renewal_notifications ?? true ? "green" : "gray"}
            >
              {user.receive_renewal_notifications ?? true ? "On" : "Off"}
            </Badge>
          )}
        </Row>

        <Row label="Status">
          {editing ? (
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm text-fg-2">Active</span>
            </label>
          ) : (
            <Badge color={user.is_active ? "green" : "red"}>
              {user.is_active ? "Active" : "Inactive"}
            </Badge>
          )}
        </Row>
      </dl>
    </section>
  );
}

function ServicesTable({
  services,
  variant,
  onRemove,
}: {
  services: Service[];
  variant: "assigned" | "owned";
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      <table className="min-w-full text-left">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {["Service", "Vendor", "Category", "Status", "Annual cost", "Renewal", ""].map(
              (h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-[11px] font-semibold uppercase text-fg-3"
                  style={{ letterSpacing: "0.04em" }}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {services.map((s) => {
            const assigneeCount = Math.max(1, s.assignees.length);
            const annual =
              s.yearly_cost == null
                ? null
                : variant === "assigned"
                  ? s.yearly_cost / assigneeCount
                  : s.yearly_cost;
            return (
              <tr
                key={s.id}
                onClick={() => navigate(`/services/${s.id}`)}
                className="interactive-record cursor-pointer border-b border-border text-[13.5px] text-fg transition-colors last:border-0 hover:bg-surface-2/60"
              >
                <td className="data-record-primary px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Monogram name={s.name} seed={s.id} size={26} />
                    <span className="record-primary-label truncate font-medium">{s.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-fg-3">{s.vendor?.name ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {s.category_rel ? (
                    <ColoredReferenceBadge
                      label={s.category_rel.name}
                      color={s.category_rel.color}
                    />
                  ) : (
                    <span className="text-fg-4">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {s.service_status ? (
                    <ColoredReferenceBadge
                      label={s.service_status.name}
                      color={s.service_status.color}
                    />
                  ) : (
                    <StatusBadge status={s.status} />
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right">
                  {annual == null ? (
                    <span className="text-fg-4">—</span>
                  ) : (
                    formatMoneyFull(annual)
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {s.renewal_date ? (
                    <div className="flex items-center gap-2">
                      <span className="tnum text-fg-3">{s.renewal_date}</span>
                      <Days date={s.renewal_date} />
                    </div>
                  ) : (
                    <span className="text-fg-4">—</span>
                  )}
                </td>
                <td
                  className="px-3 py-2.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={onRemove}
                    className="rounded-md px-2 py-1 text-[12px] font-medium text-danger transition-colors hover:bg-danger-soft"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HardwareTable({
  laptops,
  onReassign,
}: {
  laptops: Laptop[];
  onReassign: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      <table className="min-w-full text-left">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {["Device", "Serial", "CPU / RAM", "Purchased", "Warranty", ""].map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-[11px] font-semibold uppercase text-fg-3"
                style={{ letterSpacing: "0.04em" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {laptops.map((l) => {
            const purchased = l.created_at ? l.created_at.slice(0, 10) : "—";
            return (
              <tr
                key={l.id}
                onClick={() => navigate(`/hardware/${l.id}`)}
                className="interactive-record cursor-pointer border-b border-border text-[13.5px] text-fg transition-colors last:border-0 hover:bg-surface-2/60"
              >
                <td className="data-record-primary px-3 py-2.5">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <ComputerDesktopIcon className="h-4 w-4 shrink-0 text-fg-3" />
                    <span className="record-primary-label truncate font-medium">{l.model_name}</span>
                  </span>
                </td>
                <td
                  className="mono px-3 py-2.5 text-fg-3"
                  style={{ fontSize: 11.5 }}
                >
                  {l.serial_number}
                </td>
                <td className="px-3 py-2.5 text-fg-3">
                  {[l.cpu, l.ram].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="tnum px-3 py-2.5 text-fg-3">{purchased}</td>
                <td className="tnum px-3 py-2.5 text-fg-3">—</td>
                <td
                  className="px-3 py-2.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={onReassign}
                    className="rounded-md border border-border px-2 py-1 text-[12px] font-medium text-fg-2 transition-colors hover:bg-surface-2"
                  >
                    Reassign
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function relativeDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const ACTIVITY_ACTIONS = [
  "was added to",
  "was removed from",
  "took ownership of",
  "stepped down as owner of",
  "was deprovisioned from",
  "was granted access to",
];

function ActivityTimeline({ user, services }: { user: User; services: Service[] }) {
  const events = useMemo(() => {
    const count = Math.min(8, Math.max(services.length + 2, 6));
    const seed = user.id.charCodeAt(0) || 1;
    return Array.from({ length: count }).map((_, i) => {
      const action = ACTIVITY_ACTIONS[i % ACTIVITY_ACTIONS.length];
      const service =
        services.length > 0
          ? services[(seed * (i + 1)) % services.length]
          : null;
      return {
        id: `${user.id}-evt-${i}`,
        action,
        serviceName: service?.name ?? "the catalog",
        date: relativeDate(i * 7 + 2),
      };
    });
  }, [user, services]);

  return (
    <div className="rounded-[10px] border border-border bg-surface px-6 py-5">
      <div className="relative pl-5">
        <div
          className="absolute top-2 bottom-2"
          style={{ left: 7, width: 1, background: "var(--border)" }}
        />
        {events.map((e) => (
          <div key={e.id} className="relative pb-4 last:pb-0">
            <div
              className="absolute top-1 rounded-full"
              style={{
                left: -18,
                width: 10,
                height: 10,
                background: "var(--accent)",
                border: "2px solid var(--surface)",
              }}
            />
            <div className="text-[13px]">
              <span className="font-medium text-fg">{displayName(user)}</span>{" "}
              <span className="text-fg-3">{e.action}</span>{" "}
              <span className="font-medium text-fg">{e.serviceName}</span>
            </div>
            <div
              className="mt-0.5 tnum text-fg-4"
              style={{ fontSize: 11.5 }}
            >
              {e.date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabId>("assigned");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      client.get<User[]>("/api/settings/users/"),
      client.get<Service[]>("/api/services/"),
      client.get<Laptop[]>("/api/laptops/"),
    ])
      .then(([usersRes, servicesRes, laptopsRes]) => {
        if (cancelled) return;
        const match = usersRes.data.find((u) => u.id === id);
        if (!match) {
          setNotFound(true);
          return;
        }
        setUser(match);
        setDraft(toDraft(match));
        setServices(servicesRes.data);
        setLaptops(laptopsRes.data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const assignedServices = useMemo(
    () =>
      user
        ? services.filter((s) => s.assignees.some((a) => a.id === user.id))
        : [],
    [services, user],
  );
  const ownedServices = useMemo(
    () =>
      user ? services.filter((s) => s.owners.some((o) => o.id === user.id)) : [],
    [services, user],
  );
  const assignedLaptops = useMemo(
    () => (user ? laptops.filter((l) => l.assigned_to_id === user.id) : []),
    [laptops, user],
  );

  const seatCost = useMemo(() => {
    return assignedServices.reduce((sum, s) => {
      const yearly = s.yearly_cost ?? 0;
      const n = Math.max(1, s.assignees.length);
      return sum + yearly / n;
    }, 0);
  }, [assignedServices]);

  if (!id || notFound) return <Navigate to="/users" replace />;
  if (loading || !user || !draft) return <DetailPageSkeleton />;

  const name = displayName(user);
  const hue = hueFromString(user.email || user.id);
  const isLocal = user.provisioning_source === "local";

  function notImplemented() {
    alert("Not implemented yet");
  }

  function startEditing() {
    if (!user) return;
    setDraft(toDraft(user));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (user) setDraft(toDraft(user));
    setSaveError(null);
    setEditing(false);
  }

  async function handleSave() {
    if (!user || !draft) return;
    const patch: Record<string, unknown> = {
      role: draft.role,
      is_active: draft.is_active,
      receive_renewal_notifications: draft.receive_renewal_notifications,
    };
    if (isLocal) {
      patch.email = draft.email.trim();
      patch.first_name = draft.first_name.trim();
      patch.last_name = draft.last_name.trim();
      patch.display_name = draft.display_name.trim() || null;
      patch.department = draft.department.trim() || null;
    }
    if (draft.role !== "admin") {
      patch.permissions = draft.financial_view ? [PERMISSION_FINANCIAL_VIEW] : [];
    } else {
      patch.permissions = [];
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await client.patch<User>(`/api/settings/users/${user.id}`, patch);
      setUser(res.data);
      setDraft(toDraft(res.data));
      setEditing(false);
      showToast({ type: "success", text: "User updated." });
    } catch (err: unknown) {
      setSaveError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition>
      <div>
        <div className="mb-3.5 flex items-center gap-1.5 text-[12.5px] text-fg-3">
          <Link to="/users" className="hlink">
            People
          </Link>
          <ChevronRightIcon className="h-3 w-3" />
          <span className="text-fg-2">{name}</span>
        </div>

        <div className="mb-5 flex flex-wrap items-start gap-4">
          <div
            className="flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
            style={{
              width: 72,
              height: 72,
              background: `oklch(0.82 0.04 ${hue})`,
              color: `oklch(0.28 0.04 ${hue})`,
              fontSize: 24,
              border: "2px solid var(--border)",
            }}
          >
            {userInitials(user)}
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="m-0 font-semibold text-fg"
              style={{ fontSize: 26, letterSpacing: "-0.02em" }}
            >
              {name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13.5px] text-fg-3">
              <span>{user.email}</span>
              <span className="text-fg-4">·</span>
              <span>{user.department?.trim() || "—"}</span>
              <span className="text-fg-4">·</span>
              <span className="capitalize">{user.role}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {statusChip(user.is_active)}
              {provisioningChip(user.provisioning_source)}
              {neutralChip(user.timezone?.trim() || "UTC")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && !editing && (
              <button
                type="button"
                onClick={startEditing}
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
                  onClick={cancelEditing}
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
          </div>
        </div>

        {saveError && editing && (
          <div className="mb-4 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            {saveError}
          </div>
        )}

        <div className="mb-5">
          <GeneralPanel
            user={user}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
          />
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard
            label="Services assigned"
            value={assignedServices.length}
            onClick={() => setTab("assigned")}
          />
          <StatCard
            label="Services owned"
            value={ownedServices.length}
            onClick={() => setTab("owned")}
          />
          <StatCard
            label="Laptops assigned"
            value={assignedLaptops.length}
            onClick={() => setTab("hardware")}
          />
          <StatCard
            label="Est. seat cost (annual)"
            value={seatCost > 0 ? formatMoneyCompact(seatCost) : "$0"}
            onClick={() => setTab("assigned")}
          />
        </div>

        <div className="mb-4 border-b border-border">
          <nav className="-mb-px flex gap-5 overflow-x-auto">
            {TABS.map((t) => {
              const count =
                t.id === "assigned"
                  ? assignedServices.length
                  : t.id === "owned"
                    ? ownedServices.length
                    : t.id === "hardware"
                      ? assignedLaptops.length
                      : null;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap border-b-2 px-1 pb-2.5 text-[13.5px] font-medium transition-colors ${
                    active
                      ? "border-accent text-fg"
                      : "border-transparent text-fg-3 hover:border-border-strong hover:text-fg-2"
                  }`}
                >
                  <span>{t.label}</span>
                  {count != null && (
                    <span className="tnum ml-1.5 text-fg-4">{count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {tab === "assigned" &&
          (assignedServices.length === 0 ? (
            <EmptyState
              icon={ServerStackIcon}
              title="Not assigned to any service"
              subtitle="Nothing to show."
            />
          ) : (
            <ServicesTable
              services={assignedServices}
              variant="assigned"
              onRemove={notImplemented}
            />
          ))}
        {tab === "owned" &&
          (ownedServices.length === 0 ? (
            <EmptyState
              icon={ServerStackIcon}
              title="Not an owner on any service"
              subtitle="Nothing to show."
            />
          ) : (
            <ServicesTable
              services={ownedServices}
              variant="owned"
              onRemove={notImplemented}
            />
          ))}
        {tab === "hardware" &&
          (assignedLaptops.length === 0 ? (
            <EmptyState
              icon={ComputerDesktopIcon}
              title="No laptops assigned"
              subtitle="Nothing to show."
            />
          ) : (
            <HardwareTable laptops={assignedLaptops} onReassign={notImplemented} />
          ))}
        {tab === "activity" && (
          <ActivityTimeline
            user={user}
            services={[...ownedServices, ...assignedServices]}
          />
        )}
      </div>
    </PageTransition>
  );
}

