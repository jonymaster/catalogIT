import axios from "axios";
import type { ComparisonMode } from "../types/dashboardCost";
import type {
  FiscalYearCloseConversion,
  FiscalYearCloseExecuteRequest,
  FiscalYearClosePreview,
  FiscalYearCloseServicePlan,
} from "../types/fiscalYearClose";

/**
 * Client-side helpers for the close-financial-year wizard.
 *
 * Money is handled in integer cents so the live totals never show float
 * noise. The math mirrors the server for display only; the server rebuilds
 * the plan and recomputes every amount on execute.
 */

export const MIN_FISCAL_YEAR = 1900;
export const MAX_FISCAL_YEAR = 2100;
export const MIN_UPLIFT_PCT = -100;
export const MAX_UPLIFT_PCT = 1000;
/** Largest amount the API accepts (9999999999.99), in cents. */
export const MAX_AMOUNT_CENTS = 999_999_999_999;
/** Largest converted or next-year total of one close (999999999999.99), in cents. */
export const MAX_BATCH_TOTAL_CENTS = 99_999_999_999_999;
/** Shown when a computed next-year amount to create is above {@link MAX_AMOUNT_CENTS}. */
export const COMPUTED_AMOUNT_TOO_LARGE =
  "Amount is too large. Enter a smaller amount or untick it.";

export type AmountParse =
  | { ok: true; cents: number }
  | { ok: false; error: string };

export type UpliftParse =
  | { ok: true; pct: number; hundredths: number }
  | { ok: false; error: string };

export type YearParse =
  | { ok: true; year: number }
  | { ok: false; error: string };

const DECIMAL_RE = /^(\d*)(?:\.(\d*))?$/;
const SEPARATOR_ERROR = "Remove thousands separators.";

/**
 * Accepts one decimal comma ("5,5" -> "5.5"), for keyboards and locales
 * that only offer a comma. Returns null when a comma is ambiguous, such as a
 * thousands separator ("1,250") or a mix of commas and dots.
 */
function normalizeDecimalComma(value: string): string | null {
  if (!value.includes(",")) return value;
  return /^[^.,]*,\d{0,2}$/.test(value) ? value.replace(",", ".") : null;
}

/**
 * Parses the raw text of a non-negative money amount with at most 2 decimals
 * into cents. The wizard uses text inputs (not `type="number"`), so text the
 * browser cannot parse reaches this function instead of becoming "".
 */
export function parseAmount(input: string): AmountParse {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "Enter an amount." };
  if (trimmed.startsWith("-")) {
    return { ok: false, error: "Amount cannot be negative." };
  }
  const value = normalizeDecimalComma(trimmed);
  if (value === null) return { ok: false, error: SEPARATOR_ERROR };
  const match = DECIMAL_RE.exec(value);
  const whole = match?.[1] ?? "";
  const fraction = match?.[2] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (fraction.length > 2) {
    return { ok: false, error: "Use at most 2 decimals." };
  }
  const cents =
    Number(whole === "" ? "0" : whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: "Amount is too large." };
  }
  return { ok: true, cents };
}

/**
 * Parses the raw text of the global uplift percentage. Only an empty field
 * means 0; anything else must be a number with an optional leading sign and
 * at most 2 decimals.
 */
export function parseUplift(input: string): UpliftParse {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, pct: 0, hundredths: 0 };
  const value = normalizeDecimalComma(trimmed);
  if (value === null) return { ok: false, error: SEPARATOR_ERROR };
  const negative = value.startsWith("-");
  const unsigned = negative || value.startsWith("+") ? value.slice(1) : value;
  const match = DECIMAL_RE.exec(unsigned);
  const whole = match?.[1] ?? "";
  const fraction = match?.[2] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    return { ok: false, error: "Enter a valid percentage." };
  }
  if (fraction.length > 2) {
    return { ok: false, error: "Use at most 2 decimals." };
  }
  const magnitude =
    Number(whole === "" ? "0" : whole) * 100 + Number(fraction.padEnd(2, "0"));
  const hundredths = negative && magnitude !== 0 ? -magnitude : magnitude;
  if (
    !Number.isSafeInteger(hundredths) ||
    hundredths < MIN_UPLIFT_PCT * 100 ||
    hundredths > MAX_UPLIFT_PCT * 100
  ) {
    return {
      ok: false,
      error: `Uplift must be between ${MIN_UPLIFT_PCT}% and ${MAX_UPLIFT_PCT}%.`,
    };
  }
  return { ok: true, pct: hundredths / 100, hundredths };
}

