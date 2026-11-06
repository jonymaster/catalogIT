import { describe, expect, it } from "vitest";
import type {
  FiscalYearCloseConversion,
  FiscalYearClosePreview,
  FiscalYearCloseServicePlan,
} from "../types/fiscalYearClose";
import { parseComparisonMode } from "../types/dashboardCost";
import {
  applyUplift,
  centsToInput,
  COMPUTED_AMOUNT_TOO_LARGE,
  costsReportPathForYear,
  derivePlan,
  initialEdits,
  keepWithOnlyFlagged,
  MAX_AMOUNT_CENTS,
  MAX_BATCH_TOTAL_CENTS,
  parseAmount,
  parseFiscalYear,
  parseUplift,
  parseUtcTimestamp,
  parseYearParam,
  toCents,
} from "./fiscalYearClose";

function conversion(
  recordId: string,
  paymentMethodId: string | null,
  include = true,
): FiscalYearCloseConversion {
  return {
    record_id: recordId,
    amount: 100,
    include,
    flags: [],
    notes: null,
    payment_method_id: paymentMethodId,
  };
}

function servicePlan(
  conversions: FiscalYearCloseConversion[],
  existingMethods: (string | null)[],
  nextYearFlags: string[] = [],
): FiscalYearCloseServicePlan {
  return {
    service_id: "svc",
    service_name: "Service",
    conversions,
    existing_actual_total: existingMethods.length > 0 ? 50 : 0,
    existing_actual_payment_method_ids: existingMethods,
    next_year: {
      action: "create",
      amount: 0,
      payment_method_id: null,
      skip_reason: null,
      flags: nextYearFlags,
    },
  };
}

function previewOf(
  ...services: FiscalYearCloseServicePlan[]
): FiscalYearClosePreview {
  return {
    fiscal_year: 2025,
    next_fiscal_year: 2026,
    uplift_pct: 0,
    year_not_ended: false,
    plan_hash: "sha256:test",
    services,
    skipped: [],
    totals: { converted: 0, next_year: 0 },
  };
}

/** Live next-year flags of the only service, with the given include toggles. */
function liveFlags(
  service: FiscalYearCloseServicePlan,
  include: Record<string, boolean> = {},
): string[] {
  const preview = previewOf(service);
  const edits = initialEdits(preview);
  for (const [recordId, value] of Object.entries(include)) {
    edits.conversions[recordId].include = value;
  }
  return derivePlan(preview, edits).services[0].nextYearFlags;
}

