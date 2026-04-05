/** Light-theme chip styles only — same in dark mode for consistent pills on list views. */
const statusStyles: Record<string, string> = {
  // Service statuses
  Contract: "bg-emerald-100 text-emerald-800",
  "Self-Managed": "bg-blue-100 text-blue-800",
  Active: "bg-emerald-100 text-emerald-800",
  Deprecated: "bg-red-100 text-red-800",
  "Under Review": "bg-amber-100 text-amber-800",
  Pending: "bg-amber-100 text-amber-800",
  Trial: "bg-purple-100 text-purple-800",
  // Hardware statuses
  Assigned: "bg-purple-100 text-purple-800",
  "In Stock": "bg-emerald-100 text-emerald-800",
  "In Repair": "bg-amber-100 text-amber-800",
  Dismissed: "bg-gray-100 text-gray-600",
  Retired: "bg-gray-100 text-gray-600",
  Lost: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
