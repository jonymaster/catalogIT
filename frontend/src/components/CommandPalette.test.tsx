import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import client from "../api/client";
import { CommandPalette } from "./CommandPalette";
import type { Laptop } from "../types/models";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { role: "viewer" },
    canFinancialView: false,
    canHardwareView: true,
  }),
}));

const laptop = {
  id: "laptop-1",
  serial_number: "C02FABRIC01",
  model_name: "MacBook Pro 14-inch",
  cpu: "",
  ram: "",
  storage_size: "",
  operating_system: "macos",
  status: "Assigned",
  hardware_status_id: null,
  hardware_location_id: null,
  hardware_status: null,
  hardware_location: null,
  assigned_to_id: null,
  assigned_to: null,
  notes: null,
  mdm_connected: true,
  is_active: true,
  archived_at: null,
  created_at: "2026-04-25T00:00:00Z",
  updated_at: "2026-04-25T00:00:00Z",
} satisfies Laptop;

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.get).mockImplementation((url) => {
      if (url === "/api/services/") {
        return Promise.resolve({ data: [] });
      }
      if (url === "/api/laptops/search") {
        return Promise.resolve({ data: [laptop] });
      }
      return Promise.resolve({ data: { items: [] } });
    });
  });

  it("searches hardware by full serial number through the laptop search API", async () => {
    render(
      <MemoryRouter>
        <CommandPalette open onClose={() => undefined} />
      </MemoryRouter>,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Jump to a service, laptop, person, or page…"),
      { target: { value: "C02FABRIC01" } },
    );

    await waitFor(() => {
      expect(client.get).toHaveBeenCalledWith("/api/laptops/search", {
        params: { q: "C02FABRIC01", limit: 18 },
      });
    });
    expect(await screen.findByText("MacBook Pro 14-inch")).toBeInTheDocument();
    expect(screen.getByText("S/N C02FABRIC01")).toBeInTheDocument();
  });
});
