import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { ClassificationBadge, CriticalityBadge } from "../components/Badge";
import { ColumnSelector } from "../components/ColumnSelector";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import type { Service } from "../types/models";

const columns: Column<Service>[] = [
  { key: "name", header: "Name" },
  {
    key: "status",
    header: "Status",
    render: (s) => <StatusBadge status={s.status} />,
  },
  { key: "category", header: "Category" },
  { key: "license_type", header: "License" },
  {
    key: "classification",
    header: "Classification",
    render: (s) => <ClassificationBadge value={s.classification} />,
  },
  {
    key: "criticality",
    header: "Criticality",
    render: (s) => <CriticalityBadge value={s.criticality} />,
  },
  {
    key: "nonprofit_pricing",
    header: "Nonprofit",
    render: (s) => (s.nonprofit_pricing ? "Yes" : "No"),
  },
  {
    key: "yearly_cost",
    header: "Yearly Cost",
    render: (s) =>
      s.yearly_cost != null ? `$${Number(s.yearly_cost).toLocaleString()}` : "--",
  },
  {
    key: "sso_integrated",
    header: "SSO",
    render: (s) => (s.sso_integrated ? "Yes" : "No"),
  },
  {
    key: "scim_enabled",
    header: "SCIM",
    render: (s) =>
      s.scim_enabled == null ? "--" : s.scim_enabled ? "Yes" : "No",
  },
  {
    key: "vendor",
    header: "Vendor",
    render: (s) => s.vendor?.name ?? "--",
  },
  {
    key: "owners",
    header: "Owners",
    render: (s) =>
      s.owners.map((o) => `${o.first_name} ${o.last_name}`).join(", ") || "--",
  },
];

const ALL_COLUMN_KEYS = columns.map((c) => c.key);

export function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:services:columns",
    ALL_COLUMN_KEYS,
  );
  const { canEdit } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get<Service[]>("/api/services/")
      .then((r) => setServices(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.license_type.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        (s.vendor?.name ?? "").toLowerCase().includes(q) ||
        s.owners.some(
          (o) =>
            o.first_name.toLowerCase().includes(q) ||
            o.last_name.toLowerCase().includes(q),
        ),
    );
  }, [services, search]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
        {canEdit && (
          <Link
            to="/services/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            New Service
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
                placeholder="Search services..."
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
            onRowClick={(s) => navigate(`/services/${s.id}`)}
          />
        </>
      )}
    </div>
  );
}
