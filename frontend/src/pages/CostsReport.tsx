import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./CostsReport.print.css";
import client from "../api/client";
import { BarChart } from "../components/charts/BarChart";
import type { ChartYScaleMode } from "../components/charts/chartAxis";
import { PageTransition } from "../components/PageTransition";
import { StackedBar } from "../components/charts/StackedBar";
import { MultiSelectFacet } from "../components/ui/MultiSelectFacet";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Money } from "../components/ui/Money";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { Monogram } from "../components/ui/Monogram";
import { OsIcon } from "../components/ui/OsIcon";
import { formatMoneyCompact } from "../components/ui/money-format";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import {
  COMPARISON_MODE_LABEL,
  comparisonRecordTypesForMode,
  type ComparisonMode,
  type CostSourceFilter,
  type DashboardCostRecord,
} from "../types/dashboardCost";
import type { Service } from "../types/models";

type LineItemRow = DashboardCostRecord & { id: string };

function lineItemDetailPath(r: DashboardCostRecord): string | null {
  if (r.source === "service" && r.service_id) return `/services/${r.service_id}/costs`;
  if (r.source === "hardware" && r.laptop_id) return `/hardware/${r.laptop_id}`;
  return null;
}
import { buildCsv, downloadCsvFile } from "../utils/csv";
import {
  buildStackedYearData,
  combinedActualEstimatedByYear,
  classificationBarColor,
  costCenterFilterOptions,
  distinctCategoryNames,
  distinctClassifications,
  filterCostRecords,
  fmtFull,
  getCategoryColor,
  isCurrentOrFutureFiscalYear,
  totalByYear,
  visualAmountForRecordTypeAndYear,
  yoyPercent,
  categoryDisplayName,
} from "../utils/dashboardCostAggregates";

const RECORD_TYPE_LABELS: Record<string, string> = {
  actual: "Actual",
  estimated: "Estimated",
  budget: "Budget",
};
const COMBINED_RECORD_TYPE_LABEL = "Actual + Estimated";

function classificationLabel(slug: string): string {
  if (slug === "") return "(None)";
  if (slug === "core_saas") return "Core SaaS";
  if (slug === "subscription") return "Subscription";
  if (slug === "internal") return "Internal";
  if (slug === "hardware") return "Hardware";
  return slug;
}

type BreakdownDimension = "category" | "vendor" | "classification" | "cost_center" | "month";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface BreakdownBucket {
  key: string;
  label: string;
  value: number;
  records: DashboardCostRecord[];
}

function bucketKeyForRecord(
  record: DashboardCostRecord,
  dimension: BreakdownDimension,
  vendorByServiceId: Map<string, string>,
): { key: string; label: string } {
  switch (dimension) {
    case "category": {
      const raw = record.category_name ?? "";
      return { key: raw, label: categoryDisplayName(raw) };
    }
    case "vendor": {
      const v = record.service_id
        ? vendorByServiceId.get(record.service_id) ?? ""
        : "";
      const label = v || (record.source === "hardware" ? "Hardware" : "(Unknown)");
      return { key: label, label };
    }
    case "classification": {
      const raw = record.classification ?? "";
      return { key: raw, label: classificationLabel(raw) };
    }
    case "cost_center": {
      if (record.source === "hardware") {
        return { key: "__hw__", label: "Hardware (assets)" };
      }
      const raw = record.cost_center_name ?? "";
      const label = raw || "(No cost center)";
      return { key: raw, label };
    }
    case "month": {
      return { key: "total", label: "Total" };
    }
  }
}

