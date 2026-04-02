import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import client from "../../api/client";
import type { ReferenceDataResource } from "../../types/referenceData";

interface OutletContextValue {
  resources: ReferenceDataResource[];
}

export function SettingsReferenceData() {
  const [resources, setResources] = useState<ReferenceDataResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .get<ReferenceDataResource[]>("/api/settings/reference-data/")
      .then((response) => {
        setResources(response.data);
      })
      .catch(() => {
        setError("Failed to load reference data resources.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-lg font-medium text-gray-900">Reference Data</h2>
        <p className="text-sm text-gray-600">
          Manage the reusable lookup data that powers service and hardware
          metadata across CatalogIT.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        <NavLink
          to="."
          end
          className={({ isActive }) =>
            `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`
          }
        >
          Overview
        </NavLink>
        {resources.map((resource) => (
          <NavLink
            key={resource.key}
            to={resource.key}
            className={({ isActive }) =>
              `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            {resource.plural_label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ resources } satisfies OutletContextValue} />
    </div>
  );
}
