import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/useAuth";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import type {
  Service,
  Laptop,
  GlobalAuditEventRow,
  PaginatedGlobalAudit,
} from "../types/models";
import { BarChart } from "../components/charts/BarChart";
import {
  buildChartAxis,
  formatChartTickMoney,
  type ChartYScaleMode,
} from "../components/charts/chartAxis";
import { DashboardSkeleton } from "../components/Skeleton";
import { BarRow } from "../components/ui/BarRow";
import { Avatar } from "../components/ui/Avatar";
import { formatMoneyCompact } from "../components/ui/money-format";
import { PlusIcon, XMarkIcon } from "../components/Icons";
import { CommandPaletteTrigger } from "../components/CommandPaletteTrigger";
import {
  totalByYear,
  combinedActualEstimatedByYear,
  visualAmountForRecordTypeAndYear,
  yoyPercent,
} from "../utils/dashboardCostAggregates";

const WIDGET_STORAGE_KEY = "catalogit:dashboard:widgets";

type WidgetId =
  | "kpis"
  | "spend-trend"
  | "spend-by-year"
  | "renewal-risk"
  | "top-vendors"
  | "by-category"
  | "upcoming"
  | "activity"
  | "hardware"
  | "coverage"
  | "owners";

interface WidgetCtx {
  services: Service[];
  laptops: Laptop[];
  records: { category_name: string | null; amount: number; fiscal_year: number; vendor_name?: string | null }[];
  fiscalYears: number[];
  costByYear: Record<number, number>;
  dashYear: number;
  setDashYear: (y: number) => void;
  yoyChange: number;
  canFinancialView: boolean;
  hasCostData: boolean;
  upcoming30: number;
  upcoming90: number;
  laptopsInUse: number;
  ssoPct: number;
  ssoCount: number;
  activeServices: number;
  isAdmin: boolean;
  spendChartScale: ChartYScaleMode;
  setSpendChartScale: (m: ChartYScaleMode) => void;
  /** Where to show the shared axis mode control when only one spend chart is visible. */
  spendAxisTogglePlacement: "trend" | "byYear" | "none";
}

interface WidgetDef {
  id: WidgetId;
  title: string;
  span: number;
  render: (ctx: WidgetCtx) => React.ReactNode;
  adminOnly?: boolean;
  requiresFinancial?: boolean;
}

function greetingForNow(email?: string | null): string {
  const h = new Date().getHours();
  const prefix = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const name = email?.split("@")[0]?.split(".")[0];
  const pretty = name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
  return pretty ? `${prefix}, ${pretty}.` : `${prefix}.`;
}

function useFlipReorder(
  ids: string[],
  getElement: (id: string) => HTMLElement | null | undefined,
  skipId: string | null,
) {
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const newRects = new Map<string, DOMRect>();
    const animations: Array<{ el: HTMLElement; dx: number; dy: number }> = [];

    ids.forEach((id) => {
      const el = getElement(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      newRects.set(id, rect);
      if (id === skipId) return;
      const prev = prevRects.current.get(id);
      if (!prev) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      animations.push({ el, dx, dy });
    });

    prevRects.current = newRects;
    if (prefersReducedMotion || animations.length === 0) return;

    animations.forEach(({ el, dx, dy }) => {
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    const raf = requestAnimationFrame(() => {
      animations.forEach(({ el }) => {
        el.style.transition = "transform 240ms cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "";
        const cleanup = () => {
          el.style.transition = "";
          el.style.transform = "";
          el.removeEventListener("transitionend", cleanup);
        };
        el.addEventListener("transitionend", cleanup);
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [ids, getElement, skipId]);
}

function useLocalStorage<T>(
  key: string,
  fallback: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next =
          typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore quota
        }
        return next;
      });
    },
    [key],
  );
  return [value, set];
}

function Kpi({
  label,
  value,
  delta,
  sub,
  first,
  onClick,
  invertDeltaColors,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  sub?: string;
  first?: boolean;
  onClick?: () => void;
  /** When true, positive delta is bad (red) and negative is good (green) — e.g. spend vs prior year. */
  invertDeltaColors?: boolean;
}) {
  const deltaLineColor =
    delta == null || delta === 0
      ? "var(--fg-3)"
      : invertDeltaColors
        ? delta > 0
          ? "var(--danger)"
          : "var(--success)"
        : delta > 0
          ? "var(--success)"
          : "var(--danger)";
  const valueColor =
    invertDeltaColors && delta != null && delta !== 0 ? deltaLineColor : undefined;

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
        className={`tnum ${valueColor ? "" : "text-fg"}`}
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          ...(valueColor ? { color: valueColor } : {}),
        }}
      >
        {value}
      </div>
      {(delta != null || sub) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
          {delta != null && (
            <span className="font-medium" style={{ color: deltaLineColor }}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-fg-3">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function KpiStrip({ ctx }: { ctx: WidgetCtx }) {
  const navigate = useNavigate();
  const {
    activeServices,
    services,
    upcoming30,
    upcoming90,
    laptopsInUse,
    laptops,
    canFinancialView,
    hasCostData,
    costByYear,
    dashYear,
    yoyChange,
    ssoPct,
    ssoCount,
  } = ctx;
  return (
    <div className="flex flex-wrap">
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
          invertDeltaColors
          sub="vs prior year"
          onClick={() => navigate("/costs")}
        />
      )}
      {activeServices > 0 && (
        <Kpi
          label="SSO coverage"
          value={`${ssoPct}%`}
          sub={`${ssoCount} out of ${activeServices}`}
        />
      )}
 
    </div>
  );
}

