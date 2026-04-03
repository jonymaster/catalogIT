import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import { BarChart } from "../components/charts/BarChart";
import { SearchInput } from "../components/SearchInput";
import { StackedBar } from "../components/charts/StackedBar";
import type { Service, Laptop } from "../types/models";

interface CostRecordOut {
  service_id: string;
  service_name: string;
  classification: string | null;
  category_name: string | null;
  fiscal_year: number;
  amount: number;
  record_type: string;
  notes: string | null;
}

interface DashboardData {
  cost_records: CostRecordOut[];
  fiscal_years: number[];
}

const CATEGORY_COLORS: Record<string, string> = {};
const PALETTE = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#6366f1", "#f97316", "#14b8a6"];

function getCategoryColor(name: string): string {
  if (!CATEGORY_COLORS[name]) {
    CATEGORY_COLORS[name] = PALETTE[Object.keys(CATEGORY_COLORS).length % PALETTE.length];
  }
  return CATEGORY_COLORS[name];
}

const fmtFull = (n: number) => `$${n.toLocaleString()}`;

function matchesServiceSearch(service: Service, query: string) {
  const cat = (service.category_rel?.name ?? "").toLowerCase();
  return (
    service.name.toLowerCase().includes(query) ||
    cat.includes(query) ||
    service.license_type.toLowerCase().includes(query) ||
    service.status.toLowerCase().includes(query) ||
    (service.vendor?.name ?? "").toLowerCase().includes(query) ||
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
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-gray-200 bg-white p-5 ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${color ?? "text-gray-900"}`}>
        {value}
      </p>
      {subtext && <p className="mt-0.5 text-xs text-gray-400">{subtext}</p>}
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [dashYear, setDashYear] = useState<number>(new Date().getFullYear());
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      client.get<Service[]>("/api/services/"),
      client.get<Laptop[]>("/api/laptops/"),
      client.get<DashboardData>("/api/dashboard/"),
    ])
      .then(([sRes, lRes, dRes]) => {
        setServices(sRes.data);
        setLaptops(lRes.data);
        setDashData(dRes.data);
        if (dRes.data.fiscal_years.length > 0) {
          const currentYear = new Date().getFullYear();
          const years = dRes.data.fiscal_years;
          setDashYear(years.includes(currentYear) ? currentYear : years[years.length - 1]);
        }
      })
      .finally(() => setLoading(false));
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

  const years = useMemo(() => dashData?.fiscal_years ?? [], [dashData]);
  const records = useMemo(() => dashData?.cost_records ?? [], [dashData]);
  const normalizedSearch = dashboardSearch.trim().toLowerCase();

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

  const costByYear = useMemo(() => {
    const m: Record<number, number> = {};
    years.forEach((y) => (m[y] = 0));
    records.forEach((r) => (m[r.fiscal_year] = (m[r.fiscal_year] ?? 0) + r.amount));
    return m;
  }, [records, years]);

  const yoyChange = useMemo(() => {
    const prev = dashYear - 1;
    const cur = costByYear[dashYear] ?? 0;
    const prevAmt = costByYear[prev] ?? 0;
    return prevAmt > 0 ? ((cur - prevAmt) / prevAmt) * 100 : 0;
  }, [costByYear, dashYear]);

  const coreSaasTotal = useMemo(
    () =>
      records
        .filter((r) => r.fiscal_year === dashYear && r.classification === "core_saas")
        .reduce((s, r) => s + r.amount, 0),
    [records, dashYear],
  );

  const subscriptionTotal = useMemo(
    () =>
      records
        .filter((r) => r.fiscal_year === dashYear && r.classification === "subscription")
        .reduce((s, r) => s + r.amount, 0),
    [records, dashYear],
  );

  const categoryNames = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => {
      if (r.category_name) s.add(r.category_name);
    });
    return Array.from(s).sort();
  }, [records]);

  const costByCategory = useMemo(() => {
    return categoryNames.map((name) => {
      const byYr: Record<number, number> = {};
      years.forEach((y) => (byYr[y] = 0));
      records
        .filter((r) => r.category_name === name)
        .forEach((r) => (byYr[r.fiscal_year] = (byYr[r.fiscal_year] ?? 0) + r.amount));
      return { name, byYr };
    });
  }, [records, years, categoryNames]);

  const stackedData = useMemo(
    () =>
      years.map((yr) => ({
        year: yr,
        cats: categoryNames
          .map((name) => ({
            id: name,
            name,
            value: records
              .filter((r) => r.fiscal_year === yr && r.category_name === name)
              .reduce((s, r) => s + r.amount, 0),
            color: getCategoryColor(name),
          }))
          .filter((c) => c.value > 0),
      })),
    [records, years, categoryNames],
  );

  const topSpenders = useMemo(() => {
    const byService: Record<string, { name: string; classification: string | null; cost: number }> = {};
    records
      .filter((r) => r.fiscal_year === dashYear)
      .forEach((r) => {
        if (!byService[r.service_id]) {
          byService[r.service_id] = { name: r.service_name, classification: r.classification, cost: 0 };
        }
        byService[r.service_id].cost += r.amount;
      });
    return Object.values(byService)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 12);
  }, [records, dashYear]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  const hasCostData = records.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Welcome{user?.email ? `, ${user.email}` : ""}.
      </p>

      <div className="mt-8 flex justify-center">
        <div className="relative w-full max-w-3xl" ref={searchRef}>
          <div className="rounded-full border border-gray-200 bg-white p-2 shadow-sm">
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
            <div className="absolute left-0 top-full z-20 mt-3 w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
              <div className="space-y-4">
                {serviceMatches.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                          className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
                        >
                          <span>
                            <span className="block text-sm font-medium text-gray-900">
                              {service.name}
                            </span>
                            <span className="block text-xs text-gray-500">
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
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                          className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
                        >
                          <span>
                            <span className="block text-sm font-medium text-gray-900">
                              {laptop.model_name}
                            </span>
                            <span className="block text-xs text-gray-500">
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
                  <p className="text-sm text-gray-500">
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
        />
        <StatCard
          label="Total Laptops"
          value={laptops.length}
          onClick={() => navigate("/hardware")}
        />
        <StatCard
          label="Assigned Laptops"
          value={laptops.filter((l) => l.status === "Assigned").length}
        />
        <StatCard
          label="In Stock"
          value={laptops.filter((l) => l.status === "In Stock").length}
        />
      </div>

      {hasCostData && (
        <>
          {/* Year selector */}
          <div className="mt-8 flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Fiscal year:
            </span>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setDashYear(y)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  dashYear === y
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Cost KPIs */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total Spend"
              value={fmtFull(costByYear[dashYear] ?? 0)}
            />
            <StatCard
              label="YoY Change"
              value={`${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}%`}
              color={yoyChange < 0 ? "text-emerald-600" : yoyChange > 0 ? "text-red-600" : "text-gray-900"}
            />
            <StatCard
              label="Core SaaS"
              value={fmtFull(coreSaasTotal)}
              color="text-purple-700"
            />
            <StatCard
              label="Subscriptions"
              value={fmtFull(subscriptionTotal)}
              color="text-blue-700"
            />
          </div>

          {/* Total spend by year */}
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              Total spend by year
            </h3>
            <BarChart
              data={years.map((y) => ({
                label: String(y),
                value: costByYear[y] ?? 0,
                color: y === dashYear ? "#4f46e5" : "#c7d2fe",
              }))}
            />
          </div>

          {/* Spend by category (stacked) */}
          {categoryNames.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Spend by category (stacked)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {categoryNames.map((name) => (
                    <span
                      key={name}
                      className="flex items-center gap-1 text-xs text-gray-500"
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: getCategoryColor(name) }}
                      />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <StackedBar yearData={stackedData} />
            </div>
          )}

          {/* Top spenders */}
          {topSpenders.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                Top {Math.min(12, topSpenders.length)} services by cost -- {dashYear}
              </h3>
              <BarChart
                data={topSpenders.map((s) => ({
                  label:
                    s.name.length > 12 ? s.name.slice(0, 11) + "\u2026" : s.name,
                  value: s.cost,
                  color: s.classification === "core_saas" ? "#7c3aed" : "#3b82f6",
                }))}
                width={680}
                height={200}
              />
            </div>
          )}

          {/* Category breakdown table */}
          {costByCategory.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                      Category
                    </th>
                    {years.map((y) => (
                      <th
                        key={y}
                        className={`px-3 py-2 text-right text-xs font-medium uppercase ${
                          y === dashYear ? "text-indigo-600" : "text-gray-500"
                        }`}
                      >
                        {y}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                      YoY
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {costByCategory.map((cat) => {
                    const cur = cat.byYr[dashYear] ?? 0;
                    const prev = cat.byYr[dashYear - 1] ?? 0;
                    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
                    return (
                      <tr key={cat.name}>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {cat.name}
                        </td>
                        {years.map((y) => (
                          <td
                            key={y}
                            className={`px-3 py-2 text-right font-mono ${
                              y === dashYear
                                ? "font-semibold text-gray-900"
                                : "text-gray-500"
                            }`}
                          >
                            {fmtFull(cat.byYr[y] ?? 0)}
                          </td>
                        ))}
                        <td
                          className={`px-3 py-2 text-right font-mono font-medium ${
                            delta < 0
                              ? "text-emerald-600"
                              : delta > 0
                                ? "text-red-600"
                                : "text-gray-400"
                          }`}
                        >
                          {prev > 0
                            ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`
                            : "--"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2 text-gray-900">Total</td>
                    {years.map((y) => (
                      <td
                        key={y}
                        className="px-3 py-2 text-right font-mono text-gray-900"
                      >
                        {fmtFull(costByYear[y] ?? 0)}
                      </td>
                    ))}
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        yoyChange < 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {`${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
