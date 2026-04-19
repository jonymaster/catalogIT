import {
  buildChartAxis,
  formatChartTickMoney,
  type ChartYScaleMode,
} from "./chartAxis";

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
  /** Called with bar index when a bar is clicked (e.g. year columns on the dashboard). */
  onBarClick?: (index: number) => void;
  /**
   * Y-axis mode. Default `linearZero` matches legacy 0…max behavior (e.g. Cost Report).
   * Use `linearFocused` or `log` on the dashboard to emphasize variation.
   */
  scale?: ChartYScaleMode;
  /** When true and the axis provides a hint (focused/log), show it under the chart. */
  showAxisHint?: boolean;
}

const TICK_FRACS = [0, 0.25, 0.5, 0.75, 1] as const;

export function BarChart({
  data,
  width = 640,
  height = 300,
  color = "#6366f1",
  onBarClick,
  scale = "linearZero",
  showAxisHint = false,
}: Props) {
  const values = data.map((d) => d.value);
  const axis = buildChartAxis(values, scale);

  const n = Math.max(data.length, 1);
  const slot = (width - 96) / n;
  const bw = Math.min(96, Math.max(28, slot - 12));
  const startX = 92;
  /** Space above the plot for value labels (font ~14px + margin). */
  const topInset = 36;
  const bottomPad = 52;
  const chartTop = topInset;
  const chartBottom = height - bottomPad;
  const chartH = chartBottom - chartTop;

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
        {data.map((d, i) => {
          const bh = axis.valueToHeightFraction(d.value) * chartH;
          const colW = (width - startX - 16) / n;
          const x = startX + i * colW + (colW - bw) / 2;
          const y = chartTop + chartH - bh;
          return (
            <g
              key={i}
              className={onBarClick ? "cursor-pointer" : undefined}
              onClick={() => onBarClick?.(i)}
            >
              <rect
                x={x}
                y={y}
                width={bw}
                height={bh}
                rx="4"
                fill={d.color || color}
                opacity="0.85"
              />
              <text
                x={x + bw / 2}
                y={y - 10}
                textAnchor="middle"
                fontSize="14"
                fontWeight="600"
                className="fill-gray-900 dark:fill-gray-50"
              >
                {formatChartTickMoney(d.value)}
              </text>
              <text
                x={x + bw / 2}
                y={height - 14}
                textAnchor="middle"
                fontSize="14"
                fontWeight="600"
                className="fill-gray-700 dark:fill-gray-300"
              >
                {d.label}
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
