/** Types for the close-financial-year API (`/api/cost-records/close-year`). */

export const FISCAL_YEAR_CLOSE_API = "/api/cost-records/close-year";

export type ConversionFlag = "estimate_with_actual";
export type NextYearFlag = "added_during_year" | "mixed_payment_methods";
export type NextYearSkipReason = "next_year_exists" | "zero_amount";
export type SkippedServiceReason = "archived";

export interface FiscalYearClosePreviewRequest {
  fiscal_year: number;
  uplift_pct?: number;
}

export interface FiscalYearCloseConversion {
  record_id: string;
  amount: number;
  include: boolean;
  /** Known values are {@link ConversionFlag}; unknown values are shown as-is. */
  flags: string[];
  notes: string | null;
  payment_method_id: string | null;
}

export interface FiscalYearCloseNextYear {
  action: "create" | "skip";
  /** Computed amount; also set (informational) when action is "skip". */
  amount: number;
  payment_method_id: string | null;
  skip_reason: NextYearSkipReason | null;
  /** Known values are {@link NextYearFlag}; unknown values are shown as-is. */
  flags: string[];
}

export interface FiscalYearCloseServicePlan {
  service_id: string;
  service_name: string;
  conversions: FiscalYearCloseConversion[];
  existing_actual_total: number;
  /**
   * Distinct payment methods of the service's existing actual records in the
   * year (null for records without one). Empty when there are no actuals.
   */
  existing_actual_payment_method_ids: (string | null)[];
  next_year: FiscalYearCloseNextYear;
}

export interface FiscalYearCloseSkippedService {
  service_id: string;
  service_name: string;
  reason: SkippedServiceReason;
}

export interface FiscalYearCloseTotals {
  converted: number;
  next_year: number;
}

export interface FiscalYearClosePreview {
  fiscal_year: number;
  next_fiscal_year: number;
  uplift_pct: number;
  year_not_ended: boolean;
  plan_hash: string;
  services: FiscalYearCloseServicePlan[];
  skipped: FiscalYearCloseSkippedService[];
  totals: FiscalYearCloseTotals;
}

export interface FiscalYearCloseConversionOverride {
  record_id: string;
  include?: boolean;
  amount?: number;
}

export interface FiscalYearCloseNextYearOverride {
  service_id: string;
  include?: boolean;
  amount?: number;
}

export interface FiscalYearCloseExecuteRequest {
  fiscal_year: number;
  plan_hash: string;
  uplift_pct?: number;
  conversions?: FiscalYearCloseConversionOverride[];
  next_year?: FiscalYearCloseNextYearOverride[];
}

export interface FiscalYearCloseExecuteResponse {
  batch_id: string;
  converted_count: number;
  created_count: number;
  totals: FiscalYearCloseTotals;
}

export interface FiscalYearCloseRevertRequest {
  batch_id: string;
}

export interface FiscalYearCloseRevertResponse {
  batch_id: string;
  /** Converted records flipped back to estimated. */
  restored_count: number;
  /** Created next-year records deleted. */
  deleted_count: number;
}

export interface FiscalYearCloseBatch {
  id: string;
  fiscal_year: number;
  uplift_pct: number;
  converted_count: number;
  created_count: number;
  converted_total: number;
  next_year_total: number;
  /** ISO timestamp with a UTC offset; see `parseUtcTimestamp`. */
  created_at: string;
  created_by_id: string | null;
  /** Full name, or the email when the user has no name. */
  created_by_name: string | null;
  reverted_at: string | null;
  reverted_by_id: string | null;
  reverted_by_name: string | null;
  /** Records of this batch with history newer than the batch's created_at. */
  changed_since_close: number;
}

/**
 * Detail the server returns with a 409 on execute when the plan hash no
 * longer matches or the records changed while closing. Any execute 409
 * reloads the preview.
 */
export const PLAN_CHANGED_DETAIL =
  "Cost records changed since preview; reload the preview";
