interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: BarData[];
  width?: number;
  height?: number;
  color?: string;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

export function BarChart({
  data,
  width = 600,
  height = 220,
  color = "#6366f1",
}: Props) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = Math.min(60, (width - 80) / data.length - 8);
  const startX = 70;
  const chartH = height - 50;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = 10 + chartH * (1 - f);
        return (
          <g key={f}>
            <line
              x1={startX}
              y1={y}
              x2={width - 10}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="0.5"
            />
            <text
              x={startX - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              {fmt(max * f)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const bh = (d.value / max) * chartH;
        const x =
          startX + i * ((width - startX - 10) / data.length) + 4;
        const y = 10 + chartH - bh;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw}
              height={bh}
              rx="3"
              fill={d.color || color}
              opacity="0.85"
            />
            {bh > 14 && (
              <text
                x={x + bw / 2}
                y={y + 12}
                textAnchor="middle"
                fontSize="9"
                fill="white"
                fontWeight="500"
              >
                {fmt(d.value)}
              </text>
            )}
            <text
              x={x + bw / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
