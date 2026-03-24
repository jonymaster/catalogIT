const statusStyles: Record<string, string> = {
  Contract: "bg-green-100 text-green-800",
  "Self-Managed": "bg-blue-100 text-blue-800",
  Deprecated: "bg-red-100 text-red-800",
  Assigned: "bg-purple-100 text-purple-800",
  "In Stock": "bg-green-100 text-green-800",
  Dismissed: "bg-gray-100 text-gray-600",
  Lost: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
