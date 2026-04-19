import { formatMoneyCompact, formatMoneyFull } from "./money-format";

interface MoneyProps {
  value: number | null | undefined;
  compact?: boolean;
  currency?: string;
  className?: string;
}

export function Money({ value, compact = false, currency = "USD", className = "" }: MoneyProps) {
  if (value == null) {
    return <span className="text-fg-4">—</span>;
  }
  const formatted = compact
    ? formatMoneyCompact(value, currency)
    : formatMoneyFull(value, currency);
  return <span className={`tnum ${className}`.trim()}>{formatted}</span>;
}
