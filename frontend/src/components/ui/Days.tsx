interface DaysProps {
  date: string | null | undefined;
  today?: Date;
}

/**
 * Renders a days-from-today chip. Color-codes by urgency:
 *   ≤ 14d  → warn
 *   ≤ 45d  → info
 *   past   → muted
 */
export function Days({ date, today = new Date() }: DaysProps) {
  if (!date) return <span className="text-fg-4">—</span>;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return <span className="text-fg-4">—</span>;

  const diff = Math.round((parsed.getTime() - today.getTime()) / 86400000);

  let label: string;
  let color: string;
  if (diff < 0) {
    label = `${-diff}d ago`;
    color = "var(--fg-3)";
  } else if (diff === 0) {
    label = "today";
    color = "var(--warn)";
  } else if (diff <= 14) {
    label = `${diff}d`;
    color = "var(--warn)";
  } else if (diff <= 45) {
    label = `${diff}d`;
    color = "var(--info)";
  } else {
    label = `${diff}d`;
    color = "var(--fg-3)";
  }

  return (
    <span className="tnum" style={{ color }}>
      {label}
    </span>
  );
}
