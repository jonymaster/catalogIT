import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import client from "../api/client";
import { RequireAdmin } from "../components/ProtectedRoute";
import {
  PLAN_CHANGED_DETAIL,
  type FiscalYearCloseBatch,
  type FiscalYearClosePreview,
} from "../types/fiscalYearClose";
import type { UserPreferences } from "../types/models";
import { CloseFiscalYear } from "./CloseFiscalYear";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({
  role: "admin",
  preferences: null as UserPreferences | null,
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    token: "token",
    user: { sub: "user-1", email: "admin@example.com", role: auth.role },
    preferences: auth.preferences,
    canEdit: auth.role !== "viewer",
    canFinancialView: true,
    canHardwareView: true,
  }),
}));

const API = "/api/cost-records/close-year";
const CURRENT_YEAR = new Date().getUTCFullYear();
const YEAR = CURRENT_YEAR - 1;
const NEXT = YEAR + 1;

function makePreview(overrides: Partial<FiscalYearClosePreview> = {}): FiscalYearClosePreview {
  return {
    fiscal_year: YEAR,
    next_fiscal_year: NEXT,
    uplift_pct: 0,
    year_not_ended: false,
    plan_hash: "sha256:first",
    services: [
      {
        service_id: "svc-a",
        service_name: "Alpha CRM",
        conversions: [
          { record_id: "rec-a1", amount: 1000, include: true, flags: [], notes: "Licenses", payment_method_id: "pm-1" },
          { record_id: "rec-a2", amount: 200.5, include: true, flags: [], notes: null, payment_method_id: "pm-1" },
        ],
        existing_actual_total: 0,
        existing_actual_payment_method_ids: [],
        next_year: { action: "create", amount: 1200.5, payment_method_id: "pm-1", skip_reason: null, flags: [] },
      },
      {
        service_id: "svc-b",
        service_name: "Beta Tools",
        conversions: [
          { record_id: "rec-b1", amount: 300, include: false, flags: ["estimate_with_actual"], notes: null, payment_method_id: null },
        ],
        existing_actual_total: 500,
        existing_actual_payment_method_ids: ["pm-1", "pm-2"],
        next_year: { action: "create", amount: 500, payment_method_id: null, skip_reason: null, flags: ["mixed_payment_methods"] },
      },
      {
        service_id: "svc-c",
        service_name: "Gamma Hosting",
        conversions: [
          { record_id: "rec-c1", amount: 400, include: true, flags: [], notes: null, payment_method_id: null },
        ],
        existing_actual_total: 0,
        existing_actual_payment_method_ids: [],
        next_year: { action: "skip", amount: 400, payment_method_id: null, skip_reason: "next_year_exists", flags: [] },
      },
      {
        service_id: "svc-d",
        service_name: "Delta Free Tier",
        conversions: [],
        existing_actual_total: 0,
        existing_actual_payment_method_ids: [],
        next_year: { action: "skip", amount: 0, payment_method_id: null, skip_reason: "zero_amount", flags: [] },
      },
    ],
    skipped: [{ service_id: "svc-e", service_name: "Epsilon Legacy", reason: "archived" }],
    totals: { converted: 1600.5, next_year: 1700.5 },
    ...overrides,
  };
}

const batch: FiscalYearCloseBatch = {
  id: "batch-old",
  fiscal_year: YEAR - 1,
  uplift_pct: 5,
  converted_count: 4,
  created_count: 3,
  converted_total: 4000,
  next_year_total: 3150,
  created_at: "2025-01-10T09:00:00+00:00",
  created_by_id: "user-1",
  created_by_name: "Admin User",
  reverted_at: null,
  reverted_by_id: null,
  reverted_by_name: null,
  changed_since_close: 2,
};

