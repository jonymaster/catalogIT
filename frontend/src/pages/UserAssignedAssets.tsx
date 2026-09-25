import { hardwareTypeLabel } from "../hardware/hardwareTypes";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { BooleanYesNoBadge } from "../components/Badge";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import type { UserDetailOutletContext, UserHardwareAssetLink } from "../types/userProfile";

const columns: Column<UserHardwareAssetLink>[] = [
  { key: "hardware_type", header: "Type", render: (asset) => hardwareTypeLabel(asset.hardware_type) },
  { key: "quantity", header: "Quantity", render: (asset) => asset.quantity },
  {
    key: "model_name",
    header: "Model",
    render: (hardware) => (
      <Link
        to={`/hardware/${hardware.id}`}
        className="text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
      >
        {hardware.model_name}
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
    render: (hardware) => <StatusBadge status={hardware.status} />,
  },
  {
    key: "hardware_location_name",
    header: "Location",
    render: (hardware) => hardware.hardware_location_name ?? "—",
  },
  {
    key: "is_active",
    header: "Active",
    render: (hardware) => <BooleanYesNoBadge value={hardware.is_active} />,
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
        data={profile.assigned_hardware_assets}
        onRowClick={(hardware) => navigate(`/hardware/${hardware.id}`)}
        primaryColumnKey="model_name"
      />
    </div>
  );
}