/**
 * Parses a typed fiscal year: 4 digits, from {@link MIN_FISCAL_YEAR} up to
 * `maxYear` (the current UTC calendar year; future years cannot be closed).
 */
export function parseFiscalYear(input: string, maxYear: number): YearParse {
  const value = input.trim();
  const upper = Math.min(maxYear, MAX_FISCAL_YEAR);
  if (value === "") return { ok: false, error: "Enter a year." };
  const year = /^\d{4}$/.test(value) ? Number(value) : NaN;
  if (Number.isInteger(year) && year > upper) {
    return { ok: false, error: "Future years cannot be closed." };
  }
  if (!Number.isInteger(year) || year < MIN_FISCAL_YEAR) {
    return {
      ok: false,
      error: `Enter a year between ${MIN_FISCAL_YEAR} and ${upper}.`,
    };
  }
  return { ok: true, year };
}

/**
 * Parses an API timestamp. Values with an offset (`Z`, `+00:00`) are used
 * as-is; naive values are UTC by app convention, so they get a `Z` instead
 * of being read as local time. Fractions beyond milliseconds are dropped.
 */
export function parseUtcTimestamp(value: string): Date {
  const text = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const timeIndex = text.indexOf("T");
  if (timeIndex === -1) return new Date(text);
  const hasOffset = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(text.slice(timeIndex + 1));
  return new Date(hasOffset ? text : `${text}Z`);
}

/** Converts a 2-decimal API amount to integer cents. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Converts integer cents to the JSON number the API expects (2 decimals). */
export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** Formats cents as a plain input value, e.g. 125000 -> "1250.00". */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  return MONEY_FORMAT.format(cents / 100);
}

/**
 * `round(baseCents * (1 + uplift / 100))` with ROUND_HALF_UP, using exact
 * integer math. `upliftHundredths` is the uplift in hundredths of a percent
 * (3.25% -> 325), so the multiplier is `(10000 + upliftHundredths) / 10000`.
 */
export function applyUplift(baseCents: number, upliftHundredths: number): number {
  const numerator = BigInt(baseCents) * BigInt(10000 + upliftHundredths);
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator * sign;
  let quotient = abs / 10000n;
  if ((abs % 10000n) * 2n >= 10000n) quotient += 1n;
  return Number(quotient * sign);
}

export interface ConversionEdit {
  include: boolean;
  amount: string;
}

export interface NextYearEdit {
  /** Whether the user wants the next-year estimate created when its amount is above 0. */
  include: boolean;
  /** Typed override; null means "use the computed amount". */
  amount: string | null;
}

export interface CloseEdits {
  conversions: Record<string, ConversionEdit>;
  nextYear: Record<string, NextYearEdit>;
}

export function initialEdits(preview: FiscalYearClosePreview): CloseEdits {
  const conversions: Record<string, ConversionEdit> = {};
  const nextYear: Record<string, NextYearEdit> = {};
  for (const service of preview.services) {
    for (const conversion of service.conversions) {
      conversions[conversion.record_id] = {
        include: conversion.include,
        amount: centsToInput(toCents(conversion.amount)),
      };
    }
    nextYear[service.service_id] = {
      include: service.next_year.skip_reason !== "next_year_exists",
      amount: null,
    };
  }
  return { conversions, nextYear };
}

export type NextYearStatus =
  | "create"
  | "excluded"
  | "next_year_exists"
  | "zero_amount";

export interface ConversionDerived {
  conversion: FiscalYearCloseConversion;
  edit: ConversionEdit;
  parsed: AmountParse;
  cents: number;
}

export interface ServiceDerived {
  service: FiscalYearCloseServicePlan;
  conversions: ConversionDerived[];
  includedCount: number;
  includedCents: number;
  existingActualCents: number;
  computedNextCents: number;
  nextEdit: NextYearEdit;
  /** Parsed override, or null when the computed amount is used. */
  nextOverride: AmountParse | null;
  nextCents: number;
  nextStatus: NextYearStatus;
  /**
   * Error of the next-year amount: an invalid override, or a computed amount
   * above {@link MAX_AMOUNT_CENTS} on a row that would be created.
   */
  nextError: string | null;
  /** Next-year flags with `mixed_payment_methods` recomputed from the edits. */
  nextYearFlags: string[];
  /** Conversion flags plus {@link nextYearFlags}, without duplicates. */
  flags: string[];
  /** Invalid conversion amounts (shown in the expandable estimate rows). */
  conversionErrorCount: number;
  /** Invalid conversion amounts plus a next-year amount error. */
  errorCount: number;
}

