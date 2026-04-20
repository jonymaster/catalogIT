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
  combinedActualEstimatedByYear,
  fmtFull,
  isCurrentOrFutureFiscalYear,
  sumForYearAndClassification,
  totalByYear,
  visualAmountForRecordTypeAndYear,
  yoyPercent,
} from "../utils/dashboardCostAggregates";
import type {
  DashboardPreferences,
  DashboardWidgetId,
  UserPreferences,
} from "../types/models";

const DASHBOARD_PREFERENCES_STORAGE_KEY = "catalogit:dashboard:preferences";

const DASHBOARD_WIDGET_OPTIONS: {
  id: DashboardWidgetId;
  label: string;
  description: string;
  requiresFinancialView?: boolean;
}[] = [
  {
    id: "global_search",
    label: "Search",
    description: "Keep the dashboard search bar on the landing page.",
  },
  {
    id: "inventory_stats",
    label: "Inventory stats",
    description: "Show the top-line service and hardware counts.",
  },
  {
    id: "financial_kpis",
    label: "Financial KPIs",
    description: "Show fiscal-year KPIs and drillable category/classification totals.",
    requiresFinancialView: true,
  },
  {
    id: "spend_by_year",
    label: "Spend chart",
    description: "Show the year-over-year spend bar chart.",
    requiresFinancialView: true,
  },
  {
    id: "financial_report",
    label: "Financial report shortcut",
    description: "Keep the jump-off card to the IT Financial Report.",
    requiresFinancialView: true,
  },
];

const DEFAULT_DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGET_OPTIONS.map(
  (widget) => widget.id,
);

function normalizeDashboardPreferences(
  raw: DashboardPreferences | null | undefined,
): DashboardPreferences {
  const visibleWidgetIds = raw?.visible_widget_ids;
  if (!Array.isArray(visibleWidgetIds)) {
    return { visible_widget_ids: [...DEFAULT_DASHBOARD_WIDGET_IDS] };
  }

  return {
    visible_widget_ids: Array.from(
      new Set(
        visibleWidgetIds.filter((widgetId): widgetId is DashboardWidgetId =>
          DEFAULT_DASHBOARD_WIDGET_IDS.includes(widgetId),
        ),
      ),
    ),
  };
}

