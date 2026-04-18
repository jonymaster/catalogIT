import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/useAuth";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import type { Service, Laptop } from "../types/models";
import { DashboardSkeleton } from "../components/Skeleton";
import { BarRow } from "../components/ui/BarRow";
import { Monogram } from "../components/ui/Monogram";
import { formatMoneyCompact } from "../components/ui/money-format";
import {
  totalByYear,
  combinedActualEstimatedByYear,
  visualAmountForRecordTypeAndYear,
  yoyPercent,
} from "../utils/dashboardCostAggregates";

function greetingForNow(email?: string | null): string {
  const h = new Date().getHours();
  const prefix = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const name = email?.split("@")[0]?.split(".")[0];
  const pretty = name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
  return pretty ? `${prefix}, ${pretty}.` : `${prefix}.`;
}

function WidgetCard({
  title,
  right,
  children,
  className = "",
  span = 6,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  span?: number;
}) {
  return (
    <div
      className={`rounded-[10px] border border-border bg-surface p-4 shadow-sm animate-fade-in ${className}`}
      style={{ gridColumn: `span ${span} / span ${span}` }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div
          className="text-[11.5px] font-semibold uppercase text-fg-3"
          style={{ letterSpacing: "0.06em" }}
        >
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  sub,
  first,
  onClick,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  sub?: string;
  first?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`min-w-0 flex-1 px-4 py-3 ${first ? "" : "border-l border-border"} ${
        onClick ? "cursor-pointer transition-colors hover:bg-surface-2/60" : ""
      }`}
    >
      <div
        className="mb-1 text-[11px] font-semibold uppercase text-fg-3"
        style={{ letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div
        className="tnum text-fg"
        style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      {(delta != null || sub) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
          {delta != null && (
            <span
              className="font-medium"
              style={{
                color:
                  delta > 0
                    ? "var(--success)"
                    : delta < 0
                      ? "var(--danger)"
                      : "var(--fg-3)",
              }}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-fg-3">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function SpendTrendChart({
  years,
  costByYear,
  activeYear,
  onSelectYear,
}: {
  years: number[];
  costByYear: Record<number, number>;
  activeYear: number;
  onSelectYear: (y: number) => void;
}) {
  const w = 640;
  const h = 180;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 26;
  const iw = w - padL - padR;
  const ih = h - padT - padB;

  const values = years.map((y) => costByYear[y] ?? 0);
  const max = Math.max(...values, 1);

  const pts = years.map((y, i) => ({
    x: years.length === 1 ? padL + iw / 2 : padL + (i / (years.length - 1)) * iw,
    y: padT + ih - ((costByYear[y] ?? 0) / max) * ih,
    year: y,
    value: costByYear[y] ?? 0,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    linePath +
    ` L${pts[pts.length - 1].x},${padT + ih} L${pts[0].x},${padT + ih} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "auto" }}
      preserveAspectRatio="none"
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={padL}
          x2={w - padR}
          y1={padT + ih * (1 - f)}
          y2={padT + ih * (1 - f)}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      <path d={areaPath} fill="var(--accent)" opacity={0.1} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      {pts.map((p) => (
        <g key={p.year} style={{ cursor: "pointer" }} onClick={() => onSelectYear(p.year)}>
          <circle
            cx={p.x}
            cy={p.y}
            r={p.year === activeYear ? 4 : 2.5}
            fill="var(--accent)"
          />
          <text
            x={p.x}
            y={h - 8}
            fontSize={10.5}
            textAnchor="middle"
            fill={p.year === activeYear ? "var(--fg)" : "var(--fg-3)"}
            fontFamily="'IBM Plex Mono', ui-monospace, monospace"
            fontWeight={p.year === activeYear ? 600 : 400}
          >
            {p.year}
          </text>
        </g>
      ))}
    </svg>
  );
}

function UpcomingRenewals({ services }: { services: Service[] }) {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const upcoming = useMemo(() => {
    return services
      .filter((s) => !!s.renewal_date)
      .map((s) => ({
        s,
        days: Math.round(
          (new Date(s.renewal_date!).getTime() - today.getTime()) / 86400000,
        ),
      }))
      .filter(({ days }) => days >= -2 && days <= 120)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
  }, [services, today]);

  if (upcoming.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-fg-3">
        No renewals coming up in the next 120 days.
      </div>
    );
  }

  return (
    <div className="-mx-1 flex flex-col">
      {upcoming.map(({ s, days }) => {
        const bg =
          days < 30
            ? "var(--danger-soft)"
            : days < 60
              ? "var(--warn-soft)"
              : "var(--surface-2)";
        const fg =
          days < 30
            ? "var(--danger)"
            : days < 60
              ? "var(--warn)"
              : "var(--fg-3)";
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/services/${s.id}`)}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
          >
            <div
              className="flex w-9 shrink-0 flex-col items-center justify-center rounded-md py-0.5 text-[10px] font-medium"
              style={{ background: bg, color: fg }}
            >
              <span className="tnum" style={{ fontSize: 14, fontWeight: 600 }}>
                {days}
              </span>
              <span>d</span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[13px] font-medium text-fg"
                title={s.name}
              >
                {s.name}
              </div>
              <div className="truncate text-[11.5px] text-fg-3">
                {s.vendor?.name ?? "—"}
                {s.category_rel?.name ? ` · ${s.category_rel.name}` : ""}
              </div>
            </div>
            {s.yearly_cost != null && (
              <div className="tnum shrink-0 text-[12.5px] text-fg-2">
                {formatMoneyCompact(Number(s.yearly_cost))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SpendByCategory({
  records,
  fiscalYear,
}: {
  records: { category_name: string | null; amount: number; fiscal_year: number }[];
  fiscalYear: number;
}) {
  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      if (r.fiscal_year !== fiscalYear) return;
      const key = (r.category_name ?? "").trim() || "(Uncategorized)";
      map.set(key, (map.get(key) ?? 0) + r.amount);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [records, fiscalYear]);

  const total = byCat.reduce((s, d) => s + d.value, 0);
  const max = byCat[0]?.value ?? 0;

  if (byCat.length === 0) {
    return <div className="py-6 text-center text-sm text-fg-3">No cost data for {fiscalYear}.</div>;
  }

  const tones: Array<"accent" | "info" | "purple" | "success" | "warn" | "danger"> = [
    "accent",
    "info",
    "purple",
    "success",
    "warn",
    "danger",
  ];

  return (
    <div>
      <div className="mb-3 flex h-2 overflow-hidden rounded bg-surface-2">
        {byCat.map((d, i) => (
          <div
            key={d.name}
            title={`${d.name}: ${formatMoneyCompact(d.value)}`}
            style={{
              width: `${(d.value / (total || 1)) * 100}%`,
              background: `var(--${tones[i % tones.length]})`,
              opacity: 0.85,
              transition: "width 400ms cubic-bezier(.2,.8,.2,1)",
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {byCat.map((d, i) => (
          <BarRow
            key={d.name}
            label={d.name}
            value={d.value}
            max={max}
            tone={tones[i % tones.length]}
            rightLabel={formatMoneyCompact(d.value)}
            labelWidth={150}
          />
        ))}
      </div>
    </div>
  );
}

function HardwareSnapshot({ laptops }: { laptops: Laptop[] }) {
  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    laptops.forEach((l) => {
      const key = l.hardware_status?.name ?? l.status ?? "—";
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [laptops]);

  const max = byStatus[0]?.[1] ?? 0;
  const toneFor = (name: string): "accent" | "info" | "purple" | "success" | "warn" | "danger" => {
    const n = name.toLowerCase();
    if (n.includes("use") || n.includes("assigned")) return "success";
    if (n.includes("stock")) return "info";
    if (n.includes("repair") || n.includes("pending")) return "warn";
    if (n.includes("retir") || n.includes("lost")) return "danger";
    return "accent";
  };

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <div
          className="tnum text-fg"
          style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          {laptops.length}
        </div>
        <div className="text-[12px] text-fg-3">laptops tracked</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {byStatus.map(([name, n]) => (
          <BarRow
            key={name}
            label={name}
            value={n}
            max={max}
            tone={toneFor(name)}
            rightLabel={n}
            labelWidth={120}
          />
        ))}
      </div>
    </div>
  );
}

function TopServicesBySpend({ services }: { services: Service[] }) {
  const top = useMemo(() => {
    return [...services]
      .filter((s) => s.yearly_cost != null && Number(s.yearly_cost) > 0)
      .sort((a, b) => Number(b.yearly_cost) - Number(a.yearly_cost))
      .slice(0, 6);
  }, [services]);

  if (top.length === 0) {
    return <div className="py-6 text-center text-sm text-fg-3">No services with spend yet.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      {top.map((s) => (
        <Link
          key={s.id}
          to={`/services/${s.id}`}
          className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2"
        >
          <Monogram name={s.name} seed={s.id} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-fg">{s.name}</div>
            <div className="truncate text-[11.5px] text-fg-3">
              {s.vendor?.name ?? "—"}
              {s.category_rel?.name ? ` · ${s.category_rel.name}` : ""}
            </div>
          </div>
          <div className="tnum shrink-0 text-[12.5px] font-medium text-fg-2">
            {formatMoneyCompact(Number(s.yearly_cost))}
          </div>
        </Link>
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
  const [dashYearOverride, setDashYearOverride] = useState<number | null>(null);

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

  const currentYearValue = new Date().getFullYear();
  const defaultDashYear =
    fiscalYears.length === 0
      ? currentYearValue
      : fiscalYears.includes(currentYearValue)
        ? currentYearValue
        : fiscalYears[fiscalYears.length - 1];
  const dashYear = dashYearOverride ?? defaultDashYear;
  const setDashYear = (y: number) => setDashYearOverride(y);

  const loading = inventoryLoading || costLoading;

  const actualRecords = useMemo(
    () => records.filter((r) => r.record_type === "actual"),
    [records],
  );
  const currentYear = currentYearValue;

  const actualByYear = useMemo(
    () => totalByYear(actualRecords, fiscalYears),
    [actualRecords, fiscalYears],
  );
  const combinedByYear = useMemo(
    () => combinedActualEstimatedByYear(records, fiscalYears, currentYear),
    [records, fiscalYears, currentYear],
  );
  const costByYear = useMemo(
    () =>
      fiscalYears.reduce<Record<number, number>>((acc, year) => {
        acc[year] = visualAmountForRecordTypeAndYear(
          "actual",
          year,
          actualByYear[year] ?? 0,
          combinedByYear[year] ?? 0,
          currentYear,
        );
        return acc;
      }, {}),
    [fiscalYears, actualByYear, combinedByYear, currentYear],
  );

  const yoyChange = useMemo(() => yoyPercent(costByYear, dashYear), [costByYear, dashYear]);

  const today = useMemo(() => new Date(), []);
  const upcoming30 = useMemo(
    () =>
      services.filter((s) => {
        if (!s.renewal_date) return false;
        const d =
          (new Date(s.renewal_date).getTime() - today.getTime()) / 86400000;
        return d >= 0 && d <= 30;
      }).length,
    [services, today],
  );
  const upcoming90 = useMemo(
    () =>
      services.filter((s) => {
        if (!s.renewal_date) return false;
        const d =
          (new Date(s.renewal_date).getTime() - today.getTime()) / 86400000;
        return d >= 0 && d <= 90;
      }).length,
    [services, today],
  );

  const laptopsInUse = useMemo(() => {
    return laptops.filter((l) => {
      const n = (l.hardware_status?.name ?? l.status ?? "").toLowerCase();
      return n.includes("assigned") || n.includes("use");
    }).length;
  }, [laptops]);

  const laptopsInStock = useMemo(() => {
    return laptops.filter((l) => {
      const n = (l.hardware_status?.name ?? l.status ?? "").toLowerCase();
      return n.includes("stock");
    }).length;
  }, [laptops]);

  const ssoPct = useMemo(() => {
    if (services.length === 0) return 0;
    const n = services.filter((s) => s.sso_integrated).length;
    return Math.round((n * 100) / services.length);
  }, [services]);

  const activeServices = useMemo(
    () => services.filter((s) => s.is_active).length,
    [services],
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  const hasCostData = records.length > 0;
  const todayLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1280px]">
        {/* Hero */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[12px] text-fg-3">
              {todayLabel}
            </div>
            <h1
              className="text-fg"
              style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
            >
              {greetingForNow(user?.email)}
            </h1>
            <div className="mt-1 text-[14px] text-fg-3">
              <span className="text-fg-2 font-medium">{upcoming30}</span>{" "}
              renewal{upcoming30 === 1 ? "" : "s"} in the next 30 days ·{" "}
              <span className="text-fg-2 font-medium">{laptopsInStock}</span>{" "}
              laptop{laptopsInStock === 1 ? "" : "s"} in stock
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-4 flex flex-wrap rounded-[10px] border border-border bg-surface shadow-sm">
          <Kpi
            first
            label="Active services"
            value={activeServices}
            sub={`of ${services.length}`}
            onClick={() => navigate("/services")}
          />
          <Kpi
            label="Renewals · 90d"
            value={upcoming90}
            sub={`${upcoming30} urgent`}
            onClick={() => navigate("/calendar")}
          />
          <Kpi
            label="Laptops deployed"
            value={laptopsInUse}
            sub={`of ${laptops.length}`}
            onClick={() => navigate("/hardware")}
          />
          {canFinancialView && hasCostData && (
            <Kpi
              label={`Spend · FY${dashYear}`}
              value={formatMoneyCompact(costByYear[dashYear] ?? 0)}
              delta={Number.isFinite(yoyChange) ? yoyChange : null}
              sub="vs prior year"
              onClick={() => navigate("/costs")}
            />
          )}
          <Kpi label="SSO coverage" value={`${ssoPct}%`} sub="target 80%" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-4">
          {canFinancialView && hasCostData && (
            <WidgetCard
              title="Annualized spend trend"
              span={8}
              right={
                <div
                  className="tnum text-fg-3"
                  style={{ fontSize: 12, letterSpacing: "0.02em" }}
                >
                  FY{fiscalYears[0]} – FY{fiscalYears[fiscalYears.length - 1]}
                </div>
              }
            >
              <SpendTrendChart
                years={fiscalYears}
                costByYear={costByYear}
                activeYear={dashYear}
                onSelectYear={setDashYear}
              />
              <div className="mt-2 flex justify-end">
                <Link
                  to="/costs"
                  className="text-[12px] text-accent hover:text-accent-strong"
                >
                  View full report →
                </Link>
              </div>
            </WidgetCard>
          )}

          <WidgetCard
            title="Upcoming renewals"
            span={canFinancialView && hasCostData ? 4 : 6}
            right={
              <Link
                to="/calendar"
                className="text-[12px] text-fg-3 hover:text-fg-2"
              >
                Calendar →
              </Link>
            }
          >
            <UpcomingRenewals services={services} />
          </WidgetCard>

          {canFinancialView && hasCostData && (
            <WidgetCard
              title={`Spend by category · FY${dashYear}`}
              span={6}
              right={
                <Link to="/costs" className="text-[12px] text-fg-3 hover:text-fg-2">
                  Drill down →
                </Link>
              }
            >
              <SpendByCategory records={records} fiscalYear={dashYear} />
            </WidgetCard>
          )}

          <WidgetCard
            title="Hardware snapshot"
            span={canFinancialView && hasCostData ? 6 : 6}
            right={
              <Link to="/hardware" className="text-[12px] text-fg-3 hover:text-fg-2">
                All hardware →
              </Link>
            }
          >
            <HardwareSnapshot laptops={laptops} />
          </WidgetCard>

          <WidgetCard
            title="Top services by spend"
            span={12}
            right={
              <Link
                to="/services"
                className="text-[12px] text-fg-3 hover:text-fg-2"
              >
                All services →
              </Link>
            }
          >
            <TopServicesBySpend services={services} />
          </WidgetCard>
        </div>
      </div>
    </PageTransition>
  );
}
