import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { BooleanYesNoBadge } from "../components/Badge";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import type { UserDetailOutletContext, UserServiceLink } from "../types/userProfile";

const columns: Column<UserServiceLink>[] = [
  {
    key: "name",
    header: "Service",
    render: (service) => (
      <Link
        to={`/services/${service.id}`}
        className="text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
      >
        {service.name}
      </Link>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (service) => <StatusBadge status={service.status} />,
  },
  {
    key: "category_name",
    header: "Category",
    render: (service) => service.category_name ?? "—",
  },
  {
    key: "is_active",
    header: "Active",
    render: (service) => <BooleanYesNoBadge value={service.is_active} />,
  },
];

export function UserOwnedServices() {
  const navigate = useNavigate();
  const { profile } = useOutletContext<UserDetailOutletContext>();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Services this user owns or is accountable for.
      </p>
      <DataTable
        columns={columns}
        data={profile.owned_services}
        onRowClick={(service) => navigate(`/services/${service.id}`)}
        primaryColumnKey="name"
      />
    </div>
  );
}
