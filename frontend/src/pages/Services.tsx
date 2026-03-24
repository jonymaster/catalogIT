import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import type { Service } from "../types/models";

const columns = [
  { key: "name", header: "Name" },
  {
    key: "status",
    header: "Status",
    render: (s: Service) => <StatusBadge status={s.status} />,
  },
  { key: "category", header: "Category" },
  { key: "license_type", header: "License" },
  {
    key: "yearly_cost",
    header: "Yearly Cost",
    render: (s: Service) =>
      s.yearly_cost != null ? `$${Number(s.yearly_cost).toLocaleString()}` : "--",
  },
  {
    key: "sso_integrated",
    header: "SSO",
    render: (s: Service) => (s.sso_integrated ? "Yes" : "No"),
  },
  {
    key: "owners",
    header: "Owners",
    render: (s: Service) =>
      s.owners.map((o) => `${o.first_name} ${o.last_name}`).join(", ") || "--",
  },
];

export function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get<Service[]>("/api/services/")
      .then((r) => setServices(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          data={services}
          onRowClick={(s) => navigate(`/services/${s.id}`)}
        />
      )}
    </div>
  );
}
