import { useState, useEffect, type FormEvent } from "react";
import client from "../../api/client";
import { useToast } from "../../context/useToast";
import { PageTransition } from "../../components/PageTransition";
import { IntegrationEnabledIndicator } from "../../components/IntegrationEnabledIndicator";

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
  const { showToast } = useToast();
  const [config, setConfig] = useState<OidcConfig>(emptyConfig);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
    try {
      const res = await client.post<TestResult>(
        "/api/settings/oidc/test",
        config,
      );
      if (res.data.success) {
        setTestResult(res.data);
        showToast({ type: "success", text: "Connection successful." });
      } else {
        setTestResult(null);
        showToast({
          type: "error",
          text: res.data.error || "Connection test failed.",
        });
      }
    } catch {
      setTestResult(null);
      showToast({ type: "error", text: "Request failed." });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.put("/api/settings/oidc", config);
      showToast({ type: "success", text: "OIDC configuration saved." });
    } catch {
      showToast({ type: "error", text: "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition>
    <form
      onSubmit={handleSave}
      className="max-w-xl space-y-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6"
    >
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        OIDC Provider Configuration
      </h2>

      <IntegrationEnabledIndicator enabled={config.enabled} />

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
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 text-brand-600 accent-brand-600 focus:ring-2 focus:ring-brand-500/30"
          />
          <label htmlFor="enabled" className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Enable OIDC login
          </label>
        </div>
      </div>

      {testResult?.success && (
        <details
          className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-4 text-sm text-green-800 dark:text-green-200"
          open
        >
          <summary className="cursor-pointer font-medium text-green-900 dark:text-green-100">
            Endpoint details
          </summary>
          <div className="mt-3 space-y-1">
            <p>Issuer: {testResult.issuer}</p>
            <p className="break-all">Authorization: {testResult.authorization_endpoint}</p>
            <p className="break-all">Token: {testResult.token_endpoint}</p>
          </div>
        </details>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !config.issuer_url}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test connection"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Information for your identity provider
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          In your identity provider, register the redirect (callback) URI. It is normally{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">
            http://your-ui-domain/auth/oidc/callback
          </code>
          , replacing <span className="font-mono text-xs">your-ui-domain</span> with the host where this UI is served (including scheme and port if needed).
        </p>
      </div>
    </form>
    </PageTransition>
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
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
    </div>
  );
}
