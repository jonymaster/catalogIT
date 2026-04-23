import type {
  CostSourceFilter,
  DashboardCostDimension,
  DashboardCostRecord,
} from "../types/dashboardCost";

const CATEGORY_COLORS: Record<string, string> = {};
const PALETTE = [
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#4b63d6",
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

export function subcategoryDisplayName(raw: string): string {
  return raw === "" ? "(No subcategory)" : raw;
}

export function vendorDisplayName(raw: string): string {
  return raw === "" ? "(No vendor)" : raw;
}

export function teamDisplayName(raw: string): string {
  return raw === "" ? "(No team)" : raw;
}

export function environmentDisplayName(raw: string): string {
  return raw === "" ? "(No environment)" : raw;
}

export function sourceDisplayName(raw: CostSourceFilter | DashboardCostRecord["source"]): string {
  if (raw === "service") return "Software";
  if (raw === "hardware") return "Hardware";
  return "All";
}

export function classificationDisplayName(
  slug: string,
  name?: string | null,
): string {
  if (name && name.trim().length > 0) return name;
  if (slug === "") return "(None)";
  if (slug === "core_saas") return "Core SaaS";
  if (slug === "subscription") return "Subscription";
  if (slug === "internal") return "Internal";
  if (slug === "hardware") return "Hardware";
  return slug;
}

export function distinctCategoryNames(records: DashboardCostRecord[]): string[] {
  return distinctSorted(records.map((r) => r.category_name));
}

export function distinctClassifications(
  records: DashboardCostRecord[],
): string[] {
  return distinctSorted(records.map((r) => r.classification));
}

export interface DimensionValue {
  key: string;
  label: string;
}

function teamDimensionValues(record: DashboardCostRecord): DimensionValue[] {
  // Team analysis is inclusive: a multi-department record contributes to each team bucket.
  const teamNames = Array.from(
    new Set(
      (record.team_names ?? [])
        .map((team) => team.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  if (teamNames.length === 0) {
    return [{
      key: "",
      label: teamDisplayName(""),
    }];
  }

  return teamNames.map((teamName) => ({
    key: teamName,
    label: teamDisplayName(teamName),
  }));
}

export function costCenterDimensionValue(
  record: DashboardCostRecord,
): DimensionValue {
  if (record.source === "hardware") {
    return {
      key: COST_CENTER_HARDWARE_KEY,
      label: "Hardware (assets)",
    };
  }

  return {
    key: record.cost_center_name ?? "",
    label: record.cost_center_name ?? "(No cost center)",
  };
}

export function dimensionValuesForRecord(
  record: DashboardCostRecord,
  dimension: DashboardCostDimension,
): DimensionValue[] {
  switch (dimension) {
    case "category":
      return [{
        key: record.category_name ?? "",
        label: categoryDisplayName(record.category_name ?? ""),
      }];
    case "subcategory":
      return [{
        key: record.subcategory_name ?? "",
        label: subcategoryDisplayName(record.subcategory_name ?? ""),
      }];
    case "classification":
      return [{
        key: record.classification ?? "",
        label: classificationDisplayName(
          record.classification ?? "",
          record.classification_name,
        ),
      }];
    case "vendor":
      return [{
        key: record.vendor_name ?? "",
        label: vendorDisplayName(record.vendor_name ?? ""),
      }];
    case "team":
      return teamDimensionValues(record);
    case "environment":
      return [{
        key: record.environment_name ?? "",
        label: environmentDisplayName(record.environment_name ?? ""),
      }];
    case "cost_center":
      return [costCenterDimensionValue(record)];
    case "source":
      return [{
        key: record.source,
        label: sourceDisplayName(record.source),
      }];
  }
}

export function dimensionValueForRecord(
  record: DashboardCostRecord,
  dimension: DashboardCostDimension,
): DimensionValue {
  return dimensionValuesForRecord(record, dimension)[0];
}

export function recordMatchesDimensionKey(
  record: DashboardCostRecord,
  dimension: DashboardCostDimension,
  key: string,
): boolean {
  return dimensionValuesForRecord(record, dimension).some((value) => value.key === key);
}

export function dimensionFilterOptions(
  records: DashboardCostRecord[],
  dimension: DashboardCostDimension,
): { key: string; label: string }[] {
  const options = new Map<string, string>();
  records.forEach((record) => {
    dimensionValuesForRecord(record, dimension).forEach(({ key, label }) => {
      options.set(key, label);
    });
  });

  return Array.from(options.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function dimensionColor(
  dimension: DashboardCostDimension,
  key: string,
): string {
  if (dimension === "classification") {
    return classificationBarColor(key || null);
  }

  return getCategoryColor(`${dimension}:${key || "__none__"}`);
}

export interface DimensionTotalRow {
  key: string;
  label: string;
  total: number;
}

export function totalsByDimension(
  records: DashboardCostRecord[],
  dimension: DashboardCostDimension,
): DimensionTotalRow[] {
  const grouped = new Map<string, DimensionTotalRow>();

  records.forEach((record) => {
    dimensionValuesForRecord(record, dimension).forEach(({ key, label }) => {
      const existing = grouped.get(key);
      if (existing) {
        existing.total += record.amount;
        return;
      }

      grouped.set(key, {
        key,
        label,
        total: record.amount,
      });
    });
  });

  return Array.from(grouped.values()).sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label),
  );
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

export interface CostFilterCriteria {
  /** Internal keys: "" means uncategorized */
  categories?: readonly string[];
  subcategories?: readonly string[];
  source?: CostSourceFilter;
  classifications?: readonly string[];
  /** Include only rows whose record_type is in this list (one or two types). */
  recordTypes?: readonly string[];
  costCenters?: readonly string[];
  vendors?: readonly string[];
  teams?: readonly string[];
  environments?: readonly string[];
  amounts?: readonly string[];
  noteValues?: readonly string[];
  /** Empty = all years present in `records` baseline (caller passes allowed years) */
  fiscalYears?: readonly number[];
}

/** Baseline records before fiscal year chart filter (e.g. full dataset for option lists). */
export function filterCostRecords(
  records: DashboardCostRecord[],
  f: CostFilterCriteria,
): DashboardCostRecord[] {
  return records.filter((r) => {
    if (f.source === "service" && r.source !== "service") return false;
    if (f.source === "hardware" && r.source !== "hardware") return false;

    if ((f.categories?.length ?? 0) > 0) {
      const key = r.category_name ?? "";
      if (!f.categories?.includes(key)) return false;
    }

    if ((f.classifications?.length ?? 0) > 0) {
      const key = r.classification ?? "";
      if (!f.classifications?.includes(key)) return false;
    }

    if ((f.subcategories?.length ?? 0) > 0) {
      const key = r.subcategory_name ?? "";
      if (!f.subcategories?.includes(key)) return false;
    }

    if ((f.recordTypes?.length ?? 0) > 0) {
      const allowedTypes = new Set(f.recordTypes);
      if (!allowedTypes.has(r.record_type)) {
        return false;
      }
    }

    if ((f.vendors?.length ?? 0) > 0) {
      const key = r.vendor_name ?? "";
      if (!f.vendors?.includes(key)) {
        return false;
      }
    }

    if ((f.teams?.length ?? 0) > 0) {
      if (!f.teams?.some((team) => recordMatchesDimensionKey(r, "team", team))) {
        return false;
      }
    }

    if ((f.environments?.length ?? 0) > 0) {
      const key = r.environment_name ?? "";
      if (!f.environments?.includes(key)) {
        return false;
      }
    }

    if ((f.costCenters?.length ?? 0) > 0) {
      const { key } = costCenterDimensionValue(r);
      if (!f.costCenters?.includes(key)) return false;
    }

    if ((f.amounts?.length ?? 0) > 0) {
      const key = String(r.amount);
      if (!f.amounts?.includes(key)) {
        return false;
      }
    }

    if ((f.noteValues?.length ?? 0) > 0) {
      const key = r.notes?.trim() ?? "";
      if (!f.noteValues?.includes(key)) {
        return false;
      }
    }

    if ((f.fiscalYears?.length ?? 0) > 0 && !f.fiscalYears?.includes(r.fiscal_year)) {
      return false;
    }

    return true;
  });
}

/** Apply filters except fiscal year (for building year-axis options from full data). */
export function costCenterFilterOptions(
  records: DashboardCostRecord[],
): { key: string; label: string }[] {
  return dimensionFilterOptions(records, "cost_center");
}

export interface StackedDimensionDatum {
  key: string;
  label: string;
  total: number;
  cats: { id: string; name: string; value: number; color: string }[];
}

export function buildStackedDimensionData(
  records: DashboardCostRecord[],
  primaryDimension: DashboardCostDimension,
  secondaryDimension: DashboardCostDimension,
): StackedDimensionDatum[] {
  const primaryMap = new Map<
    string,
    {
      key: string;
      label: string;
      total: number;
      slices: Map<string, { id: string; name: string; value: number; color: string }>;
    }
  >();

  records.forEach((record) => {
    const primaryValues = dimensionValuesForRecord(record, primaryDimension);
    const secondaryValues = dimensionValuesForRecord(record, secondaryDimension);

    primaryValues.forEach((primary) => {
      let primaryEntry = primaryMap.get(primary.key);
      if (!primaryEntry) {
        primaryEntry = {
          key: primary.key,
          label: primary.label,
          total: 0,
          slices: new Map(),
        };
        primaryMap.set(primary.key, primaryEntry);
      }

      primaryEntry.total += record.amount;

      secondaryValues.forEach((secondary) => {
        const slice = primaryEntry.slices.get(secondary.key);
        if (slice) {
          slice.value += record.amount;
          return;
        }

        primaryEntry.slices.set(secondary.key, {
          id: secondary.key,
          name: secondary.label,
          value: record.amount,
          color: dimensionColor(secondaryDimension, secondary.key),
        });
      });
    });
  });

  return Array.from(primaryMap.values())
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      total: entry.total,
      cats: Array.from(entry.slices.values()).sort(
        (a, b) => b.value - a.value || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
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
