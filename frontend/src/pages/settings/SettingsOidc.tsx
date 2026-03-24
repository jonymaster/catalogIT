import { useState, useEffect, type FormEvent } from "react";
import client from "../../api/client";

interface OidcConfig {
  provider_name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  enabled: boolean;
}

interface TestResult {
  success: boolean;
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  error: string;
}

const emptyConfig: OidcConfig = {
  provider_name: "",
  issuer_url: "",
  client_id: "",
  client_secret: "",
  scopes: "openid profile email",
  enabled: false,
};

export function SettingsOidc() {
  const [config, setConfig] = useState<OidcConfig>(emptyConfig);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    client.get<OidcConfig | null>("/api/settings/oidc").then((r) => {
      if (r.data) {
        setConfig({ ...r.data, client_secret: "" });
      }
    });
  }, []);

  function update(field: keyof OidcConfig, value: string | boolean) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  async function handleTest(e: FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    setMessage(null);
    try {
      const res = await client.post<TestResult>(
        "/api/settings/oidc/test",
        config,
      );
      setTestResult(res.data);
    } catch {
      setTestResult({
        success: false,
        issuer: "",
        authorization_endpoint: "",
        token_endpoint: "",
        error: "Request failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await client.put("/api/settings/oidc", config);
      setMessage({ type: "success", text: "OIDC configuration saved." });
    } catch {
      setMessage({ type: "error", text: "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="max-w-xl space-y-6 rounded-lg border border-gray-200 bg-white p-6"
    >
      <h2 className="text-lg font-medium text-gray-900">
        OIDC Provider Configuration
      </h2>

      <div className="space-y-4">
        <Field
          label="Provider name"
          id="provider_name"
          value={config.provider_name}
          onChange={(v) => update("provider_name", v)}
          placeholder="e.g. Okta, Azure AD, Google Workspace"
        />
        <Field
          label="Issuer URL"
          id="issuer_url"
          value={config.issuer_url}
          onChange={(v) => update("issuer_url", v)}
          placeholder="https://your-domain.okta.com/oauth2/default"
        />
        <Field
          label="Client ID"
          id="client_id"
          value={config.client_id}
          onChange={(v) => update("client_id", v)}
        />
        <Field
          label="Client secret"
          id="client_secret"
          value={config.client_secret}
          onChange={(v) => update("client_secret", v)}
          type="password"
          placeholder="Leave blank to keep existing"
        />
        <Field
          label="Scopes"
          id="scopes"
          value={config.scopes}
          onChange={(v) => update("scopes", v)}
        />

        <div className="flex items-center gap-3">
          <input
            id="enabled"
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
          />
          <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
            Enable OIDC login
          </label>
        </div>
      </div>

      {testResult && (
        <div
          className={`rounded-md p-4 text-sm ${
            testResult.success
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {testResult.success ? (
            <div className="space-y-1">
              <p className="font-medium">Connection successful</p>
              <p>Issuer: {testResult.issuer}</p>
              <p className="truncate">
                Authorization: {testResult.authorization_endpoint}
              </p>
              <p className="truncate">
                Token: {testResult.token_endpoint}
              </p>
            </div>
          ) : (
            <p>{testResult.error}</p>
          )}
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !config.issuer_url}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test connection"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
    </div>
  );
}
