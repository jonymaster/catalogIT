import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import client from "../../api/client";
import { useToast } from "../../context/useToast";
import type { ReferenceDataResource } from "../../types/referenceData";

interface OutletContextValue {
  resources: ReferenceDataResource[];
}

export function SettingsReferenceData() {
  const { showToast } = useToast();
  const [resources, setResources] = useState<ReferenceDataResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    client
      .get<ReferenceDataResource[]>("/api/settings/reference-data/")
      .then((response) => {
        setResources(response.data);
      })
      .catch(() => {
        setLoadFailed(true);
        showToast({ type: "error", text: "Failed to load reference data resources." });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [showToast]);

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }

  if (loadFailed) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Could not load reference data resources.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Reference Data</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
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
                ? "bg-brand-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:bg-gray-700"
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
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:bg-gray-700"
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
