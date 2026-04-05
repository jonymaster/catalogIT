/** Stored billing_schedule values align with ServiceForm options. */

const BILLING_LABELS: Record<string, string> = {
  monthly: "Monthly",
  annually: "Annually",
  na: "N/A",
  on_demand: "On-Demand",
};

export function formatBillingSchedule(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  const v = raw.toLowerCase().replace(/\s+/g, "_");
  if (!v) return "--";
  return BILLING_LABELS[v] ?? raw;
}
