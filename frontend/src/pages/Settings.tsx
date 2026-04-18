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
      <h1
        className="text-fg"
        style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
      >
        Settings
      </h1>
      <p className="mt-1 text-[13px] text-fg-3">
        Manage authentication, integrations, notifications, and reference data.
      </p>

      <div className="mt-6 border-b border-border">
        <nav className="-mb-px flex gap-5 overflow-x-auto">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-1 pb-2.5 text-[13.5px] font-medium transition-colors ${
                  isActive
                    ? "border-accent text-fg"
                    : "border-transparent text-fg-3 hover:border-border-strong hover:text-fg-2"
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
