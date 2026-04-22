import type { RenewalConfig } from "../types/models";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatRenewalConfig(cfg: RenewalConfig | null | undefined): string {
  if (!cfg) return "—";
  if (cfg.type === "monthly") return `Monthly · day ${cfg.day}`;
  const month = MONTH_NAMES[cfg.month - 1] ?? String(cfg.month);
  return `Annual · ${month} ${cfg.day}`;
}

export function renewalConfigLabel(cfg: RenewalConfig | null | undefined): string {
  if (!cfg) return "None";
  return cfg.type === "annual" ? "Annual" : "Monthly";
}

export function clampDay(year: number, monthIndex0: number, day: number): number {
  const last = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(day, last);
}
