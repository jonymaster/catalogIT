import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/useAuth";
import { BarChart } from "../components/charts/BarChart";
import { SearchInput } from "../components/SearchInput";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import type { Service, Laptop } from "../types/models";
import { DashboardSkeleton } from "../components/Skeleton";
import {
  fmtFull,
  sumForYearAndClassification,
  totalByYear,
  yoyPercent,
} from "../utils/dashboardCostAggregates";

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

function StatCard({
  label,
  value,
  subtext,
  color,
  onClick,
  stagger,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
  onClick?: () => void;
  stagger?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const staggerClass = stagger ? `animate-stagger-${stagger}` : "";
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm ${staggerClass} ${
        onClick
          ? "cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-200 dark:hover:border-brand-800"
          : ""
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${color ?? "text-gray-900 dark:text-gray-100"}`}
      >
        {value}
      </p>
      {subtext && <p className="mt-0.5 text-xs text-gray-400">{subtext}</p>}
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
  const [dashYear, setDashYear] = useState<number>(new Date().getFullYear());
  const [dashYearInitialized, setDashYearInitialized] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
    if (dashYearInitialized || fiscalYears.length === 0) return;
    const currentYear = new Date().getFullYear();
    setDashYear(
      fiscalYears.includes(currentYear)
        ? currentYear
        : fiscalYears[fiscalYears.length - 1],
    );
    setDashYearInitialized(true);
  }, [fiscalYears, dashYearInitialized]);

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

  const actualRecords = useMemo(
    () => records.filter((r) => r.record_type === "actual"),
    [records],
  );

  const serviceMatches = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }

    return services
      .filter((service) => matchesServiceSearch(service, normalizedSearch))
      .slice(0, 5);
  }, [normalizedSearch, services]);

  const laptopMatches = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }

    return laptops
      .filter((laptop) => matchesLaptopSearch(laptop, normalizedSearch))
      .slice(0, 5);
  }, [laptops, normalizedSearch]);

  const costByYear = useMemo(
    () => totalByYear(actualRecords, years),
    [actualRecords, years],
  );

  const yoyChange = useMemo(
    () => yoyPercent(costByYear, dashYear),
    [costByYear, dashYear],
  );

  const coreSaasTotal = useMemo(
    () => sumForYearAndClassification(actualRecords, dashYear, "core_saas"),
    [actualRecords, dashYear],
  );

  const subscriptionTotal = useMemo(
    () => sumForYearAndClassification(actualRecords, dashYear, "subscription"),
    [actualRecords, dashYear],
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  const hasCostData = records.length > 0;

  return (
    <PageTransition>
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Welcome{user?.email ? `, ${user.email}` : ""}.
      </p>

      <div className="mt-8 flex justify-center">
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
                if (event.key === "Escape") {
                  setSearchOpen(false);
                }
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
                          <span className="ml-4 text-xs text-gray-400">
                            Service
                          </span>
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
                          <span className="ml-4 text-xs text-gray-400">
                            Hardware
                          </span>
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

      {/* Inventory stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Services"
          value={services.length}
          onClick={() => navigate("/services")}
          stagger={1}
        />
        <StatCard
          label="Total Laptops"
          value={laptops.length}
          onClick={() => navigate("/hardware")}
          stagger={2}
        />
        <StatCard
          label="Assigned Laptops"
          value={laptops.filter((l) => l.status === "Assigned").length}
          stagger={3}
        />
        <StatCard
          label="In Stock"
          value={laptops.filter((l) => l.status === "In Stock").length}
          stagger={4}
        />
      </div>

      {canFinancialView && hasCostData && (
        <>
          {/* Year selector */}
          <div className="mt-8 flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Fiscal year:
            </span>
            <div className="inline-flex gap-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => setDashYear(y)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 ${
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

          {/* Cost KPIs (actual records only — matches chart) */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total spend (actual)"
              value={fmtFull(costByYear[dashYear] ?? 0)}
            />
            <StatCard
              label="YoY change (actual)"
              value={`${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}%`}
              color={yoyChange < 0 ? "text-emerald-600" : yoyChange > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"}
            />
            <StatCard
              label="Core SaaS (actual)"
              value={fmtFull(coreSaasTotal)}
              color="text-purple-700"
            />
            <StatCard
              label="Subscriptions (actual)"
              value={fmtFull(subscriptionTotal)}
              color="text-blue-700"
            />
          </div>

          {records.length > 0 && actualRecords.length === 0 && (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
              There are cost records, but none marked as actual. Add actual amounts or open the IT Financial Report to include other record types.
            </p>
          )}

          {/* Total spend by year */}
          <div className="mt-6 min-h-[300px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total spend by year (actual)
            </h3>
            <BarChart
              data={years.map((y) => ({
                label: String(y),
                value: costByYear[y] ?? 0,
                color: y === dashYear ? "var(--color-brand-600)" : "var(--color-brand-200)",
              }))}
              onBarClick={(i) => {
                const y = years[i];
                if (y !== undefined) setDashYear(y);
              }}
            />
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/80 p-5 dark:border-brand-900 dark:bg-brand-950/40 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                IT Financial Report
              </p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                Compare actual, estimated, and budget; filter, export, and print.
              </p>
            </div>
            <Link
              to="/costs"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open IT Financial Report
            </Link>
          </div>
        </>
      )}
    </div>
    </PageTransition>
  );
}
