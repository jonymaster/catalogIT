const statusStyles: Record<string, string> = {
  // Service statuses
  Contract: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Self-Managed": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Deprecated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Under Review": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Trial: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  // Hardware statuses
  Assigned: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Stock": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "In Repair": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Dismissed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Retired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Lost: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
