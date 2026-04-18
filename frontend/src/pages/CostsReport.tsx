import { useMemo, useState } from "react";
import "./CostsReport.print.css";
import { BarChart } from "../components/charts/BarChart";
import { PageTransition } from "../components/PageTransition";
import { StackedBar } from "../components/charts/StackedBar";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import {
  COMPARISON_MODE_LABEL,
  comparisonRecordTypesForMode,
  type ComparisonMode,
  type CostSourceFilter,
} from "../types/dashboardCost";
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

function MultiStringSelect({
  id,
  label,
  options,
  values,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </label>
      <select
        id={id}
        multiple
        value={values}
        onChange={(e) => {
          onChange(Array.from(e.target.selectedOptions, (o) => o.value));
        }}
        size={Math.min(6, Math.max(3, options.length))}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  );
}

function MultiYearSelect({
  id,
  label,
  years,
  values,
  onChange,
}: {
  id: string;
  label: string;
  years: number[];
  values: number[];
  onChange: (next: number[]) => void;
}) {
  const strValues = values.map(String);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </label>
      <select
        id={id}
        multiple
        value={strValues}
        onChange={(e) => {
          onChange(
            Array.from(e.target.selectedOptions, (o) => Number.parseInt(o.value, 10)),
          );
        }}
        size={Math.min(6, Math.max(3, years.length))}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Empty = include all years in the filtered data.
      </p>
    </div>
  );
}

