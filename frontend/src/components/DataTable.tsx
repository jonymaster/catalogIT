export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  visibleKeys?: string[];
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  visibleKeys,
}: Props<T>) {
  const active = visibleKeys
    ? columns.filter((c) => visibleKeys.includes(c.key))
    : columns;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {active.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.length === 0 && (
            <tr>
              <td
                colSpan={active.length}
                className="px-4 py-8 text-center text-sm text-gray-500"
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
                onRowClick
                  ? "cursor-pointer transition-colors hover:bg-gray-50"
                  : undefined
              }
            >
              {active.map((col) => (
                <td
                  key={col.key}
                  className="whitespace-nowrap px-4 py-3 text-sm text-gray-700"
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
  );
}
