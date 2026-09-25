import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HardwareTypeFields } from "./HardwareTypeFields";
import { osOptionsForType } from "../hardware/hardwareTypes";
import { draftToHardwareAssetPayload, validateDraft, type HardwareAssetDraft } from "../service/hardwareDetailContext";

const initial: HardwareAssetDraft = {
  hardware_type: "phone", quantity: 1, model_name: "Phone", serial_number: "SN",
  operating_system: "ios", os_version: "18", imei: "123456789012345", imei2: "", phone_number: "",
  cpu: "", ram: "", storage_size: "128GB", status: "In Stock", hardware_status_id: "",
  hardware_location_id: "room-1", assigned_to_id: "", notes: "", mdm_connected: true,
  purchase_year: "", purchase_cost: "",
};
function Form() {
  const [draft, setDraft] = useState(initial);
  return <>
    <HardwareTypeFields value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
    <output data-testid="payload">{JSON.stringify(draftToHardwareAssetPayload(draft))}</output>
  </>;
}

describe("hardware category fields", () => {
  it("switches from a managed phone to a simple accessory batch and clears device fields", () => {
    render(<Form />);
    expect(screen.getByLabelText("IMEI")).toHaveValue("123456789012345");
    fireEvent.change(screen.getByLabelText("Hardware type"), { target: { value: "accessory" } });
    expect(screen.queryByLabelText("IMEI")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("OS version")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "20" } });
    const payload = JSON.parse(screen.getByTestId("payload").textContent!);
    expect(payload).toMatchObject({ hardware_type: "accessory", quantity: 20, operating_system: null,
      imei: null, os_version: null, storage_size: "", mdm_connected: false, hardware_location_id: "room-1" });
  });
  it("keeps peripherals simple and retains their location", () => {
    render(<Form />);
    fireEvent.change(screen.getByLabelText("Hardware type"), { target: { value: "peripheral" } });
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("IMEI")).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("payload").textContent!)).toMatchObject({ quantity: 1, hardware_location_id: "room-1" });
  });
  it("validates device serials and mobile identifiers, while allowing unserialized batches", () => {
    expect(validateDraft({ ...initial, serial_number: "" }, true).serial_number).toBeDefined();
    expect(validateDraft({ ...initial, imei: "123" }, true).imei).toBeDefined();
    expect(validateDraft({ ...initial, hardware_type: "accessory", serial_number: "", quantity: 20 }, true).serial_number).toBeUndefined();
    expect(validateDraft({ ...initial, quantity: 0 }, true).quantity).toBeDefined();
    expect(osOptionsForType("phone").map((os) => os.value)).toEqual(["android", "ios"]);
    expect(osOptionsForType("tablet").map((os) => os.value)).toContain("ipados");
  });
});