describe("fiscal year close helpers", () => {
  it("parses amounts into exact cents", () => {
    expect(parseAmount("1250")).toEqual({ ok: true, cents: 125000 });
    expect(parseAmount(" 0.1 ")).toEqual({ ok: true, cents: 10 });
    expect(parseAmount("19.99")).toEqual({ ok: true, cents: 1999 });
    expect(parseAmount(".5")).toEqual({ ok: true, cents: 50 });
    expect(parseAmount("9999999999.99")).toEqual({ ok: true, cents: 999_999_999_999 });
    // One decimal comma is read as a decimal point.
    expect(parseAmount("12,5")).toEqual({ ok: true, cents: 1250 });
    expect(parseAmount("0,07")).toEqual({ ok: true, cents: 7 });
  });

  it("rejects invalid amounts", () => {
    expect(parseAmount("")).toMatchObject({ ok: false });
    expect(parseAmount("-1")).toEqual({ ok: false, error: "Amount cannot be negative." });
    expect(parseAmount("1.234")).toEqual({ ok: false, error: "Use at most 2 decimals." });
    expect(parseAmount("10000000000")).toEqual({ ok: false, error: "Amount is too large." });
    expect(parseAmount("abc")).toMatchObject({ ok: false });
    expect(parseAmount(".")).toMatchObject({ ok: false });
    expect(parseAmount("1e3")).toEqual({ ok: false, error: "Enter a valid amount." });
    expect(parseAmount("+5")).toEqual({ ok: false, error: "Enter a valid amount." });
    expect(parseAmount("1,250")).toEqual({ ok: false, error: "Remove thousands separators." });
    expect(parseAmount("1,250.50")).toEqual({ ok: false, error: "Remove thousands separators." });
    expect(parseAmount("1.250,50")).toEqual({ ok: false, error: "Remove thousands separators." });
  });

  it("parses the uplift within -100% and 1000%", () => {
    expect(parseUplift("")).toEqual({ ok: true, pct: 0, hundredths: 0 });
    expect(parseUplift("3.25")).toEqual({ ok: true, pct: 3.25, hundredths: 325 });
    expect(parseUplift("-100")).toEqual({ ok: true, pct: -100, hundredths: -10000 });
    expect(parseUplift("1000")).toEqual({ ok: true, pct: 1000, hundredths: 100000 });
    expect(parseUplift("-100.01")).toMatchObject({ ok: false });
    expect(parseUplift("1000.01")).toMatchObject({ ok: false });
    expect(parseUplift("1.005")).toMatchObject({ ok: false });
  });

  it("only reads an empty uplift field as 0", () => {
    expect(parseUplift("  ")).toEqual({ ok: true, pct: 0, hundredths: 0 });
    expect(parseUplift("+5")).toEqual({ ok: true, pct: 5, hundredths: 500 });
    expect(parseUplift("5,5")).toEqual({ ok: true, pct: 5.5, hundredths: 550 });
    expect(parseUplift("-2,25")).toEqual({ ok: true, pct: -2.25, hundredths: -225 });
    expect(parseUplift("-0")).toEqual({ ok: true, pct: 0, hundredths: 0 });
    for (const value of ["abc", "5%", "+-5", "--5", "-", "+", "1e2", "1.2.3"]) {
      expect(parseUplift(value)).toEqual({ ok: false, error: "Enter a valid percentage." });
    }
    expect(parseUplift("1,000")).toEqual({ ok: false, error: "Remove thousands separators." });
  });

  it("parses a typed fiscal year from 1900 to the current year", () => {
    expect(parseFiscalYear("1900", 2026)).toEqual({ ok: true, year: 1900 });
    expect(parseFiscalYear(" 2026 ", 2026)).toEqual({ ok: true, year: 2026 });
    expect(parseFiscalYear("", 2026)).toEqual({ ok: false, error: "Enter a year." });
    expect(parseFiscalYear("2027", 2026)).toEqual({
      ok: false,
      error: "Future years cannot be closed.",
    });
    for (const value of ["1899", "999", "20266", "20a6", "2026.0"]) {
      expect(parseFiscalYear(value, 2026)).toEqual({
        ok: false,
        error: "Enter a year between 1900 and 2026.",
      });
    }
  });

  it("reads API timestamps as UTC, with or without an offset", () => {
    const iso = (value: string) => parseUtcTimestamp(value).toISOString();
    expect(iso("2025-01-10T09:00:00")).toBe("2025-01-10T09:00:00.000Z");
    expect(iso("2025-01-10T09:00:00+00:00")).toBe("2025-01-10T09:00:00.000Z");
    expect(iso("2025-01-10T09:00:00Z")).toBe("2025-01-10T09:00:00.000Z");
    expect(iso("2025-01-10T11:00:00+02:00")).toBe("2025-01-10T09:00:00.000Z");
    expect(iso("2025-01-10T09:00:00.123456")).toBe("2025-01-10T09:00:00.123Z");
    expect(iso("2025-01-10T09:00:00.123456+00:00")).toBe("2025-01-10T09:00:00.123Z");
    expect(iso("2025-01-10 09:00:00")).toBe("2025-01-10T09:00:00.000Z");
    expect(Number.isNaN(parseUtcTimestamp("not a date").getTime())).toBe(true);
  });

  it("recomputes the mixed payment methods flag from actuals and included estimates", () => {
    // Existing actuals alone.
    expect(liveFlags(servicePlan([], ["pm-1"]))).toEqual([]);
    expect(liveFlags(servicePlan([], ["pm-1", "pm-2"]))).toEqual(["mixed_payment_methods"]);
    // null is a value of its own.
    expect(liveFlags(servicePlan([], ["pm-1", null]))).toEqual(["mixed_payment_methods"]);
    // Included estimates count; excluded ones do not.
    const service = servicePlan([conversion("r1", "pm-2", false)], ["pm-1"]);
    expect(liveFlags(service)).toEqual([]);
    expect(liveFlags(service, { r1: true })).toEqual(["mixed_payment_methods"]);
    expect(liveFlags(servicePlan([conversion("r1", "pm-1"), conversion("r2", "pm-1")], []))).toEqual([]);
    expect(liveFlags(servicePlan([conversion("r1", "pm-1"), conversion("r2", null)], []))).toEqual([
      "mixed_payment_methods",
    ]);
    // A stale preview flag is dropped; added_during_year is kept.
    const stale = servicePlan(
      [conversion("r1", "pm-1"), conversion("r2", null)],
      [],
      ["added_during_year", "mixed_payment_methods"],
    );
    expect(liveFlags(stale)).toEqual(["added_during_year", "mixed_payment_methods"]);
    expect(liveFlags(stale, { r2: false })).toEqual(["added_during_year"]);
    // The service's combined flags follow the live value too.
    const preview = previewOf(stale);
    const edits = initialEdits(preview);
    edits.conversions.r2.include = false;
    expect(derivePlan(preview, edits).services[0].flags).toEqual(["added_during_year"]);
  });

  it("applies the uplift with ROUND_HALF_UP and no float noise", () => {
    expect(applyUplift(120050, 1000)).toBe(132055);
    // 0.05 * 1.5 = 0.075 -> 0.08
    expect(applyUplift(5, 5000)).toBe(8);
    // 1234.56 * 1.0333 = 1275.670848 -> 1275.67
    expect(applyUplift(123456, 333)).toBe(127567);
    // 0.1 + 0.2 style sums stay exact in cents.
    expect(applyUplift(10 + 20, 0)).toBe(30);
    expect(applyUplift(50000, -10000)).toBe(0);
    expect(applyUplift(999_999_999_999, 100000)).toBe(10_999_999_999_989);
  });

  it("converts between API numbers, cents, and input strings", () => {
    expect(toCents(200.5)).toBe(20050);
    expect(toCents(0.29)).toBe(29);
    expect(centsToInput(20050)).toBe("200.50");
    expect(centsToInput(7)).toBe("0.07");
  });

  it("reads a year query param", () => {
    expect(parseYearParam("2027")).toBe(2027);
    expect(parseYearParam(null)).toBeNull();
    expect(parseYearParam("27")).toBeNull();
    expect(parseYearParam("abcd")).toBeNull();
    expect(parseYearParam("3000")).toBeNull();
  });

  describe("server limits", () => {
    /** A service with the given conversion amounts and existing actual total. */
    function service(
      id: string,
      amounts: number[],
      existingActualTotal = 0,
    ): FiscalYearCloseServicePlan {
      return {
        ...servicePlan(
          amounts.map((amount, i) => ({ ...conversion(`${id}-r${i}`, null), amount })),
          [],
        ),
        service_id: id,
        existing_actual_total: existingActualTotal,
      };
    }

    it("flags a computed next-year amount above the record limit on a row to create", () => {
      // 9999999999.99 + 0.01 is one cent above the limit.
      const preview = previewOf(service("svc", [0.01], 9999999999.99));
      const edits = initialEdits(preview);
      let row = derivePlan(preview, edits).services[0];
      expect(row.computedNextCents).toBe(MAX_AMOUNT_CENTS + 1);
      expect(row.nextStatus).toBe("create");
      expect(row.nextError).toBe(COMPUTED_AMOUNT_TOO_LARGE);
      expect(row.errorCount).toBe(1);
      expect(row.conversionErrorCount).toBe(0);
      expect(derivePlan(preview, edits).errorCount).toBe(1);

      // Unticked: nothing is created, so there is no error.
      edits.nextYear.svc = { include: false, amount: null };
      row = derivePlan(preview, edits).services[0];
      expect(row.nextStatus).toBe("excluded");
      expect(row.nextError).toBeNull();
      expect(row.errorCount).toBe(0);

      // A valid typed amount replaces the computed one.
      edits.nextYear.svc = { include: true, amount: "100" };
      row = derivePlan(preview, edits).services[0];
      expect(row.nextError).toBeNull();
      expect(row.errorCount).toBe(0);

      // Exactly at the limit is accepted.
      edits.nextYear.svc = { include: true, amount: null };
      edits.conversions["svc-r0"].include = false;
      row = derivePlan(preview, edits).services[0];
      expect(row.computedNextCents).toBe(MAX_AMOUNT_CENTS);
      expect(row.nextError).toBeNull();
    });

    it("keeps reporting an invalid override as the next-year error", () => {
      const preview = previewOf(service("svc", [100]));
      const edits = initialEdits(preview);
      edits.nextYear.svc = { include: true, amount: "1,500" };
      const row = derivePlan(preview, edits).services[0];
      expect(row.nextError).toBe("Remove thousands separators.");
      expect(row.errorCount).toBe(1);
    });

    it("counts invalid conversion amounts apart from the next-year error", () => {
      const preview = previewOf(service("svc", [100, 200]));
      const edits = initialEdits(preview);
      edits.conversions["svc-r0"].amount = "abc";
      edits.conversions["svc-r1"].amount = "-1";
      const row = derivePlan(preview, edits).services[0];
      expect(row.conversionErrorCount).toBe(2);
      expect(row.errorCount).toBe(2);
      expect(row.nextError).toBeNull();
    });

    it("flags converted and next-year totals above the batch limit", () => {
      const max = 9999999999.99;
      // 100 x 9999999999.99 + 0.99 is exactly 999999999999.99.
      const atLimit = previewOf(
        ...Array.from({ length: 100 }, (_, i) => service(`s${i}`, [max])),
        service("s100", [0.99]),
      );
      let plan = derivePlan(atLimit, initialEdits(atLimit));
      expect(plan.convertedCents).toBe(MAX_BATCH_TOTAL_CENTS);
      expect(plan.nextYearCents).toBe(MAX_BATCH_TOTAL_CENTS);
      expect(plan.errorCount).toBe(0);
      expect(plan.convertedTotalTooLarge).toBe(false);
      expect(plan.nextYearTotalTooLarge).toBe(false);

      const edits = initialEdits(atLimit);
      edits.conversions["s100-r0"].amount = "1.00";
      plan = derivePlan(atLimit, edits);
      expect(plan.convertedTotalTooLarge).toBe(true);
      expect(plan.nextYearTotalTooLarge).toBe(true);

      // Unticking a next-year row only brings that total under the limit.
      edits.nextYear.s0 = { include: false, amount: null };
      plan = derivePlan(atLimit, edits);
      expect(plan.convertedTotalTooLarge).toBe(true);
      expect(plan.nextYearTotalTooLarge).toBe(false);
    });
  });

  it("keeps preview-flagged, live-flagged, and invalid rows with only flags", () => {
    const keep = (
      service: FiscalYearCloseServicePlan,
      edit?: (edits: ReturnType<typeof initialEdits>) => void,
    ) => {
      const preview = previewOf(service);
      const edits = initialEdits(preview);
      edit?.(edits);
      return keepWithOnlyFlagged(derivePlan(preview, edits).services[0]);
    };
    expect(keep(servicePlan([conversion("r1", "pm-1")], []))).toBe(false);
    // A conversion flag of the preview.
    expect(
      keep(servicePlan([{ ...conversion("r1", "pm-1"), flags: ["estimate_with_actual"] }], [])),
    ).toBe(true);
    // A next-year flag of the preview stays a reason after the live flag clears.
    const mixed = servicePlan(
      [conversion("r1", "pm-1"), conversion("r2", null)],
      [],
      ["mixed_payment_methods"],
    );
    expect(
      keep(mixed, (edits) => {
        edits.conversions.r2.include = false;
      }),
    ).toBe(true);
    // A live flag the preview did not have.
    expect(
      keep(servicePlan([conversion("r1", "pm-2", false)], ["pm-1"]), (edits) => {
        edits.conversions.r1.include = true;
      }),
    ).toBe(true);
    // An invalid amount.
    expect(
      keep(servicePlan([conversion("r1", "pm-1")], []), (edits) => {
        edits.conversions.r1.amount = "abc";
      }),
    ).toBe(true);
  });

  it("links to the costs report in a view that shows past-year estimates", () => {
    expect(costsReportPathForYear(2026, 2026)).toBe("/costs?year=2026");
    expect(costsReportPathForYear(2027, 2026)).toBe("/costs?year=2027");
    expect(costsReportPathForYear(2025, 2026)).toBe("/costs?year=2025&mode=actual_vs_estimated");
  });

  it("reads a comparison mode query param", () => {
    expect(parseComparisonMode("actual_vs_estimated")).toBe("actual_vs_estimated");
    expect(parseComparisonMode("only_actual")).toBe("only_actual");
    expect(parseComparisonMode(null)).toBeNull();
    expect(parseComparisonMode("")).toBeNull();
    expect(parseComparisonMode("bogus")).toBeNull();
    expect(parseComparisonMode("toString")).toBeNull();
  });
});
