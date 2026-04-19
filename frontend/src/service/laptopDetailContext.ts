import type { CostRecord, Laptop, OperatingSystem } from "../types/models";

export interface LaptopDraft {
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

export type LaptopValidationErrors = Partial<
  Record<keyof LaptopDraft, string>
>;

export interface LaptopDetailContext {
  laptop: Laptop;
  reloadLaptop: () => void;
  purchaseYear: string;
  costAmount: string;
  costLoading: boolean;
  editing: boolean;
  setEditing: (next: boolean) => void;
  draft: LaptopDraft;
  setDraftField: <K extends keyof LaptopDraft>(
    key: K,
    value: LaptopDraft[K],
  ) => void;
  errors: LaptopValidationErrors;
  saving: boolean;
  saveError: string | null;
}

export function toDraft(laptop: Laptop): LaptopDraft {
  return {
    serial_number: laptop.serial_number ?? "",
    model_name: laptop.model_name ?? "",
    operating_system: laptop.operating_system ?? "",
    cpu: laptop.cpu ?? "",
    ram: laptop.ram ?? "",
    storage_size: laptop.storage_size ?? "",
    status: laptop.status ?? "",
    hardware_status_id: laptop.hardware_status_id ?? "",
    hardware_location_id: laptop.hardware_location_id ?? "",
    assigned_to_id: laptop.assigned_to_id ?? "",
    notes: laptop.notes ?? "",
    mdm_connected: laptop.mdm_connected ?? false,
    purchase_year: "",
    purchase_cost: "",
  };
}

export function mergeCostIntoDraft(
  draft: LaptopDraft,
  cost: CostRecord | null,
): LaptopDraft {
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
  draft: LaptopDraft,
  isActive: boolean,
): LaptopValidationErrors {
  const errs: LaptopValidationErrors = {};
  if (isActive) {
    if (!draft.serial_number.trim()) errs.serial_number = "Required";
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

export function draftFromLaptopAndCostStrings(
  laptop: Laptop,
  purchaseYear: string,
  costAmount: string,
): LaptopDraft {
  return {
    ...toDraft(laptop),
    purchase_year: purchaseYear,
    purchase_cost: costAmount,
  };
}

export function draftToLaptopPayload(draft: LaptopDraft) {
  return {
    serial_number: draft.serial_number.trim(),
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

/** Backend allows only these fields when the laptop is archived. */
export function draftToArchivedLaptopPayload(draft: LaptopDraft) {
  return {
    notes: draft.notes.trim() || null,
    hardware_status_id: draft.hardware_status_id || null,
    hardware_location_id: draft.hardware_location_id || null,
    status: draft.status,
    mdm_connected: draft.mdm_connected,
  };
}
