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

export type ParseRenewalOffsetsResult =
  | { ok: true; value: number[] | null }
  | { ok: false; message: string };

/**
 * Parses the free-text "Offsets override" field used by the service create
 * and edit forms. Empty input ⇒ `{ ok: true, value: null }` (use global
 * defaults). Otherwise splits on comma/whitespace, requires positive
 * integers, and deduplicates. Shared by ServiceForm and ServiceNotifications
 * so validation is identical across the create and edit flows.
 */
export function parseRenewalOffsets(text: string): ParseRenewalOffsetsResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };

  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  const seen = new Set<number>();
  const parsed: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (Number.isNaN(n) || n <= 0 || !/^\d+$/.test(p)) {
      return {
        ok: false,
        message: "Offsets must be positive integers (e.g. 30, 14, 7, 1).",
      };
    }
    if (seen.has(n)) continue;
    seen.add(n);
    parsed.push(n);
  }
  return { ok: true, value: parsed };
}
