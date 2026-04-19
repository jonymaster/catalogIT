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
  /** Called with fiscal year when a year column is clicked (empty area / label). */
  onYearClick?: (year: number) => void;
  /** Called with fiscal year and category id when a specific stack segment is clicked. */
  onCategoryClick?: (year: number, categoryId: string) => void;
  /** Currently selected year (used together with selectedCategoryId to dim siblings). */
  selectedYear?: number | null;
  /** Currently selected category id (dim other segments in the same column). */
  selectedCategoryId?: string | null;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

export function StackedBar({
  yearData,
  width = 640,
  height = 300,
  onYearClick,
  onCategoryClick,
  selectedYear = null,
  selectedCategoryId = null,
}: Props) {
  const max = yearData.length
    ? Math.max(
        ...yearData.map((yd) =>
          yd.cats.reduce((s, c) => s + c.value, 0),
        ),
        1,
      )
    : 1;
  const startX = 92;
  const topInset = 36;
  const bottomPad = 52;
  const chartTop = topInset;
  const chartBottom = height - bottomPad;
  const chartH = chartBottom - chartTop;
  const n = Math.max(yearData.length, 1);
  const slot = (width - startX - 20) / n;
  const bw = Math.min(104, Math.max(28, slot - 12));
  const hasCategorySelection =
    selectedYear !== null && selectedCategoryId !== null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = chartTop + chartH * (1 - f);
        return (
          <g key={f}>
            <line
              x1={startX}
              y1={y}
              x2={width - 10}
              y2={y}
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="0.5"
            />
            <text
              x={startX - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="13"
              fontWeight="500"
              className="fill-gray-500 dark:fill-gray-400"
            >
              {fmt(max * f)}
            </text>
          </g>
        );
      })}
      {yearData.map((yd, i) => {
        const colW = (width - startX - 20) / Math.max(yearData.length, 1);
        const x = startX + i * colW + (colW - bw) / 2;
        let cumH = 0;
        const total = yd.cats.reduce((s, c) => s + c.value, 0);
        return (
          <g key={i}>
            {yd.cats.map((c, ci) => {
              const bh = (c.value / max) * chartH;
              const y = chartTop + chartH - cumH - bh;
              cumH += bh;
              const isSelected =
                hasCategorySelection &&
                yd.year === selectedYear &&
                c.id === selectedCategoryId;
              const opacity =
                hasCategorySelection && !isSelected ? 0.24 : 0.8;
              return (
                <rect
                  key={ci}
                  x={x}
                  y={y}
                  width={bw}
                  height={Math.max(bh, 0)}
                  rx="3"
                  fill={c.color}
                  opacity={opacity}
                  className={onCategoryClick ? "cursor-pointer" : undefined}
                  onClick={(e) => {
                    if (onCategoryClick) {
                      e.stopPropagation();
                      onCategoryClick(yd.year, c.id);
                    } else if (onYearClick) {
                      onYearClick(yd.year);
                    }
                  }}
                >
                  <title>
                    {c.name} — {fmt(c.value)} (FY {yd.year})
                  </title>
                </rect>
              );
            })}
            <text
              x={x + bw / 2}
              y={chartTop + chartH - cumH - 10}
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              className={`fill-gray-900 dark:fill-gray-50 ${
                onYearClick ? "cursor-pointer" : ""
              }`}
              onClick={() => onYearClick?.(yd.year)}
            >
              {fmt(total)}
            </text>
            <text
              x={x + bw / 2}
              y={height - 14}
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              className={`fill-gray-700 dark:fill-gray-300 ${
                onYearClick ? "cursor-pointer" : ""
              }`}
              onClick={() => onYearClick?.(yd.year)}
            >
              {yd.year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
