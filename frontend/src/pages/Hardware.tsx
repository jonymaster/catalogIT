import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import type { Laptop } from "../types/models";

const columns = [
  { key: "serial_number", header: "Serial Number" },
  { key: "model_name", header: "Model" },
  {
    key: "status",
    header: "Status",
    render: (l: Laptop) => <StatusBadge status={l.status} />,
  },
  { key: "cpu", header: "CPU" },
  { key: "ram", header: "RAM" },
  { key: "storage_size", header: "Storage" },
  {
    key: "assigned_to",
    header: "Assigned To",
    render: (l: Laptop) =>
      l.assigned_to
        ? `${l.assigned_to.first_name} ${l.assigned_to.last_name}`
        : "--",
  },
];

export function Hardware() {
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get<Laptop[]>("/api/laptops/")
      .then((r) => setLaptops(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Hardware</h1>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          data={laptops}
          onRowClick={(l) => navigate(`/hardware/${l.id}`)}
        />
      )}
    </div>
  );
}
