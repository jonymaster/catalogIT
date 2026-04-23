export interface Column<T> {
  key: string;
  header: React.ReactNode;
  label?: string;
  render?: (row: T) => React.ReactNode;
  /** Cell and header alignment (default left) */
  align?: "left" | "right" | "center";
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
  /** Extra classes on the outer card wrapper */
  className?: string;
  /** Extra classes merged onto `<table>` */
  tableClassName?: string;
  /** Extra classes on the primary column `<td>` (e.g. print helpers) */
  primaryCellClassName?: string;
  /**
   * When set, only rows for which this returns true get pointer hover / primary underline.
   * Use when some rows are not navigable. Requires `onRowClick`.
   */
  rowInteractive?: (row: T) => boolean;
}

function clickCameFromInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest(
    'a, button, input, select, textarea, label, summary, [role="button"], [role="link"]',
  ) != null;
}

function columnsInOrder<T>(columns: Column<T>[], visibleKeys: string[]): Column<T>[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return visibleKeys.map((key) => byKey.get(key)).filter((c): c is Column<T> => c != null);
}

function alignClass(align: Column<unknown>["align"]): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  visibleKeys,
  striped = false,
  primaryColumnKey,
  className: wrapClassName,
  tableClassName,
  primaryCellClassName,
  rowInteractive,
}: Props<T>) {
  const active = visibleKeys
    ? columnsInOrder(columns, visibleKeys)
    : columns;

  const cardClass = [
    "overflow-visible rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm",
    wrapClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const tableClass = [
    "min-w-full divide-y divide-gray-200 dark:divide-gray-800",
    tableClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClass}>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr className="bg-gray-50/80 dark:bg-gray-950/80 backdrop-blur-sm">
              {active.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={[
                    "px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400",
                    alignClass(col.align),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={
              striped ? "bg-white dark:bg-gray-900" : "divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900"
            }
          >
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={active.length}
                  className="px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-gray-300 dark:text-gray-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    <p className="text-sm text-gray-400 dark:text-gray-500">No records found</p>
                  </div>
                </td>
              </tr>
            )}
            {data.map((row) => {
              const rowIsInteractive =
                !!onRowClick &&
                (rowInteractive ? rowInteractive(row) : true);
              return (
              <tr
                key={row.id}
                onClick={(event) => {
                  if (!onRowClick || clickCameFromInteractiveElement(event.target)) {
                    return;
                  }
                  if (rowInteractive && !rowInteractive(row)) return;
                  onRowClick(row);
                }}
                className={
                  striped
                    ? [
                        "[&:nth-child(odd)]:bg-white dark:[&:nth-child(odd)]:bg-gray-900 [&:nth-child(even)]:bg-gray-50/50 dark:[&:nth-child(even)]:bg-gray-950/50",
                        rowIsInteractive
                          ? "interactive-record cursor-pointer transition-colors duration-100 hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : rowIsInteractive
                      ? "interactive-record cursor-pointer transition-colors duration-100 hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                      : undefined
                }
              >
                {active.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      "whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200",
                      alignClass(col.align),
                      col.key === primaryColumnKey
                        ? [
                            "font-semibold text-fg",
                            rowIsInteractive ? "data-record-primary" : "",
                            primaryCellClassName ?? "",
                          ]
                            .filter(Boolean)
                            .join(" ")
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
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
