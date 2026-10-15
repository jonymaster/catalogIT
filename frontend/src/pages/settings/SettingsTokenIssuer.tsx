import { useState, useEffect, type FormEvent } from "react";
import axios from "axios";
import client from "../../api/client";
import { useToast } from "../../context/useToast";
import { PageTransition } from "../../components/PageTransition";
import { IntegrationEnabledIndicator } from "../../components/IntegrationEnabledIndicator";
import { Button } from "../../components/ui/Button";

interface TokenIssuerConfig {
  provider_name: string;
  issuer_url: string;
  jwks_url: string;
  audience: string;
  email_claim: string;
  enabled: boolean;
}

interface TestResult {
  success: boolean;
  jwks_url: string;
  key_count: number;
  error: string;
}

const emptyConfig: TokenIssuerConfig = {
  provider_name: "",
  issuer_url: "",
  jwks_url: "",
  audience: "",
  email_claim: "email",
  enabled: false,
};

function errorDetail(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
    return err.response.data.detail;
  }
  return fallback;
}

export function SettingsTokenIssuer() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<TokenIssuerConfig>(emptyConfig);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    client.get<TokenIssuerConfig | null>("/api/settings/token-issuer").then((r) => {
      if (r.data) {
        setConfig(r.data);
      }
    });
  }, []);

  function update(field: keyof TokenIssuerConfig, value: string | boolean) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  async function handleTest(e: FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await client.post<TestResult>("/api/settings/token-issuer/test", config);
      if (res.data.success) {
        setTestResult(res.data);
        showToast({ type: "success", text: "Signing keys fetched." });
      } else {
        showToast({ type: "error", text: res.data.error || "Connection test failed." });
      }
    } catch (err) {
      showToast({ type: "error", text: errorDetail(err, "Request failed.") });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.put("/api/settings/token-issuer", config);
      showToast({ type: "success", text: "Token issuer configuration saved." });
    } catch (err) {
      showToast({ type: "error", text: errorDetail(err, "Failed to save configuration.") });
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
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          MCP Sign-in (Trusted Token Issuer)
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Lets AI assistants such as Claude and ChatGPT sign in to the MCP server with your own
          OAuth provider. CatalogIT accepts access tokens signed by this issuer and maps them to an
          existing, active user by email. Tokens never create users; each user keeps their role and
          permissions.
        </p>
      </div>

      <IntegrationEnabledIndicator enabled={config.enabled} />

      <div className="space-y-4">
        <Field
          label="Provider name"
          id="provider_name"
          value={config.provider_name}
          onChange={(v) => update("provider_name", v)}
          placeholder="e.g. Cloudflare Access, Okta"
        />
        <Field
          label="Issuer URL"
          id="issuer_url"
          value={config.issuer_url}
          onChange={(v) => update("issuer_url", v)}
          placeholder="https://your-team.cloudflareaccess.com"
          help="Must exactly match the token's iss claim."
        />
        <Field
          label="JWKS URL"
          id="jwks_url"
          value={config.jwks_url}
          onChange={(v) => update("jwks_url", v)}
          placeholder="https://your-team.cloudflareaccess.com/cdn-cgi/access/certs"
          help="Leave blank to discover it from the issuer's OpenID configuration."
        />
        <Field
          label="Audience"
          id="audience"
          value={config.audience}
          onChange={(v) => update("audience", v)}
          placeholder="Cloudflare Access application AUD tag, or Okta audience"
          help="Must be one of the token's aud values."
        />
        <Field
          label="Email claim"
          id="email_claim"
          value={config.email_claim}
          onChange={(v) => update("email_claim", v)}
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
            Accept tokens from this issuer
          </label>
        </div>
      </div>

      {testResult?.success && (
        <details
          className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-4 text-sm text-green-800 dark:text-green-200"
          open
        >
          <summary className="cursor-pointer font-medium text-green-900 dark:text-green-100">
            Signing keys
          </summary>
          <div className="mt-3 space-y-1">
            <p className="break-all">JWKS: {testResult.jwks_url}</p>
            <p>Keys found: {testResult.key_count}</p>
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
          {testing ? "Testing..." : "Test signing keys"}
        </button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
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
  placeholder,
  help,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      {help && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>}
    </div>
  );
}
