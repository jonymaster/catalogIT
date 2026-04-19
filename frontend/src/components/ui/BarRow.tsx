import type { ReactNode } from "react";

type Tone = "accent" | "info" | "purple" | "success" | "warn" | "danger";

interface BarRowProps {
  label: ReactNode;
  value: number;
  max: number;
  tone?: Tone;
  rightLabel?: ReactNode;
  labelWidth?: number;
  onClick?: () => void;
}

const toneVar: Record<Tone, string> = {
  accent: "var(--accent)",
  info: "var(--info)",
  purple: "var(--purple)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

export function BarRow({
  label,
  value,
  max,
  tone = "accent",
  rightLabel,
  labelWidth = 120,
  onClick,
}: BarRowProps) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 py-1 ${onClick ? "cursor-pointer rounded-md px-1 -mx-1 hover:bg-surface-2" : ""}`}
    >
      <div
        className="text-fg-2 truncate"
        style={{ width: labelWidth, fontSize: 12.5 }}
      >
        {label}
      </div>
      <div className="flex-1 h-2 rounded bg-surface-2 overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: toneVar[tone],
            opacity: 0.85,
            transition: "width 400ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </div>
      {rightLabel != null && (
        <div
          className="tnum text-fg-2 text-right shrink-0"
          style={{ width: 64, fontSize: 12.5 }}
        >
          {rightLabel}
        </div>
      )}
    </div>
  );
}
