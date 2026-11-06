import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import client from "../api/client";
import type { DashboardCostRecord } from "../types/dashboardCost";
import { CostsReport } from "./CostsReport";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({ role: "admin" }));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    token: "token",
    user: { sub: "user-1", email: "user@example.com", role: auth.role },
    preferences: null,
    canEdit: true,
    canFinancialView: true,
    canHardwareView: true,
  }),
}));

function renderReport(path = "/costs") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CostsReport />
    </MemoryRouter>,
  );
}

describe("CostsReport close financial year entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.get).mockImplementation((url) => {
      if (url === "/api/dashboard/") {
        return Promise.resolve({ data: { cost_records: [], fiscal_years: [] } });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it("shows the close financial year button to admins", async () => {
    auth.role = "admin";
    renderReport();
    expect(
      await screen.findByRole("link", { name: "Close financial year" }),
    ).toHaveAttribute("href", "/costs/close-year");
  });

  it("hides the button from non-admins with financial visibility", async () => {
    auth.role = "editor";
    renderReport();
    expect(
      await screen.findByText("No cost rows match the current filters."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Close financial year" }),
    ).not.toBeInTheDocument();
  });
});

const CURRENT_YEAR = new Date().getFullYear();
/** Past years only, so the default view does not merge estimates into them. */
const OLDER = CURRENT_YEAR - 4;
const OLD = CURRENT_YEAR - 3;
const ESTIMATED_ONLY = CURRENT_YEAR - 2;

function record(
  id: string,
  serviceName: string,
  fiscalYear: number,
  recordType: string,
  amount: number,
): DashboardCostRecord {
  return {
    cost_record_id: id,
    source: "service",
    service_id: `svc-${id}`,
    hardware_id: null,
    service_name: serviceName,
    purchase_year: null,
    vendor_id: null,
    vendor_name: null,
    category_id: null,
    classification: null,
    classification_id: null,
    classification_name: null,
    category_name: null,
    cost_center_id: null,
    cost_center_name: null,
    environment_name: null,
    team_name: null,
    team_names: [],
    operating_system: null,
    fiscal_year: fiscalYear,
    amount,
    record_type: recordType,
    notes: null,
  };
}

describe("CostsReport year and view query params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "editor";
    const records = [
      record("r1", "Alpha CRM", OLDER, "actual", 100),
      record("r2", "Beta Tools", OLD, "actual", 200),
      // For example created by closing the year before it.
      record("r3", "Gamma Hosting", ESTIMATED_ONLY, "estimated", 300),
    ];
    vi.mocked(client.get).mockImplementation((url) => {
      if (url === "/api/dashboard/") {
        return Promise.resolve({
          data: { cost_records: records, fiscal_years: [OLDER, OLD, ESTIMATED_ONLY] },
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  function lineItems() {
    return screen.getByText(/^Line items \(\d+\)$/).closest("div")!;
  }

  it("opens the view and year from the URL", async () => {
    renderReport(`/costs?year=${ESTIMATED_ONLY}&mode=actual_vs_estimated`);
    expect(await screen.findByText("Line items (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actual vs Estimated" })).toHaveClass("bg-brand-600");
    expect(screen.getByRole("button", { name: "Only Actual" })).not.toHaveClass("bg-brand-600");
    expect(screen.getByRole("button", { name: "Clear year filter" })).toBeInTheDocument();
    expect(within(lineItems()).getByText(`FY ${ESTIMATED_ONLY}`)).toBeInTheDocument();
    expect(within(lineItems()).getByText("Gamma Hosting")).toBeInTheDocument();
  });

  it("keeps the default view without a mode param or with an unknown one", async () => {
    for (const path of ["/costs", "/costs?mode=bogus", "/costs?mode=toString"]) {
      const { unmount } = renderReport(path);
      expect(await screen.findByText("Line items (2)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Only Actual" })).toHaveClass("bg-brand-600");
      expect(screen.queryByText("Gamma Hosting")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("filters line items by a year from the URL that the report has", async () => {
    renderReport(`/costs?year=${OLD}`);
    expect(await screen.findByText("Line items (1)")).toBeInTheDocument();
    expect(within(lineItems()).getByText(`FY ${OLD}`)).toBeInTheDocument();
    expect(within(lineItems()).getByText("Beta Tools")).toBeInTheDocument();
    expect(within(lineItems()).queryByText("Alpha CRM")).not.toBeInTheDocument();
  });

  it.each([
    ["has no data in the current view", ESTIMATED_ONLY],
    ["is not a report year", CURRENT_YEAR - 10],
  ])("ignores a year from the URL that %s", async (_label, year) => {
    renderReport(`/costs?year=${year}`);
    // All line items, no year chip, and the KPIs use the latest year.
    expect(await screen.findByText("Line items (2)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear year filter" })).not.toBeInTheDocument();
    expect(screen.queryByText(`FY ${year}`)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: String(OLD) })).toHaveClass("bg-brand-600");
    expect(screen.getByRole("button", { name: String(OLDER) })).not.toHaveClass("bg-brand-600");
  });
});