const SPEND_TREND_TICK_FRACS = [0, 0.25, 0.5, 0.75, 1] as const;

function SpendTrendChart({
  years,
  costByYear,
  activeYear,
  onSelectYear,
  scale,
  showAxisHint,
}: {
  years: number[];
  costByYear: Record<number, number>;
  activeYear: number;
  onSelectYear: (y: number) => void;
  scale: ChartYScaleMode;
  showAxisHint?: boolean;
}) {
  const w = 640;
  const h = 180;
  const padL = 52;
  const padR = 10;
  const padT = 10;
  const padB = 26;
  const iw = w - padL - padR;
  const ih = h - padT - padB;

  const values = years.map((y) => costByYear[y] ?? 0);
  const axis = buildChartAxis(values, scale);

  if (years.length === 0) {
    return null;
  }

  const pts = years.map((y, i) => ({
    x: years.length === 1 ? padL + iw / 2 : padL + (i / (years.length - 1)) * iw,
    y: padT + ih - axis.valueToHeightFraction(costByYear[y] ?? 0) * ih,
    year: y,
    value: costByYear[y] ?? 0,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    linePath +
    ` L${pts[pts.length - 1].x},${padT + ih} L${pts[0].x},${padT + ih} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto" }}
        preserveAspectRatio="none"
      >
        {SPEND_TREND_TICK_FRACS.map((f) => {
          const y = padT + ih * (1 - f);
          return (
            <g key={f}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fontWeight="500"
                className="fill-gray-500 dark:fill-gray-400"
                style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              >
                {formatChartTickMoney(axis.tickValue(f))}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="var(--accent)" opacity={0.1} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        {pts.map((p) => (
          <g
            key={p.year}
            style={{ cursor: "pointer" }}
            onClick={() => onSelectYear(p.year)}
          >
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
      {showAxisHint && axis.axisHint ? (
        <div className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">
          {axis.axisHint}
        </div>
      ) : null}
    </div>
  );
}

function SpendChartScaleToggle({
  value,
  onChange,
}: {
  value: ChartYScaleMode;
  onChange: (m: ChartYScaleMode) => void;
}) {
  const opts: { id: ChartYScaleMode; label: string }[] = [
    { id: "linearZero", label: "Full" },
    { id: "linearFocused", label: "Focus" },
    { id: "log", label: "Log" },
  ];
  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
      <span className="text-[11px] text-fg-4">Axis</span>
      <div className="inline-flex rounded-md border border-border bg-surface-2/50 p-0.5">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              value === o.id
                ? "bg-accent text-white shadow-sm"
                : "text-fg-3 hover:text-fg-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpendTrendWidget({ ctx }: { ctx: WidgetCtx }) {
  const {
    fiscalYears,
    costByYear,
    dashYear,
    setDashYear,
    spendChartScale,
    setSpendChartScale,
    spendAxisTogglePlacement,
  } = ctx;
  return (
    <>
      {fiscalYears.length > 0 && spendAxisTogglePlacement === "trend" ? (
        <SpendChartScaleToggle
          value={spendChartScale}
          onChange={setSpendChartScale}
        />
      ) : null}
      <SpendTrendChart
        years={fiscalYears}
        costByYear={costByYear}
        activeYear={dashYear}
        onSelectYear={setDashYear}
        scale={spendChartScale}
        showAxisHint
      />
      <div className="mt-2 flex justify-end">
        <Link
          to="/costs"
          className="text-[12px] text-accent hover:text-accent-strong"
        >
          View full report →
        </Link>
      </div>
    </>
  );
}

function SpendByYearWidget({ ctx }: { ctx: WidgetCtx }) {
  const {
    fiscalYears,
    costByYear,
    dashYear,
    setDashYear,
    hasCostData,
    spendChartScale,
    setSpendChartScale,
    spendAxisTogglePlacement,
  } = ctx;
  if (!hasCostData || fiscalYears.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-fg-3">
        No cost data yet. Add cost records in the Cost Report to see spend by year.
      </div>
    );
  }
  return (
    <>
      {spendAxisTogglePlacement === "byYear" ? (
        <SpendChartScaleToggle
          value={spendChartScale}
          onChange={setSpendChartScale}
        />
      ) : null}
      <BarChart
        height={260}
        scale={spendChartScale}
        showAxisHint
        data={fiscalYears.map((y) => ({
          label: String(y),
          value: costByYear[y] ?? 0,
          color:
            y === dashYear
              ? "var(--accent)"
              : "color-mix(in srgb, var(--accent) 38%, var(--surface-2))",
        }))}
        onBarClick={(i) => {
          const y = fiscalYears[i];
          if (y !== undefined) setDashYear(y);
        }}
      />
      <div className="mt-2 flex justify-end">
        <Link
          to="/costs"
          className="text-[12px] text-accent hover:text-accent-strong"
        >
          View full report →
        </Link>
      </div>
    </>
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
            className="interactive-record flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
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
                className="record-primary-label truncate text-[13px] font-medium text-fg"
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

function RenewalRisk({ services }: { services: Service[] }) {
  const today = useMemo(() => new Date(), []);
  const { b30, b60, b90, atRisk } = useMemo(() => {
    const days = (s: Service) =>
      (new Date(s.renewal_date!).getTime() - today.getTime()) / 86400000;
    const withRenewal = services.filter((s) => !!s.renewal_date);
    const up = withRenewal.filter((s) => {
      const d = days(s);
      return d >= 0 && d <= 90;
    });
    const b30 = up.filter((s) => days(s) <= 30);
    const b60 = up.filter((s) => {
      const d = days(s);
      return d > 30 && d <= 60;
    });
    const b90 = up.filter((s) => {
      const d = days(s);
      return d > 60 && d <= 90;
    });
    const atRisk = b30.reduce((a, s) => a + Number(s.yearly_cost ?? 0), 0);
    return { b30, b60, b90, atRisk };
  }, [services, today]);

  const rows: Array<{ label: string; n: number; tone: "accent" | "info" | "warn" | "danger" }> = [
    { label: "≤ 30d", n: b30.length, tone: "danger" },
    { label: "31–60d", n: b60.length, tone: "warn" },
    { label: "61–90d", n: b90.length, tone: "info" },
  ];
  const max = Math.max(...rows.map((r) => r.n), 1);

  return (
    <div>
      <div
        className="tnum text-fg"
        style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}
      >
        {formatMoneyCompact(atRisk)}
      </div>
      <div className="mb-3 mt-0.5 text-[11.5px] text-fg-3">
        at risk in next 30 days
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <BarRow
            key={r.label}
            label={r.label}
            value={r.n}
            max={max}
            tone={r.tone}
            rightLabel={r.n}
            labelWidth={60}
          />
        ))}
      </div>
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

function TopVendors({ services }: { services: Service[] }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    services.forEach((s) => {
      const name = s.vendor?.name ?? "—";
      map.set(name, (map.get(name) ?? 0) + Number(s.yearly_cost ?? 0));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [services]);

  if (data.length === 0) {
    return <div className="py-6 text-center text-sm text-fg-3">No vendor spend yet.</div>;
  }

  const max = data[0].value;

  return (
    <div className="flex flex-col gap-1">
      {data.map((d) => (
        <BarRow
          key={d.name}
          label={d.name}
          value={d.value}
          max={max}
          tone="accent"
          rightLabel={formatMoneyCompact(d.value)}
          labelWidth={140}
        />
      ))}
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

function SsoCoverage({ services }: { services: Service[] }) {
  const { sso, scim } = useMemo(() => {
    let sso = 0;
    let scim = 0;
    services.forEach((s) => {
      if (s.sso_integrated) sso++;
      if (s.scim_enabled) scim++;
    });
    return { sso, scim };
  }, [services]);
  const n = services.length || 1;
  const ssoPct = Math.round((sso * 100) / n);
  const scimPct = Math.round((scim * 100) / n);
  const rows: Array<{ label: string; pct: number; have: number; tone: string }> = [
    { label: "SSO", pct: ssoPct, have: sso, tone: "accent" },
    { label: "SCIM", pct: scimPct, have: scim, tone: "purple" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {rows.map((r) => (
        <div key={r.label} className="py-1">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[12px] text-fg-3">{r.label}</span>
            <span
              className="tnum text-fg"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {r.pct}%
            </span>
          </div>
          <div className="mb-1.5 h-1.5 overflow-hidden rounded bg-surface-2">
            <div
              className="h-full"
              style={{
                width: `${r.pct}%`,
                background: `var(--${r.tone})`,
                opacity: 0.85,
                transition: "width 400ms cubic-bezier(.2,.8,.2,1)",
              }}
            />
          </div>
          <div className="text-[11.5px] text-fg-3">
            {r.have} of {services.length} services
          </div>
        </div>
      ))}
    </div>
  );
}

function OwnerDistribution({ services }: { services: Service[] }) {
  const entries = useMemo(() => {
    const counts = new Map<string, { user: Service["owners"][number]; n: number }>();
    services.forEach((s) => {
      s.owners.forEach((o) => {
        const prev = counts.get(o.id);
        counts.set(o.id, { user: o, n: (prev?.n ?? 0) + 1 });
      });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [services]);

  if (entries.length === 0) {
    return <div className="py-6 text-center text-sm text-fg-3">No owners assigned.</div>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      {entries.map(({ user, n }) => (
        <div
          key={user.id}
          className="flex items-center gap-2.5 rounded-md bg-surface-2 px-2 py-1.5"
        >
          <Avatar user={user} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-fg">
              {user.display_name ?? (`${user.first_name} ${user.last_name}`.trim() || user.email)}
            </div>
            <div className="truncate text-[11px] text-fg-3">
              {user.department ?? "—"}
            </div>
          </div>
          <div className="tnum shrink-0 text-[13px] font-semibold text-fg">
            {n}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (!Number.isFinite(diffSec)) return "";
  const abs = Math.abs(diffSec);
  if (abs < 60) return "just now";
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`;
  if (abs < 86400 * 30) return `${Math.floor(abs / 86400)}d ago`;
  if (abs < 86400 * 365) return `${Math.floor(abs / (86400 * 30))}mo ago`;
  return `${Math.floor(abs / (86400 * 365))}y ago`;
}

function humanizeEvent(row: GlobalAuditEventRow): string {
  if (row.summary) return row.summary;
  const verb = row.event_type.includes("create")
    ? "created"
    : row.event_type.includes("update")
      ? "updated"
      : row.event_type.includes("delete")
        ? "deleted"
        : row.event_type.includes("login")
          ? "signed in"
          : row.event_type.replace(/[._]/g, " ");
  const entity = row.entity_table ? ` ${row.entity_table.replace(/_/g, " ")}` : "";
  return `${verb}${entity}`;
}

function ActivityFeed() {
  const [rows, setRows] = useState<GlobalAuditEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .get<PaginatedGlobalAudit>("/api/settings/audit-events?per_page=8")
      .then((r) => {
        if (!cancelled) setRows(r.data.items);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load activity");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="py-6 text-center text-sm text-fg-3">{error}</div>;
  }
  if (rows == null) {
    return <div className="py-6 text-center text-sm text-fg-3">Loading activity…</div>;
  }
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-fg-3">No recent activity.</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.slice(0, 8).map((r) => {
        const actorName = r.actor
          ? (r.actor.display_name ??
              (`${r.actor.first_name} ${r.actor.last_name}`.trim() ||
                r.actor.email))
          : "System";
        return (
          <div key={r.id} className="flex items-start gap-2.5 text-[12.5px]">
            {r.actor ? (
              <Avatar user={r.actor} size={22} />
            ) : (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px] font-semibold text-fg-3"
                style={{ width: 22, height: 22 }}
              >
                SY
              </span>
            )}
            <div className="min-w-0 flex-1 leading-snug">
              <div className="text-fg">
                <strong className="font-medium">{actorName}</strong>{" "}
                <span className="text-fg-3">{humanizeEvent(r)}</span>
                {r.entity_key ? (
                  <span className="text-fg-3"> · {r.entity_key}</span>
                ) : null}
              </div>
              <div className="text-[11px] text-fg-4">
                {formatRelativeTime(r.occurred_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const WIDGETS: WidgetDef[] = [
  {
    id: "kpis",
    title: "Key numbers",
    span: 12,
    render: (ctx) => <KpiStrip ctx={ctx} />,
  },
  {
    id: "spend-trend",
    title: "Annualized spend trend",
    span: 6,
    requiresFinancial: true,
    render: (ctx) => <SpendTrendWidget ctx={ctx} />,
  },
  {
    id: "spend-by-year",
    title: "Spend by year (actual)",
    span: 6,
    requiresFinancial: true,
    render: (ctx) => <SpendByYearWidget ctx={ctx} />,
  },
  {
    id: "renewal-risk",
    title: "Renewal risk (90 days)",
    span: 6,
    render: (ctx) => <RenewalRisk services={ctx.services} />,
  },
  {
    id: "top-vendors",
    title: "Top vendors by spend",
    span: 6,
    requiresFinancial: true,
    render: (ctx) => <TopVendors services={ctx.services} />,
  },
  {
    id: "by-category",
    title: "Spend by category",
    span: 6,
    requiresFinancial: true,
    render: (ctx) => <SpendByCategory records={ctx.records} fiscalYear={ctx.dashYear} />,
  },
  {
    id: "upcoming",
    title: "Upcoming renewals",
    span: 6,
    render: (ctx) => <UpcomingRenewals services={ctx.services} />,
  },
  {
    id: "activity",
    title: "Recent activity",
    span: 6,
    adminOnly: true,
    render: () => <ActivityFeed />,
  },
  {
    id: "hardware",
    title: "Hardware snapshot",
    span: 6,
    render: (ctx) => <HardwareSnapshot laptops={ctx.laptops} />,
  },
  {
    id: "coverage",
    title: "SSO & SCIM coverage",
    span: 6,
    render: (ctx) => <SsoCoverage services={ctx.services} />,
  },
  {
    id: "owners",
    title: "Services per owner",
    span: 12,
    render: (ctx) => <OwnerDistribution services={ctx.services} />,
  },
];

const DEFAULT_WIDGETS: WidgetId[] = [
  "kpis",
  "spend-trend",
  "spend-by-year",
  "upcoming",
  "by-category",
  "hardware",
  "activity",
];

function WidgetShell({
  def,
  editMode,
  onRemove,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  children,
  right,
}: {
  def: WidgetDef;
  editMode: boolean;
  onRemove: () => void;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      data-widget-id={def.id}
      draggable={editMode && def.id !== "kpis"}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-[10px] border border-border bg-surface p-4 shadow-sm animate-fade-in transition-[opacity,box-shadow] ${
        editMode ? "ring-1 ring-accent/20" : ""
      } ${dragging ? "opacity-40" : ""} ${
        dropTarget
          ? "z-[1] ring-2 ring-dashed ring-accent bg-accent-soft/50"
          : ""
      }`}
      style={{
        gridColumn: `span ${def.span} / span ${def.span}`,
        cursor: editMode && def.id !== "kpis" ? "grab" : undefined,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        {editMode && def.id !== "kpis" && (
          <span
            className="text-fg-4 select-none"
            style={{ fontSize: 14, lineHeight: 1, cursor: "grab" }}
            aria-hidden
          >
            ⋮⋮
          </span>
        )}
        <div
          className="flex-1 text-[11.5px] font-semibold uppercase text-fg-3"
          style={{ letterSpacing: "0.06em" }}
        >
          {def.title}
        </div>
        {!editMode && right}
        {editMode && def.id !== "kpis" && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove widget"
            aria-label={`Remove ${def.title}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-3 hover:bg-surface-2 hover:text-fg"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function AddWidgetMenu({
  available,
  onAdd,
}: {
  available: WidgetDef[];
  onAdd: (id: WidgetId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (available.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-fg-2 hover:bg-surface-2"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Add widget
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-border bg-surface shadow-lg animate-fade-in"
        >
          {available.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                onAdd(w.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg-2 hover:bg-surface-2"
            >
              <PlusIcon className="h-3.5 w-3.5 text-fg-3" />
              <span className="flex-1 truncate">{w.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const { user, canFinancialView } = useAuth();
  const isAdmin = user?.role === "admin";
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const { records, fiscalYears, loading: costLoading } = useDashboardCostData();
  const [dashYearOverride, setDashYearOverride] = useState<number | null>(null);
  const [spendChartScale, setSpendChartScale] = useState<ChartYScaleMode>(
    "linearFocused",
  );
  const [editMode, setEditMode] = useState(false);
  const [widgetIds, setWidgetIds] = useLocalStorage<WidgetId[]>(
    WIDGET_STORAGE_KEY,
    DEFAULT_WIDGETS,
  );
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const [dragOverId, setDragOverId] = useState<WidgetId | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const getWidgetEl = useCallback(
    (id: string) =>
      gridRef.current?.querySelector<HTMLElement>(
        `[data-widget-id="${id}"]`,
      ) ?? null,
    [],
  );
  const widgetIdsRef = useRef(widgetIds);
  const orderSnapshotRef = useRef<WidgetId[] | null>(null);
  const didDropRef = useRef(false);
  const lastDragOverWidgetRef = useRef<WidgetId | null>(null);

  useEffect(() => {
    widgetIdsRef.current = widgetIds;
  }, [widgetIds]);

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

  const activeServices = useMemo(
    () => services.filter((s) => s.is_active).length,
    [services],
  );

  const ssoCount = useMemo(
    () => services.filter((s) => s.is_active && s.sso_integrated).length,
    [services],
  );

  const ssoPct = useMemo(() => {
    if (activeServices === 0) return 0;
    return Math.round((ssoCount * 100) / activeServices);
  }, [ssoCount, activeServices]);

  const hasCostData = records.length > 0;

  const registry = useMemo<WidgetDef[]>(
    () =>
      WIDGETS.filter((w) => {
        if (w.adminOnly && !isAdmin) return false;
        if (w.requiresFinancial && !(canFinancialView && hasCostData)) return false;
        return true;
      }),
    [isAdmin, canFinancialView, hasCostData],
  );

  const orderedIds = useMemo<WidgetId[]>(() => {
    const known = new Set(registry.map((w) => w.id));
    const list: WidgetId[] = [];
    const seen = new Set<WidgetId>();
    if (known.has("kpis")) {
      list.push("kpis");
      seen.add("kpis");
    }
    widgetIds.forEach((id) => {
      if (known.has(id) && !seen.has(id)) {
        list.push(id);
        seen.add(id);
      }
    });
    return list;
  }, [widgetIds, registry]);

  const available = useMemo(
    () => registry.filter((w) => w.id !== "kpis" && !orderedIds.includes(w.id)),
    [registry, orderedIds],
  );

  useFlipReorder(orderedIds, getWidgetEl, draggingId);

  const addWidget = useCallback(
    (id: WidgetId) => {
      setWidgetIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [setWidgetIds],
  );

  const removeWidget = useCallback(
    (id: WidgetId) => {
      if (id === "kpis") return;
      setWidgetIds((prev) => prev.filter((x) => x !== id));
    },
    [setWidgetIds],
  );

  const resetWidgets = useCallback(() => {
    try {
      localStorage.removeItem(WIDGET_STORAGE_KEY);
    } catch {
      // ignore
    }
    setWidgetIds(DEFAULT_WIDGETS);
  }, [setWidgetIds]);

  const moveWidget = useCallback(
    (fromId: WidgetId, toId: WidgetId) => {
      if (fromId === toId || fromId === "kpis" || toId === "kpis") return;
      setWidgetIds((prev) => {
        const next = [...prev];
        const hasFrom = next.includes(fromId);
        const hasTo = next.includes(toId);
        if (!hasFrom || !hasTo) return prev;
        const from = next.indexOf(fromId);
        next.splice(from, 1);
        const to = next.indexOf(toId);
        next.splice(to, 0, fromId);
        return next;
      });
    },
    [setWidgetIds],
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  const todayLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const spendAxisTogglePlacement: "trend" | "byYear" | "none" =
    !canFinancialView
      ? "none"
      : orderedIds.includes("spend-trend")
        ? "trend"
        : orderedIds.includes("spend-by-year")
          ? "byYear"
          : "none";

  const ctx: WidgetCtx = {
    services,
    laptops,
    records,
    fiscalYears,
    costByYear,
    dashYear,
    setDashYear,
    yoyChange,
    canFinancialView,
    hasCostData,
    upcoming30,
    upcoming90,
    laptopsInUse,
    ssoPct,
    ssoCount,
    activeServices,
    isAdmin,
    spendChartScale,
    setSpendChartScale,
    spendAxisTogglePlacement,
  };

  const rightForWidget = (id: WidgetId): React.ReactNode => {
    switch (id) {
      case "spend-trend":
        return fiscalYears.length > 0 ? (
          <div
            className="tnum text-fg-3"
            style={{ fontSize: 12, letterSpacing: "0.02em" }}
          >
            FY{fiscalYears[0]} – FY{fiscalYears[fiscalYears.length - 1]}
          </div>
        ) : null;
      case "spend-by-year":
        return (
          <Link to="/costs" className="text-[12px] text-fg-3 hover:text-fg-2">
            Cost report →
          </Link>
        );
      case "upcoming":
        return (
          <Link to="/calendar" className="text-[12px] text-fg-3 hover:text-fg-2">
            Calendar →
          </Link>
        );
      case "by-category":
        return (
          <Link to="/costs" className="text-[12px] text-fg-3 hover:text-fg-2">
            Drill down →
          </Link>
        );
      case "top-vendors":
        return (
          <Link to="/services" className="text-[12px] text-fg-3 hover:text-fg-2">
            All services →
          </Link>
        );
      case "hardware":
        return (
          <Link to="/hardware" className="text-[12px] text-fg-3 hover:text-fg-2">
            All hardware →
          </Link>
        );
      case "activity":
        return (
          <Link
            to="/settings/audit-log"
            className="text-[12px] text-fg-3 hover:text-fg-2"
          >
            Audit log →
          </Link>
        );
      case "owners":
        return (
          <Link to="/users" className="text-[12px] text-fg-3 hover:text-fg-2">
            All users →
          </Link>
        );
      default:
        return null;
    }
  };

  const visibleDefs = orderedIds
    .map((id) => registry.find((w) => w.id === id))
    .filter((w): w is WidgetDef => !!w);

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
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
            <div className="flex items-center gap-2">
              {editMode && (
                <>
                  <AddWidgetMenu available={available} onAdd={addWidget} />
                  <button
                    type="button"
                    onClick={resetWidgets}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-fg-3 hover:text-fg-2 hover:bg-surface-2"
                  >
                    Reset
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  if (editMode) {
                    setDraggingId(null);
                    setDragOverId(null);
                    lastDragOverWidgetRef.current = null;
                  }
                  setEditMode((v) => !v);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  editMode
                    ? "bg-accent text-white hover:bg-accent-strong"
                    : "border border-border bg-surface text-fg-2 hover:bg-surface-2"
                }`}
              >
                {editMode ? "Done" : "Customize"}
              </button>
            </div>
          </div>
          <div className="mt-6">
            <CommandPaletteTrigger variant="prominent" />
          </div>
        </div>

        {visibleDefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[10px] border border-border bg-surface px-6 py-16 text-center shadow-sm">
            <div
              className="text-fg"
              style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              Your dashboard is empty
            </div>
            <div className="mt-1 text-[13px] text-fg-3">
              Customize to add widgets.
            </div>
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-strong"
            >
              Customize
            </button>
          </div>
        ) : (
          <div ref={gridRef} className="grid grid-cols-12 gap-4">
            {visibleDefs.map((def) => {
              const dragging = draggingId === def.id;
              const dropTarget =
                editMode &&
                !!draggingId &&
                dragOverId === def.id &&
                draggingId !== def.id;
              return def.id === "kpis" ? (
                <div
                  key={def.id}
                  data-widget-id={def.id}
                  className="rounded-[10px] border border-border bg-surface shadow-sm animate-fade-in"
                  style={{ gridColumn: `span ${def.span} / span ${def.span}` }}
                >
                  {def.render(ctx)}
                </div>
              ) : (
                <WidgetShell
                  key={def.id}
                  def={def}
                  editMode={editMode}
                  onRemove={() => removeWidget(def.id)}
                  dragging={dragging}
                  dropTarget={dropTarget}
                  onDragStart={(e) => {
                    setDraggingId(def.id);
                    orderSnapshotRef.current = [...widgetIdsRef.current];
                    didDropRef.current = false;
                    lastDragOverWidgetRef.current = null;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", def.id);
                  }}
                  onDragEnd={() => {
                    if (!didDropRef.current && orderSnapshotRef.current) {
                      setWidgetIds(orderSnapshotRef.current);
                    }
                    didDropRef.current = false;
                    orderSnapshotRef.current = null;
                    lastDragOverWidgetRef.current = null;
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  onDragEnter={(e) => {
                    if (!editMode || !draggingId) return;
                    e.preventDefault();
                  }}
                  onDragLeave={(e) => {
                    if (!editMode || !draggingId) return;
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    setDragOverId((prev) => (prev === def.id ? null : prev));
                  }}
                  onDragOver={(e) => {
                    if (!editMode || !draggingId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (draggingId === def.id) return;

                    const order = widgetIdsRef.current;
                    const fromIdx = order.indexOf(draggingId);
                    const toIdx = order.indexOf(def.id);
                    if (fromIdx === -1 || toIdx === -1) return;

                    const targetRect = e.currentTarget.getBoundingClientRect();
                    const draggingEl = gridRef.current?.querySelector<HTMLElement>(
                      `[data-widget-id="${draggingId}"]`,
                    );
                    const draggingRect = draggingEl?.getBoundingClientRect();
                    const sameRow =
                      !!draggingRect &&
                      Math.abs(draggingRect.top - targetRect.top) <
                        targetRect.height / 2;
                    const forward = toIdx > fromIdx;
                    const crossed = sameRow
                      ? forward
                        ? e.clientX > (targetRect.left + targetRect.right) / 2
                        : e.clientX < (targetRect.left + targetRect.right) / 2
                      : forward
                        ? e.clientY > (targetRect.top + targetRect.bottom) / 2
                        : e.clientY < (targetRect.top + targetRect.bottom) / 2;
                    if (!crossed) return;

                    if (lastDragOverWidgetRef.current === def.id) return;
                    lastDragOverWidgetRef.current = def.id;
                    setDragOverId(def.id);
                    moveWidget(draggingId, def.id);
                  }}
                  onDrop={() => {
                    didDropRef.current = true;
                    setDraggingId(null);
                    setDragOverId(null);
                    lastDragOverWidgetRef.current = null;
                  }}
                  right={rightForWidget(def.id)}
                >
                  {def.render(ctx)}
                </WidgetShell>
              );
            })}
          </div>
        )}

      </div>
    </PageTransition>
  );
}
