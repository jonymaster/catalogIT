import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./CostsReport.print.css";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { PageTransition } from "../components/PageTransition";
import { BarChart } from "../components/charts/BarChart";
import { StackedBar } from "../components/charts/StackedBar";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import type {
  DashboardCostDimension,
  DashboardCostRecord,
  ReportAnalysisMode,
} from "../types/dashboardCost";
import { DASHBOARD_COST_DIMENSION_LABEL } from "../types/dashboardCost";
import { buildCsv, downloadCsvFile } from "../utils/csv";
import {
  categoryDisplayName,
  classificationBarColor,
  classificationDisplayName,
  costCenterFilterOptions,
  dimensionFilterOptions,
  dimensionValuesForRecord,
  distinctCategoryNames,
  distinctClassifications,
  environmentDisplayName,
  filterCostRecords,
  fmtFull,
  getCategoryColor,
  isCurrentOrFutureFiscalYear,
  subcategoryDisplayName,
  teamDisplayName,
  totalsByDimension,
  vendorDisplayName,
  sourceDisplayName,
  buildStackedDimensionData,
  recordMatchesDimensionKey,
} from "../utils/dashboardCostAggregates";

type RecordType = "actual" | "estimated" | "budget";

type DrilldownState = {
  year: number | null;
  primaryKey: string | null;
  primaryLabel: string | null;
  secondaryKey: string | null;
  secondaryLabel: string | null;
};

type DetailRow = DashboardCostRecord & { id: string };

const RECORD_TYPE_OPTIONS: { value: RecordType; label: string }[] = [
  { value: "actual", label: "Actual" },
  { value: "estimated", label: "Estimated" },
  { value: "budget", label: "Budget" },
];

const REPORT_DIMENSIONS: DashboardCostDimension[] = [
  "category",
  "subcategory",
  "classification",
  "vendor",
  "team",
  "environment",
  "cost_center",
  "source",
];

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
      <label
        htmlFor={id}
        className="block text-xs font-medium text-gray-600 dark:text-gray-400"
      >
        {label}
      </label>
      <select
        id={id}
        multiple
        value={values}
        onChange={(e) => {
          onChange(Array.from(e.target.selectedOptions, (option) => option.value));
        }}
        size={Math.min(6, Math.max(3, options.length))}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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
  years,
  values,
  onChange,
}: {
  years: number[];
  values: number[];
  onChange: (next: number[]) => void;
}) {
  const selected = values.map(String);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        Fiscal years
      </label>
      <select
        multiple
        value={selected}
        onChange={(e) => {
          onChange(
            Array.from(e.target.selectedOptions, (option) =>
              Number.parseInt(option.value, 10),
            ),
          );
        }}
        size={Math.min(6, Math.max(3, years.length))}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Leave empty to include every year present in the filtered data.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtext}</p>}
    </div>
  );
}

function QuickFilterButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
    >
      {label}
    </button>
  );
}

function dimensionColor(dimension: DashboardCostDimension, key: string) {
  if (dimension === "classification") {
    return classificationBarColor(key || null);
  }
  return getCategoryColor(`${dimension}:${key || "__none__"}`);
}

function formatRecordType(recordType: string) {
  return RECORD_TYPE_OPTIONS.find((option) => option.value === recordType)?.label ?? recordType;
}

function timeStackGroups(
  records: DashboardCostRecord[],
  years: number[],
  secondaryDimension: DashboardCostDimension,
) {
  return years.map((year) => {
    const slices = new Map<
      string,
      { id: string; name: string; value: number; color: string }
    >();

    records
      .filter((record) => record.fiscal_year === year)
      .forEach((record) => {
        dimensionValuesForRecord(record, secondaryDimension).forEach((value) => {
          const existing = slices.get(value.key);
          if (existing) {
            existing.value += record.amount;
            return;
          }
          slices.set(value.key, {
            id: value.key,
            name: value.label,
            value: record.amount,
            color: dimensionColor(secondaryDimension, value.key),
          });
        });
      });

    return {
      key: String(year),
      label: String(year),
      cats: Array.from(slices.values()).sort(
        (left, right) => right.value - left.value || left.name.localeCompare(right.name),
      ),
    };
  });
}

