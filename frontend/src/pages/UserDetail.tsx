import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { DetailPageSkeleton } from "../components/Skeleton";
import type { UserDetailOutletContext, UserProfile } from "../types/userProfile";
import { getUserDisplayName } from "../utils/userDisplay";

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    client
      .get<UserProfile>(`/api/users/${id}/profile`)
      .then((response) => {
        if (!cancelled) {
          setProfile(response.data);
          setLoadedUserId(id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setLoadedUserId(id);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = id != null && loadedUserId !== id;

  const tabs = useMemo(
    () =>
      profile == null
        ? []
        : [
            { to: ".", label: "Overview", end: true },
            {
              to: "owned-services",
              label: `Owned services (${profile.owned_services.length})`,
              end: false,
            },
            {
              to: "assigned-services",
              label: `Assigned services (${profile.assigned_services.length})`,
              end: false,
            },
            {
              to: "assigned-assets",
              label: `Assigned assets (${profile.assigned_laptops.length})`,
              end: false,
            },
          ],
    [profile],
  );

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">User not found.</p>;
  }

  const user = profile.user;
  const heading = getUserDisplayName(user);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              &larr; Back
            </button>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {heading}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {user.email}
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {user.role} account
              {user.department?.trim() ? ` • ${user.department}` : ""}
              {` • ${profile.owned_services.length} owned services`}
              {` • ${profile.assigned_services.length} assigned services`}
              {` • ${profile.assigned_laptops.length} assigned assets`}
            </p>
          </div>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex flex-wrap gap-6">
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

        <Outlet context={{ profile } satisfies UserDetailOutletContext} />
      </div>
    </PageTransition>
  );
}
