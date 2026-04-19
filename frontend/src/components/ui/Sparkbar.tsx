type Tone = "accent" | "info" | "purple" | "success" | "warn" | "danger";

interface SparkbarProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: Tone;
}

const toneVar: Record<Tone, string> = {
  accent: "var(--accent)",
  info: "var(--info)",
  purple: "var(--purple)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

export function Sparkbar({ values, width = 100, height = 22, tone = "accent" }: SparkbarProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  if (max <= 0) return null;
  const gap = 1.5;
  const barW = width / values.length - gap;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            fill={toneVar[tone]}
            opacity={0.3 + 0.7 * (v / max)}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
