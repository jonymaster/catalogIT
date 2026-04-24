import {
  buildChartAxis,
  formatChartTickMoney,
  type ChartYScaleMode,
} from "./chartAxis";

interface CatSlice {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface GroupData {
  key: string;
  label: string;
  cats: CatSlice[];
}

interface YearData {
  year: number;
  cats: CatSlice[];
}

interface Props {
  /** Generic drill-down groups (PR branch API). Optional when `yearData` is used. */
  groups?: GroupData[];
  /** Fiscal-year oriented data (legacy API). Normalized internally to `groups`. */
  yearData?: YearData[];
  width?: number;
  height?: number;
  // Generic (groups) callbacks -----------------------------------------------
  onGroupClick?: (group: GroupData) => void;
  onSliceClick?: (group: GroupData, slice: CatSlice) => void;
  // Year-oriented callbacks --------------------------------------------------
  /** Called with fiscal year when a year column is clicked (empty area / label). */
  onYearClick?: (year: number) => void;
  /** Called with fiscal year and category id when a specific stack segment is clicked. */
  onCategoryClick?: (year: number, categoryId: string) => void;
  /** Currently selected year (used together with selectedCategoryId to dim siblings). */
  selectedYear?: number | null;
  /** Currently selected category id (dim other segments in the same column). */
  selectedCategoryId?: string | null;
  /**
   * Y-axis mode for column totals. Default `linearZero` matches legacy 0…max behavior.
   */
  scale?: ChartYScaleMode;
  /** When true and the axis provides a hint, show it under the chart. */
  showAxisHint?: boolean;
}

const TICK_FRACS = [0, 0.25, 0.5, 0.75, 1] as const;

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

export function StackedBar({
  groups,
  yearData,
  width = 640,
  height = 300,
  onGroupClick,
  onSliceClick,
  onYearClick,
  onCategoryClick,
  selectedYear = null,
  selectedCategoryId = null,
  scale = "linearZero",
  showAxisHint = false,
}: Props) {
  // Normalize both input shapes to a single `GroupData[]`. When `yearData` is
  // provided, the numeric year becomes the group key (as a string) and label.
  const normalizedGroups: GroupData[] =
    groups ??
    (yearData
      ? yearData.map((yd) => ({
          key: String(yd.year),
          label: String(yd.year),
          cats: yd.cats,
        }))
      : []);

  // Keep a parallel mapping back to the original year (when available) so that
  // the year-oriented click callbacks receive a number rather than a string.
  const yearForGroup = (i: number): number | null => {
    if (yearData && yearData[i]) return yearData[i].year;
    const parsed = Number.parseInt(normalizedGroups[i]?.key ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const totals = normalizedGroups.map((g) =>
    g.cats.reduce((s, c) => s + c.value, 0),
  );
  const axis = buildChartAxis(totals, scale);

  const startX = 92;
  const topInset = 36;
  const bottomPad = 52;
  const chartTop = topInset;
  const chartBottom = height - bottomPad;
  const chartH = chartBottom - chartTop;
  const n = Math.max(normalizedGroups.length, 1);
  const slot = (width - startX - 20) / n;
  const bw = Math.min(104, Math.max(28, slot - 12));
  const hasCategorySelection =
    selectedYear !== null && selectedCategoryId !== null;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: height }}
      >
        {TICK_FRACS.map((f) => {
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
                {formatChartTickMoney(axis.tickValue(f))}
              </text>
            </g>
          );
        })}
        {normalizedGroups.map((group, i) => {
          const colW = (width - startX - 20) / Math.max(normalizedGroups.length, 1);
          const x = startX + i * colW + (colW - bw) / 2;
          const total = totals[i] ?? 0;
          const colH = axis.valueToHeightFraction(total) * chartH;
          const year = yearForGroup(i);
          let cumH = 0;
          return (
            <g
              key={group.key || i}
              className={onGroupClick ? "cursor-pointer" : undefined}
              onClick={onGroupClick ? () => onGroupClick(group) : undefined}
            >
              {group.cats.map((c, ci) => {
                const bh = total > 0 ? (c.value / total) * colH : 0;
                const y = chartTop + chartH - cumH - bh;
                cumH += bh;
                const isSelected =
                  hasCategorySelection &&
                  year !== null &&
                  year === selectedYear &&
                  c.id === selectedCategoryId;
                const opacity =
                  hasCategorySelection && !isSelected ? 0.24 : 0.8;
                const sliceClickable = Boolean(onSliceClick || onCategoryClick);
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
                    className={sliceClickable ? "cursor-pointer" : undefined}
                    onClick={(event) => {
                      if (onSliceClick) {
                        event.stopPropagation();
                        onSliceClick(group, c);
                        return;
                      }
                      if (onCategoryClick && year !== null) {
                        event.stopPropagation();
                        onCategoryClick(year, c.id);
                        return;
                      }
                      if (onYearClick && year !== null) {
                        onYearClick(year);
                      }
                    }}
                  >
                    <title>
                      {c.name} — {fmt(c.value)}
                      {year !== null ? ` (FY ${year})` : ""}
                    </title>
                  </rect>
                );
              })}
              <text
                x={x + bw / 2}
                y={chartTop + chartH - colH - 10}
                textAnchor="middle"
                fontSize="14"
                fontWeight="600"
                className={`fill-gray-900 dark:fill-gray-50 ${
                  onYearClick && year !== null ? "cursor-pointer" : ""
                }`}
                onClick={
                  onYearClick && year !== null
                    ? (event) => {
                        event.stopPropagation();
                        onYearClick(year);
                      }
                    : undefined
                }
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
                  onYearClick && year !== null ? "cursor-pointer" : ""
                }`}
                onClick={
                  onYearClick && year !== null
                    ? (event) => {
                        event.stopPropagation();
                        onYearClick(year);
                      }
                    : undefined
                }
              >
                {group.label}
              </text>
            </g>
          );
        })}
      </svg>
      {showAxisHint && axis.axisHint ? (
        <div className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">
          {axis.axisHint}
        </div>
      ) : null}
    </div>
  );
}

export type { ChartYScaleMode } from "./chartAxis";