function buildBreakdownBuckets(
  records: DashboardCostRecord[],
  dimension: BreakdownDimension,
  vendorByServiceId: Map<string, string>,
): BreakdownBucket[] {
  const map = new Map<string, BreakdownBucket>();
  for (const r of records) {
    const { key, label } = bucketKeyForRecord(r, dimension, vendorByServiceId);
    const existing = map.get(key);
    if (existing) {
      existing.value += r.amount;
      existing.records.push(r);
    } else {
      map.set(key, { key, label, value: r.amount, records: [r] });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function monthlySpendFromRecords(
  records: DashboardCostRecord[],
  focusYear: number,
): number[] {
  const total = records
    .filter((r) => r.fiscal_year === focusYear)
    .reduce((s, r) => s + r.amount, 0);
  const avg = total / 12;
  const weights = [0.95, 1.02, 1.08, 0.96, 0.97, 1.05, 0.93, 0.94, 1.04, 1.02, 0.98, 1.06];
  return weights.map((w) => avg * w);
}

interface InteractiveBarRowProps {
  label: string;
  value: number;
  max: number;
  pctOfTotal: number;
  selected: boolean;
  onClick: () => void;
}

function InteractiveBarRow({
  label,
  value,
  max,
  pctOfTotal,
  selected,
  onClick,
  clickable = true,
}: InteractiveBarRowProps & { clickable?: boolean }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={clickable ? `Drill into ${label}` : label}
      className={`group grid w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
        clickable ? "cursor-pointer" : "cursor-default"
      } ${
        selected
          ? "bg-accent-soft ring-1 ring-accent"
          : clickable
          ? "hover:bg-accent-soft/60 hover:ring-1 hover:ring-accent/40"
          : ""
      }`}
      style={{ gridTemplateColumns: "180px 1fr 80px 44px 14px" }}
    >
      <div
        className={`truncate text-[13px] font-medium text-fg ${
          clickable ? "group-hover:text-accent group-hover:underline" : ""
        }`}
        title={label}
      >
        {label}
      </div>
      <div className="h-2.5 overflow-hidden rounded bg-surface-2">
        <div
          className="h-full bg-accent"
          style={{
            width: `${pct}%`,
            opacity: selected ? 1 : 0.75,
            transition: "width 400ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </div>
      <div className="tnum text-right text-[12.5px] text-fg-2">
        {formatMoneyCompact(value)}
      </div>
      <div className="tnum text-right text-[11.5px] text-fg-3">
        {pctOfTotal.toFixed(1)}%
      </div>
      <div
        className={`text-[12px] text-fg-3 ${
          clickable
            ? "opacity-40 group-hover:opacity-100 group-hover:text-accent"
            : "opacity-0"
        }`}
        aria-hidden
      >
        ›
      </div>
    </button>
  );
}

function StatCell({
  label,
  value,
  sub,
  delta,
  first,
  variant = "row",
  valueClassName,
  deltaSemantic = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  first?: boolean;
  variant?: "row" | "grid";
  /** Tailwind classes for the main value (e.g. semantic YoY coloring). */
  valueClassName?: string;
  /** "cost": YoY up = bad (red), down = good (green). "default": opposite. */
  deltaSemantic?: "default" | "cost";
}) {
  return (
    <div
      className={
        variant === "grid"
          ? "flex min-h-0 w-full flex-1 flex-col justify-center px-5 py-5 sm:px-6 sm:py-6"
          : `min-w-0 flex-1 px-4 py-3 ${
              first ? "" : "border-l border-border"
            }`
      }
    >
      <div
        className={`mb-1 font-semibold uppercase text-fg-3 ${
          variant === "grid" ? "text-xs" : "text-[11px]"
        }`}
        style={{ letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div
        className={`tnum ${valueClassName ?? "text-fg"}`}
        style={{
          fontSize: variant === "grid" ? 26 : 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: variant === "grid" ? 1.15 : undefined,
        }}
      >
        {value}
      </div>
      {(sub || delta != null) && (
        <div
          className={`flex items-center gap-1.5 ${
            variant === "grid"
              ? "mt-1.5 text-[13px] leading-snug"
              : "mt-0.5 text-[11.5px]"
          }`}
        >
          {delta != null && (
            <span
              className="font-medium"
              style={{
                color: (() => {
                  if (delta === 0) return "var(--fg-3)";
                  const upIsGood = deltaSemantic === "default";
                  const good = "var(--success)";
                  const bad = "var(--danger)";
                  if (delta > 0) return upIsGood ? good : bad;
                  return upIsGood ? bad : good;
                })(),
              }}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta).toFixed(1)}% YoY
            </span>
          )}
          {sub && <span className="truncate text-fg-3">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function CostsReport() {
  const navigate = useNavigate();
  const { records: allRecords, fiscalYears: apiYears, loading, error } =
    useDashboardCostData();

  const [categories, setCategories] = useState<string[]>([]);
  const [source, setSource] = useState<CostSourceFilter>("all");
  const [classifications, setClassifications] = useState<string[]>([]);
  const [comparisonMode, setComparisonMode] =
    useState<ComparisonMode>("only_actual");
  const [costCenters, setCostCenters] = useState<string[]>([]);
  const [fiscalYearsFilter, setFiscalYearsFilter] = useState<number[]>([]);
  const [focusYear, setFocusYear] = useState<number | null>(null);
  const [yearBarChartScale, setYearBarChartScale] =
    useState<ChartYScaleMode>("linearFocused");
  const [printGeneratedAt, setPrintGeneratedAt] = useState("");
  const [combineActualEstimatedCfYears, setCombineActualEstimatedCfYears] =
    useState(true);
  const currentYear = new Date().getFullYear();

  const [breakdownDim, setBreakdownDim] = useState<BreakdownDimension>("category");
  const [selectedBucket, setSelectedBucket] = useState<{
    dimension: BreakdownDimension;
    key: string;
    label: string;
  } | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    let cancelled = false;
    client
      .get<Service[]>("/api/services/")
      .then((res) => {
        if (!cancelled) setServices(res.data);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const serviceById = useMemo(() => {
    const m = new Map<string, Service>();
    services.forEach((s) => m.set(s.id, s));
    return m;
  }, [services]);

  const vendorByServiceId = useMemo(() => {
    const m = new Map<string, string>();
    services.forEach((s) => {
      if (s.vendor?.name) m.set(s.id, s.vendor.name);
    });
    return m;
  }, [services]);

  useEffect(() => {
    if (!selectedBucket) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedBucket(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBucket]);

  const categoryOptions = useMemo(() => {
    return distinctCategoryNames(allRecords).map((v) => ({
      value: v,
      label: categoryDisplayName(v),
    }));
  }, [allRecords]);

  const classificationOptions = useMemo(() => {
    return distinctClassifications(allRecords).map((v) => ({
      value: v,
      label: classificationLabel(v),
    }));
  }, [allRecords]);

  const costCenterOptions = useMemo(
    () => costCenterFilterOptions(allRecords),
    [allRecords],
  );

  const costCenterFilterSummary = useMemo(() => {
    if (costCenters.length === 0) return "All";
    const labelByKey = new Map(
      costCenterOptions.map((o) => [o.key, o.label] as const),
    );
    return costCenters
      .map((k) => labelByKey.get(k) ?? k)
      .join(", ");
  }, [costCenters, costCenterOptions]);

  const comparisonTypes = useMemo(
    () => comparisonRecordTypesForMode(comparisonMode),
    [comparisonMode],
  );

  const isOnlyActual = comparisonMode === "only_actual";

  const filteredRecords = useMemo(
    () =>
      filterCostRecords(allRecords, {
        categories,
        source,
        classifications,
        comparisonRecordTypes: comparisonTypes,
        costCenters,
        fiscalYears: fiscalYearsFilter,
      }),
    [
      allRecords,
      categories,
      source,
      classifications,
      comparisonTypes,
      costCenters,
      fiscalYearsFilter,
    ],
  );

  const filteredRecordsAllTypes = useMemo(
    () =>
      filterCostRecords(allRecords, {
        categories,
        source,
        classifications,
        comparisonRecordTypes: ["actual", "estimated", "budget"],
        costCenters,
        fiscalYears: fiscalYearsFilter,
      }),
    [
      allRecords,
      categories,
      source,
      classifications,
      costCenters,
      fiscalYearsFilter,
    ],
  );

  const recordsForSelectedVisuals = useMemo(() => {
    const selectedTypes = new Set(comparisonTypes);
    return filteredRecordsAllTypes.filter((record) => {
      if (record.record_type === "budget") {
        return selectedTypes.has("budget");
      }
      if (record.record_type === "actual" || record.record_type === "estimated") {
        if (
          combineActualEstimatedCfYears &&
          isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
        ) {
          return selectedTypes.has("actual") || selectedTypes.has("estimated");
        }
        return selectedTypes.has(record.record_type);
      }
      return selectedTypes.has(record.record_type as never);
    });
  }, [
    comparisonTypes,
    filteredRecordsAllTypes,
    currentYear,
    combineActualEstimatedCfYears,
  ]);

  const visualRecordsTypeA = useMemo(() => {
    const typeA = comparisonTypes[0];
    if (!typeA) return [];
    return recordsForSelectedVisuals.filter((record) => {
      if (
        combineActualEstimatedCfYears &&
        typeA === "actual" &&
        isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
      ) {
        return record.record_type === "actual" || record.record_type === "estimated";
      }
      if (
        combineActualEstimatedCfYears &&
        typeA === "estimated" &&
        isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
      ) {
        return record.record_type === "actual" || record.record_type === "estimated";
      }
      return record.record_type === typeA;
    });
  }, [
    comparisonTypes,
    recordsForSelectedVisuals,
    currentYear,
    combineActualEstimatedCfYears,
  ]);

  const visualRecordsTypeB = useMemo(() => {
    const typeB = comparisonTypes[1];
    if (!typeB) return [];
    return recordsForSelectedVisuals.filter((record) => {
      if (
        combineActualEstimatedCfYears &&
        typeB === "actual" &&
        isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
      ) {
        return record.record_type === "actual" || record.record_type === "estimated";
      }
      if (
        combineActualEstimatedCfYears &&
        typeB === "estimated" &&
        isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
      ) {
        return record.record_type === "actual" || record.record_type === "estimated";
      }
      return record.record_type === typeB;
    });
  }, [
    comparisonTypes,
    recordsForSelectedVisuals,
    currentYear,
    combineActualEstimatedCfYears,
  ]);

  const chartYears = useMemo(() => {
    const ys = new Set(recordsForSelectedVisuals.map((r) => r.fiscal_year));
    return Array.from(ys).sort((a, b) => a - b);
  }, [recordsForSelectedVisuals]);

  const displayYear = useMemo(() => {
    if (chartYears.length === 0) return null;
    if (focusYear !== null && chartYears.includes(focusYear)) return focusYear;
    const cy = new Date().getFullYear();
    if (chartYears.includes(cy)) return cy;
    return chartYears[chartYears.length - 1];
  }, [chartYears, focusYear]);


  const costByYearA = useMemo(
    () => totalByYear(visualRecordsTypeA, chartYears),
    [visualRecordsTypeA, chartYears],
  );

  const costByYearB = useMemo(
    () => totalByYear(visualRecordsTypeB, chartYears),
    [visualRecordsTypeB, chartYears],
  );
  const combinedByYear = useMemo(() => {
    if (!combineActualEstimatedCfYears) return {} as Record<number, number>;
    return combinedActualEstimatedByYear(
      recordsForSelectedVisuals,
      chartYears,
      currentYear,
    );
  }, [
    combineActualEstimatedCfYears,
    recordsForSelectedVisuals,
    chartYears,
    currentYear,
  ]);
  const visualCostByYearA = useMemo(() => {
    if (!combineActualEstimatedCfYears) return costByYearA;
    return chartYears.reduce<Record<number, number>>((acc, year) => {
      acc[year] = visualAmountForRecordTypeAndYear(
        comparisonTypes[0] ?? "",
        year,
        costByYearA[year] ?? 0,
        combinedByYear[year] ?? 0,
        currentYear,
      );
      return acc;
    }, {});
  }, [
    combineActualEstimatedCfYears,
    chartYears,
    comparisonTypes,
    costByYearA,
    combinedByYear,
    currentYear,
  ]);
  const visualCostByYearB = useMemo(() => {
    if (!combineActualEstimatedCfYears) return costByYearB;
    return chartYears.reduce<Record<number, number>>((acc, year) => {
      acc[year] = visualAmountForRecordTypeAndYear(
        comparisonTypes[1] ?? "",
        year,
        costByYearB[year] ?? 0,
        combinedByYear[year] ?? 0,
        currentYear,
      );
      return acc;
    }, {});
  }, [
    combineActualEstimatedCfYears,
    chartYears,
    comparisonTypes,
    costByYearB,
    combinedByYear,
    currentYear,
  ]);

  /** Spend by FY for YoY Actual + Estimated KPI: combined A+E for current/future FYs when enabled, else actual-only. */
  const actualEstimatedKpiSpendByYear = useMemo(() => {
    const result: Record<number, number> = {};
    for (const y of chartYears) {
      if (
        combineActualEstimatedCfYears &&
        isCurrentOrFutureFiscalYear(y, currentYear)
      ) {
        result[y] = combinedByYear[y] ?? 0;
      } else {
        result[y] = recordsForSelectedVisuals
          .filter((r) => r.fiscal_year === y && r.record_type === "actual")
          .reduce((s, r) => s + r.amount, 0);
      }
    }
    return result;
  }, [
    chartYears,
    combineActualEstimatedCfYears,
    combinedByYear,
    currentYear,
    recordsForSelectedVisuals,
  ]);

  const yoyActualEstimatedKpi = useMemo(
    () =>
      displayYear !== null
        ? yoyPercent(actualEstimatedKpiSpendByYear, displayYear)
        : null,
    [displayYear, actualEstimatedKpiSpendByYear],
  );

  const categoryNamesForStackA = useMemo(
    () => distinctCategoryNames(visualRecordsTypeA),
    [visualRecordsTypeA],
  );

  const categoryNamesForStackB = useMemo(
    () => distinctCategoryNames(visualRecordsTypeB),
    [visualRecordsTypeB],
  );

  const stackedDataA = useMemo(
    () =>
      buildStackedYearData(visualRecordsTypeA, chartYears, categoryNamesForStackA),
    [visualRecordsTypeA, chartYears, categoryNamesForStackA],
  );

  const stackedDataB = useMemo(
    () =>
      buildStackedYearData(visualRecordsTypeB, chartYears, categoryNamesForStackB),
    [visualRecordsTypeB, chartYears, categoryNamesForStackB],
  );

  function handleStackedCategoryClick(year: number, categoryId: string) {
    setFocusYear(year);
    setBreakdownDim("category");
    setSelectedBucket({
      dimension: "category",
      key: categoryId,
      label: categoryDisplayName(categoryId),
    });
  }

  const selectedCategoryIdForStack =
    selectedBucket?.dimension === "category" ? selectedBucket.key : null;

  const sortedDetail = useMemo(() => {
    if (!combineActualEstimatedCfYears) {
      return [...filteredRecords].sort((a, b) => {
        if (b.fiscal_year !== a.fiscal_year) return b.fiscal_year - a.fiscal_year;
        return b.amount - a.amount;
      });
    }
    const combinedRows = new Map<string, (typeof filteredRecords)[number]>();
    const passthroughRows: (typeof filteredRecords)[number][] = [];
    recordsForSelectedVisuals.forEach((record) => {
      if (
        isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear) &&
        (record.record_type === "actual" || record.record_type === "estimated")
      ) {
        const key = [
          record.source,
          record.service_id ?? "",
          record.laptop_id ?? "",
          record.service_name,
          record.classification ?? "",
          record.category_name ?? "",
          record.cost_center_name ?? "",
          record.fiscal_year,
        ].join("|");
        const existing = combinedRows.get(key);
        if (existing) {
          existing.amount += record.amount;
          existing.record_type = "actual_estimated_combined";
        } else {
          combinedRows.set(key, {
            ...record,
            record_type: "actual_estimated_combined",
          });
        }
      } else {
        passthroughRows.push(record);
      }
    });
    return [...passthroughRows, ...combinedRows.values()].sort((a, b) => {
      if (b.fiscal_year !== a.fiscal_year) return b.fiscal_year - a.fiscal_year;
      return b.amount - a.amount;
    });
  }, [
    combineActualEstimatedCfYears,
    filteredRecords,
    recordsForSelectedVisuals,
    currentYear,
  ]);

  const displayedDetail = useMemo(() => {
    let rows = sortedDetail;
    if (focusYear !== null) {
      rows = rows.filter((r) => r.fiscal_year === focusYear);
    }
    if (selectedBucket) {
      rows = rows.filter((r) => {
        const { key } = bucketKeyForRecord(
          r,
          selectedBucket.dimension,
          vendorByServiceId,
        );
        return key === selectedBucket.key;
      });
    }
    return rows;
  }, [sortedDetail, focusYear, selectedBucket, vendorByServiceId]);

  const displayRecordTypeLabel = useCallback(
    (recordType: string, fiscalYear: number): string => {
      if (
        combineActualEstimatedCfYears &&
        isCurrentOrFutureFiscalYear(fiscalYear, currentYear) &&
        (recordType === "actual" || recordType === "estimated")
      ) {
        return COMBINED_RECORD_TYPE_LABEL;
      }
      return RECORD_TYPE_LABELS[recordType] ?? recordType;
    },
    [combineActualEstimatedCfYears, currentYear],
  );

  function handleDownloadCsv() {
    const headers = [
      "Source",
      "Name",
      "Spending category",
      "Classification",
      "Cost center",
      "Fiscal year",
      "Amount",
      "Record type",
      "Notes",
    ];
    const rows = sortedDetail.map((r) => [
      r.source,
      r.service_name,
      r.category_name ?? "",
      r.classification ?? "",
      r.cost_center_name ?? "",
      String(r.fiscal_year),
      String(r.amount),
      r.record_type,
      r.notes ?? "",
    ]);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `catalogit-it-financial-report-${date}.csv`,
      buildCsv(headers, rows),
    );
  }

  function handlePrint() {
    setPrintGeneratedAt(
      new Date().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
    queueMicrotask(() => window.print());
  }

  const hasData = filteredRecords.length > 0;

  const actualRecords = useMemo(
    () => filteredRecords.filter((r) => r.record_type === "actual"),
    [filteredRecords],
  );

  /** FYs that still have actual rows after all filters (used to align KPI year with visible data). */
  const fiscalYearsPresentInActual = useMemo(() => {
    const s = new Set(actualRecords.map((r) => r.fiscal_year));
    return Array.from(s).sort((a, b) => a - b);
  }, [actualRecords]);

  /**
   * FY used for Annualized / Highest category / FY labels in stats.
   * When fiscal years are filtered, uses the latest selected FY that appears in actuals
   * (so e.g. filtering to 2025 alone does not still target calendar "current" FY with no rows).
   * Breakdown below uses displayYear (focus year) instead.
   */
  const statYear = useMemo(() => {
    const present = fiscalYearsPresentInActual;
    const presentSet = new Set(present);

    const baseFromApi = (): number => {
      if (apiYears.includes(currentYear)) return currentYear;
      if (apiYears.length > 0) return apiYears[apiYears.length - 1];
      return currentYear;
    };

    if (fiscalYearsFilter.length > 0) {
      const inFilterAndPresent = fiscalYearsFilter.filter((y) =>
        presentSet.has(y),
      );
      if (inFilterAndPresent.length > 0) {
        return Math.max(...inFilterAndPresent);
      }
      return Math.max(...fiscalYearsFilter);
    }

    let candidate = baseFromApi();
    if (present.length > 0 && !presentSet.has(candidate)) {
      candidate = present[present.length - 1];
    }
    return candidate;
  }, [
    fiscalYearsFilter,
    fiscalYearsPresentInActual,
    apiYears,
    currentYear,
  ]);

  const annualizedCurrent = useMemo(
    () =>
      actualRecords
        .filter((r) => r.fiscal_year === statYear)
        .reduce((s, r) => s + r.amount, 0),
    [actualRecords, statYear],
  );

  const annualizedPrev = useMemo(
    () =>
      actualRecords
        .filter((r) => r.fiscal_year === statYear - 1)
        .reduce((s, r) => s + r.amount, 0),
    [actualRecords, statYear],
  );

  const yoyPct = annualizedPrev > 0
    ? ((annualizedCurrent - annualizedPrev) / annualizedPrev) * 100
    : null;

  const [nowMs] = useState(() => Date.now());
  const next30Days = useMemo(() => {
    if (services.length === 0) return null;
    const cutoff = nowMs + 30 * 86400000;
    return services.reduce((s, svc) => {
      if (!svc.renewal_date || svc.yearly_cost == null) return s;
      const t = new Date(svc.renewal_date).getTime();
      if (Number.isNaN(t)) return s;
      if (t >= nowMs - 86400000 && t <= cutoff) return s + Number(svc.yearly_cost);
      return s;
    }, 0);
  }, [services, nowMs]);

  const statYearRecords = useMemo(
    () => actualRecords.filter((r) => r.fiscal_year === statYear),
    [actualRecords, statYear],
  );

  const highestCategory = useMemo(() => {
    const map = new Map<string, number>();
    statYearRecords.forEach((r) => {
      const key = r.category_name ?? "";
      map.set(key, (map.get(key) ?? 0) + r.amount);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (!top) return null;
    return { name: categoryDisplayName(top[0]), amount: top[1] };
  }, [statYearRecords]);

  /** Actual rows for the chart focus year (same FY as Total spend by year selected column). */
  const breakdownYearRecords = useMemo(
    () =>
      displayYear !== null
        ? actualRecords.filter((r) => r.fiscal_year === displayYear)
        : [],
    [actualRecords, displayYear],
  );

  const buckets = useMemo(() => {
    if (breakdownDim === "month") {
      if (displayYear === null) return [];
      const monthly = monthlySpendFromRecords(actualRecords, displayYear);
      return monthly.map((value, i) => ({
        key: String(i),
        label: MONTH_LABELS[i],
        value,
        records: breakdownYearRecords,
      }));
    }
    return buildBreakdownBuckets(
      breakdownYearRecords,
      breakdownDim,
      vendorByServiceId,
    );
  }, [
    breakdownDim,
    breakdownYearRecords,
    vendorByServiceId,
    actualRecords,
    displayYear,
  ]);

  const bucketTotal = useMemo(
    () => buckets.reduce((s, b) => s + b.value, 0),
    [buckets],
  );

  const bucketMax = useMemo(
    () => buckets.reduce((m, b) => Math.max(m, b.value), 0),
    [buckets],
  );

  const drillRecords = useMemo(() => {
    if (!selectedBucket) return [] as DashboardCostRecord[];
    const bucket = buckets.find((b) => b.key === selectedBucket.key);
    return bucket?.records ?? [];
  }, [selectedBucket, buckets]);

  const drillByService = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        category: string;
        classification: string;
        fiscalYear: number;
        amount: number;
        isService: boolean;
        operating_system: DashboardCostRecord["operating_system"];
      }
    >();
    drillRecords.forEach((r) => {
      const idKey = r.service_id ?? r.laptop_id ?? r.service_name;
      const existing = map.get(idKey);
      if (existing) {
        existing.amount += r.amount;
      } else {
        map.set(idKey, {
          id: idKey,
          name: r.service_name,
          category: categoryDisplayName(r.category_name ?? ""),
          classification: classificationLabel(r.classification ?? ""),
          fiscalYear: r.fiscal_year,
          amount: r.amount,
          isService: r.source === "service" && !!r.service_id,
          operating_system:
            r.source === "hardware" ? r.operating_system : null,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [drillRecords]);

  const breakdownOptions: { value: BreakdownDimension; label: string }[] = [
    { value: "category", label: "Category" },
    { value: "vendor", label: "Vendor" },
    { value: "classification", label: "Classification" },
    { value: "cost_center", label: "Cost center" },
    { value: "month", label: "Month" },
  ];

  const lineItemTableRows = useMemo<LineItemRow[]>(
    () =>
      displayedDetail.map((r, idx) => ({
        ...r,
        id: `line-${idx}-${r.source}-${r.service_id ?? "s"}-${r.laptop_id ?? "l"}-${r.fiscal_year}-${r.record_type}-${r.amount}`,
      })),
    [displayedDetail],
  );

  const lineItemColumns = useMemo<Column<LineItemRow>[]>(
    () => [
      {
        key: "source",
        header: "Source",
        render: (r) => (
          <span className="text-gray-700 dark:text-gray-300">{r.source}</span>
        ),
      },
      {
        key: "name",
        header: "Name",
        render: (r) => (
          <div className="flex min-w-0 max-w-[220px] items-center gap-2.5">
            {r.source === "service" ? (
              <Monogram name={r.service_name} seed={r.service_id ?? r.service_name} size={26} />
            ) : (
              <OsIcon operatingSystem={r.operating_system} />
            )}
            <span className="truncate text-fg">{r.service_name}</span>
          </div>
        ),
      },
      {
        key: "category",
        header: "Category",
        render: (r) => (
          <span className="text-gray-600 dark:text-gray-400">
            {categoryDisplayName(r.category_name ?? "")}
          </span>
        ),
      },
      {
        key: "classification",
        header: "Class.",
        render: (r) => (
          <span
            className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400"
            title={r.classification ?? ""}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{
                background: classificationBarColor(r.classification),
              }}
            />
            {classificationLabel(r.classification ?? "")}
          </span>
        ),
      },
      {
        key: "cost_center",
        header: "Cost ctr.",
        render: (r) => (
          <span className="text-gray-600 dark:text-gray-400">
            {r.cost_center_name ?? "—"}
          </span>
        ),
      },
      {
        key: "fiscal_year",
        header: "Year",
        align: "right",
        render: (r) => (
          <span className="font-mono text-base tabular-nums text-gray-700 dark:text-gray-300">
            {r.fiscal_year}
          </span>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        render: (r) => (
          <span className="font-mono text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {fmtFull(r.amount)}
          </span>
        ),
      },
      {
        key: "record_type",
        header: "Type",
        render: (r) => (
          <span className="text-gray-600 dark:text-gray-400">
            {r.record_type === "actual_estimated_combined"
              ? COMBINED_RECORD_TYPE_LABEL
              : RECORD_TYPE_LABELS[r.record_type] ?? r.record_type}
          </span>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          IT Financial Report
        </h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          IT Financial Report
        </h1>
        <p className="mt-4 text-sm text-red-600">
          Could not load cost data. Try again later.
        </p>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="costs-report costs-report-print text-gray-900 dark:text-gray-100">
      <style>{`
        @media print {
          .costs-report .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="print:hidden">
        <h1
          className="text-fg"
          style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
        >
          IT Financial Report
        </h1>
        <p className="mt-1 text-[13px] text-fg-3">
          Default is actual-only; switch the view to compare pairs of record types, filter, export, or
          print.
        </p>
      </div>

      <div className="hidden print:block costs-report-print-summary">
        <h1 className="costs-report-print-title">IT Financial Report</h1>
        <p className="mt-2 text-[9.5pt] text-gray-800">
          <strong>Generated</strong> {printGeneratedAt || "—"}
        </p>
        <ul className="mt-3 list-none space-y-1.5 text-[9.5pt]">
          <li>
            <strong>View:</strong> {COMPARISON_MODE_LABEL[comparisonMode]}
          </li>
          <li>
            <strong>Source:</strong>{" "}
            {source === "all"
              ? "All"
              : source === "service"
                ? "Software only"
                : "Hardware only"}
          </li>
          <li>
            <strong>Fiscal years:</strong>{" "}
            {fiscalYearsFilter.length === 0
              ? "All (within filtered data)"
              : [...fiscalYearsFilter].sort((a, b) => a - b).join(", ")}
          </li>
          <li>
            <strong>Classification:</strong>{" "}
            {classifications.length === 0
              ? "All"
              : classifications.map(classificationLabel).join(", ")}
          </li>
          <li>
            <strong>Spending categories:</strong>{" "}
            {categories.length === 0
              ? "All"
              : categories.map(categoryDisplayName).join(", ")}
          </li>
          <li>
            <strong>Cost center / hardware:</strong> {costCenterFilterSummary}
          </li>
          <li>
            <strong>Combine actual + estimated (current/future years):</strong>{" "}
            {combineActualEstimatedCfYears ? "On" : "Off"}
          </li>
          <li>
            <strong>Rows in report:</strong> {sortedDetail.length}
          </li>
        </ul>
      </div>

      <div className="print:hidden mt-6 space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
          <span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            View
          </span>
          {(
            [
              "only_actual",
              "actual_vs_estimated",
              "actual_vs_budget",
              "estimated_vs_budget",
            ] as const
          ).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setComparisonMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                comparisonMode === m
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {COMPARISON_MODE_LABEL[m]}
            </button>
          ))}
          <label className="flex w-full cursor-pointer items-start gap-2 text-sm text-gray-700 sm:w-auto dark:text-gray-300">
            <input
              id="cr-combine-ae"
              type="checkbox"
              checked={combineActualEstimatedCfYears}
              onChange={(e) => setCombineActualEstimatedCfYears(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900"
            />
            <span>
              Combine Actual and Estimated for current and future years
            </span>
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={!hasData}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!hasData}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Print
            </button>
          </div>
        </div>

        <div
          className={`grid gap-4 ${hasData ? "lg:grid-cols-2" : ""}`}
        >
          {hasData && (
            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-border shadow-sm lg:h-full lg:min-h-[20rem]">
              <div className="grid min-h-[17rem] flex-1 grid-cols-2 grid-rows-2 gap-px bg-border sm:min-h-[19rem] lg:min-h-0">
                <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
                  <StatCell
                    variant="grid"
                    label="Annualized spend"
                    value={formatMoneyCompact(annualizedCurrent)}
                    delta={yoyPct}
                    deltaSemantic="cost"
                    sub={`FY ${statYear} actual`}
                  />
                </div>
                <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
                  <StatCell
                    variant="grid"
                    label="Next 30 days"
                    value={next30Days == null ? "—" : formatMoneyCompact(next30Days)}
                    sub={next30Days == null ? "requires renewals" : "upcoming renewals"}
                  />
                </div>
                <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
                  <StatCell
                    variant="grid"
                    label="Highest category"
                    value={
                      highestCategory
                        ? formatMoneyCompact(highestCategory.amount)
                        : "—"
                    }
                    sub={highestCategory?.name}
                  />
                </div>
                <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
                  <StatCell
                    variant="grid"
                    label="YoY Actual + Estimated"
                    value={
                      displayYear !== null && yoyActualEstimatedKpi != null
                        ? `${yoyActualEstimatedKpi >= 0 ? "+" : ""}${yoyActualEstimatedKpi.toFixed(1)}%`
                        : "—"
                    }
                    sub={
                      displayYear !== null
                        ? `(${displayYear})`
                        : undefined
                    }
                    valueClassName={
                      displayYear !== null && yoyActualEstimatedKpi != null
                        ? yoyActualEstimatedKpi < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : yoyActualEstimatedKpi > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-fg"
                        : undefined
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-fg-3">Source</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["service", "Software"],
                    ["hardware", "Hardware"],
                  ] as const
                ).map(([val, lab]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSource(val)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      source === val
                        ? "bg-brand-600 text-white"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
            <MultiSelectFacet
              label="Fiscal years"
              options={apiYears.map((y) => ({ value: String(y), label: String(y) }))}
              values={fiscalYearsFilter.map(String)}
              onChange={(next) =>
                setFiscalYearsFilter(
                  next
                    .map((v) => Number.parseInt(v, 10))
                    .filter((n) => !Number.isNaN(n))
                    .sort((a, b) => a - b),
                )
              }
              hint="Empty = include all years in the filtered data."
              fullWidth
            />
            <MultiSelectFacet
              label="Classification"
              options={classificationOptions}
              values={classifications}
              onChange={setClassifications}
              hint="Empty = all."
              fullWidth
            />
            <MultiSelectFacet
              label="Spending category"
              options={categoryOptions}
              values={categories}
              onChange={setCategories}
              hint="Empty = all categories."
              fullWidth
            />
            <MultiSelectFacet
              label="Cost center / hardware"
              options={costCenterOptions.map((o) => ({
                value: o.key,
                label: o.label,
              }))}
              values={costCenters}
              onChange={setCostCenters}
              hint='Empty = all. Hardware matches "Hardware (assets)".'
              fullWidth
            />
          </div>
        </div>
      </div>

      {hasData && (
        <>
          {!isOnlyActual && displayYear !== null && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
              <div className="print-kpi-card rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {displayRecordTypeLabel(comparisonTypes[0] ?? "", displayYear)} ({displayYear})
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                  {fmtFull(visualCostByYearA[displayYear] ?? 0)}
                </p>
              </div>
              {comparisonTypes[1] !== undefined && (
                <div className="print-kpi-card rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
                  <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {displayRecordTypeLabel(comparisonTypes[1], displayYear)} ({displayYear})
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                    {fmtFull(visualCostByYearB[displayYear] ?? 0)}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 print:hidden">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Focus year for KPIs:{" "}
            </span>
            {chartYears.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setFocusYear(y)}
                className={`mr-1 rounded px-2 py-0.5 text-xs font-medium ${
                  displayYear === y
                    ? "bg-brand-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {isOnlyActual ? (
            <div className="print-chart-card mt-6 min-h-[300px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 print:break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 gap-y-2">
                <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Total spend by year (actual)
                </h2>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Year column axis
                  </span>
                  <SegmentedControl<ChartYScaleMode>
                    value={yearBarChartScale}
                    onChange={setYearBarChartScale}
                    size="sm"
                    activeTone="brand"
                    options={[
                      { value: "linearZero", label: "Full" },
                      { value: "linearFocused", label: "Focus" },
                      { value: "log", label: "Log" },
                    ]}
                  />
                </div>
              </div>
              <BarChart
                scale={yearBarChartScale}
                showAxisHint
                data={chartYears.map((y) => ({
                  label: String(y),
                  value: visualCostByYearA[y] ?? 0,
                  color:
                    y === displayYear
                      ? "var(--accent)"
                      : "color-mix(in srgb, var(--accent) 38%, var(--surface-2))",
                }))}
                onBarClick={(i) => {
                  const y = chartYears[i];
                  if (y !== undefined) setFocusYear(y);
                }}
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2 print:grid-cols-1">
              <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-2 print:hidden">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Year column axis
                </span>
                <SegmentedControl<ChartYScaleMode>
                  value={yearBarChartScale}
                  onChange={setYearBarChartScale}
                  size="sm"
                  activeTone="brand"
                  options={[
                    { value: "linearZero", label: "Full" },
                    { value: "linearFocused", label: "Focus" },
                    { value: "log", label: "Log" },
                  ]}
                />
              </div>
              <div className="print-chart-card min-h-[280px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 print:break-inside-avoid">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {RECORD_TYPE_LABELS[comparisonTypes[0]]} — total by year
                </h2>
                <BarChart
                  scale={yearBarChartScale}
                  showAxisHint
                  data={chartYears.map((y) => ({
                    label: String(y),
                    value: visualCostByYearA[y] ?? 0,
                    color:
                    y === displayYear
                      ? "var(--accent)"
                      : "color-mix(in srgb, var(--accent) 38%, var(--surface-2))",
                  }))}
                  onBarClick={(i) => {
                    const y = chartYears[i];
                    if (y !== undefined) setFocusYear(y);
                  }}
                />
              </div>
              {comparisonTypes[1] !== undefined && (
                <div className="print-chart-card min-h-[280px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 print:break-inside-avoid">
                  <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {RECORD_TYPE_LABELS[comparisonTypes[1]]} — total by year
                  </h2>
                  <BarChart
                    scale={yearBarChartScale}
                    showAxisHint
                    data={chartYears.map((y) => ({
                      label: String(y),
                      value: visualCostByYearB[y] ?? 0,
                      color: y === displayYear ? "#0d9488" : "#99f6e4",
                    }))}
                    onBarClick={(i) => {
                      const y = chartYears[i];
                      if (y !== undefined) setFocusYear(y);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {categoryNamesForStackA.length > 0 && (
            <div className="print-chart-card mt-4 min-h-[300px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 print:break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {isOnlyActual
                    ? "Spend by category (actual)"
                    : `${RECORD_TYPE_LABELS[comparisonTypes[0]]} — spend by category`}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {categoryNamesForStackA.map((name) => (
                    <span
                      key={name}
                      className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          background: getCategoryColor(
                            name || "(Uncategorized)",
                          ),
                        }}
                      />
                      {categoryDisplayName(name)}
                    </span>
                  ))}
                </div>
              </div>
              <StackedBar
                yearData={stackedDataA}
                scale={yearBarChartScale}
                showAxisHint
                onYearClick={(y) => {
                  setFocusYear(y);
                  setSelectedBucket(null);
                }}
                onCategoryClick={handleStackedCategoryClick}
                selectedYear={displayYear}
                selectedCategoryId={selectedCategoryIdForStack}
              />
            </div>
          )}

          {!isOnlyActual && categoryNamesForStackB.length > 0 && comparisonTypes[1] !== undefined && (
            <div className="print-chart-card mt-4 min-h-[300px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 print:break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {RECORD_TYPE_LABELS[comparisonTypes[1]]} — spend by category
                </h2>
                <div className="flex flex-wrap gap-2">
                  {categoryNamesForStackB.map((name) => (
                    <span
                      key={name}
                      className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          background: getCategoryColor(
                            name || "(Uncategorized)",
                          ),
                        }}
                      />
                      {categoryDisplayName(name)}
                    </span>
                  ))}
                </div>
              </div>
              <StackedBar
                yearData={stackedDataB}
                scale={yearBarChartScale}
                showAxisHint
                onYearClick={(y) => {
                  setFocusYear(y);
                  setSelectedBucket(null);
                }}
                onCategoryClick={handleStackedCategoryClick}
                selectedYear={displayYear}
                selectedCategoryId={selectedCategoryIdForStack}
              />
            </div>
          )}

          <section className="print:hidden mt-6 space-y-4">
            <div className="rounded-[10px] border border-border bg-surface p-4 shadow-sm">
              {selectedBucket ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedBucket(null)}
                        className="text-[12px] font-medium text-fg-3 hover:text-fg"
                      >
                        ← Back to all
                      </button>
                      <div className="mt-1 flex items-baseline gap-2">
                        <div
                          className="text-[10.5px] font-semibold uppercase text-fg-3"
                          style={{ letterSpacing: "0.06em" }}
                        >
                          {
                            breakdownOptions.find(
                              (o) => o.value === selectedBucket.dimension,
                            )?.label
                          }
                        </div>
                        <div
                          className="text-fg"
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {selectedBucket.label}
                        </div>
                        <div className="text-[12px] text-fg-3">
                          {drillByService.length} items ·{" "}
                          {formatMoneyCompact(
                            drillRecords.reduce((s, r) => s + r.amount, 0),
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBucket(null)}
                      className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-fg-2 hover:bg-surface-2"
                    >
                      Close
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-[13px]">
                      <thead className="bg-surface-2">
                        <tr className="text-left text-fg-3">
                          <th className="px-3 py-2 font-medium">Service</th>
                          <th className="px-3 py-2 font-medium">Category</th>
                          <th className="px-3 py-2 font-medium">Classification</th>
                          <th className="px-3 py-2 text-right font-medium">FY</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillByService.slice(0, 50).map((row) => {
                          const service = serviceById.get(row.id);
                          const linkTo = row.isService
                            ? `/services/${row.id}`
                            : null;
                          return (
                            <tr
                              key={row.id}
                              className="border-t border-border hover:bg-surface-2"
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {row.isService ? (
                                    <Monogram
                                      name={service?.name ?? row.name}
                                      seed={row.id}
                                      size={22}
                                    />
                                  ) : (
                                    <OsIcon
                                      operatingSystem={row.operating_system}
                                      className="h-[22px] w-[22px] shrink-0"
                                    />
                                  )}
                                  {linkTo ? (
                                    <Link
                                      to={linkTo}
                                      className="truncate font-medium text-fg hover:text-accent"
                                    >
                                      {row.name}
                                    </Link>
                                  ) : (
                                    <span className="truncate font-medium text-fg">
                                      {row.name}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-fg-2">
                                {row.category}
                              </td>
                              <td className="px-3 py-2 text-fg-2">
                                {row.classification}
                              </td>
                              <td className="mono px-3 py-2 text-right text-fg-2">
                                {row.fiscalYear}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Money value={row.amount} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {drillByService.length > 50 && (
                      <div className="border-t border-border bg-surface-2 px-3 py-2 text-[11.5px] text-fg-3">
                        Showing top 50 of {drillByService.length}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3
                        className="text-fg"
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          letterSpacing: "-0.01em",
                          margin: 0,
                        }}
                      >
                        Breakdown
                      </h3>
                      <div className="mt-0.5 text-[12px] text-fg-3">
                        {displayYear !== null ? `FY ${displayYear} actual · ` : null}
                        Click a bar to drill into specific services
                      </div>
                    </div>
                    <SegmentedControl
                      value={breakdownDim}
                      onChange={(v) => {
                        setBreakdownDim(v);
                        setSelectedBucket(null);
                      }}
                      options={breakdownOptions}
                    />
                  </div>
                  {buckets.length === 0 ? (
                    <div className="py-8 text-center text-[13px] text-fg-3">
                      No actual spend to break down.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {buckets.slice(0, 12).map((b) => (
                        <InteractiveBarRow
                          key={b.key}
                          label={b.label}
                          value={b.value}
                          max={bucketMax}
                          pctOfTotal={
                            bucketTotal > 0 ? (b.value / bucketTotal) * 100 : 0
                          }
                          selected={false}
                          clickable={breakdownDim !== "month"}
                          onClick={() =>
                            breakdownDim === "month"
                              ? undefined
                              : setSelectedBucket({
                                  dimension: breakdownDim,
                                  key: b.key,
                                  label: b.label,
                                })
                          }
                        />
                      ))}
                      {buckets.length > 12 && (
                        <div className="pt-1 text-[11.5px] text-fg-3">
                          +{buckets.length - 12} more
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <div className="print-table-section mt-8 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 print:break-inside-avoid">
            <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
              <span>Line items ({displayedDetail.length})</span>
              {(focusYear !== null || selectedBucket) && (
                <span className="flex flex-wrap items-center gap-2 text-[11px] normal-case tracking-normal text-fg-3">
                  {focusYear !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5">
                      FY {focusYear}
                      <button
                        type="button"
                        onClick={() => setFocusYear(null)}
                        className="text-fg-3 hover:text-fg"
                        aria-label="Clear year filter"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {selectedBucket && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5">
                      {selectedBucket.label}
                      <button
                        type="button"
                        onClick={() => setSelectedBucket(null)}
                        className="text-fg-3 hover:text-fg"
                        aria-label="Clear category filter"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </span>
              )}
            </h2>
            <div className="costs-report-print-table-wrap max-h-[520px] overflow-auto print:max-h-none print:overflow-visible">
              <DataTable<LineItemRow>
                columns={lineItemColumns}
                data={lineItemTableRows}
                striped
                primaryColumnKey="name"
                className="rounded-none border-0 bg-transparent shadow-none dark:bg-transparent"
                tableClassName="costs-report-data-table text-base"
                primaryCellClassName="print-name-cell max-w-[220px]"
                onRowClick={(r) => {
                  const path = lineItemDetailPath(r);
                  if (path) navigate(path);
                }}
                rowInteractive={(r) => lineItemDetailPath(r) != null}
              />
            </div>
          </div>
        </>
      )}

      {!hasData && (
        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          No cost rows match the current filters.
        </p>
      )}
    </div>
    </PageTransition>
  );
}