export function CostsReport() {
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
  const [printGeneratedAt, setPrintGeneratedAt] = useState("");
  const [combineActualEstimatedCfYears, setCombineActualEstimatedCfYears] =
    useState(true);
  const currentYear = new Date().getFullYear();

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

  const yoyA =
    displayYear !== null ? yoyPercent(visualCostByYearA, displayYear) : 0;
  const yoyB =
    displayYear !== null ? yoyPercent(visualCostByYearB, displayYear) : 0;

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

  function displayRecordTypeLabel(recordType: string, fiscalYear: number): string {
    if (
      combineActualEstimatedCfYears &&
      isCurrentOrFutureFiscalYear(fiscalYear, currentYear) &&
      (recordType === "actual" || recordType === "estimated")
    ) {
      return COMBINED_RECORD_TYPE_LABEL;
    }
    return RECORD_TYPE_LABELS[recordType] ?? recordType;
  }

  function yoyLabelForType(recordType: string, fiscalYear: number): string {
    return `YoY ${displayRecordTypeLabel(recordType, fiscalYear)} (${fiscalYear})`;
  }

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

  const hasData = filteredRecords.length > 0;

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
            <strong>Spending categories:</strong>{" "}
            {categories.length === 0
              ? "All"
              : categories.map(categoryDisplayName).join(", ")}
          </li>
          <li>
            <strong>Classification:</strong>{" "}
            {classifications.length === 0
              ? "All"
              : classifications.map(classificationLabel).join(", ")}
          </li>
          <li>
            <strong>Cost center / hardware:</strong> {costCenterFilterSummary}
          </li>
          <li>
            <strong>Fiscal years:</strong>{" "}
            {fiscalYearsFilter.length === 0
              ? "All (within filtered data)"
              : [...fiscalYearsFilter].sort((a, b) => a - b).join(", ")}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MultiStringSelect
            id="cr-cat"
            label="Spending category"
            options={categoryOptions}
            values={categories}
            onChange={setCategories}
            hint="Empty = all categories."
          />
          <div>
            <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Source
            </span>
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
          <MultiStringSelect
            id="cr-class"
            label="Classification"
            options={classificationOptions}
            values={classifications}
            onChange={setClassifications}
            hint="Empty = all."
          />
          <MultiStringSelect
            id="cr-cc"
            label="Cost center / hardware"
            options={costCenterOptions.map((o) => ({
              value: o.key,
              label: o.label,
            }))}
            values={costCenters}
            onChange={setCostCenters}
            hint="Empty = all. Hardware matches “Hardware (assets)”."
          />
          <MultiYearSelect
            id="cr-yr"
            label="Fiscal years"
            years={apiYears}
            values={fiscalYearsFilter}
            onChange={setFiscalYearsFilter}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
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
      </div>

      {!hasData && (
        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          No cost rows match the current filters.
        </p>
      )}

      {hasData && (
        <>
          {displayYear !== null && (
            <div
              className={`mt-6 grid gap-3 print:grid-cols-2 ${
                isOnlyActual
                  ? "grid-cols-2 sm:max-w-2xl"
                  : "grid-cols-2 sm:grid-cols-4 print:grid-cols-4"
              }`}
            >
              <div className="print-kpi-card rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {displayRecordTypeLabel(comparisonTypes[0] ?? "", displayYear)} ({displayYear})
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                  {fmtFull(visualCostByYearA[displayYear] ?? 0)}
                </p>
              </div>
              {!isOnlyActual && comparisonTypes[1] !== undefined && (
                <div className="print-kpi-card rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
                  <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {displayRecordTypeLabel(comparisonTypes[1], displayYear)} ({displayYear})
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                    {fmtFull(visualCostByYearB[displayYear] ?? 0)}
                  </p>
                </div>
              )}
              <div className="print-kpi-card rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {yoyLabelForType(comparisonTypes[0] ?? "", displayYear)}
                </p>
                <p
                  className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
                    yoyA < 0
                      ? "text-emerald-600"
                      : yoyA > 0
                        ? "text-red-600"
                        : "text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {`${yoyA >= 0 ? "+" : ""}${yoyA.toFixed(1)}%`}
                </p>
              </div>
              {!isOnlyActual && comparisonTypes[1] !== undefined && (
                <div className="print-kpi-card rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
                  <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {yoyLabelForType(comparisonTypes[1], displayYear)}
                  </p>
                  <p
                    className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
                      yoyB < 0
                        ? "text-emerald-600"
                        : yoyB > 0
                          ? "text-red-600"
                          : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {`${yoyB >= 0 ? "+" : ""}${yoyB.toFixed(1)}%`}
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
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Total spend by year (actual)
              </h2>
              <BarChart
                data={chartYears.map((y) => ({
                  label: String(y),
                  value: visualCostByYearA[y] ?? 0,
                  color: y === displayYear ? "#4f46e5" : "#c7d2fe",
                }))}
                onBarClick={(i) => {
                  const y = chartYears[i];
                  if (y !== undefined) setFocusYear(y);
                }}
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2 print:grid-cols-1">
              <div className="print-chart-card min-h-[280px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 print:break-inside-avoid">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {RECORD_TYPE_LABELS[comparisonTypes[0]]} — total by year
                </h2>
                <BarChart
                  data={chartYears.map((y) => ({
                    label: String(y),
                    value: visualCostByYearA[y] ?? 0,
                    color: y === displayYear ? "#4f46e5" : "#c7d2fe",
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
                onYearClick={(y) => setFocusYear(y)}
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
                onYearClick={(y) => setFocusYear(y)}
              />
            </div>
          )}

          <div className="print-table-section mt-8 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 print:break-inside-avoid">
            <h2 className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
              Line items ({sortedDetail.length})
            </h2>
            <div className="costs-report-print-table-wrap max-h-[520px] overflow-auto print:max-h-none print:overflow-visible">
              <table className="costs-report-data-table min-w-full divide-y divide-gray-200 text-base dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Class.
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Cost ctr.
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Year
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-900">
                  {sortedDetail.map((r, idx) => (
                    <tr key={`${r.service_name}-${r.fiscal_year}-${idx}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                        {r.source}
                      </td>
                      <td className="print-name-cell max-w-[220px] truncate px-4 py-3 text-gray-900 dark:text-gray-100">
                        {r.service_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {categoryDisplayName(r.category_name ?? "")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        <span
                          className="inline-flex items-center gap-1"
                          title={r.classification ?? ""}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              background: classificationBarColor(r.classification),
                            }}
                          />
                          {classificationLabel(r.classification ?? "")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {r.cost_center_name ?? (r.source === "hardware" ? "—" : "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-base text-gray-700 tabular-nums dark:text-gray-300">
                        {r.fiscal_year}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {fmtFull(r.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {r.record_type === "actual_estimated_combined"
                          ? COMBINED_RECORD_TYPE_LABEL
                          : RECORD_TYPE_LABELS[r.record_type] ?? r.record_type}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
    </PageTransition>
  );
}
