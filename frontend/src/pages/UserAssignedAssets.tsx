import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { BooleanYesNoBadge } from "../components/Badge";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import type { UserDetailOutletContext, UserLaptopLink } from "../types/userProfile";

const columns: Column<UserLaptopLink>[] = [
  {
    key: "model_name",
    header: "Model",
    render: (laptop) => (
      <Link
        to={`/hardware/${laptop.id}`}
        className="text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
      >
        {laptop.model_name}
      </Link>
    ),
  },
  {
    key: "serial_number",
    header: "Serial Number",
  },
  {
    key: "status",
    header: "Status",
    render: (laptop) => <StatusBadge status={laptop.status} />,
  },
  {
    key: "hardware_location_name",
    header: "Location",
    render: (laptop) => laptop.hardware_location_name ?? "—",
  },
  {
    key: "is_active",
    header: "Active",
    render: (laptop) => <BooleanYesNoBadge value={laptop.is_active} />,
  },
];

export function UserAssignedAssets() {
  const navigate = useNavigate();
  const { profile } = useOutletContext<UserDetailOutletContext>();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Hardware currently assigned to this user.
      </p>
      <DataTable
        columns={columns}
        data={profile.assigned_laptops}
        onRowClick={(laptop) => navigate(`/hardware/${laptop.id}`)}
        primaryColumnKey="model_name"
      />
    </div>
  );
}
