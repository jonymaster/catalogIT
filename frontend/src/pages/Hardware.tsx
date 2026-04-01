import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { ColumnSelector } from "../components/ColumnSelector";
import { DataTable } from "../components/DataTable";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
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

const ALL_COLUMN_KEYS = columns.map((c) => c.key);

export function Hardware() {
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:hardware:columns",
    ALL_COLUMN_KEYS,
  );
  const { canEdit } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get<Laptop[]>("/api/laptops/")
      .then((r) => setLaptops(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return laptops;
    const q = search.toLowerCase();
    return laptops.filter(
      (l) =>
        l.serial_number.toLowerCase().includes(q) ||
        l.model_name.toLowerCase().includes(q) ||
        l.cpu.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        (l.assigned_to
          ? `${l.assigned_to.first_name} ${l.assigned_to.last_name}`
              .toLowerCase()
              .includes(q)
          : false),
    );
  }, [laptops, search]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Hardware</h1>
        {canEdit && (
          <Link
            to="/hardware/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            New Laptop
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="max-w-sm flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search hardware..."
              />
            </div>
            <ColumnSelector
              columns={columns}
              visibleKeys={visibleKeys}
              onChange={setVisibleKeys}
            />
          </div>
          <DataTable
            columns={columns}
            data={filtered}
            visibleKeys={visibleKeys}
            onRowClick={(l) => navigate(`/hardware/${l.id}`)}
          />
        </>
      )}
    </div>
  );
}
