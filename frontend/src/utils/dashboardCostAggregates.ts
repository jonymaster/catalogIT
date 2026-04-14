import type {
  CostSourceFilter,
  DashboardCostRecord,
} from "../types/dashboardCost";

const CATEGORY_COLORS: Record<string, string> = {};
const PALETTE = [
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#f97316",
  "#14b8a6",
];

export function getCategoryColor(name: string): string {
  if (!CATEGORY_COLORS[name]) {
    CATEGORY_COLORS[name] =
      PALETTE[Object.keys(CATEGORY_COLORS).length % PALETTE.length];
  }
  return CATEGORY_COLORS[name];
}

export function classificationBarColor(slug: string | null): string {
  if (slug === "core_saas") return "#7c3aed";
  if (slug === "subscription") return "#3b82f6";
  if (slug === "internal") return "#0d9488";
  if (slug === "hardware") return "#78716c";
  return "#64748b";
}

export const fmtFull = (n: number) => `$${n.toLocaleString()}`;

export const COMBINED_RECORD_TYPES = ["actual", "estimated"] as const;

export function isCurrentOrFutureFiscalYear(
  fiscalYear: number,
  currentYear = new Date().getFullYear(),
): boolean {
  return fiscalYear >= currentYear;
}

export function totalByYear(
  records: DashboardCostRecord[],
  years: number[],
): Record<number, number> {
  const m: Record<number, number> = {};
  years.forEach((y) => {
    m[y] = 0;
  });
  records.forEach((r) => {
    m[r.fiscal_year] = (m[r.fiscal_year] ?? 0) + r.amount;
  });
  return m;
}

export function combinedActualEstimatedByYear(
  records: DashboardCostRecord[],
  years: number[],
  currentYear = new Date().getFullYear(),
): Record<number, number> {
  const totals: Record<number, number> = {};
  years.forEach((year) => {
    totals[year] = 0;
  });
  records.forEach((record) => {
    if (
      COMBINED_RECORD_TYPES.includes(
        record.record_type as (typeof COMBINED_RECORD_TYPES)[number],
      ) &&
      isCurrentOrFutureFiscalYear(record.fiscal_year, currentYear)
    ) {
      totals[record.fiscal_year] = (totals[record.fiscal_year] ?? 0) + record.amount;
    }
  });
  return totals;
}

export function visualAmountForRecordTypeAndYear(
  recordType: string,
  fiscalYear: number,
  baseAmount: number,
  combinedActualEstimatedAmount: number,
  currentYear = new Date().getFullYear(),
): number {
  if (
    COMBINED_RECORD_TYPES.includes(
      recordType as (typeof COMBINED_RECORD_TYPES)[number],
    ) &&
    isCurrentOrFutureFiscalYear(fiscalYear, currentYear)
  ) {
    return combinedActualEstimatedAmount;
  }
  return baseAmount;
}

export function yoyPercent(
  costByYear: Record<number, number>,
  year: number,
): number {
  const prev = year - 1;
  const cur = costByYear[year] ?? 0;
  const prevAmt = costByYear[prev] ?? 0;
  return prevAmt > 0 ? ((cur - prevAmt) / prevAmt) * 100 : 0;
}

export function distinctSorted(values: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  values.forEach((v) => s.add(v ?? ""));
  return Array.from(s).sort();
}

export function categoryDisplayName(raw: string): string {
  return raw === "" ? "(Uncategorized)" : raw;
}

export function distinctCategoryNames(records: DashboardCostRecord[]): string[] {
  return distinctSorted(records.map((r) => r.category_name));
}

export function distinctClassifications(
  records: DashboardCostRecord[],
): string[] {
  return distinctSorted(records.map((r) => r.classification));
}

export interface StackedYearDatum {
  year: number;
  cats: { id: string; name: string; value: number; color: string }[];
}

export function buildStackedYearData(
  records: DashboardCostRecord[],
  years: number[],
  categoryNames: string[],
): StackedYearDatum[] {
  return years.map((yr) => ({
    year: yr,
    cats: categoryNames
      .map((name) => ({
        id: name,
        name: categoryDisplayName(name),
        value: records
          .filter(
            (r) =>
              r.fiscal_year === yr &&
              (r.category_name ?? "") === (name === "" ? "" : name),
          )
          .reduce((s, r) => s + r.amount, 0),
        color: getCategoryColor(name || "(Uncategorized)"),
      }))
      .filter((c) => c.value > 0),
  }));
}

export interface TopSpenderRow {
  name: string;
  classification: string | null;
  cost: number;
}

