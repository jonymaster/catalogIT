import { useState } from "react";
import { SettingsOidc } from "./settings/SettingsOidc";
import { SettingsScim } from "./settings/SettingsScim";
import { SettingsUsers } from "./settings/SettingsUsers";
import { SettingsTokens } from "./settings/SettingsTokens";
import { SettingsApi } from "./settings/SettingsApi";

const tabs = [
  { id: "oidc", label: "OIDC" },
  { id: "scim", label: "SCIM" },
  { id: "users", label: "Users" },
  { id: "tokens", label: "API Tokens" },
  { id: "api", label: "API Docs" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>("oidc");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        Manage authentication, users, and integrations.
      </p>

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === "oidc" && <SettingsOidc />}
        {activeTab === "scim" && <SettingsScim />}
        {activeTab === "users" && <SettingsUsers />}
        {activeTab === "tokens" && <SettingsTokens />}
        {activeTab === "api" && <SettingsApi />}
      </div>
    </div>
  );
}