const MIXED_PAYMENT_METHODS = "mixed_payment_methods";

/**
 * The preview's next-year flags, with `mixed_payment_methods` recomputed the
 * way the server does on execute: the payment methods of the existing actuals
 * plus those of the included conversions (null counts as a value) are mixed
 * when there is more than one. Other flags (`added_during_year`) are kept.
 */
function liveNextYearFlags(
  service: FiscalYearCloseServicePlan,
  conversions: ConversionDerived[],
): string[] {
  const methods = new Set<string | null>(service.existing_actual_payment_method_ids);
  for (const c of conversions) {
    if (c.edit.include) methods.add(c.conversion.payment_method_id);
  }
  const flags = service.next_year.flags.filter((f) => f !== MIXED_PAYMENT_METHODS);
  if (methods.size > 1) flags.push(MIXED_PAYMENT_METHODS);
  return flags;
}

export interface PlanDerived {
  services: ServiceDerived[];
  convertedCount: number;
  convertedCents: number;
  excludedConversionCount: number;
  createdCount: number;
  nextYearCents: number;
  errorCount: number;
  /** {@link convertedCents} is above {@link MAX_BATCH_TOTAL_CENTS}. */
  convertedTotalTooLarge: boolean;
  /** {@link nextYearCents} is above {@link MAX_BATCH_TOTAL_CENTS}. */
  nextYearTotalTooLarge: boolean;
}

export function derivePlan(
  preview: FiscalYearClosePreview,
  edits: CloseEdits,
): PlanDerived {
  const upliftHundredths = Math.round(preview.uplift_pct * 100);
  let convertedCount = 0;
  let convertedCents = 0;
  let excludedConversionCount = 0;
  let createdCount = 0;
  let nextYearCents = 0;
  let errorCount = 0;

  const services = preview.services.map<ServiceDerived>((service) => {
    let conversionErrorCount = 0;
    let includedCount = 0;
    let includedCents = 0;
    const conversions = service.conversions.map<ConversionDerived>((conversion) => {
      const edit = edits.conversions[conversion.record_id] ?? {
        include: conversion.include,
        amount: centsToInput(toCents(conversion.amount)),
      };
      const parsed = parseAmount(edit.amount);
      const cents = parsed.ok ? parsed.cents : 0;
      if (!parsed.ok) conversionErrorCount += 1;
      if (edit.include) {
        includedCount += 1;
        includedCents += cents;
      }
      return { conversion, edit, parsed, cents };
    });

    const existingActualCents = toCents(service.existing_actual_total);
    const computedNextCents = applyUplift(
      existingActualCents + includedCents,
      upliftHundredths,
    );
    const exists = service.next_year.skip_reason === "next_year_exists";
    const nextEdit = edits.nextYear[service.service_id] ?? {
      include: !exists,
      amount: null,
    };
    const nextOverride =
      !exists && nextEdit.amount !== null ? parseAmount(nextEdit.amount) : null;
    const nextCents = exists
      ? toCents(service.next_year.amount)
      : nextOverride
        ? nextOverride.ok
          ? nextOverride.cents
          : 0
        : computedNextCents;

    let nextStatus: NextYearStatus;
    if (exists) nextStatus = "next_year_exists";
    else if (nextCents <= 0) nextStatus = "zero_amount";
    else nextStatus = nextEdit.include ? "create" : "excluded";

    // Typed overrides are capped by parseAmount; a computed amount is not, and
    // the server refuses to create a record above the limit.
    let nextError: string | null = null;
    if (nextOverride && !nextOverride.ok) nextError = nextOverride.error;
    else if (
      nextStatus === "create" &&
      nextOverride === null &&
      computedNextCents > MAX_AMOUNT_CENTS
    ) {
      nextError = COMPUTED_AMOUNT_TOO_LARGE;
    }
    const serviceErrors = conversionErrorCount + (nextError === null ? 0 : 1);

    convertedCount += includedCount;
    convertedCents += includedCents;
    excludedConversionCount += conversions.length - includedCount;
    if (nextStatus === "create") {
      createdCount += 1;
      nextYearCents += nextCents;
    }
    errorCount += serviceErrors;

    const nextYearFlags = liveNextYearFlags(service, conversions);
    const flags = Array.from(
      new Set([...service.conversions.flatMap((c) => c.flags), ...nextYearFlags]),
    );

    return {
      service,
      conversions,
      includedCount,
      includedCents,
      existingActualCents,
      computedNextCents,
      nextEdit,
      nextOverride,
      nextCents,
      nextStatus,
      nextError,
      nextYearFlags,
      flags,
      conversionErrorCount,
      errorCount: serviceErrors,
    };
  });

  return {
    services,
    convertedCount,
    convertedCents,
    excludedConversionCount,
    createdCount,
    nextYearCents,
    errorCount,
    convertedTotalTooLarge: convertedCents > MAX_BATCH_TOTAL_CENTS,
    nextYearTotalTooLarge: nextYearCents > MAX_BATCH_TOTAL_CENTS,
  };
}

