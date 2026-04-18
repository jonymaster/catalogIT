import { useCallback, useEffect, useState } from "react";
import {
  useParams,
  Link,
  NavLink,
  Outlet,
} from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { PencilSquareIcon } from "../components/Icons";
import { DetailPageSkeleton } from "../components/Skeleton";
import { useAuth } from "../context/useAuth";
import type { Service } from "../types/models";

const tabs = [
  { to: ".", label: "Overview", end: true },
  { to: "costs", label: "Costs", end: false },
  { to: "assignments", label: "Seats & assignments", end: false },
];

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [loadedServiceId, setLoadedServiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    client
      .get<Service>(`/api/services/${id}`)
      .then((r) => {
        if (!cancelled) {
          setService(r.data);
          setLoadedServiceId(id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setService(null);
          setLoadedServiceId(id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const reloadService = useCallback(() => {
    if (!id) return;
    client.get<Service>(`/api/services/${id}`).then((r) => setService(r.data));
  }, [id]);

  const loading = id != null && loadedServiceId !== id;

  if (loading) return <DetailPageSkeleton />;
  if (!service)
    return <p className="text-sm text-red-600">Service not found.</p>;

  return (
    <PageTransition>
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
          {service.description && (
            <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
              {service.description}
            </p>
          )}
        </div>
        {canEdit && (
          <Link
            to={`/services/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <PencilSquareIcon className="h-4 w-4" />
            Edit
          </Link>
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
                    ? "border-brand-600 text-gray-900 dark:text-gray-100"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet context={{ service, reloadService }} />
    </div>
    </PageTransition>
  );
}
