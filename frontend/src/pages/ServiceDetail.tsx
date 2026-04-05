import { useEffect, useState } from "react";
import {
  useParams,
  Link,
  useNavigate,
  NavLink,
  Outlet,
} from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { Service } from "../types/models";

const tabs = [
  { to: ".", label: "Overview", end: true },
  { to: "costs", label: "Costs", end: false },
];

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    client
      .get<Service>(`/api/services/${id}`)
      .then((r) => setService(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this service?"))
      return;
    await client.delete(`/api/services/${id}`);
    navigate("/services");
  }

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  if (!service)
    return <p className="text-sm text-red-600">Service not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/services"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            &larr; Back to Services
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {service.name}
          </h1>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link
              to={`/services/${id}/edit`}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet context={{ service }} />
    </div>
  );
}
