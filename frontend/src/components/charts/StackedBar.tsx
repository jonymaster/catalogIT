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

interface Props {
  groups: GroupData[];
  width?: number;
  height?: number;
  onGroupClick?: (group: GroupData) => void;
  onSliceClick?: (group: GroupData, slice: CatSlice) => void;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

export function StackedBar({
  groups,
  width = 640,
  height = 300,
  onGroupClick,
  onSliceClick,
}: Props) {
  const max = groups.length
    ? Math.max(
        ...groups.map((group) => group.cats.reduce((s, c) => s + c.value, 0)),
        1,
      )
    : 1;
  const startX = 92;
  const topInset = 36;
  const bottomPad = 52;
  const chartTop = topInset;
  const chartBottom = height - bottomPad;
  const chartH = chartBottom - chartTop;
  const n = Math.max(groups.length, 1);
  const slot = (width - startX - 20) / n;
  const bw = Math.min(104, Math.max(28, slot - 12));

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
      {groups.map((group, i) => {
        const colW = (width - startX - 20) / Math.max(groups.length, 1);
        const x = startX + i * colW + (colW - bw) / 2;
        let cumH = 0;
        const total = group.cats.reduce((s, c) => s + c.value, 0);
        return (
          <g
            key={group.key || i}
            className={onGroupClick ? "cursor-pointer" : undefined}
            onClick={() => onGroupClick?.(group)}
          >
            {group.cats.map((c, ci) => {
              const bh = (c.value / max) * chartH;
              const y = chartTop + chartH - cumH - bh;
              cumH += bh;
              return (
                <rect
                  key={ci}
                  x={x}
                  y={y}
                  width={bw}
                  height={Math.max(bh, 0)}
                  rx="3"
                  fill={c.color}
                  opacity="0.8"
                  className={onSliceClick ? "cursor-pointer" : undefined}
                  onClick={(event) => {
                    if (!onSliceClick) return;
                    event.stopPropagation();
                    onSliceClick(group, c);
                  }}
                />
              );
            })}
            <text
              x={x + bw / 2}
              y={chartTop + chartH - cumH - 10}
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              className="fill-gray-900 dark:fill-gray-50"
            >
              {fmt(total)}
            </text>
            <text
              x={x + bw / 2}
              y={height - 14}
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              className="fill-gray-700 dark:fill-gray-300"
            >
              {group.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
