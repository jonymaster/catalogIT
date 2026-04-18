import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/useAuth";
import { SearchInput } from "../components/SearchInput";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import type { Service, Laptop } from "../types/models";
import { DashboardSkeleton } from "../components/Skeleton";
import {
  combinedActualEstimatedByYear,
  isCurrentOrFutureFiscalYear,
  totalByYear,
  visualAmountForRecordTypeAndYear,
  yoyPercent,
} from "../utils/dashboardCostAggregates";

const MS_PER_DAY = 86400000;

function matchesServiceSearch(service: Service, query: string) {
  const cat = (service.category_rel?.name ?? "").toLowerCase();
  return (
    service.name.toLowerCase().includes(query) ||
    cat.includes(query) ||
    (service.service_status?.name ?? service.status).toLowerCase().includes(query) ||
    (service.vendor?.name ?? "").toLowerCase().includes(query) ||
    (service.service_classification?.name ?? "")
      .toLowerCase()
      .includes(query) ||
    service.owners.some(
      (owner) =>
        owner.first_name.toLowerCase().includes(query) ||
        owner.last_name.toLowerCase().includes(query),
    )
  );
}

function matchesLaptopSearch(laptop: Laptop, query: string) {
  const assignedTo = laptop.assigned_to
    ? `${laptop.assigned_to.first_name} ${laptop.assigned_to.last_name}`
    : "";

  return (
    laptop.serial_number.toLowerCase().includes(query) ||
    laptop.model_name.toLowerCase().includes(query) ||
    laptop.cpu.toLowerCase().includes(query) ||
    laptop.status.toLowerCase().includes(query) ||
    assignedTo.toLowerCase().includes(query)
  );
}

const fmtMoneyCompact = (v: number) =>
  Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);

const fmtMoneyFull = (v: number) =>
  Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function daysUntil(date: string | null, today: Date): number | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.round((parsed.getTime() - today.getTime()) / MS_PER_DAY);
}

type KpiProps = {
  label: string;
  value: string | number;
  delta?: number | null;
  sub?: string;
};