/**
 * Whether "Only rows with flags" keeps the row. Rows the preview flagged stay
 * visible even when an edit clears their live flags, so a row never
 * disappears while it is being edited; rows with errors always stay visible.
 */
export function keepWithOnlyFlagged(row: ServiceDerived): boolean {
  return (
    row.flags.length > 0 ||
    row.errorCount > 0 ||
    row.service.next_year.flags.length > 0 ||
    row.service.conversions.some((c) => c.flags.length > 0)
  );
}

/** Costs report view that shows estimates of past years too. */
const ESTIMATES_VIEW: ComparisonMode = "actual_vs_estimated";

/**
 * Costs report link focused on the year after a close. The report's default
 * view ("Only Actual") merges estimates only for the current and future
 * years, so when that year is already past the link opens a view that shows
 * the new estimates.
 */
export function costsReportPathForYear(fiscalYear: number, currentYear: number): string {
  const params = new URLSearchParams({ year: String(fiscalYear) });
  if (fiscalYear < currentYear) params.set("mode", ESTIMATES_VIEW);
  return `/costs?${params.toString()}`;
}

/**
 * Builds the execute body: every conversion row with its include flag and
 * amount; every next-year row except `next_year_exists` with its include
 * flag, plus the amount only when the user typed an override.
 */
export function buildExecuteRequest(
  preview: FiscalYearClosePreview,
  plan: PlanDerived,
): FiscalYearCloseExecuteRequest {
  const conversions = plan.services.flatMap((s) =>
    s.conversions.map((c) => ({
      record_id: c.conversion.record_id,
      include: c.edit.include,
      amount: centsToAmount(c.cents),
    })),
  );
  const nextYear = plan.services
    .filter((s) => s.nextStatus !== "next_year_exists")
    .map((s) => {
      const row: { service_id: string; include: boolean; amount?: number } = {
        service_id: s.service.service_id,
        include: s.nextStatus === "create",
      };
      if (s.nextOverride?.ok) row.amount = centsToAmount(s.nextOverride.cents);
      return row;
    });
  return {
    fiscal_year: preview.fiscal_year,
    plan_hash: preview.plan_hash,
    uplift_pct: preview.uplift_pct,
    conversions,
    next_year: nextYear,
  };
}

export const FLAG_INFO: Record<string, { label: string; description: string }> = {
  estimate_with_actual: {
    label: "Already has actuals",
    description:
      "This service already has actual records this year. Converting the estimate may double-count, so it is excluded by default.",
  },
  added_during_year: {
    label: "Added during year",
    description:
      "The service was created during this year, so the year may be partial. The next-year amount is not annualized.",
  },
  mixed_payment_methods: {
    label: "Mixed payment methods",
    description:
      "This year's actual records, including the estimates being converted, use different payment methods, so the next-year record gets no payment method.",
  },
};

export function flagLabel(flag: string): string {
  return FLAG_INFO[flag]?.label ?? flag.replace(/_/g, " ");
}

export function flagDescription(flag: string): string | undefined {
  return FLAG_INFO[flag]?.description;
}

export function skipReasonLabel(reason: string, nextFiscalYear: number): string {
  switch (reason) {
    case "archived":
      return "Archived service: not converted and not copied. Unarchive it and restart the wizard to include it.";
    case "next_year_exists":
      return `No next-year estimate: FY${nextFiscalYear} already has cost records for this service.`;
    case "zero_amount":
      return "No next-year estimate: the amount is zero.";
    default:
      return reason.replace(/_/g, " ");
  }
}

/** Extracts a readable message from an API error (FastAPI `detail`). */
export function apiErrorDetail(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail: unknown = err.response?.data?.detail;
    if (typeof detail === "string" && detail.trim() !== "") return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d ? String(d.msg) : null,
        )
        .filter((m): m is string => Boolean(m));
      if (messages.length > 0) return messages.join("; ");
    }
  }
  return fallback;
}

/** Reads `?year=` for pages that accept a fiscal year in the URL. */
export function parseYearParam(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_FISCAL_YEAR && year <= MAX_FISCAL_YEAR ? year : null;
}
