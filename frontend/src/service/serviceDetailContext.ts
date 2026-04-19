import type { Service } from "../types/models";

export interface ServiceDraft {
  name: string;
  description: string;
  notes: string;
  point_of_contact: string;
  vendor_id: string;
  category_id: string;
  cost_center_id: string;
  payment_method_id: string;
  service_status_id: string;
  classification_id: string;
  billing_schedule: string;
  renewal_date: string;
  yearly_cost: string;
  criticality: string;
  total_seats: string;
  sso_integrated: boolean;
  scim_enabled: boolean;
  nonprofit_pricing: boolean;
  owner_ids: string[];
}

export type ServiceValidationErrors = Partial<
  Record<keyof ServiceDraft, string>
>;

export interface ServiceDetailContext {
  service: Service;
  reloadService: () => void;
  editing: boolean;
  setEditing: (next: boolean) => void;
  draft: ServiceDraft;
  setDraftField: <K extends keyof ServiceDraft>(
    key: K,
    value: ServiceDraft[K],
  ) => void;
  errors: ServiceValidationErrors;
  saving: boolean;
  saveError: string | null;
}

export function toDraft(s: Service): ServiceDraft {
  return {
    name: s.name,
    description: s.description ?? "",
    notes: s.notes ?? "",
    point_of_contact: s.point_of_contact ?? "",
    vendor_id: s.vendor_id ?? "",
    category_id: s.category_id ?? "",
    cost_center_id: s.cost_center_id ?? "",
    payment_method_id: s.payment_method_id ?? "",
    service_status_id: s.service_status_id ?? "",
    classification_id: s.classification_id ?? "",
    billing_schedule: s.billing_schedule ?? "",
    renewal_date: s.renewal_date ?? "",
    yearly_cost: s.yearly_cost != null ? String(s.yearly_cost) : "",
    criticality: s.criticality ?? "",
    total_seats: s.total_seats != null ? String(s.total_seats) : "",
    sso_integrated: s.sso_integrated,
    scim_enabled: s.scim_enabled ?? false,
    nonprofit_pricing: s.nonprofit_pricing,
    owner_ids: s.owners.map((o) => o.id),
  };
}

export function validateDraft(draft: ServiceDraft): ServiceValidationErrors {
  const errs: ServiceValidationErrors = {};
  if (!draft.name.trim()) errs.name = "Required";
  if (draft.yearly_cost.trim() !== "") {
    const n = Number(draft.yearly_cost);
    if (Number.isNaN(n) || n < 0)
      errs.yearly_cost = "Must be a non-negative number";
  }
  if (draft.total_seats.trim() !== "") {
    const n = Number(draft.total_seats);
    if (!Number.isInteger(n) || n < 1)
      errs.total_seats = "Must be a positive integer";
  }
  if (draft.renewal_date.trim() !== "") {
    const d = new Date(draft.renewal_date);
    if (Number.isNaN(d.getTime())) errs.renewal_date = "Invalid date";
  }
  return errs;
}
