export interface Column<T> {
  key: string;
  header: React.ReactNode;
  label?: string;
  render?: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  visibleKeys?: string[];
  /** Zebra striping on data rows */
  striped?: boolean;
  /** Renders this column with stronger weight (e.g. primary identifier) */
  primaryColumnKey?: string;
}

function columnsInOrder<T>(columns: Column<T>[], visibleKeys: string[]): Column<T>[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return visibleKeys.map((key) => byKey.get(key)).filter((c): c is Column<T> => c != null);
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  visibleKeys,
  striped = false,
  primaryColumnKey,
}: Props<T>) {
  const active = visibleKeys
    ? columnsInOrder(columns, visibleKeys)
    : columns;

  return (
    <div className="overflow-visible rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-950">
            <tr>
              {active.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={
              striped ? "bg-white dark:bg-gray-900" : "divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900"
            }
          >
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={active.length}
                  className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No records found.
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={
                  striped
                    ? [
                        "[&:nth-child(odd)]:bg-white dark:[&:nth-child(odd)]:bg-gray-900 [&:nth-child(even)]:bg-gray-50 dark:[&:nth-child(even)]:bg-gray-950",
                        onRowClick
                          ? "cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : onRowClick
                      ? "cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                      : undefined
                }
              >
                {active.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      "whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200",
                      col.key === primaryColumnKey
                        ? "font-semibold text-gray-900 dark:text-gray-100"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
