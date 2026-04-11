import { NavLink } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { BrandMark } from "./BrandMark";

const mainNavAfterDashboard = [
  { name: "Services", to: "/services" },
  { name: "Hardware", to: "/hardware" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
  }`;

export function Sidebar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <BrandMark />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <NavLink to="/" end className={linkClass}>
          Dashboard
        </NavLink>

        <div className="my-3 h-px bg-gray-200 dark:bg-gray-700" />
        {mainNavAfterDashboard.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            {item.name}
          </NavLink>
        ))}

        <div className="my-3 h-px bg-gray-200 dark:bg-gray-700" />
        <NavLink to="/calendar" className={linkClass}>
          Renewal Calendar
        </NavLink>

        <div className="my-3 h-px bg-gray-200 dark:bg-gray-700" />
        <NavLink to="/costs" className={linkClass}>
          Costs
        </NavLink>

        {isAdmin && (
          <>
            <div className="my-3 h-px bg-gray-200 dark:bg-gray-700" />
            <p className="px-3 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Admin menu
            </p>
            <NavLink to="/users" className={linkClass}>
              Users
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              Settings
            </NavLink>
            <NavLink to="/audit" className={linkClass}>
              Audit logs
            </NavLink>
          </>
        )}
      </nav>

      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        {user && (
          <>
            <p className="mb-2 truncate text-sm text-gray-600 dark:text-gray-300">{user.email}</p>
            <NavLink
              to="/me/settings"
              className={({ isActive }) =>
                `mb-3 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                }`
              }
            >
              Personal Settings
            </NavLink>
          </>
        )}
        <button
          onClick={logout}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
