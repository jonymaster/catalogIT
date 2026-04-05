export type BadgeColor =
  | "gray"
  | "green"
  | "blue"
  | "purple"
  | "amber"
  | "red"
  | "teal"
  | "pink";

const colorMap: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  teal: "bg-teal-100 text-teal-800",
  pink: "bg-pink-100 text-pink-800",
};

interface Props {
  children: React.ReactNode;
  color?: BadgeColor;
}

export function Badge({ children, color = "gray" }: Props) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[color]}`}
    >
      {children}
    </span>
  );
}

const criticalityColors: Record<string, BadgeColor> = {
  Critical: "red",
  High: "amber",
  Medium: "blue",
  Low: "gray",
};

export function CriticalityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400">--</span>;
  return <Badge color={criticalityColors[value] ?? "gray"}>{value}</Badge>;
}

const classificationColors: Record<string, BadgeColor> = {
  core_saas: "purple",
  subscription: "blue",
  internal: "teal",
};

export function ClassificationBadge({
  classification,
}: {
  classification: { slug: string; name: string } | null;
}) {
  if (!classification) return <span className="text-gray-400">--</span>;
  return (
    <Badge color={classificationColors[classification.slug] ?? "gray"}>
      {classification.name}
    </Badge>
  );
}