function recordIncludedInVisuals(
  record: DashboardCostRecord,
  selectedRecordTypes: string[],
  includeEstimatedForecast: boolean,
  currentYear: number,
) {
  if (selectedRecordTypes.includes(record.record_type)) {
    return true;
  }

  return (
    includeEstimatedForecast &&
    selectedRecordTypes.includes("actual") &&
    record.record_type === "estimated" &&
    isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
  );
}

export function CostsReport() {
  const { records: allRecords, fiscalYears, loading, error } = useDashboardCostData();
  const [analysisMode, setAnalysisMode] = useState<ReportAnalysisMode>("time");
  const [source, setSource] = useState<"all" | "service" | "hardware">("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [costCenters, setCostCenters] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<string[]>([]);
  const [noteValues, setNoteValues] = useState<string[]>([]);
  const [recordTypes, setRecordTypes] = useState<string[]>(["actual"]);
  const [fiscalYearsFilter, setFiscalYearsFilter] = useState<number[]>([]);
  const [primaryDimension, setPrimaryDimension] =
    useState<DashboardCostDimension>("vendor");
  const [secondaryDimension, setSecondaryDimension] =
    useState<DashboardCostDimension>("category");
  const [includeEstimatedForecast, setIncludeEstimatedForecast] = useState(true);
  const [printGeneratedAt, setPrintGeneratedAt] = useState("");
  const [drilldown, setDrilldown] = useState<DrilldownState>({
    year: null,
    primaryKey: null,
    primaryLabel: null,
    secondaryKey: null,
    secondaryLabel: null,
  });

  const currentYear = new Date().getFullYear();
  const effectiveSecondaryDimension =
    secondaryDimension === primaryDimension
      ? primaryDimension === "category"
        ? "classification"
        : "category"
      : secondaryDimension;

  const categoryOptions = useMemo(
    () =>
      distinctCategoryNames(allRecords).map((value) => ({
        value,
        label: categoryDisplayName(value),
      })),
    [allRecords],
  );

  const classificationOptions = useMemo(() => {
    const labels = new Map<string, string>();
    allRecords.forEach((record) => {
      const key = record.classification ?? "";
      labels.set(
        key,
        classificationDisplayName(key, record.classification_name),
      );
    });
    return distinctClassifications(allRecords).map((value) => ({
      value,
      label: labels.get(value) ?? classificationDisplayName(value),
    }));
  }, [allRecords]);

  const subcategoryOptions = useMemo(
    () =>
      dimensionFilterOptions(allRecords, "subcategory").map((option) => ({
        value: option.key,
        label: option.label,
      })),
    [allRecords],
  );

  const vendorOptions = useMemo(
    () =>
      dimensionFilterOptions(allRecords, "vendor").map((option) => ({
        value: option.key,
        label: option.label,
      })),
    [allRecords],
  );

  const teamOptions = useMemo(
    () =>
      dimensionFilterOptions(allRecords, "team").map((option) => ({
        value: option.key,
        label: option.label,
      })),
    [allRecords],
  );

  const environmentOptions = useMemo(
    () =>
      dimensionFilterOptions(allRecords, "environment").map((option) => ({
        value: option.key,
        label: option.label,
      })),
    [allRecords],
  );

  const costCenterOptions = useMemo(
    () =>
      costCenterFilterOptions(allRecords).map((option) => ({
        value: option.key,
        label: option.label,
      })),
    [allRecords],
  );

  const baseFilteredRecords = useMemo(
    () =>
      filterCostRecords(allRecords, {
        categories,
        subcategories,
        classifications,
        vendors,
        teams,
        environments,
        costCenters,
        amounts,
        noteValues,
        fiscalYears: fiscalYearsFilter,
        source,
      }),
    [
      allRecords,
      amounts,
      categories,
      classifications,
      costCenters,
      environments,
      fiscalYearsFilter,
      noteValues,
      source,
      subcategories,
      teams,
      vendors,
    ],
  );

  const visualRecords = useMemo(
    () =>
      baseFilteredRecords.filter((record) =>
        recordIncludedInVisuals(
          record,
          recordTypes,
          includeEstimatedForecast,
          currentYear,
        ),
      ),
    [baseFilteredRecords, currentYear, includeEstimatedForecast, recordTypes],
  );

  const yearsInScope = useMemo(() => {
    const years = new Set(visualRecords.map((record) => record.fiscal_year));
    return Array.from(years).sort((left, right) => left - right);
  }, [visualRecords]);

  const totalSpend = useMemo(
    () => visualRecords.reduce((sum, record) => sum + record.amount, 0),
    [visualRecords],
  );

  const groupedDimensionRows = useMemo(
    () => totalsByDimension(visualRecords, primaryDimension),
    [primaryDimension, visualRecords],
  );

  const stackedGroups = useMemo(() => {
    if (analysisMode === "dimension") {
      return buildStackedDimensionData(
        visualRecords,
        primaryDimension,
        effectiveSecondaryDimension,
      );
    }

    return timeStackGroups(visualRecords, yearsInScope, effectiveSecondaryDimension);
  }, [
    analysisMode,
    effectiveSecondaryDimension,
    primaryDimension,
    visualRecords,
    yearsInScope,
  ]);

  const chartBars = useMemo(() => {
    if (analysisMode === "dimension") {
      return groupedDimensionRows.map((row) => ({
        label: row.label,
        value: row.total,
        color: dimensionColor(primaryDimension, row.key),
      }));
    }

    return yearsInScope.map((year) => ({
      label: String(year),
      value: visualRecords
        .filter((record) => record.fiscal_year === year)
        .reduce((sum, record) => sum + record.amount, 0),
      color: year === currentYear ? "#4f46e5" : "#c7d2fe",
    }));
  }, [analysisMode, currentYear, groupedDimensionRows, primaryDimension, visualRecords, yearsInScope]);

  const drilldownRecords = useMemo(() => {
    return visualRecords.filter((record) => {
      if (drilldown.year != null && record.fiscal_year !== drilldown.year) {
        return false;
      }

      if (analysisMode === "dimension" && drilldown.primaryKey != null) {
        if (!recordMatchesDimensionKey(record, primaryDimension, drilldown.primaryKey)) {
          return false;
        }
      }

      if (drilldown.secondaryKey != null) {
        if (
          !recordMatchesDimensionKey(
            record,
            effectiveSecondaryDimension,
            drilldown.secondaryKey,
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    analysisMode,
    drilldown.primaryKey,
    drilldown.secondaryKey,
    drilldown.year,
    effectiveSecondaryDimension,
    primaryDimension,
    visualRecords,
  ]);

  const detailRows = useMemo<DetailRow[]>(
    () =>
      drilldownRecords
        .slice()
        .sort(
          (left, right) =>
            right.fiscal_year - left.fiscal_year ||
            right.amount - left.amount ||
            left.service_name.localeCompare(right.service_name),
        )
        .map((record) => ({
          ...record,
          id: record.cost_record_id,
        })),
    [drilldownRecords],
  );

  function resetFilters() {
    setSource("all");
    setCategories([]);
    setSubcategories([]);
    setClassifications([]);
    setVendors([]);
    setTeams([]);
    setEnvironments([]);
    setCostCenters([]);
    setAmounts([]);
    setNoteValues([]);
    setRecordTypes(["actual"]);
    setFiscalYearsFilter([]);
    setPrimaryDimension("vendor");
    setSecondaryDimension("category");
    setIncludeEstimatedForecast(true);
    setDrilldown({
      year: null,
      primaryKey: null,
      primaryLabel: null,
      secondaryKey: null,
      secondaryLabel: null,
    });
  }

  function clearDrilldown() {
    setDrilldown({
      year: null,
      primaryKey: null,
      primaryLabel: null,
      secondaryKey: null,
      secondaryLabel: null,
    });
  }

  const handleQuickFilter = useCallback((
    dimension: DashboardCostDimension | "fiscal_year" | "record_type" | "amount" | "notes",
    key: string,
  ) => {
    clearDrilldown();
    if (dimension === "fiscal_year") {
      setFiscalYearsFilter([Number.parseInt(key, 10)]);
      return;
    }
    if (dimension === "category") {
      setCategories([key]);
      return;
    }
    if (dimension === "subcategory") {
      setSubcategories([key]);
      return;
    }
    if (dimension === "classification") {
      setClassifications([key]);
      return;
    }
    if (dimension === "vendor") {
      setVendors([key]);
      return;
    }
    if (dimension === "team") {
      setTeams([key]);
      return;
    }
    if (dimension === "environment") {
      setEnvironments([key]);
      return;
    }
    if (dimension === "cost_center") {
      setCostCenters([key]);
      return;
    }
    if (dimension === "record_type") {
      setRecordTypes([key]);
      return;
    }
    if (dimension === "amount") {
      setAmounts([key]);
      return;
    }
    if (dimension === "notes") {
      setNoteValues([key]);
      return;
    }
    setSource(key as "service" | "hardware");
  }, []);

  function handleDownloadCsv() {
    const headers = [
      "Source",
      "Name",
      "Vendor",
      "Category",
      "Subcategory",
      "Classification",
      "Team",
      "Environment",
      "Cost center",
      "Fiscal year",
      "Amount",
      "Record type",
      "Notes",
    ];
    const rows = detailRows.map((row) => [
      sourceDisplayName(row.source),
      row.service_name,
      vendorDisplayName(row.vendor_name ?? ""),
      categoryDisplayName(row.category_name ?? ""),
      subcategoryDisplayName(row.subcategory_name ?? ""),
      classificationDisplayName(row.classification ?? "", row.classification_name),
      row.team_names.length > 0
        ? row.team_names.map((team) => teamDisplayName(team)).join(", ")
        : teamDisplayName(""),
      environmentDisplayName(row.environment_name ?? ""),
      row.cost_center_name ?? (row.source === "hardware" ? "Hardware (assets)" : "(No cost center)"),
      String(row.fiscal_year),
      String(row.amount),
      formatRecordType(row.record_type),
      row.notes ?? "",
    ]);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`catalogit-cost-report-${date}.csv`, buildCsv(headers, rows));
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

  const detailColumns = useMemo<Column<DetailRow>[]>(
    () => [
      {
        key: "service_name",
        header: "Name",
        render: (row) => {
          const href =
            row.source === "service" && row.service_id
              ? `/services/${row.service_id}`
              : row.laptop_id
                ? `/hardware/${row.laptop_id}`
                : null;

          return href ? (
            <Link
              to={href}
              className="text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
            >
              {row.service_name}
            </Link>
          ) : (
            row.service_name
          );
        },
      },
      {
        key: "source",
        header: "Source",
        render: (row) => (
          <QuickFilterButton
            label={sourceDisplayName(row.source)}
            onClick={() => handleQuickFilter("source", row.source)}
          />
        ),
      },
      {
        key: "vendor_name",
        header: "Vendor",
        render: (row) =>
          row.vendor_name ? (
            <QuickFilterButton
              label={vendorDisplayName(row.vendor_name)}
              onClick={() => handleQuickFilter("vendor", row.vendor_name ?? "")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "category_name",
        header: "Category",
        render: (row) => (
          <QuickFilterButton
            label={categoryDisplayName(row.category_name ?? "")}
            onClick={() => handleQuickFilter("category", row.category_name ?? "")}
          />
        ),
      },
      {
        key: "subcategory_name",
        header: "Subcategory",
        render: (row) =>
          row.subcategory_name?.trim() ? (
            <QuickFilterButton
              label={subcategoryDisplayName(row.subcategory_name)}
              onClick={() => handleQuickFilter("subcategory", row.subcategory_name ?? "")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "classification",
        header: "Classification",
        render: (row) => (
          <QuickFilterButton
            label={classificationDisplayName(row.classification ?? "", row.classification_name)}
            onClick={() => handleQuickFilter("classification", row.classification ?? "")}
          />
        ),
      },
      {
        key: "cost_center_name",
        header: "Cost Center",
        render: (row) => {
          const key =
            row.source === "hardware" ? "__hw__" : (row.cost_center_name ?? "");
          const label =
            row.source === "hardware"
              ? "Hardware (assets)"
              : row.cost_center_name || "(No cost center)";
          return (
            <QuickFilterButton
              label={label}
              onClick={() => handleQuickFilter("cost_center", key)}
            />
          );
        },
      },
      {
        key: "team_name",
        header: "Team",
        render: (row) =>
          row.team_names.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {row.team_names.map((teamName) => (
                <QuickFilterButton
                  key={teamName}
                  label={teamDisplayName(teamName)}
                  onClick={() => handleQuickFilter("team", teamName)}
                />
              ))}
            </div>
          ) : (
            "—"
          ),
      },
      {
        key: "environment_name",
        header: "Environment",
        render: (row) =>
          row.environment_name?.trim() ? (
            <QuickFilterButton
              label={environmentDisplayName(row.environment_name)}
              onClick={() => handleQuickFilter("environment", row.environment_name ?? "")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "fiscal_year",
        header: "Year",
        render: (row) => (
          <QuickFilterButton
            label={String(row.fiscal_year)}
            onClick={() => handleQuickFilter("fiscal_year", String(row.fiscal_year))}
          />
        ),
      },
      {
        key: "amount",
        header: "Amount",
        render: (row) => (
          <QuickFilterButton
            label={fmtFull(row.amount)}
            onClick={() => handleQuickFilter("amount", String(row.amount))}
          />
        ),
      },
      {
        key: "record_type",
        header: "Type",
        render: (row) => (
          <QuickFilterButton
            label={formatRecordType(row.record_type)}
            onClick={() => handleQuickFilter("record_type", row.record_type)}
          />
        ),
      },
      {
        key: "notes",
        header: "Notes",
        render: (row) =>
          row.notes?.trim() ? (
            <QuickFilterButton
              label={row.notes}
              onClick={() => handleQuickFilter("notes", row.notes?.trim() ?? "")}
            />
          ) : (
            "—"
          ),
      },
    ],
    [handleQuickFilter],
  );

  const activeFilterSummary = [
    categories.length > 0 ? `${categories.length} categories` : null,
    subcategories.length > 0 ? `${subcategories.length} subcategories` : null,
    classifications.length > 0 ? `${classifications.length} classifications` : null,
    vendors.length > 0 ? `${vendors.length} vendors` : null,
    teams.length > 0 ? `${teams.length} teams` : null,
    environments.length > 0 ? `${environments.length} environments` : null,
    costCenters.length > 0 ? `${costCenters.length} cost centers` : null,
    amounts.length > 0 ? `${amounts.length} amounts` : null,
    noteValues.length > 0 ? `${noteValues.length} notes` : null,
    fiscalYearsFilter.length > 0 ? `${fiscalYearsFilter.length} years` : null,
    source !== "all" ? sourceDisplayName(source) : null,
    recordTypes.length > 0 ? recordTypes.map(formatRecordType).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const drilldownSummary = [
    drilldown.year != null ? `Year ${drilldown.year}` : null,
    drilldown.primaryLabel,
    drilldown.secondaryLabel,
  ]
    .filter(Boolean)
    .join(" • ");

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Cost Report
        </h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Cost Report
        </h1>
        <p className="mt-4 text-sm text-red-600">
          Could not load cost data. Try again later.
        </p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="costs-report costs-report-print space-y-6 text-gray-900 dark:text-gray-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Cost Report
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Explore spend by year or by business dimension, then drill into the exact records behind each aggregate.
            </p>
            {printGeneratedAt && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Print generated {printGeneratedAt}
              </p>
            )}
          </div>
          <div className="print:hidden flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={detailRows.length === 0}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Print
            </button>
          </div>
        </div>

        <div className="print:hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Filters & Analysis
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Click chart bars, stack segments, or table cells below to isolate a value quickly.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearDrilldown}
                disabled={!drilldownSummary}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Clear drilldown
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Reset all
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Analysis mode
              </label>
              <select
                value={analysisMode}
                onChange={(e) => setAnalysisMode(e.target.value as ReportAnalysisMode)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="time">Time series</option>
                <option value="dimension">Dimension ranking</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as "all" | "service" | "hardware")}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">All</option>
                <option value="service">Software</option>
                <option value="hardware">Hardware</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Primary dimension
              </label>
              <select
                value={primaryDimension}
                onChange={(e) => setPrimaryDimension(e.target.value as DashboardCostDimension)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                disabled={analysisMode !== "dimension"}
              >
                {REPORT_DIMENSIONS.map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {DASHBOARD_COST_DIMENSION_LABEL[dimension]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Breakdown dimension
              </label>
              <select
                value={effectiveSecondaryDimension}
                onChange={(e) => setSecondaryDimension(e.target.value as DashboardCostDimension)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                {REPORT_DIMENSIONS.filter((dimension) => dimension !== primaryDimension).map(
                  (dimension) => (
                    <option key={dimension} value={dimension}>
                      {DASHBOARD_COST_DIMENSION_LABEL[dimension]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <MultiStringSelect
              id="record-types"
              label="Record types"
              options={RECORD_TYPE_OPTIONS}
              values={recordTypes}
              onChange={(next) => setRecordTypes(next.length > 0 ? next : ["actual"])}
              hint="Choose the rows that feed the charts and drilldowns."
            />
            <MultiStringSelect
              id="categories"
              label="Categories"
              options={categoryOptions}
              values={categories}
              onChange={setCategories}
            />
            <MultiStringSelect
              id="subcategories"
              label="Subcategories"
              options={subcategoryOptions}
              values={subcategories}
              onChange={setSubcategories}
            />
            <MultiStringSelect
              id="classifications"
              label="Classifications"
              options={classificationOptions}
              values={classifications}
              onChange={setClassifications}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <MultiStringSelect
              id="vendors"
              label="Vendors"
              options={vendorOptions}
              values={vendors}
              onChange={setVendors}
            />
            <MultiStringSelect
              id="teams"
              label="Teams"
              options={teamOptions}
              values={teams}
              onChange={setTeams}
            />
            <MultiStringSelect
              id="environments"
              label="Environments"
              options={environmentOptions}
              values={environments}
              onChange={setEnvironments}
            />
            <MultiStringSelect
              id="cost-centers"
              label="Cost centers"
              options={costCenterOptions}
              values={costCenters}
              onChange={setCostCenters}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <MultiYearSelect
              years={fiscalYears.length > 0 ? fiscalYears : yearsInScope}
              values={fiscalYearsFilter}
              onChange={setFiscalYearsFilter}
            />
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950">
              <input
                type="checkbox"
                checked={includeEstimatedForecast}
                onChange={(e) => setIncludeEstimatedForecast(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Forecast future actuals with estimated rows
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  When Actual is selected, include estimated records for the current and future fiscal years in charts and drilldowns.
                </span>
              </span>
            </label>
          </div>

          {(activeFilterSummary || drilldownSummary) && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              {activeFilterSummary && (
                <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                  Filters: {activeFilterSummary}
                </span>
              )}
              {drilldownSummary && (
                <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  Drilldown: {drilldownSummary}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Spend in Scope"
            value={fmtFull(totalSpend)}
            subtext={`${visualRecords.length} records included`}
          />
          <SummaryCard
            label="Drilldown Rows"
            value={String(detailRows.length)}
            subtext={drilldownSummary || "No chart drilldown applied"}
          />
          <SummaryCard
            label="Coverage"
            value={
              yearsInScope.length > 0
                ? `${yearsInScope[0]}-${yearsInScope[yearsInScope.length - 1]}`
                : "—"
            }
            subtext={
              analysisMode === "dimension"
                ? `Ranking by ${DASHBOARD_COST_DIMENSION_LABEL[primaryDimension].toLowerCase()}`
                : `Stacked by ${DASHBOARD_COST_DIMENSION_LABEL[effectiveSecondaryDimension].toLowerCase()}`
            }
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {analysisMode === "dimension"
                ? `Spend by ${DASHBOARD_COST_DIMENSION_LABEL[primaryDimension]}`
                : "Spend by fiscal year"}
            </h2>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Click a bar to drill into the records behind that total.
            </p>
            <BarChart
              data={chartBars}
              onBarClick={(index) => {
                if (analysisMode === "dimension") {
                  const row = groupedDimensionRows[index];
                  if (!row) return;
                  setDrilldown({
                    year: null,
                    primaryKey: row.key,
                    primaryLabel: row.label,
                    secondaryKey: null,
                    secondaryLabel: null,
                  });
                  return;
                }

                const year = yearsInScope[index];
                if (year == null) return;
                setDrilldown({
                  year,
                  primaryKey: null,
                  primaryLabel: null,
                  secondaryKey: null,
                  secondaryLabel: null,
                });
              }}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {analysisMode === "dimension"
                ? `${DASHBOARD_COST_DIMENSION_LABEL[primaryDimension]} split by ${DASHBOARD_COST_DIMENSION_LABEL[effectiveSecondaryDimension]}`
                : `Fiscal year split by ${DASHBOARD_COST_DIMENSION_LABEL[effectiveSecondaryDimension]}`}
            </h2>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Click a stack to drill into a group, or click a segment to isolate a specific slice.
            </p>
            <StackedBar
              groups={stackedGroups}
              onGroupClick={(group) => {
                if (analysisMode === "dimension") {
                  setDrilldown({
                    year: null,
                    primaryKey: group.key,
                    primaryLabel: group.label,
                    secondaryKey: null,
                    secondaryLabel: null,
                  });
                  return;
                }

                setDrilldown({
                  year: Number.parseInt(group.key, 10),
                  primaryKey: null,
                  primaryLabel: null,
                  secondaryKey: null,
                  secondaryLabel: null,
                });
              }}
              onSliceClick={(group, slice) => {
                if (analysisMode === "dimension") {
                  setDrilldown({
                    year: null,
                    primaryKey: group.key,
                    primaryLabel: group.label,
                    secondaryKey: slice.id,
                    secondaryLabel: slice.name,
                  });
                  return;
                }

                setDrilldown({
                  year: Number.parseInt(group.key, 10),
                  primaryKey: null,
                  primaryLabel: null,
                  secondaryKey: slice.id,
                  secondaryLabel: slice.name,
                });
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Underlying Records
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use the clickable values in the table to isolate dimensions, record type, notes, amount, source, or year instantly.
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {detailRows.length} rows
            </p>
          </div>
          <div className="mt-4">
            <DataTable columns={detailColumns} data={detailRows} primaryColumnKey="service_name" />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