function readStoredDashboardPreferences(): DashboardPreferences {
  try {
    const stored = localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
    if (!stored) {
      return normalizeDashboardPreferences(null);
    }
    return normalizeDashboardPreferences(
      JSON.parse(stored) as DashboardPreferences,
    );
  } catch {
    return normalizeDashboardPreferences(null);
  }
}

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
  const emptyClassificationKey = "__none__";
  const emptyCategoryKey = "__uncategorized__";
  const emptyClassificationLabel = "(None)";
  const emptyCategoryLabel = "(Uncategorized)";
  const {
    user,
    canFinancialView,
    preferences,
    preferencesLoading,
    setPreferences,
  } = useAuth();
  const navigate = useNavigate();
  const storedDashboardPreferences = useMemo(
    () => readStoredDashboardPreferences(),
    [],
  );
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const { records, fiscalYears, loading: costLoading } = useDashboardCostData();
  const [dashYearSelection, setDashYearSelection] = useState<number | null>(null);
  const [selectedClassificationKeyState, setSelectedClassificationKeyState] =
    useState<string | null>(null);
  const [selectedCategoryKeyState, setSelectedCategoryKeyState] =
    useState<string | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [visibleWidgetIds, setVisibleWidgetIds] = useState<DashboardWidgetId[]>(
    storedDashboardPreferences.visible_widget_ids ?? [...DEFAULT_DASHBOARD_WIDGET_IDS],
  );
  const searchRef = useRef<HTMLDivElement>(null);
  const dashboardPreferencesHydratedRef = useRef(false);
  const lastSyncedDashboardSignatureRef = useRef<string | null>(null);

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
  const profileDashboardPreferences = useMemo(
    () => normalizeDashboardPreferences(preferences?.ui_preferences.dashboard),
    [preferences],
  );
  const dashboardPreferenceState = useMemo(
    () => normalizeDashboardPreferences({ visible_widget_ids: visibleWidgetIds }),
    [visibleWidgetIds],
  );
  const visibleWidgetIdSet = useMemo(
    () => new Set(dashboardPreferenceState.visible_widget_ids),
    [dashboardPreferenceState],
  );
  const financialWidgetsVisible =
    canFinancialView &&
    visibleWidgetIdSet.has("financial_kpis") &&
    records.length > 0;
  const spendChartVisible =
    canFinancialView &&
    visibleWidgetIdSet.has("spend_by_year") &&
    records.length > 0;
  const financialShortcutVisible =
    canFinancialView &&
    visibleWidgetIdSet.has("financial_report") &&
    records.length > 0;
  const showYearSelector = financialWidgetsVisible || spendChartVisible;
  const defaultDashYear = useMemo(() => {
    if (fiscalYears.length === 0) {
      return new Date().getFullYear();
    }
    const currentYear = new Date().getFullYear();
    return fiscalYears.includes(currentYear)
      ? currentYear
      : fiscalYears[fiscalYears.length - 1];
  }, [fiscalYears]);

  useEffect(() => {
    if (preferencesLoading || dashboardPreferencesHydratedRef.current) {
      return;
    }

    const hasProfilePreferences = preferences?.ui_preferences.dashboard !== undefined;
    const sourcePreferences = hasProfilePreferences
      ? profileDashboardPreferences
      : storedDashboardPreferences;

    const timeoutId = window.setTimeout(() => {
      setVisibleWidgetIds(sourcePreferences.visible_widget_ids ?? []);
      lastSyncedDashboardSignatureRef.current = hasProfilePreferences
        ? JSON.stringify(profileDashboardPreferences)
        : null;
      dashboardPreferencesHydratedRef.current = true;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    preferences,
    preferencesLoading,
    profileDashboardPreferences,
    storedDashboardPreferences,
  ]);

  useEffect(() => {
    const serialized = JSON.stringify(dashboardPreferenceState);

    try {
      localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage failures; per-user persistence still attempts to save.
    }

    if (!dashboardPreferencesHydratedRef.current) {
      return;
    }
    if (serialized === lastSyncedDashboardSignatureRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      client
        .patch<UserPreferences>("/api/me/preferences", {
          ui_preferences: {
            dashboard: dashboardPreferenceState,
          },
        })
        .then((response) => {
          lastSyncedDashboardSignatureRef.current = serialized;
          setPreferences(response.data);
        })
        .catch(() => {
          // Keep the local fallback in place if profile sync fails.
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [dashboardPreferenceState, setPreferences]);

  const actualRecords = useMemo(
    () => records.filter((r) => r.record_type === "actual"),
    [records],
  );
  const estimatedRecords = useMemo(
    () => records.filter((r) => r.record_type === "estimated"),
    [records],
  );
  const currentYear = new Date().getFullYear();
  const dashYear = fiscalYears.includes(dashYearSelection ?? Number.NaN)
    ? (dashYearSelection as number)
    : defaultDashYear;
  const showProjectedValues = isCurrentOrFutureFiscalYear(dashYear, currentYear);

  const classificationOptions = useMemo(() => {
    const unique = new Set<string>();
    records.forEach((record) => {
      unique.add((record.classification ?? "").trim() || emptyClassificationKey);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    records.forEach((record) => {
      unique.add((record.category_name ?? "").trim() || emptyCategoryKey);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [records]);
  const selectedClassificationKey =
    selectedClassificationKeyState &&
    classificationOptions.includes(selectedClassificationKeyState)
      ? selectedClassificationKeyState
      : (classificationOptions[0] ?? emptyClassificationKey);
  const selectedCategoryKey =
    selectedCategoryKeyState && categoryOptions.includes(selectedCategoryKeyState)
      ? selectedCategoryKeyState
      : (categoryOptions[0] ?? emptyCategoryKey);
  const selectedClassificationIndex = Math.max(
    0,
    classificationOptions.indexOf(selectedClassificationKey),
  );
  const selectedCategoryIndex = Math.max(
    0,
    categoryOptions.indexOf(selectedCategoryKey),
  );

  const selectedClassificationLabel =
    selectedClassificationKey === emptyClassificationKey
      ? emptyClassificationLabel
      : selectedClassificationKey;
  const selectedCategoryLabel =
    selectedCategoryKey === emptyCategoryKey ? emptyCategoryLabel : selectedCategoryKey;

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

  const classificationTotal = useMemo(
    () =>
      showProjectedValues
        ? sumForYearAndClassification(
            actualRecords,
            dashYear,
            selectedClassificationKey,
          ) +
          sumForYearAndClassification(
            estimatedRecords,
            dashYear,
            selectedClassificationKey,
          )
        : sumForYearAndClassification(
            actualRecords,
            dashYear,
            selectedClassificationKey,
          ),
    [
      showProjectedValues,
      actualRecords,
      estimatedRecords,
      dashYear,
      selectedClassificationKey,
    ],
  );

  const categoryTotal = useMemo(
    () => {
      const selectedCategoryAmount = (collection: typeof records) =>
        collection.reduce((total, record) => {
          if (record.fiscal_year !== dashYear) return total;
          const key = (record.category_name ?? "").trim() || emptyCategoryKey;
          return key === selectedCategoryKey ? total + record.amount : total;
        }, 0);
      return showProjectedValues
        ? selectedCategoryAmount(actualRecords) + selectedCategoryAmount(estimatedRecords)
        : selectedCategoryAmount(actualRecords);
    },
    [
      showProjectedValues,
      actualRecords,
      estimatedRecords,
      dashYear,
      selectedCategoryKey,
    ],
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  const hasCostData = records.length > 0;
  const hasVisibleSections =
    visibleWidgetIdSet.has("global_search") ||
    visibleWidgetIdSet.has("inventory_stats") ||
    financialWidgetsVisible ||
    spendChartVisible ||
    financialShortcutVisible;

  function toggleWidget(widgetId: DashboardWidgetId) {
    setVisibleWidgetIds((current) =>
      current.includes(widgetId)
        ? current.filter((value) => value !== widgetId)
        : [...current, widgetId],
    );
  }

  function resetDashboardPreferences() {
    setVisibleWidgetIds([...DEFAULT_DASHBOARD_WIDGET_IDS]);
  }

  return (
    <PageTransition>
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Welcome{user?.email ? `, ${user.email}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreferencesOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {preferencesOpen ? "Hide customization" : "Customize dashboard"}
          </button>
          <button
            type="button"
            onClick={resetDashboardPreferences}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Reset widgets
          </button>
        </div>
      </div>

      {preferencesOpen && (
        <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Visible dashboard sections
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Changes save to your profile automatically and fall back locally if profile sync is unavailable.
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {dashboardPreferenceState.visible_widget_ids?.length ?? 0} visible
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {DASHBOARD_WIDGET_OPTIONS.filter(
              (widget) => !widget.requiresFinancialView || canFinancialView,
            ).map((widget) => (
              <label
                key={widget.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950 p-4"
              >
                <input
                  type="checkbox"
                  checked={visibleWidgetIdSet.has(widget.id)}
                  onChange={() => toggleWidget(widget.id)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {widget.label}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {widget.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {visibleWidgetIdSet.has("global_search") && (
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
      )}

      {visibleWidgetIdSet.has("inventory_stats") && (
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
      )}

      {canFinancialView && hasCostData && (
        <>
          {showYearSelector && (
            <div className="mt-8 flex items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Fiscal year:
              </span>
              <div className="inline-flex gap-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => setDashYearSelection(y)}
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
          )}

          {financialWidgetsVisible && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label={
                  showProjectedValues
                    ? "Total spend (actual + estimated)"
                    : "Total spend (actual)"
                }
                value={fmtFull(costByYear[dashYear] ?? 0)}
              />
              <StatCard
                label={
                  showProjectedValues
                    ? "YoY change (actual + estimated)"
                    : "YoY change (actual)"
                }
                value={`${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}%`}
                color={yoyChange < 0 ? "text-emerald-600" : yoyChange > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"}
              />
              <StatCard
                label={
                  showProjectedValues
                    ? `Classification: ${selectedClassificationLabel} (actual + estimated)`
                    : `Classification: ${selectedClassificationLabel} (actual)`
                }
                value={fmtFull(classificationTotal)}
                color="text-purple-700"
                subtext="Click to cycle"
                onClick={() =>
                  setSelectedClassificationKeyState(
                    classificationOptions.length === 0
                      ? null
                      : classificationOptions[
                          (selectedClassificationIndex + 1) % classificationOptions.length
                        ],
                  )
                }
              />
              <StatCard
                label={
                  showProjectedValues
                    ? `Category: ${selectedCategoryLabel} (actual + estimated)`
                    : `Category: ${selectedCategoryLabel} (actual)`
                }
                value={fmtFull(categoryTotal)}
                color="text-blue-700"
                subtext="Click to cycle"
                onClick={() =>
                  setSelectedCategoryKeyState(
                    categoryOptions.length === 0
                      ? null
                      : categoryOptions[
                          (selectedCategoryIndex + 1) % categoryOptions.length
                        ],
                  )
                }
              />
            </div>
          )}

          {records.length > 0 && actualRecords.length === 0 && (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
              There are cost records, but none marked as actual. Add actual amounts or open the IT Financial Report to include other record types.
            </p>
          )}

          {spendChartVisible && (
            <div className="mt-6 min-h-[300px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Total spend by year (actual; current/future includes estimated)
              </h3>
              <BarChart
                data={years.map((y) => ({
                  label: String(y),
                  value: costByYear[y] ?? 0,
                  color: y === dashYear ? "var(--color-brand-600)" : "var(--color-brand-200)",
                }))}
                onBarClick={(i) => {
                  const y = years[i];
                  if (y !== undefined) setDashYearSelection(y);
                }}
              />
            </div>
          )}

          {financialShortcutVisible && (
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
          )}
        </>
      )}

      {!hasVisibleSections && (
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/60 p-6 text-sm text-gray-600 dark:text-gray-300">
          All dashboard sections are hidden. Use <span className="font-medium">Customize dashboard</span> to turn widgets back on.
        </div>
      )}
    </div>
    </PageTransition>
  );
}
