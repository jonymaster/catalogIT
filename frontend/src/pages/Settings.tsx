import { NavLink, Outlet } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";

const tabs = [
  { to: "oidc", label: "OIDC" },
  { to: "scim", label: "SCIM" },
  { to: "integrations", label: "Integrations" },
  { to: "notifications", label: "Notifications" },
  { to: "reference-data", label: "Reference Data" },
  { to: "record-deletion", label: "Record Deletion" },
  { to: "export", label: "Export" },
  { to: "tokens", label: "API Tokens" },
  { to: "api", label: "API Docs" },
];

export function Settings() {
  return (
    <PageTransition>
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Manage authentication, integrations, notifications, and reference data.
      </p>

      <div className="mt-6 border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
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

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
    </PageTransition>
  );
}
