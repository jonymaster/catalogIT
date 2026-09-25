import type { CostRecord, HardwareAsset, OperatingSystem, HardwareType } from "../types/models";

export interface HardwareAssetDraft {
  hardware_type: HardwareType;
  quantity: number;
  os_version: string;
  imei: string;
  imei2: string;
  phone_number: string;
  serial_number: string;
  model_name: string;
  operating_system: string;
  cpu: string;
  ram: string;
  storage_size: string;
  status: string;
  hardware_status_id: string;
  hardware_location_id: string;
  assigned_to_id: string;
  notes: string;
  mdm_connected: boolean;
  purchase_year: string;
  purchase_cost: string;
}

export type HardwareAssetValidationErrors = Partial<
  Record<keyof HardwareAssetDraft, string>
>;

export interface HardwareAssetDetailContext {
  hardware: HardwareAsset;
  reloadHardwareAsset: () => void;
  purchaseYear: string;
  costAmount: string;
  costLoading: boolean;
  canFinancialView: boolean;
  editing: boolean;
  setEditing: (next: boolean) => void;
  draft: HardwareAssetDraft;
  setDraftField: <K extends keyof HardwareAssetDraft>(
    key: K,
    value: HardwareAssetDraft[K],
  ) => void;
  errors: HardwareAssetValidationErrors;
  saving: boolean;
  saveError: string | null;
}

export function toDraft(hardware: HardwareAsset): HardwareAssetDraft {
  return {
    hardware_type: hardware.hardware_type,
    quantity: hardware.quantity,
    os_version: hardware.os_version ?? "",
    imei: hardware.imei ?? "",
    imei2: hardware.imei2 ?? "",
    phone_number: hardware.phone_number ?? "",
    serial_number: hardware.serial_number ?? "",
    model_name: hardware.model_name ?? "",
    operating_system: hardware.operating_system ?? "",
    cpu: hardware.cpu ?? "",
    ram: hardware.ram ?? "",
    storage_size: hardware.storage_size ?? "",
    status: hardware.status ?? "",
    hardware_status_id: hardware.hardware_status_id ?? "",
    hardware_location_id: hardware.hardware_location_id ?? "",
    assigned_to_id: hardware.assigned_to_id ?? "",
    notes: hardware.notes ?? "",
    mdm_connected: hardware.mdm_connected ?? false,
    purchase_year: "",
    purchase_cost: "",
  };
}

export function mergeCostIntoDraft(
  draft: HardwareAssetDraft,
  cost: CostRecord | null,
): HardwareAssetDraft {
  if (!cost) {
    return { ...draft, purchase_year: "", purchase_cost: "" };
  }
  return {
    ...draft,
    purchase_year:
      cost.purchase_year != null ? String(cost.purchase_year) : "",
    purchase_cost: String(cost.amount),
  };
}

export function validateDraft(
  draft: HardwareAssetDraft,
  isActive: boolean,
): HardwareAssetValidationErrors {
  const errs: HardwareAssetValidationErrors = {};
  if (isActive) {
    if (!["accessory", "peripheral"].includes(draft.hardware_type) && !draft.serial_number.trim()) errs.serial_number = "Required";
    if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 2147483647) errs.quantity = "Enter a positive whole number";
    for (const key of ["imei", "imei2"] as const) {
      if (draft[key].trim() && !/^[0-9]{15}$/.test(draft[key].trim())) errs[key] = "Enter exactly 15 digits";
    }
    if (!draft.model_name.trim()) errs.model_name = "Required";
    if (draft.purchase_year.trim() !== "") {
      const y = Number(draft.purchase_year);
      if (!Number.isFinite(y) || y < 1900 || y > 2100)
        errs.purchase_year = "Enter a year between 1900 and 2100";
    }
    if (draft.purchase_cost.trim() !== "") {
      const n = Number(draft.purchase_cost);
      if (Number.isNaN(n) || n < 0)
        errs.purchase_cost = "Must be a non-negative number";
    }
  }

  return errs;
}

export function draftFromHardwareAssetAndCostStrings(
  hardware: HardwareAsset,
  purchaseYear: string,
  costAmount: string,
): HardwareAssetDraft {
  return {
    ...toDraft(hardware),
    purchase_year: purchaseYear,
    purchase_cost: costAmount,
  };
}

export function draftToHardwareAssetPayload(draft: HardwareAssetDraft) {
  return {
    hardware_type: draft.hardware_type,
    quantity: draft.quantity,
    os_version: draft.os_version.trim() || null,
    imei: draft.imei.trim() || null,
    imei2: draft.imei2.trim() || null,
    phone_number: draft.phone_number.trim() || null,
    serial_number: draft.serial_number.trim() || null,
    model_name: draft.model_name.trim(),
    operating_system: draft.operating_system
      ? (draft.operating_system as OperatingSystem)
      : null,
    cpu: draft.cpu,
    ram: draft.ram,
    storage_size: draft.storage_size,
    status: draft.status,
    hardware_status_id: draft.hardware_status_id || null,
    hardware_location_id: draft.hardware_location_id || null,
    assigned_to_id: draft.assigned_to_id || null,
    notes: draft.notes.trim() || null,
    mdm_connected: draft.mdm_connected,
  };
}

/** Backend allows only these fields when the hardware is archived. */
export function draftToArchivedHardwareAssetPayload(draft: HardwareAssetDraft) {
  return {
    notes: draft.notes.trim() || null,
    hardware_status_id: draft.hardware_status_id || null,
    hardware_location_id: draft.hardware_location_id || null,
    status: draft.status,
    mdm_connected: draft.mdm_connected,
  };
}