function axiosError(status: number, detail: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

function mockApi({
  previews = [makePreview()],
  batches = [] as FiscalYearCloseBatch[],
  execute,
  revert,
}: {
  previews?: FiscalYearClosePreview[];
  batches?: FiscalYearCloseBatch[];
  execute?: () => Promise<unknown>;
  revert?: () => Promise<unknown>;
} = {}) {
  let previewCall = 0;
  vi.mocked(client.get).mockImplementation((url) => {
    if (url === `${API}/batches`) return Promise.resolve({ data: batches });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  vi.mocked(client.post).mockImplementation((url) => {
    if (url === `${API}/preview`) {
      const data = previews[Math.min(previewCall, previews.length - 1)];
      previewCall += 1;
      return Promise.resolve({ data });
    }
    if (url === `${API}/execute`) {
      return (
        execute?.() ??
        Promise.resolve({
          data: {
            batch_id: "batch-new",
            converted_count: 3,
            created_count: 2,
            totals: { converted: 1600.5, next_year: 1700.5 },
          },
        })
      );
    }
    if (url === `${API}/revert`) {
      return (
        revert?.() ??
        Promise.resolve({
          data: { batch_id: "batch-old", restored_count: 4, deleted_count: 3 },
        })
      );
    }
    return Promise.reject(new Error(`unexpected POST ${url}`));
  });
}

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/costs/close-year"]}>
      <CloseFiscalYear />
    </MemoryRouter>,
  );
}

/** The service row and its conversion rows in the review table. */
function serviceRow(name: string) {
  return screen.getByRole("link", { name }).closest("tbody")!;
}

async function goToReview(year = YEAR) {
  fireEvent.change(screen.getByLabelText("Financial year"), {
    target: { value: String(year) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
  await screen.findByRole("heading", { name: `Review FY${year}` });
}

function goToConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByRole("heading", { name: `Confirm closing FY${YEAR}` }),
  ).toBeInTheDocument();
}

function executeBody() {
  const call = vi
    .mocked(client.post)
    .mock.calls.find(([url]) => url === `${API}/execute`);
  return call?.[1];
}

describe("CloseFiscalYear wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "admin";
    auth.preferences = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to the current year, disables future years, and warns that the year has not ended", async () => {
    mockApi();
    renderWizard();

    expect(screen.getByLabelText("Financial year")).toHaveValue(String(CURRENT_YEAR));
    expect(
      screen.getByRole("option", { name: `${CURRENT_YEAR + 1} (future years cannot be closed)` }),
    ).toBeDisabled();
    expect(
      screen.getByText(`FY${CURRENT_YEAR} has not ended yet. Costs may still change.`),
    ).toBeInTheDocument();
    expect(await screen.findByText("No previous closes yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Financial year"), {
      target: { value: String(YEAR) },
    });
    expect(screen.queryByText(/has not ended yet/)).not.toBeInTheDocument();
  });

  it("walks through pick, review, confirm, and done with the default payload", async () => {
    mockApi();
    renderWizard();
    await goToReview();

    expect(client.post).toHaveBeenCalledWith(`${API}/preview`, {
      fiscal_year: YEAR,
      uplift_pct: 0,
    });
    expect(screen.getByTestId("total-converted")).toHaveTextContent("$1,600.50");
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$1,700.50");
    expect(screen.getAllByText("Already has actuals").length).toBeGreaterThan(0);
    expect(screen.getByText("Mixed payment methods")).toBeInTheDocument();

    const skipped = screen.getByRole("heading", { name: "Skipped" }).parentElement!;
    expect(within(skipped).getByText("Epsilon Legacy")).toBeInTheDocument();
    expect(within(skipped).getByText(/Archived service/)).toBeInTheDocument();
    expect(within(skipped).getByText("Gamma Hosting")).toBeInTheDocument();
    expect(
      within(skipped).getByText(new RegExp(`FY${NEXT} already has cost records`)),
    ).toBeInTheDocument();
    expect(within(skipped).getByText("Delta Free Tier")).toBeInTheDocument();
    expect(within(skipped).getByText(/the amount is zero/)).toBeInTheDocument();

    goToConfirm();
    const summary = screen.getByTestId("confirm-summary");
    expect(summary).toHaveTextContent("Convert 3 estimated records");
    expect(summary).toHaveTextContent("$1,600.50");
    expect(summary).toHaveTextContent("1 estimated record stay estimated");
    expect(summary).toHaveTextContent(`Create 2 estimated records for FY${NEXT}`);
    expect(summary).toHaveTextContent("1 archived service skipped");

    fireEvent.change(screen.getByLabelText(`Type ${YEAR} to confirm`), {
      target: { value: String(YEAR) },
    });
    fireEvent.click(screen.getByRole("button", { name: `Close FY${YEAR}` }));

    expect(
      await screen.findByRole("heading", { name: `FY${YEAR} closed` }),
    ).toBeInTheDocument();
    expect(executeBody()).toEqual({
      fiscal_year: YEAR,
      plan_hash: "sha256:first",
      uplift_pct: 0,
      conversions: [
        { record_id: "rec-a1", include: true, amount: 1000 },
        { record_id: "rec-a2", include: true, amount: 200.5 },
        { record_id: "rec-b1", include: false, amount: 300 },
        { record_id: "rec-c1", include: true, amount: 400 },
      ],
      next_year: [
        { service_id: "svc-a", include: true },
        { service_id: "svc-b", include: true },
        { service_id: "svc-d", include: false },
      ],
    });
    expect(screen.getByText("batch-new")).toBeInTheDocument();
    expect(screen.getByTestId("done-converted")).toHaveTextContent("$1,600.50");
    expect(screen.getByTestId("done-created")).toHaveTextContent("$1,700.50");
    expect(
      screen.getByRole("link", { name: `Open the Costs report for FY${NEXT}` }),
    ).toHaveAttribute("href", `/costs?year=${NEXT}`);
    // Previous closes are reloaded after the close.
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });

  it("updates live totals on edits and sends only edited next-year amounts", async () => {
    mockApi();
    renderWizard();
    await goToReview();

    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Alpha CRM" }));
    fireEvent.change(screen.getByLabelText("Amount of estimate 1 of Alpha CRM"), {
      target: { value: "1100" },
    });
    expect(screen.getByTestId("total-converted")).toHaveTextContent("$1,700.50");
    expect(screen.getByLabelText(`FY${NEXT} amount for Alpha CRM`)).toHaveDisplayValue("1300.50");
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$1,800.50");

    // Including the flagged estimate raises both totals.
    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Beta Tools" }));
    fireEvent.click(screen.getByLabelText("Convert estimate 1 of Beta Tools"));
    expect(screen.getByTestId("total-converted")).toHaveTextContent("$2,000.50");
    expect(screen.getByLabelText(`FY${NEXT} amount for Beta Tools`)).toHaveDisplayValue("800.00");
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$2,100.50");

    // Excluding a next-year row removes it from the total.
    fireEvent.click(screen.getByLabelText(`Create FY${NEXT} estimate for Beta Tools`));
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$1,300.50");

    // A typed next-year amount overrides the computed one.
    fireEvent.change(screen.getByLabelText(`FY${NEXT} amount for Alpha CRM`), {
      target: { value: "1500" },
    });
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$1,500.00");
    expect(screen.getByText("Computed: $1,300.50")).toBeInTheDocument();

    // A zero-amount row becomes a create once an amount above 0 is typed.
    const deltaCheckbox = screen.getByLabelText(`Create FY${NEXT} estimate for Delta Free Tier`);
    expect(deltaCheckbox).toBeDisabled();
    fireEvent.change(screen.getByLabelText(`FY${NEXT} amount for Delta Free Tier`), {
      target: { value: "50" },
    });
    expect(deltaCheckbox).toBeEnabled();
    expect(deltaCheckbox).toBeChecked();
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$1,550.00");

    // next_year_exists rows are read-only.
    expect(
      screen.queryByLabelText(`FY${NEXT} amount for Gamma Hosting`),
    ).not.toBeInTheDocument();

    goToConfirm();
    fireEvent.change(screen.getByLabelText(`Type ${YEAR} to confirm`), {
      target: { value: String(YEAR) },
    });
    fireEvent.click(screen.getByRole("button", { name: `Close FY${YEAR}` }));
    await screen.findByRole("heading", { name: `FY${YEAR} closed` });

    expect(executeBody()).toEqual({
      fiscal_year: YEAR,
      plan_hash: "sha256:first",
      uplift_pct: 0,
      conversions: [
        { record_id: "rec-a1", include: true, amount: 1100 },
        { record_id: "rec-a2", include: true, amount: 200.5 },
        { record_id: "rec-b1", include: true, amount: 300 },
        { record_id: "rec-c1", include: true, amount: 400 },
      ],
      next_year: [
        { service_id: "svc-a", include: true, amount: 1500 },
        { service_id: "svc-b", include: false },
        { service_id: "svc-d", include: true, amount: 50 },
      ],
    });
  });

  it("applies the uplift to live next-year amounts", async () => {
    mockApi({ previews: [makePreview({ uplift_pct: 10 })] });
    renderWizard();
    fireEvent.change(screen.getByLabelText("Uplift for next year (%)"), {
      target: { value: "10" },
    });
    await goToReview();

    expect(client.post).toHaveBeenCalledWith(`${API}/preview`, {
      fiscal_year: YEAR,
      uplift_pct: 10,
    });
    expect(screen.getByLabelText(`FY${NEXT} amount for Alpha CRM`)).toHaveDisplayValue("1320.55");
    expect(screen.getByLabelText(`FY${NEXT} amount for Beta Tools`)).toHaveDisplayValue("550.00");
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$1,870.55");
  });

  it("validates uplift and amounts before calling the API", async () => {
    mockApi();
    renderWizard();

    fireEvent.change(screen.getByLabelText("Uplift for next year (%)"), {
      target: { value: "1001" },
    });
    expect(screen.getByText("Uplift must be between -100% and 1000%.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview changes" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Uplift for next year (%)"), {
      target: { value: "0" },
    });
    await goToReview();

    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Alpha CRM" }));
    const amount = screen.getByLabelText("Amount of estimate 1 of Alpha CRM");
    expect(amount).toHaveAttribute("type", "text");
    fireEvent.change(amount, { target: { value: "-5" } });
    expect(screen.getByText("Amount cannot be negative.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    // Text a number input would turn into "" is shown as an error, not read as 0.
    fireEvent.change(amount, { target: { value: "1e3" } });
    expect(screen.getByText("Enter a valid amount.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    const nextAmount = screen.getByLabelText(`FY${NEXT} amount for Alpha CRM`);
    expect(nextAmount).toHaveAttribute("type", "text");
    fireEvent.change(amount, { target: { value: "1000" } });
    fireEvent.change(nextAmount, { target: { value: "1,500" } });
    expect(screen.getByText("Remove thousands separators.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    // A decimal comma is accepted.
    fireEvent.change(nextAmount, { target: { value: "1500,5" } });
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$2,000.50");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("validates the raw uplift text instead of reading unparsable input as 0", async () => {
    mockApi({ previews: [makePreview({ uplift_pct: 5.5 })] });
    renderWizard();
    const uplift = screen.getByLabelText("Uplift for next year (%)");
    const previewButton = screen.getByRole("button", { name: "Preview changes" });
    expect(uplift).toHaveAttribute("type", "text");

    for (const [value, error] of [
      ["abc", "Enter a valid percentage."],
      ["5%", "Enter a valid percentage."],
      ["1.2.3", "Enter a valid percentage."],
      ["1,000", "Remove thousands separators."],
      ["--5", "Enter a valid percentage."],
    ]) {
      fireEvent.change(uplift, { target: { value } });
      expect(screen.getByText(error)).toBeInTheDocument();
      expect(uplift).toHaveAttribute("aria-invalid", "true");
      expect(previewButton).toBeDisabled();
    }
    fireEvent.click(previewButton);
    expect(client.post).not.toHaveBeenCalled();

    // Only a really empty field means 0.
    fireEvent.change(uplift, { target: { value: "" } });
    expect(previewButton).toBeEnabled();
    fireEvent.change(uplift, { target: { value: "+5" } });
    expect(previewButton).toBeEnabled();

    fireEvent.change(uplift, { target: { value: "5,5" } });
    expect(uplift).toHaveAttribute("aria-invalid", "false");
    await goToReview();
    expect(client.post).toHaveBeenCalledWith(`${API}/preview`, {
      fiscal_year: YEAR,
      uplift_pct: 5.5,
    });
  });

  it("lets the user type any year from 1900 to the current year", async () => {
    mockApi({ previews: [makePreview({ fiscal_year: 1900, next_fiscal_year: 1901 })] });
    renderWizard();
    const previewButton = screen.getByRole("button", { name: "Preview changes" });
    expect(screen.queryByLabelText("Other year")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Financial year"), {
      target: { value: "other" },
    });
    const other = screen.getByLabelText("Other year");
    expect(screen.getByText(`Any year from 1900 to ${CURRENT_YEAR}.`)).toBeInTheDocument();
    expect(previewButton).toBeDisabled();

    fireEvent.change(other, { target: { value: "1899" } });
    expect(screen.getByText(`Enter a year between 1900 and ${CURRENT_YEAR}.`)).toBeInTheDocument();
    expect(other).toHaveAttribute("aria-invalid", "true");
    expect(previewButton).toBeDisabled();

    fireEvent.change(other, { target: { value: "19x0" } });
    expect(screen.getByText(`Enter a year between 1900 and ${CURRENT_YEAR}.`)).toBeInTheDocument();
    expect(previewButton).toBeDisabled();

    fireEvent.change(other, { target: { value: String(CURRENT_YEAR + 1) } });
    expect(screen.getByText("Future years cannot be closed.")).toBeInTheDocument();
    expect(previewButton).toBeDisabled();

    fireEvent.change(other, { target: { value: String(CURRENT_YEAR) } });
    expect(previewButton).toBeEnabled();
    expect(
      screen.getByText(`FY${CURRENT_YEAR} has not ended yet. Costs may still change.`),
    ).toBeInTheDocument();

    fireEvent.change(other, { target: { value: "1900" } });
    expect(other).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText(/Applied to every FY1901 estimate/)).toBeInTheDocument();
    fireEvent.click(previewButton);
    await screen.findByRole("heading", { name: "Review FY1900" });
    expect(client.post).toHaveBeenCalledWith(`${API}/preview`, {
      fiscal_year: 1900,
      uplift_pct: 0,
    });
  });

  it("only enables the confirm button once the exact year is typed", async () => {
    mockApi();
    renderWizard();
    await goToReview();
    goToConfirm();

    const confirm = screen.getByRole("button", { name: `Close FY${YEAR}` });
    const input = screen.getByLabelText(`Type ${YEAR} to confirm`);
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: String(YEAR + 1) } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: String(YEAR).slice(0, 3) } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: String(YEAR) } });
    expect(confirm).toBeEnabled();
    expect(executeBody()).toBeUndefined();
  });

  it("returns to review with a reloaded preview when the plan changed (409)", async () => {
    const changed = makePreview({
      plan_hash: "sha256:second",
      services: makePreview().services.map((s) =>
        s.service_id === "svc-a"
          ? {
              ...s,
              conversions: [{ ...s.conversions[0], amount: 2000 }, s.conversions[1]],
              next_year: { ...s.next_year, amount: 2200.5 },
            }
          : s,
      ),
    });
    const execute = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(axiosError(409, PLAN_CHANGED_DETAIL))
      .mockResolvedValue({
        data: {
          batch_id: "batch-new",
          converted_count: 3,
          created_count: 2,
          totals: { converted: 2600.5, next_year: 2700.5 },
        },
      });
    mockApi({ previews: [makePreview(), changed], execute });
    renderWizard();
    await goToReview();

    // This edit is discarded by the reload.
    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Beta Tools" }));
    fireEvent.click(screen.getByLabelText("Convert estimate 1 of Beta Tools"));

    goToConfirm();
    fireEvent.change(screen.getByLabelText(`Type ${YEAR} to confirm`), {
      target: { value: String(YEAR) },
    });
    fireEvent.click(screen.getByRole("button", { name: `Close FY${YEAR}` }));

    expect(
      await screen.findByText(/Cost records changed since the preview was loaded/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Review FY${YEAR}` })).toBeInTheDocument();
    const previewCalls = vi
      .mocked(client.post)
      .mock.calls.filter(([url]) => url === `${API}/preview`);
    expect(previewCalls).toHaveLength(2);
    expect(previewCalls[1][1]).toEqual({ fiscal_year: YEAR, uplift_pct: 0 });
    expect(screen.getByTestId("total-converted")).toHaveTextContent("$2,600.50");
    expect(screen.getByTestId("total-next-year")).toHaveTextContent("$2,700.50");

    // The next execute uses the new hash.
    goToConfirm();
    vi.mocked(client.post).mockClear();
    fireEvent.change(screen.getByLabelText(`Type ${YEAR} to confirm`), {
      target: { value: String(YEAR) },
    });
    fireEvent.click(screen.getByRole("button", { name: `Close FY${YEAR}` }));
    await screen.findByRole("heading", { name: `FY${YEAR} closed` });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(executeBody()).toMatchObject({
      plan_hash: "sha256:second",
      conversions: expect.arrayContaining([
        { record_id: "rec-a1", include: true, amount: 2000 },
        { record_id: "rec-b1", include: false, amount: 300 },
      ]),
    });
  });

  it("shows server error details on execute", async () => {
    mockApi({
      execute: () => Promise.reject(axiosError(400, "Nothing to close for this year")),
    });
    renderWizard();
    await goToReview();
    goToConfirm();
    fireEvent.change(screen.getByLabelText(`Type ${YEAR} to confirm`), {
      target: { value: String(YEAR) },
    });
    fireEvent.click(screen.getByRole("button", { name: `Close FY${YEAR}` }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing to close for this year");
    expect(
      screen.getByRole("heading", { name: `Confirm closing FY${YEAR}` }),
    ).toBeInTheDocument();
  });

  it("reverts a previous close after a confirmation that shows changed records", async () => {
    mockApi({ batches: [batch] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: `Revert FY${YEAR - 1} close` }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const message = confirmSpy.mock.calls[0][0];
    expect(message).toContain(`Revert the FY${YEAR - 1} close?`);
    expect(message).toContain("2 records of this close changed after the close");
    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith(`${API}/revert`, { batch_id: "batch-old" }),
    );
    expect(
      await screen.findByText(
        `FY${YEAR - 1} close reverted: 4 records back to estimated, 3 created records deleted.`,
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });

  it.each([
    `Revert these later closes first: FY${YEAR}`,
    "Cost records changed during revert; try again",
  ])("shows the server reason when a revert is refused (409): %s", async (detail) => {
    mockApi({ batches: [batch], revert: () => Promise.reject(axiosError(409, detail)) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: `Revert FY${YEAR - 1} close` }));

    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    // The list is reloaded, and the revert can be retried.
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: `Revert FY${YEAR - 1} close` })).toBeEnabled();
  });

  it("shows batch times in the user's time zone, reading naive values as UTC", async () => {
    auth.preferences = {
      locale: "en-US",
      timezone: "America/New_York",
      theme: "light",
      ui_preferences: {} as UserPreferences["ui_preferences"],
      receive_renewal_notifications: false,
    };
    mockApi({
      batches: [
        {
          ...batch,
          created_at: "2025-01-10T09:00:00",
          reverted_at: "2025-01-11T15:30:00.123456+00:00",
          reverted_by_name: "admin@example.com",
        },
      ],
    });
    renderWizard();

    expect(await screen.findByText(/^Jan 10, 2025, 4:00\sAM$/)).toBeInTheDocument();
    expect(screen.getByText(/^Reverted Jan 11, 2025, 10:30\sAM$/)).toBeInTheDocument();
    expect(screen.getByText("by admin@example.com")).toBeInTheDocument();
  });

  it("does not revert when the confirmation is cancelled", async () => {
    mockApi({ batches: [batch] });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: `Revert FY${YEAR - 1} close` }));
    expect(client.post).not.toHaveBeenCalled();
  });

  it("filters to rows with flags", async () => {
    mockApi();
    renderWizard();
    await goToReview();

    const table = screen.getByRole("table");
    expect(within(table).getByText("Alpha CRM")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Only rows with flags"));
    expect(within(table).queryByText("Alpha CRM")).not.toBeInTheDocument();
    expect(within(table).getByText("Beta Tools")).toBeInTheDocument();
  });

  it("recomputes the mixed payment methods flag live as estimates are toggled", async () => {
    mockApi({
      previews: [
        makePreview({
          services: [
            {
              service_id: "svc-a",
              service_name: "Alpha CRM",
              conversions: [
                { record_id: "rec-a1", amount: 1000, include: true, flags: [], notes: null, payment_method_id: "pm-1" },
                // No payment method counts as a different value.
                { record_id: "rec-a2", amount: 200.5, include: true, flags: [], notes: null, payment_method_id: null },
              ],
              existing_actual_total: 0,
              existing_actual_payment_method_ids: [],
              next_year: { action: "create", amount: 1200.5, payment_method_id: null, skip_reason: null, flags: ["mixed_payment_methods"] },
            },
            {
              service_id: "svc-b",
              service_name: "Beta Tools",
              conversions: [
                { record_id: "rec-b1", amount: 300, include: false, flags: [], notes: null, payment_method_id: "pm-2" },
              ],
              existing_actual_total: 500,
              existing_actual_payment_method_ids: ["pm-1"],
              next_year: { action: "create", amount: 500, payment_method_id: "pm-1", skip_reason: null, flags: ["added_during_year"] },
            },
          ],
          skipped: [],
        }),
      ],
    });
    renderWizard();
    await goToReview();

    expect(within(serviceRow("Alpha CRM")).getByText("Mixed payment methods")).toBeInTheDocument();
    expect(within(serviceRow("Beta Tools")).getByText("Added during year")).toBeInTheDocument();
    expect(
      within(serviceRow("Beta Tools")).queryByText("Mixed payment methods"),
    ).not.toBeInTheDocument();

    // Excluding the estimate without a payment method leaves only pm-1.
    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Alpha CRM" }));
    fireEvent.click(screen.getByLabelText("Convert estimate 2 of Alpha CRM"));
    expect(
      within(serviceRow("Alpha CRM")).queryByText("Mixed payment methods"),
    ).not.toBeInTheDocument();

    // The filter keeps rows the preview flagged, so Alpha does not disappear
    // while it is being edited even though its live flag is gone.
    fireEvent.click(screen.getByLabelText("Only rows with flags"));
    expect(screen.getByRole("link", { name: "Alpha CRM" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beta Tools" })).toBeInTheDocument();

    // Including an estimate with another payment method than the actuals mixes them.
    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Beta Tools" }));
    fireEvent.click(screen.getByLabelText("Convert estimate 1 of Beta Tools"));
    const beta = within(serviceRow("Beta Tools"));
    expect(beta.getByText("Added during year")).toBeInTheDocument();
    expect(beta.getByText("Mixed payment methods")).toBeInTheDocument();

    // Including the Alpha estimate again brings its flag back.
    fireEvent.click(screen.getByLabelText("Convert estimate 2 of Alpha CRM"));
    expect(within(serviceRow("Alpha CRM")).getByText("Mixed payment methods")).toBeInTheDocument();
  });

  it("keeps preview-flagged rows visible with only flags after the flag is toggled off", async () => {
    mockApi({
      previews: [
        makePreview({
          services: [
            {
              service_id: "svc-a",
              service_name: "Alpha CRM",
              conversions: [
                { record_id: "rec-a1", amount: 1000, include: true, flags: [], notes: null, payment_method_id: "pm-1" },
                { record_id: "rec-a2", amount: 200.5, include: true, flags: [], notes: null, payment_method_id: null },
              ],
              existing_actual_total: 0,
              existing_actual_payment_method_ids: [],
              next_year: { action: "create", amount: 1200.5, payment_method_id: null, skip_reason: null, flags: ["mixed_payment_methods"] },
            },
            {
              service_id: "svc-z",
              service_name: "Zeta Plain",
              conversions: [
                { record_id: "rec-z1", amount: 100, include: true, flags: [], notes: null, payment_method_id: null },
              ],
              existing_actual_total: 0,
              existing_actual_payment_method_ids: [],
              next_year: { action: "create", amount: 100, payment_method_id: null, skip_reason: null, flags: [] },
            },
          ],
          skipped: [],
        }),
      ],
    });
    renderWizard();
    await goToReview();

    fireEvent.click(screen.getByLabelText("Only rows with flags"));
    expect(screen.queryByRole("link", { name: "Zeta Plain" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Alpha CRM" }));
    fireEvent.click(screen.getByLabelText("Convert estimate 2 of Alpha CRM"));
    // No live flag is left, but the row and its estimate rows stay in place.
    expect(
      within(serviceRow("Alpha CRM")).queryByText("Mixed payment methods"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Convert estimate 2 of Alpha CRM")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Convert estimate 2 of Alpha CRM"));
    expect(screen.getByLabelText("Convert estimate 2 of Alpha CRM")).toBeChecked();
  });

  it("marks invalid amounts on the service row while its estimates are collapsed", async () => {
    mockApi();
    renderWizard();
    await goToReview();

    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Alpha CRM" }));
    fireEvent.change(screen.getByLabelText("Amount of estimate 1 of Alpha CRM"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide estimates for Alpha CRM" }));
    expect(screen.queryByLabelText("Amount of estimate 1 of Alpha CRM")).not.toBeInTheDocument();

    expect(within(serviceRow("Alpha CRM")).getByText("1 invalid amount")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show estimates for Alpha CRM" });
    expect(toggle).toHaveClass("text-red-600");
    expect(toggle).toHaveAccessibleDescription("1 invalid amount");
    expect(within(serviceRow("Beta Tools")).queryByText(/invalid amount/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show estimates for Beta Tools" }),
    ).not.toHaveClass("text-red-600");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    // Rows with errors stay visible with only flags; Alpha has no flags.
    fireEvent.click(screen.getByLabelText("Only rows with flags"));
    expect(screen.getByRole("link", { name: "Alpha CRM" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Delta Free Tier" })).not.toBeInTheDocument();

    // A next-year error adds to the count; the toggle only reflects estimate errors.
    fireEvent.change(screen.getByLabelText(`FY${NEXT} amount for Alpha CRM`), {
      target: { value: "x" },
    });
    expect(within(serviceRow("Alpha CRM")).getByText("2 invalid amounts")).toBeInTheDocument();

    // Fixed again: the marker goes away, and so does the row (no flags).
    fireEvent.click(screen.getByRole("button", { name: `Use computed FY${NEXT} amount for Alpha CRM` }));
    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Alpha CRM" }));
    fireEvent.change(screen.getByLabelText("Amount of estimate 1 of Alpha CRM"), {
      target: { value: "1000" },
    });
    expect(screen.queryByRole("link", { name: "Alpha CRM" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Only rows with flags"));
    expect(within(serviceRow("Alpha CRM")).queryByText(/invalid amount/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide estimates for Alpha CRM" }),
    ).not.toHaveClass("text-red-600");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("does not call a next-year amount zero while its estimates are invalid", async () => {
    mockApi({
      previews: [
        makePreview({
          services: [
            {
              service_id: "svc-z",
              service_name: "Zeta Single",
              conversions: [
                { record_id: "rec-z1", amount: 100, include: true, flags: [], notes: null, payment_method_id: null },
              ],
              existing_actual_total: 0,
              existing_actual_payment_method_ids: [],
              next_year: { action: "create", amount: 100, payment_method_id: null, skip_reason: null, flags: [] },
            },
          ],
          skipped: [],
        }),
      ],
    });
    renderWizard();
    await goToReview();

    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Zeta Single" }));
    const amount = screen.getByLabelText("Amount of estimate 1 of Zeta Single");
    fireEvent.change(amount, { target: { value: "abc" } });
    // The invalid amount counts as 0, but the row is not reported as zero or skipped.
    expect(screen.getByLabelText(`FY${NEXT} amount for Zeta Single`)).toHaveDisplayValue("0.00");
    expect(screen.queryByText(/Amount is zero/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Skipped" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    // A valid zero is a real zero.
    fireEvent.change(amount, { target: { value: "0" } });
    expect(screen.getByText("Amount is zero, so no estimate is created.")).toBeInTheDocument();
    const skipped = screen.getByRole("heading", { name: "Skipped" }).parentElement!;
    expect(within(skipped).getByText("Zeta Single")).toBeInTheDocument();
    expect(within(skipped).getByText(/the amount is zero/)).toBeInTheDocument();

    // An invalid typed next-year amount is not listed as skipped either.
    fireEvent.change(screen.getByLabelText(`FY${NEXT} amount for Zeta Single`), {
      target: { value: "x" },
    });
    expect(screen.getByText("Enter a valid amount.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Skipped" })).not.toBeInTheDocument();
  });

  it("blocks a computed next-year amount above the record limit until it is unticked or lowered", async () => {
    mockApi({
      previews: [
        makePreview({
          services: [
            {
              service_id: "svc-big",
              service_name: "Big Iron",
              conversions: [
                { record_id: "rec-big1", amount: 0.01, include: true, flags: [], notes: null, payment_method_id: null },
              ],
              existing_actual_total: 9999999999.99,
              existing_actual_payment_method_ids: [null],
              next_year: { action: "create", amount: 10000000000, payment_method_id: null, skip_reason: null, flags: [] },
            },
          ],
          skipped: [],
        }),
      ],
    });
    renderWizard();
    await goToReview();

    const amount = screen.getByLabelText(`FY${NEXT} amount for Big Iron`);
    const create = screen.getByLabelText(`Create FY${NEXT} estimate for Big Iron`);
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(amount).toHaveDisplayValue("10000000000.00");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Amount is too large. Enter a smaller amount or untick it."),
    ).toBeInTheDocument();
    expect(within(serviceRow("Big Iron")).getByText("1 invalid amount")).toBeInTheDocument();
    expect(screen.getByText("Fix the highlighted amounts to continue.")).toBeInTheDocument();
    expect(continueButton).toBeDisabled();

    // Unticked, nothing is created, so the estimate alone can be closed.
    fireEvent.click(create);
    expect(amount).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Amount is too large/)).not.toBeInTheDocument();
    expect(continueButton).toBeEnabled();

    // Ticked again it blocks; a typed amount within the limit unblocks it.
    fireEvent.click(create);
    expect(continueButton).toBeDisabled();
    fireEvent.change(amount, { target: { value: "5000" } });
    expect(amount).toHaveAttribute("aria-invalid", "false");
    expect(continueButton).toBeEnabled();
  });

  it("blocks continuing while a close total is above the batch limit", async () => {
    // 101 rows at the record limit add up to more than 999999999999.99.
    const services = Array.from({ length: 101 }, (_, i) => ({
      service_id: `svc-${i}`,
      service_name: `Service ${i}`,
      conversions: [
        { record_id: `rec-${i}`, amount: 9999999999.99, include: true, flags: [], notes: null, payment_method_id: null },
      ],
      existing_actual_total: 0,
      existing_actual_payment_method_ids: [],
      next_year: { action: "create" as const, amount: 9999999999.99, payment_method_id: null, skip_reason: null, flags: [] },
    }));
    mockApi({ previews: [makePreview({ services, skipped: [] })] });
    renderWizard();
    await goToReview();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(
      screen.getByText(/The total to convert is above the \$999,999,999,999\.99 limit/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`The total of new FY${NEXT} estimates is above the`)),
    ).toBeInTheDocument();
    expect(screen.queryByText("Fix the highlighted amounts to continue.")).not.toBeInTheDocument();
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(`Create FY${NEXT} estimate for Service 0`));
    expect(screen.queryByText(/The total of new FY/)).not.toBeInTheDocument();
    expect(screen.getByText(/The total to convert is above/)).toBeInTheDocument();
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Show estimates for Service 0" }));
    fireEvent.click(screen.getByLabelText("Convert estimate 1 of Service 0"));
    expect(screen.queryByText(/The total to convert is above/)).not.toBeInTheDocument();
    expect(continueButton).toBeEnabled();
  });

  it("links to the report view that shows the new estimates when the next year is past", async () => {
    const OLD = YEAR - 1;
    mockApi({ previews: [makePreview({ fiscal_year: OLD, next_fiscal_year: YEAR })] });
    renderWizard();
    await goToReview(OLD);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(`Type ${OLD} to confirm`), {
      target: { value: String(OLD) },
    });
    fireEvent.click(screen.getByRole("button", { name: `Close FY${OLD}` }));
    await screen.findByRole("heading", { name: `FY${OLD} closed` });

    expect(
      screen.getByRole("link", { name: `Open the Costs report for FY${YEAR}` }),
    ).toHaveAttribute("href", `/costs?year=${YEAR}&mode=actual_vs_estimated`);
  });
});

describe("RequireAdmin", () => {
  beforeEach(() => {
    auth.role = "admin";
  });

  function renderGuarded() {
    return render(
      <MemoryRouter initialEntries={["/costs/close-year"]}>
        <Routes>
          <Route
            path="/costs/close-year"
            element={
              <RequireAdmin redirectTo="/costs">
                <p>Wizard</p>
              </RequireAdmin>
            }
          />
          <Route path="/costs" element={<p>Costs report</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("redirects non-admins to the costs report", () => {
    auth.role = "editor";
    renderGuarded();
    expect(screen.getByText("Costs report")).toBeInTheDocument();
    expect(screen.queryByText("Wizard")).not.toBeInTheDocument();
  });

  it("renders the page for admins", () => {
    renderGuarded();
    expect(screen.getByText("Wizard")).toBeInTheDocument();
  });
});