export function topSpendersForYear(
  records: DashboardCostRecord[],
  fiscalYear: number,
  limit = 12,
): TopSpenderRow[] {
  const byKey: Record<
    string,
    { name: string; classification: string | null; cost: number }
  > = {};
  records
    .filter((r) => r.fiscal_year === fiscalYear)
    .forEach((r) => {
      const k =
        r.source === "hardware" && r.laptop_id
          ? `h:${r.laptop_id}`
          : r.service_id
            ? `s:${r.service_id}`
            : "";
      if (!k) return;
      if (!byKey[k]) {
        byKey[k] = {
          name: r.service_name,
          classification: r.classification,
          cost: 0,
        };
      }
      byKey[k].cost += r.amount;
    });
  return Object.values(byKey)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

export interface CategoryYearRow {
  name: string;
  byYr: Record<number, number>;
}

export function costByCategoryRows(
  records: DashboardCostRecord[],
  years: number[],
  categoryNames: string[],
): CategoryYearRow[] {
  return categoryNames.map((name) => {
    const byYr: Record<number, number> = {};
    years.forEach((y) => {
      byYr[y] = 0;
    });
    records
      .filter((r) => (r.category_name ?? "") === name)
      .forEach((r) => {
        byYr[r.fiscal_year] = (byYr[r.fiscal_year] ?? 0) + r.amount;
      });
    return { name, byYr };
  });
}

/** Cost center filter key for hardware rows (not a real cost center name). */
export const COST_CENTER_HARDWARE_KEY = "__hw__";

export interface CostFilterState {
  /** Internal keys: "" means uncategorized */
  categories: string[];
  source: CostSourceFilter;
  classifications: string[];
  /** Include only rows whose record_type is in this list (one or two types). */
  comparisonRecordTypes: readonly string[];
  costCenters: string[];
  /** Empty = all years present in `records` baseline (caller passes allowed years) */
  fiscalYears: number[];
}

/** Baseline records before fiscal year chart filter (e.g. full dataset for option lists). */
export function filterCostRecords(
  records: DashboardCostRecord[],
  f: CostFilterState,
): DashboardCostRecord[] {
  return records.filter((r) => {
    if (f.source === "service" && r.source !== "service") return false;
    if (f.source === "hardware" && r.source !== "hardware") return false;

    if (f.categories.length > 0) {
      const key = r.category_name ?? "";
      if (!f.categories.includes(key)) return false;
    }

    if (f.classifications.length > 0) {
      const key = r.classification ?? "";
      if (!f.classifications.includes(key)) return false;
    }

    const allowedTypes = new Set(f.comparisonRecordTypes);
    if (!allowedTypes.has(r.record_type)) {
      return false;
    }

    if (f.costCenters.length > 0) {
      if (r.source === "hardware") {
        if (!f.costCenters.includes(COST_CENTER_HARDWARE_KEY)) return false;
      } else {
        const key = r.cost_center_name ?? "";
        if (!f.costCenters.includes(key)) return false;
      }
    }

    if (f.fiscalYears.length > 0 && !f.fiscalYears.includes(r.fiscal_year)) {
      return false;
    }

    return true;
  });
}

/** Apply filters except fiscal year (for building year-axis options from full data). */
export function costCenterFilterOptions(
  records: DashboardCostRecord[],
): { key: string; label: string }[] {
  const serviceKeys = distinctSorted(
    records.filter((r) => r.source === "service").map((r) => r.cost_center_name),
  );
  const opts: { key: string; label: string }[] = serviceKeys.map((key) => ({
    key,
    label: key === "" ? "(No cost center)" : key,
  }));
  if (records.some((r) => r.source === "hardware")) {
    opts.push({
      key: COST_CENTER_HARDWARE_KEY,
      label: "Hardware (assets)",
    });
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label));
}

export function sumForYearAndClassification(
  records: DashboardCostRecord[],
  fiscalYear: number,
  classification: string | null,
): number {
  return records
    .filter(
      (r) =>
        r.fiscal_year === fiscalYear && r.classification === classification,
    )
    .reduce((s, r) => s + r.amount, 0);
}

export function totalsByYearSplit(
  records: DashboardCostRecord[],
  years: number[],
): { software: Record<number, number>; hardware: Record<number, number> } {
  const software: Record<number, number> = {};
  const hardware: Record<number, number> = {};
  years.forEach((y) => {
    software[y] = 0;
    hardware[y] = 0;
  });
  records.forEach((r) => {
    if (r.source === "hardware") {
      hardware[r.fiscal_year] = (hardware[r.fiscal_year] ?? 0) + r.amount;
    } else {
      software[r.fiscal_year] = (software[r.fiscal_year] ?? 0) + r.amount;
    }
  });
  return { software, hardware };
}
