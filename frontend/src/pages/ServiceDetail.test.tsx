import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import client from "../api/client";
import { AuthContext, type AuthContextValue } from "../context/auth-context";
import { ServiceDetail } from "./ServiceDetail";
import type { Service } from "../types/models";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeAuthValue(): AuthContextValue {
  return {
    token: "token",
    user: { sub: "user-1", email: "viewer@example.com", role: "viewer" },
    preferences: null,
    preferencesLoading: false,
    canEdit: false,
    canFinancialView: false,
    login: vi.fn(),
    logout: vi.fn(),
    setToken: vi.fn(),
    refreshPreferences: vi.fn().mockResolvedValue(undefined),
    setPreferences: vi.fn(),
  };
}

function makeService(): Service {
  return {
    id: "service-1",
    name: "Slack",
    description: "Messaging",
    status: "active",
    billing_schedule: "monthly",
    renewal_date: null,
    yearly_cost: 1200,
    sso_integrated: true,
    point_of_contact: null,
    notes: null,
    owners: [],
    assignees: [],
    total_seats: 10,
    vendor_id: null,
    category_id: null,
    cost_center_id: null,
    payment_method_id: null,
    service_status_id: null,
    contract_id: null,
    classification_id: null,
    scim_enabled: false,
    criticality: null,
    nonprofit_pricing: false,
    is_active: true,
    renewal_reminders_enabled: false,
    renewal_offsets_days: null,
    deprecated_at: null,
    vendor: null,
    category_rel: null,
    cost_center: null,
    payment_method: null,
    service_status: null,
    service_classification: null,
    created_at: "2026-04-19T00:00:00Z",
    updated_at: "2026-04-19T00:00:00Z",
  };
}

function renderServiceDetail() {
  return render(
    <StrictMode>
      <AuthContext.Provider value={makeAuthValue()}>
        <MemoryRouter initialEntries={["/services/service-1"]}>
          <Routes>
            <Route path="/services/:id" element={<ServiceDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </StrictMode>,
  );
}

describe("ServiceDetail", () => {
  beforeEach(() => {
    vi.mocked(client.get).mockReset();
  });

  it("renders the service after the request resolves in StrictMode", async () => {
    const serviceRequest = deferred<{ data: Service }>();
    vi.mocked(client.get).mockReturnValue(serviceRequest.promise);

    renderServiceDetail();

    serviceRequest.resolve({ data: makeService() });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Slack" }),
      ).toBeInTheDocument();
    });
  });
});