function Kpi({ label, value, delta, sub }: KpiProps) {
  return (
    <div className="min-w-0 flex-1 px-4 py-3 border-r border-gray-200 dark:border-gray-800 last:border-r-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-[26px] font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
        {value}
      </div>
      {(delta != null || sub) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
          {delta != null && (
            <span
              className={`font-medium ${
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500"
              }`}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-gray-500 dark:text-gray-400">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function WidgetCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm ${className}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {title}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function SpendTrend({
  yearly,
  years,
}: {
  yearly: Record<number, number>;
  years: number[];
}) {
  const points = years.map((y) => ({ label: String(y), value: yearly[y] ?? 0 }));
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((s, p) => s + p.value, 0);
  const latest = points[points.length - 1]?.value ?? 0;

  const w = 560;
  const h = 150;
  const padL = 34;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const iw = w - padL - padR;
  const ih = h - padT - padB;

  const pts = points.map((p, i) => ({
    x: padL + (i + 0.5) * (iw / Math.max(points.length, 1)),
    y: padT + ih - (p.value / max) * ih,
    label: p.label,
    value: p.value,
  }));
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p.x + "," + p.y)
    .join(" ");
  const areaPath =
    pts.length > 0
      ? path +
        ` L${pts[pts.length - 1].x},${padT + ih} L${pts[0].x},${padT + ih} Z`
      : "";

  return (
    <div className="w-full">
      <div className="flex gap-6 mb-2">
        <div>
          <div className="text-[22px] font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
            {fmtMoneyCompact(latest)}
          </div>
          <div className="text-[11.5px] text-gray-500 dark:text-gray-400">
            Latest year
          </div>
        </div>
        <div>
          <div className="text-[22px] font-semibold tabular-nums tracking-tight text-gray-500 dark:text-gray-400">
            {fmtMoneyCompact(total)}
          </div>
          <div className="text-[11.5px] text-gray-500 dark:text-gray-400">
            All tracked years
          </div>
        </div>
      </div>
      {points.length === 0 ? (
        <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
          No spend history available yet.
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={padL}
              x2={w - padR}
              y1={padT + ih * (1 - f)}
              y2={padT + ih * (1 - f)}
              className="stroke-gray-200 dark:stroke-gray-800"
              strokeWidth={1}
            />
          ))}
          <path d={areaPath} className="fill-brand-500" opacity={0.1} />
          <path
            d={path}
            fill="none"
            className="stroke-brand-500"
            strokeWidth={1.75}
            strokeLinejoin="round"
          />
          {pts.map((p) => (
            <g key={p.label}>
              <circle cx={p.x} cy={p.y} r={2.5} className="fill-brand-500" />
              <text
                x={p.x}
                y={h - 6}
                fontSize={10}
                textAnchor="middle"
                className="fill-gray-500 dark:fill-gray-400"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  rightLabel,
  tone = "brand",
}: {
  label: string;
  value: number;
  max: number;
  rightLabel: string;
  tone?: "brand" | "success" | "info" | "warn" | "danger" | "purple";
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const toneClass: Record<string, string> = {
    brand: "bg-brand-500",
    success: "bg-emerald-500",
    info: "bg-sky-500",
    warn: "bg-amber-500",
    danger: "bg-red-500",
    purple: "bg-purple-500",
  };
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-28 truncate text-[12.5px] text-gray-700 dark:text-gray-300">
        {label}
      </div>
      <div className="flex-1 h-2 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full ${toneClass[tone] ?? toneClass.brand}`}
          style={{ width: pct + "%", opacity: 0.85, transition: "width 400ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </div>
      <div className="w-20 text-right text-[12.5px] tabular-nums text-gray-700 dark:text-gray-300">
        {rightLabel}
      </div>
    </div>
  );
}

function RenewalRisk({
  services,
  today,
  showMoney,
}: {
  services: Service[];
  today: Date;
  showMoney: boolean;
}) {
  const upcoming = services.filter((s) => {
    const d = daysUntil(s.renewal_date, today);
    return d != null && d >= 0 && d <= 90;
  });
  const bucket30 = upcoming.filter((s) => (daysUntil(s.renewal_date, today) ?? 0) <= 30);
  const bucket60 = upcoming.filter((s) => {
    const d = daysUntil(s.renewal_date, today) ?? 0;
    return d > 30 && d <= 60;
  });
  const bucket90 = upcoming.filter((s) => {
    const d = daysUntil(s.renewal_date, today) ?? 0;
    return d > 60 && d <= 90;
  });
  const atRisk = bucket30.reduce((a, s) => a + (s.yearly_cost ?? 0), 0);

  const rows: Array<{ l: string; arr: Service[]; tone: "danger" | "warn" | "info" }> = [
    { l: "≤ 30d", arr: bucket30, tone: "danger" },
    { l: "31–60d", arr: bucket60, tone: "warn" },
    { l: "61–90d", arr: bucket90, tone: "info" },
  ];
  const toneBar: Record<string, string> = {
    danger: "bg-red-500",
    warn: "bg-amber-500",
    info: "bg-sky-500",
  };

  return (
    <div>
      <div className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
        {showMoney ? fmtMoneyCompact(atRisk) : bucket30.length}
      </div>
      <div className="text-[11.5px] text-gray-500 dark:text-gray-400 mb-3.5">
        {showMoney ? "at risk in next 30 days" : "renewals in next 30 days"}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center gap-2 text-xs">
            <span className="w-12 tabular-nums text-gray-500 dark:text-gray-400">
              {r.l}
            </span>
            <div className="flex-1 h-1.5 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={`h-full ${toneBar[r.tone]}`}
                style={{ width: Math.min(100, r.arr.length * 4) + "%", opacity: 0.8 }}
              />
            </div>
            <span className="w-6 text-right font-medium tabular-nums text-gray-700 dark:text-gray-300">
              {r.arr.length}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopVendors({ services }: { services: Service[] }) {
  const byVendor = new Map<string, number>();
  for (const s of services) {
    const name = s.vendor?.name ?? "—";
    byVendor.set(name, (byVendor.get(name) ?? 0) + (s.yearly_cost ?? 0));
  }
  const rows = [...byVendor.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));

  if (rows.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
        No vendor spend recorded.
      </div>
    );
  }
  const max = rows[0].value;
  return (
    <div>
      {rows.map((r) => (
        <BarRow
          key={r.name}
          label={r.name}
          value={r.value}
          max={max}
          rightLabel={fmtMoneyCompact(r.value)}
          tone="brand"
        />
      ))}
    </div>
  );
}

function ByCategory({ services }: { services: Service[] }) {
  const map = new Map<string, number>();
  for (const s of services) {
    const name = s.category_rel?.name ?? "Uncategorized";
    map.set(name, (map.get(name) ?? 0) + (s.yearly_cost ?? 0));
  }
  const rows = [...map.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const tones = [
    "bg-brand-500",
    "bg-sky-500",
    "bg-purple-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-red-500",
  ];
  const dotTones = [
    "bg-brand-500",
    "bg-sky-500",
    "bg-purple-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-red-500",
  ];
  if (rows.length === 0 || total === 0) {
    return (
      <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
        No categorized spend yet.
      </div>
    );
  }
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800 mb-3">
        {rows.map(([name, v], i) => (
          <div
            key={name}
            title={`${name}: ${fmtMoneyCompact(v)}`}
            className={tones[i % tones.length]}
            style={{
              width: (v / total) * 100 + "%",
              opacity: 0.85,
              transition: "width 400ms",
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-1">
        {rows.slice(0, 8).map(([name, v], i) => (
          <div key={name} className="flex items-center gap-1.5 text-xs min-w-0">
            <span
              className={`inline-block h-2 w-2 rounded-sm shrink-0 ${dotTones[i % dotTones.length]}`}
            />
            <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">
              {name}
            </span>
            <span className="tabular-nums text-gray-500 dark:text-gray-400">
              {Math.round((v / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingList({
  services,
  today,
  navigate,
  showMoney,
}: {
  services: Service[];
  today: Date;
  navigate: (path: string) => void;
  showMoney: boolean;
}) {
  const upcoming = services
    .map((s) => ({ s, d: daysUntil(s.renewal_date, today) }))
    .filter((x) => x.d != null && x.d >= 0 && x.d <= 120)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
    .slice(0, 10);

  if (upcoming.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
        No renewals in the next 120 days.
      </div>
    );
  }
  return (
    <div className="-mx-1">
      {upcoming.map(({ s, d }) => {
        const days = d ?? 0;
        const tone =
          days < 30
            ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
            : days < 60
              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/services/${s.id}`)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div
              className={`flex w-9 flex-col items-center rounded-md py-0.5 text-[11px] font-medium leading-tight ${tone}`}
            >
              <span className="text-sm font-semibold tabular-nums">{days}</span>
              <span>d</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                {s.name}
              </div>
              <div className="truncate text-[11.5px] text-gray-500 dark:text-gray-400">
                {(s.vendor?.name ?? "—") + " · " + (s.category_rel?.name ?? "Uncategorized")}
              </div>
            </div>
            {showMoney && (
              <div className="shrink-0 text-[12.5px] tabular-nums text-gray-700 dark:text-gray-300">
                {s.yearly_cost != null ? fmtMoneyCompact(s.yearly_cost) : "—"}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function HardwareSnapshot({ laptops }: { laptops: Laptop[] }) {
  const byStatus = new Map<string, number>();
  for (const l of laptops) {
    const name = l.hardware_status?.name ?? l.status ?? "Unknown";
    byStatus.set(name, (byStatus.get(name) ?? 0) + 1);
  }
  const entries = [...byStatus.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const toneMap: Record<string, "success" | "info" | "warn" | "danger" | "brand"> = {
    "In use": "success",
    "In Use": "success",
    Assigned: "success",
    "In stock": "info",
    "In Stock": "info",
    Repair: "warn",
    Retired: "brand",
    Lost: "danger",
  };

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <div className="text-[26px] font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
          {laptops.length}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">laptops tracked</div>
      </div>
      <div className="flex flex-col gap-1">
        {entries.map(([name, n]) => (
          <BarRow
            key={name}
            label={name}
            value={n}
            max={max}
            rightLabel={String(n)}
            tone={toneMap[name] ?? "brand"}
          />
        ))}
      </div>
    </div>
  );
}

function Coverage({ services }: { services: Service[] }) {
  const total = Math.max(1, services.length);
  const sso = services.filter((s) => s.sso_integrated).length;
  const scim = services.filter((s) => s.scim_enabled).length;
  const ssoPct = Math.round((sso / total) * 100);
  const scimPct = Math.round((scim / total) * 100);
  const rows: Array<{
    label: string;
    pct: number;
    n: number;
    tone: string;
  }> = [
    { label: "SSO", pct: ssoPct, n: sso, tone: "bg-brand-500" },
    { label: "SCIM", pct: scimPct, n: scim, tone: "bg-purple-500" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {rows.map((r) => (
        <div key={r.label} className="py-1">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {r.label}
            </span>
            <span className="text-[22px] font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {r.pct}%
            </span>
          </div>
          <div className="h-1.5 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden mb-1.5">
            <div
              className={`h-full ${r.tone}`}
              style={{ width: r.pct + "%", opacity: 0.85 }}
            />
          </div>
          <div className="text-[11.5px] text-gray-500 dark:text-gray-400">
            {r.n} of {services.length} services
          </div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { user, canFinancialView } = useAuth();
  const navigate = useNavigate();
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const { records, fiscalYears, loading: costLoading } = useDashboardCostData();
  const [dashYearPreference, setDashYearPreference] = useState<number | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    Promise.all([
      client.get<Service[]>("/api/services/"),
      client.get<Laptop[]>("/api/laptops/"),
    ])
      .then(([sRes, lRes]) => {
        setServices(sRes.data);
        setLaptops(lRes.data);
      })
      .finally(() => setInventoryLoading(false));
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const years = fiscalYears;
  const loading = inventoryLoading || costLoading;
  const normalizedSearch = dashboardSearch.trim().toLowerCase();
  const currentYear = today.getFullYear();
  const defaultDashYear =
    years.length === 0
      ? currentYear
      : years.includes(currentYear)
        ? currentYear
        : years[years.length - 1];
  const dashYear =
    dashYearPreference != null && years.includes(dashYearPreference)
      ? dashYearPreference
      : defaultDashYear;

  const actualRecords = useMemo(
    () => records.filter((r) => r.record_type === "actual"),
    [records],
  );
  const showProjectedValues = isCurrentOrFutureFiscalYear(dashYear, currentYear);

  const serviceMatches = useMemo(() => {
    if (!normalizedSearch) return [];
    return services
      .filter((service) => matchesServiceSearch(service, normalizedSearch))
      .slice(0, 5);
  }, [normalizedSearch, services]);

  const laptopMatches = useMemo(() => {
    if (!normalizedSearch) return [];
    return laptops
      .filter((laptop) => matchesLaptopSearch(laptop, normalizedSearch))
      .slice(0, 5);
  }, [laptops, normalizedSearch]);

  const actualCostByYear = useMemo(
    () => totalByYear(actualRecords, years),
    [actualRecords, years],
  );
  const combinedActualEstimatedCostByYear = useMemo(
    () => combinedActualEstimatedByYear(records, years, currentYear),
    [records, years, currentYear],
  );
  const costByYear = useMemo(
    () =>
      years.reduce<Record<number, number>>((acc, year) => {
        acc[year] = visualAmountForRecordTypeAndYear(
          "actual",
          year,
          actualCostByYear[year] ?? 0,
          combinedActualEstimatedCostByYear[year] ?? 0,
          currentYear,
        );
        return acc;
      }, {}),
    [years, actualCostByYear, combinedActualEstimatedCostByYear, currentYear],
  );

  const yoyChange = useMemo(
    () => yoyPercent(costByYear, dashYear),
    [costByYear, dashYear],
  );

  const annualizedSpend = useMemo(
    () => services.reduce((s, sv) => s + (sv.yearly_cost ?? 0), 0),
    [services],
  );
  const activeServices = services.filter((s) => s.is_active).length;
  const renewals30 = services.filter((s) => {
    const d = daysUntil(s.renewal_date, today);
    return d != null && d >= 0 && d <= 30;
  }).length;
  const renewals90 = services.filter((s) => {
    const d = daysUntil(s.renewal_date, today);
    return d != null && d >= 0 && d <= 90;
  }).length;
  const laptopsInStock = laptops.filter((l) => {
    const name = (l.hardware_status?.name ?? l.status ?? "").toLowerCase();
    return name.includes("stock");
  }).length;
  const laptopsDeployed = laptops.filter((l) => {
    const name = (l.hardware_status?.name ?? l.status ?? "").toLowerCase();
    return name.includes("use") || name.includes("assigned");
  }).length;
  const ssoCoveragePct =
    services.length > 0
      ? Math.round(
          (services.filter((s) => s.sso_integrated).length / services.length) * 100,
        )
      : 0;

  const displayName = user?.email ? user.email.split("@")[0] : "";
  const displayGreeting = displayName ? `${greeting(today)}, ${displayName}.` : greeting(today) + ".";

  if (loading) {
    return <DashboardSkeleton />;
  }

  const hasCostData = records.length > 0;

  return (
    <PageTransition>
      <div className="pb-16">
        {/* Header: greeting */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              Today,{" "}
              {today.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
              {displayGreeting}
            </h1>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {renewals30} renewals in the next 30 days · {laptopsInStock} laptops in stock
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-6 flex justify-center">
          <div className="relative w-full max-w-3xl" ref={searchRef}>
            <div className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 shadow-sm">
              <SearchInput
                value={dashboardSearch}
                onChange={(value) => {
                  setDashboardSearch(value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (normalizedSearch) {
                    setSearchOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Search services and hardware..."
                bare
                inputClassName="rounded-full py-4 pl-12 pr-5 text-base"
                iconClassName="left-5 h-5 w-5"
              />
            </div>
            {searchOpen && normalizedSearch && (
              <div className="animate-scale-in absolute left-0 top-full z-20 mt-3 w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xl">
                <div className="space-y-4">
                  {serviceMatches.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Services
                      </p>
                      <div className="space-y-1">
                        {serviceMatches.map((service) => (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setDashboardSearch("");
                              navigate(`/services/${service.id}`);
                            }}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                {service.name}
                              </span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">
                                {service.category_rel?.name ?? "—"} • {service.status}
                              </span>
                            </span>
                            <span className="ml-4 text-xs text-gray-400">Service</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {laptopMatches.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Hardware
                      </p>
                      <div className="space-y-1">
                        {laptopMatches.map((laptop) => (
                          <button
                            key={laptop.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setDashboardSearch("");
                              navigate(`/hardware/${laptop.id}`);
                            }}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                {laptop.model_name}
                              </span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">
                                {laptop.serial_number} • {laptop.status}
                              </span>
                            </span>
                            <span className="ml-4 text-xs text-gray-400">Hardware</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {serviceMatches.length === 0 && laptopMatches.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No matching services or hardware found.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="flex flex-wrap">
            {canFinancialView && (
              <Kpi
                label="Annualized spend"
                value={fmtMoneyCompact(annualizedSpend)}
                sub="from active services"
              />
            )}
            <Kpi
              label="Active services"
              value={activeServices}
              sub={`of ${services.length}`}
            />
            <Kpi
              label="Renewals · 90d"
              value={renewals90}
              sub={`${renewals30} urgent`}
            />
            <Kpi
              label="Laptops deployed"
              value={laptopsDeployed}
              sub={`of ${laptops.length}`}
            />
            <Kpi
              label="SSO coverage"
              value={`${ssoCoveragePct}%`}
              sub="target 80%"
            />
          </div>
        </div>

        {/* Widget grid */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {canFinancialView && (
            <WidgetCard title="Annualized spend trend" className="lg:col-span-8">
              {hasCostData ? (
                <SpendTrend yearly={costByYear} years={years} />
              ) : (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No cost records yet. Add cost records to services to see trends.
                </div>
              )}
            </WidgetCard>
          )}
          <WidgetCard
            title="Renewal risk (90 days)"
            className={canFinancialView ? "lg:col-span-4" : "lg:col-span-6"}
          >
            <RenewalRisk
              services={services}
              today={today}
              showMoney={canFinancialView}
            />
          </WidgetCard>

          {canFinancialView && (
            <WidgetCard title="Top vendors by spend" className="lg:col-span-6">
              <TopVendors services={services} />
            </WidgetCard>
          )}
          {canFinancialView && (
            <WidgetCard title="Spend by category" className="lg:col-span-6">
              <ByCategory services={services} />
            </WidgetCard>
          )}

          <WidgetCard
            title="Upcoming renewals"
            className={canFinancialView ? "lg:col-span-8" : "lg:col-span-6"}
          >
            <UpcomingList
              services={services}
              today={today}
              navigate={navigate}
              showMoney={canFinancialView}
            />
          </WidgetCard>
          <WidgetCard
            title="Hardware snapshot"
            className={canFinancialView ? "lg:col-span-4" : "lg:col-span-6"}
          >
            <HardwareSnapshot laptops={laptops} />
          </WidgetCard>

          <WidgetCard
            title="SSO & SCIM coverage"
            className={canFinancialView ? "lg:col-span-6" : "lg:col-span-12"}
          >
            <Coverage services={services} />
          </WidgetCard>

          {canFinancialView && hasCostData && years.length > 0 && (
            <WidgetCard title="Fiscal year focus" className="lg:col-span-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Fiscal year
                  </span>
                  <div className="inline-flex gap-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                    {years.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setDashYearPreference(y)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 ${
                          dashYear === y
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {showProjectedValues ? "Total (actual + est.)" : "Total (actual)"}
                    </div>
                    <div className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
                      {fmtMoneyFull(costByYear[dashYear] ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      YoY change
                    </div>
                    <div
                      className={`mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight ${
                        yoyChange < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : yoyChange > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-900 dark:text-gray-50"
                      }`}
                    >
                      {yoyChange >= 0 ? "+" : ""}
                      {yoyChange.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <Link
                  to="/costs"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Open IT Financial Report →
                </Link>
              </div>
            </WidgetCard>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
