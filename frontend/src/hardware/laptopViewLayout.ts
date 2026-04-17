export type LaptopFieldKey =
  | "status"
  | "assigned_to"
  | "location"
  | "cpu"
  | "ram"
  | "storage_size"
  | "purchase_year"
  | "purchase_cost"
  | "notes";

export const LAPTOP_VIEW_SECTIONS: readonly {
  id: string;
  title: string;
  fields: readonly LaptopFieldKey[];
}[] = [
  {
    id: "overview",
    title: "Overview",
    fields: ["status", "assigned_to", "location"],
  },
  {
    id: "specs",
    title: "Hardware Specs",
    fields: ["cpu", "ram", "storage_size"],
  },
  {
    id: "lifecycle",
    title: "Lifecycle & Cost",
    fields: ["purchase_year", "purchase_cost", "notes"],
  },
] as const;

export const LAPTOP_FIELD_LABELS: Record<LaptopFieldKey, string> = {
  status: "Status",
  assigned_to: "Assigned To",
  location: "Location",
  cpu: "CPU",
  ram: "RAM",
  storage_size: "Storage",
  purchase_year: "Purchase Year",
  purchase_cost: "Purchase Cost",
  notes: "Notes",
};
