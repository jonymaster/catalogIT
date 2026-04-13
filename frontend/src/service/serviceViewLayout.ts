/**
 * Single source of order for Service read (Overview) and edit (ServiceForm) fields.
 * Name is collected only on the edit form and appears above these sections.
 */
export type ServiceFieldKey =
  | "status"
  | "owners"
  | "classification"
  | "criticality"
  | "sso_integrated"
  | "scim_enabled"
  | "vendor"
  | "spending_category"
  | "cost_center"
  | "billing_schedule"
  | "renewal_date"
  | "yearly_cost"
  | "payment_method"
  | "nonprofit_pricing"
  | "renewal_reminders"
  | "point_of_contact"
  | "notes"
  | "total_seats";

export const SERVICE_VIEW_SECTIONS: readonly {
  id: string;
  title: string;
  fields: readonly ServiceFieldKey[];
}[] = [
  {
    id: "general",
    title: "General",
    fields: [
      "status",
      "owners",
      "classification",
      "criticality",
      "sso_integrated",
      "scim_enabled",
      "vendor",
      "total_seats",
    ],
  },
  {
    id: "cost",
    title: "Cost Management",
    fields: [
      "spending_category",
      "cost_center",
      "billing_schedule",
      "renewal_date",
      "yearly_cost",
      "payment_method",
      "nonprofit_pricing",
      "renewal_reminders",
    ],
  },
  {
    id: "notes",
    title: "Notes",
    fields: ["point_of_contact", "notes"],
  },
] as const;

/** Labels aligned with Service read view. */
export const SERVICE_FIELD_LABELS: Record<ServiceFieldKey, string> = {
  status: "Status",
  owners: "Owner",
  classification: "Classification",
  criticality: "Criticality",
  sso_integrated: "SSO Integrated",
  scim_enabled: "SCIM Enabled",
  vendor: "Vendor",
  spending_category: "Spending Category",
  cost_center: "Cost Center",
  billing_schedule: "Billing Schedule",
  renewal_date: "Renewal Date",
  yearly_cost: "Yearly Cost",
  payment_method: "Payment Method",
  nonprofit_pricing: "Nonprofit Pricing",
  renewal_reminders: "Renewal reminders",
  point_of_contact: "Point of contact",
  notes: "Notes",
  total_seats: "Number of seats",
};
