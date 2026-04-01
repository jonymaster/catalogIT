interface CatSlice {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface YearData {
  year: number;
  cats: CatSlice[];
}

interface Props {
  yearData: YearData[];
  width?: number;
  height?: number;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

export function StackedBar({
  yearData,
  width = 600,
  height = 240,
}: Props) {
  const max = Math.max(
    ...yearData.map((yd) =>
      yd.cats.reduce((s, c) => s + c.value, 0),
    ),
    1,
  );
  const startX = 70;
  const chartH = height - 50;
  const bw = Math.min(
    80,
    (width - startX - 20) / yearData.length - 12,
  );

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
      {yearData.map((yd, i) => {
        const x =
          startX +
          i * ((width - startX - 20) / yearData.length) +
          6;
        let cumH = 0;
        const total = yd.cats.reduce((s, c) => s + c.value, 0);
        return (
          <g key={i}>
            {yd.cats.map((c, ci) => {
              const bh = (c.value / max) * chartH;
              const y = 10 + chartH - cumH - bh;
              cumH += bh;
              return (
                <rect
                  key={ci}
                  x={x}
                  y={y}
                  width={bw}
                  height={Math.max(bh, 0)}
                  rx="2"
                  fill={c.color}
                  opacity="0.8"
                />
              );
            })}
            <text
              x={x + bw / 2}
              y={10 + chartH - cumH - 4}
              textAnchor="middle"
              fontSize="9"
              fill="#374151"
              fontWeight="500"
            >
              {fmt(total)}
            </text>
            <text
              x={x + bw / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
              fontWeight="500"
            >
              {yd.year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
