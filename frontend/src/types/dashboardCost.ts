export type DashboardCostSource = "service" | "hardware";
export type DashboardCostDimension =
  | "category"
  | "classification"
  | "vendor"
  | "cost_center"
  | "source";

/** Mirrors GET /api/dashboard/ cost_records rows. */
export interface DashboardCostRecord {
  cost_record_id: string;
  source: DashboardCostSource;
  service_id: string | null;
  laptop_id: string | null;
  service_name: string;
  purchase_year: number | null;
  vendor_id: string | null;
  vendor_name: string | null;
  category_id: string | null;
  classification: string | null;
  classification_id: string | null;
  classification_name: string | null;
  category_name: string | null;
  cost_center_id: string | null;
  cost_center_name: string | null;
  fiscal_year: number;
  amount: number;
  record_type: string;
  notes: string | null;
}

export interface DashboardCostPayload {
  cost_records: DashboardCostRecord[];
  fiscal_years: number[];
}

export const DASHBOARD_COST_DIMENSION_LABEL: Record<
  DashboardCostDimension,
  string
> = {
  category: "Category",
  classification: "Classification",
  vendor: "Vendor",
  cost_center: "Cost center",
  source: "Source",
};

export type ReportAnalysisMode = "time" | "dimension";

export type CostSourceFilter = "all" | "service" | "hardware";

/** Cost record type (actual / estimated / budget). */
export type CostRecordTypeChoice = "actual" | "estimated" | "budget";

/** Report layout: single-type (only actual) or pairwise comparison. */
export type ComparisonMode =
  | "only_actual"
  | "actual_vs_estimated"
  | "actual_vs_budget"
  | "estimated_vs_budget";

/** Record types included for the current mode (one or two). */
export function comparisonRecordTypesForMode(
  mode: ComparisonMode,
): readonly CostRecordTypeChoice[] {
  switch (mode) {
    case "only_actual":
      return ["actual"];
    case "actual_vs_estimated":
      return ["actual", "estimated"];
    case "actual_vs_budget":
      return ["actual", "budget"];
    case "estimated_vs_budget":
      return ["estimated", "budget"];
  }
}

export const COMPARISON_MODE_LABEL: Record<ComparisonMode, string> = {
  only_actual: "Only Actual",
  actual_vs_estimated: "Actual vs Estimated",
  actual_vs_budget: "Actual vs Budget",
  estimated_vs_budget: "Estimated vs Budget",
};
