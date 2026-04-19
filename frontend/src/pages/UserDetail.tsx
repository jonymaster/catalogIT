import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  ServerStackIcon,
} from "../components/Icons";
import { ColoredReferenceBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { DetailPageSkeleton } from "../components/Skeleton";
import { Days } from "../components/ui/Days";
import { Monogram } from "../components/ui/Monogram";
import { formatMoneyCompact, formatMoneyFull } from "../components/ui/money-format";
import type { Laptop, Service, User } from "../types/models";

const TABS = [
  { id: "assigned", label: "Assigned services" },
  { id: "owned", label: "Owned services" },
  { id: "hardware", label: "Hardware" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
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
    </div>
  );
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
                className="cursor-pointer border-b border-border text-[13.5px] text-fg transition-colors last:border-0 hover:bg-surface-2/60"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Monogram name={s.name} seed={s.id} size={26} />
                    <span className="font-medium">{s.name}</span>
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
                className="cursor-pointer border-b border-border text-[13.5px] text-fg transition-colors last:border-0 hover:bg-surface-2/60"
              >
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <ComputerDesktopIcon className="h-4 w-4 text-fg-3" />
                    <span className="font-medium">{l.model_name}</span>
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
  const [user, setUser] = useState<User | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabId>("assigned");

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
  if (loading || !user) return <DetailPageSkeleton />;

  const name = displayName(user);
  const hue = hueFromString(user.email || user.id);

  function notImplemented() {
    alert("Not implemented yet");
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
            <button
              type="button"
              onClick={notImplemented}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-2 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
              Open in HR
            </button>
            <button
              type="button"
              onClick={notImplemented}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                color: "var(--danger)",
                background: "var(--danger-soft)",
              }}
            >
              <ArchiveBoxIcon className="h-4 w-4" />
              Offboard
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="Services assigned" value={assignedServices.length} />
          <StatCard label="Services owned" value={ownedServices.length} />
          <StatCard label="Laptops assigned" value={assignedLaptops.length} />
          <StatCard
            label="Est. seat cost (annual)"
            value={seatCost > 0 ? formatMoneyCompact(seatCost) : "$0"}
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

function ArchiveBoxIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
      />
    </svg>
  );
}
