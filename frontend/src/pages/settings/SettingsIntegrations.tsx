import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import client from "../../api/client";

interface IntegrationChannel {
  channel: string;
  enabled: boolean;
  connection_status: string;
  last_error: string | null;
  last_success_at: string | null;
  token_expires_at: string | null;
  metadata: Record<string, string>;
  has_encrypted_secrets: boolean;
}

interface Meta {
  public_base_url: string;
  secrets_encryption_configured: boolean;
  webhook_payload_version: string;
  webhook_payload_example: Record<string, unknown>;
  google: Record<string, string>;
  slack: Record<string, string>;
}

function statusClass(status: string): string {
  if (status === "connected") return "bg-green-100 text-green-800";
  if (status === "error") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function axiosDetail(e: unknown): string | undefined {
  const err = e as { response?: { data?: { detail?: unknown } } };
  const d = err.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d
      .map((x: { msg?: string }) => x.msg)
      .filter(Boolean)
      .join(", ");
  return undefined;
}

export function SettingsIntegrations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [channels, setChannels] = useState<IntegrationChannel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [slackClientId, setSlackClientId] = useState("");
  const [slackSecret, setSlackSecret] = useState("");
  const [slackChannelLabel, setSlackChannelLabel] = useState("");
  const [gClientId, setGClientId] = useState("");
  const [gSecret, setGSecret] = useState("");
  const [gSubj, setGSubj] = useState("");
  const [gHtml, setGHtml] = useState("");
  const [gText, setGText] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewSubj, setPreviewSubj] = useState("");

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [m, list] = await Promise.all([
        client.get<Meta>("/api/settings/integrations/meta"),
        client.get<{ channels: IntegrationChannel[] }>("/api/settings/integrations"),
      ]);
      setMeta(m.data);
      setChannels(list.data.channels);
      for (const ch of list.data.channels) {
        if (ch.channel === "webhook") {
          setWebhookUrl(ch.metadata.url ?? "");
        }
        if (ch.channel === "telegram") {
          setTgChat(ch.metadata.chat_id ?? "");
        }
        if (ch.channel === "slack") {
          setSlackClientId(ch.metadata.client_id ?? "");
          setSlackChannelLabel(ch.metadata.default_channel_label ?? "");
        }
        if (ch.channel === "google_mail") {
          setGClientId(ch.metadata.client_id ?? "");
          setGSubj(ch.metadata.email_subject_template ?? "");
          setGHtml(ch.metadata.email_html_template ?? "");
          setGText(ch.metadata.email_text_template ?? "");
        }
      }
    } catch {
      setLoadError("Failed to load integrations.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const g = searchParams.get("google");
    const s = searchParams.get("slack");
    if (g === "connected") {
      setMessage({ type: "success", text: "Google account connected." });
      setSearchParams({}, { replace: true });
    }
    if (s === "connected") {
      setMessage({ type: "success", text: "Slack workspace connected." });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function ch(name: string): IntegrationChannel | undefined {
    return channels.find((c) => c.channel === name);
  }

  async function testChannel(channel: string) {
    setMessage(null);
    try {
      const r = await client.post<{ ok: boolean; detail?: string }>(
        `/api/settings/integrations/${channel}/test`,
      );
      if (r.data.ok) {
        setMessage({ type: "success", text: `Test sent (${channel}).` });
      } else {
        setMessage({ type: "error", text: r.data.detail ?? "Test failed." });
      }
      await refresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setMessage({
        type: "error",
        text: err.response?.data?.detail ?? "Test request failed.",
      });
    }
  }

  async function saveWebhook(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.patch("/api/settings/integrations/webhook", {
        url: webhookUrl || null,
        signing_secret: webhookSecret || null,
        enabled: true,
      });
      setWebhookSecret("");
      setMessage({ type: "success", text: "Webhook settings saved." });
      await refresh();
    } catch (e: unknown) {
      setMessage({
        type: "error",
        text:
          axiosDetail(e) ??
          "Save failed (configure INTEGRATION_SECRET_KEY if saving a signing secret).",
      });
    }
  }

  async function saveTelegram(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.patch("/api/settings/integrations/telegram", {
        chat_id: tgChat || null,
        bot_token: tgToken || null,
        enabled: true,
      });
      setTgToken("");
      setMessage({ type: "success", text: "Telegram settings saved." });
      await refresh();
    } catch (e: unknown) {
      setMessage({
        type: "error",
        text: axiosDetail(e) ?? "Save failed.",
      });
    }
  }

  async function saveSlack(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.patch("/api/settings/integrations/slack", {
        client_id: slackClientId || null,
        client_secret: slackSecret || null,
        enabled: true,
      });
      setSlackSecret("");
      setMessage({ type: "success", text: "Slack settings saved." });
      await refresh();
    } catch (e: unknown) {
      setMessage({
        type: "error",
        text: axiosDetail(e) ?? "Save failed.",
      });
    }
  }

  async function connectSlack() {
    setMessage(null);
    try {
      const r = await client.post<{ authorization_url: string }>(
        "/api/integrations/slack/oauth/start",
      );
      window.location.href = r.data.authorization_url;
    } catch {
      setMessage({ type: "error", text: "Could not start Slack OAuth." });
    }
  }

  async function resolveSlackChannel(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.post("/api/settings/integrations/slack/resolve-channel", {
        label: slackChannelLabel,
      });
      setMessage({ type: "success", text: "Channel resolved and saved." });
      await refresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setMessage({
        type: "error",
        text: err.response?.data?.detail ?? "Resolve failed.",
      });
    }
  }

  async function saveGoogle(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.patch("/api/settings/integrations/google_mail", {
        client_id: gClientId || null,
        client_secret: gSecret || null,
        email_subject_template: gSubj || null,
        email_html_template: gHtml || null,
        email_text_template: gText || null,
        enabled: true,
      });
      setGSecret("");
      setMessage({ type: "success", text: "Gmail integration settings saved." });
      await refresh();
    } catch (e: unknown) {
      setMessage({
        type: "error",
        text: axiosDetail(e) ?? "Save failed.",
      });
    }
  }

  async function connectGoogle() {
    setMessage(null);
    try {
      const r = await client.post<{ authorization_url: string }>(
        "/api/integrations/google/oauth/start",
      );
      window.location.href = r.data.authorization_url;
    } catch {
      setMessage({ type: "error", text: "Could not start Google OAuth." });
    }
  }

  async function runPreview() {
    try {
      const r = await client.post<{
        subject: string;
        html: string;
        text: string;
      }>("/api/settings/integrations/google_mail/preview", {
        sample_data: {
          title: "CatalogIT",
          body: "Sample notification body.",
          service_name: "Example Service",
          renewal_date: "2026-12-31",
        },
      });
      setPreviewSubj(r.data.subject);
      setPreviewHtml(r.data.html);
      setPreviewText(r.data.text);
    } catch {
      setMessage({ type: "error", text: "Preview failed." });
    }
  }

  const google = ch("google_mail");
  const slack = ch("slack");
  const webhook = ch("webhook");
  const telegram = ch("telegram");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Integrations</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure outbound notifications for this deployment. Only admins can change these settings.
          Set <code className="text-xs">PUBLIC_BASE_URL</code> and OAuth redirect URIs to match your
          deployment.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</p>
      )}
      {message && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {meta && !meta.secrets_encryption_configured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Secret encryption is not configured</p>
          <p className="mt-2 text-amber-900">
            Set <code className="rounded bg-amber-100 px-1 text-xs">INTEGRATION_SECRET_KEY</code> in
            the API environment (Fernet key; see <code className="text-xs">.env.example</code> or{" "}
            <code className="text-xs">docs/integrations/README.md</code>), then restart the API. Saving
            bot tokens, webhook signing secrets, or OAuth client secrets requires this key.
          </p>
        </div>
      )}

      {meta && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p>
            <span className="font-medium">Public base URL:</span> {meta.public_base_url}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Webhook payload version {meta.webhook_payload_version}
            {meta.secrets_encryption_configured ? (
              <span className="ml-2 text-green-700">· Secret encryption: on</span>
            ) : (
              <span className="ml-2 text-amber-700">· Secret encryption: off</span>
            )}
          </p>
        </div>
      )}

      {/* Webhook */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-gray-900">Webhook</h3>
          {webhook && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(webhook.connection_status)}`}>
              {webhook.connection_status}
            </span>
          )}
        </div>
        {webhook?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {webhook.last_error}</p>
        )}
        <form onSubmit={saveWebhook} className="mt-4 space-y-3 max-w-xl">
          <label className="block text-sm text-gray-700">
            URL
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://example.com/hooks/catalogit"
            />
          </label>
          <label className="block text-sm text-gray-700">
            Signing secret (optional, HMAC-SHA256 header{" "}
            <code className="text-xs">X-CatalogIT-Signature</code>)
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={webhook?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void testChannel("webhook")}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Send test
            </button>
          </div>
        </form>
        <details className="mt-4 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-800">Troubleshooting</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Ensure the target URL accepts POST JSON and returns 2xx.</li>
            <li>If using a signing secret, verify HMAC of the raw body matches the header.</li>
          </ul>
        </details>
      </section>

      {/* Telegram */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-gray-900">Telegram</h3>
          {telegram && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(telegram.connection_status)}`}>
              {telegram.connection_status}
            </span>
          )}
        </div>
        {telegram?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {telegram.last_error}</p>
        )}
        <form onSubmit={saveTelegram} className="mt-4 space-y-3 max-w-xl">
          <label className="block text-sm text-gray-700">
            Bot token
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder={telegram?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
          </label>
          <label className="block text-sm text-gray-700">
            Chat ID
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={tgChat}
              onChange={(e) => setTgChat(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void testChannel("telegram")}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Send test
            </button>
          </div>
        </form>
      </section>

      {/* Slack */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-gray-900">Slack</h3>
          {slack && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(slack.connection_status)}`}>
              {slack.connection_status}
            </span>
          )}
        </div>
        {meta?.slack && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-gray-600">
              <span className="font-medium text-gray-800">Redirect URI:</span>{" "}
              <code className="break-all text-xs">{meta.slack.redirect_uri ?? `${meta.public_base_url}/api/integrations/slack/oauth/callback`}</code>
              <button
                type="button"
                className="ml-2 text-blue-600 hover:underline"
                onClick={() =>
                  void copy(
                    meta.slack.redirect_uri ??
                      `${meta.public_base_url}/api/integrations/slack/oauth/callback`,
                  )
                }
              >
                Copy
              </button>
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-800">Scopes:</span>{" "}
              <code className="break-all text-xs">{meta.slack.oauth_scopes}</code>
              <button
                type="button"
                className="ml-2 text-blue-600 hover:underline"
                onClick={() => void copy(meta.slack.oauth_scopes)}
              >
                Copy
              </button>
            </p>
          </div>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-gray-800">Setup steps</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-gray-600">
            <li>Create a Slack app (see repository docs for manifest).</li>
            <li>Add the redirect URI above to the Slack app.</li>
            <li>Paste OAuth client ID and secret below, save, then Connect.</li>
            <li>Invite the bot to your channel and resolve the channel name.</li>
          </ol>
        </details>
        {slack?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {slack.last_error}</p>
        )}
        <form onSubmit={saveSlack} className="mt-4 space-y-3 max-w-xl">
          <label className="block text-sm text-gray-700">
            Client ID
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={slackClientId}
              onChange={(e) => setSlackClientId(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-700">
            OAuth client secret
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={slackSecret}
              onChange={(e) => setSlackSecret(e.target.value)}
              placeholder={slack?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
            <span className="mt-1 block text-xs text-gray-500">
              From Basic Information → App Credentials. Not the Signing Secret on that page.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void connectSlack()}
              className="rounded bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-600"
            >
              Connect Slack
            </button>
          </div>
        </form>
        <form onSubmit={resolveSlackChannel} className="mt-4 flex max-w-xl flex-wrap items-end gap-2">
          <label className="block flex-1 text-sm text-gray-700">
            Default channel (#name or ID)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={slackChannelLabel}
              onChange={(e) => setSlackChannelLabel(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Resolve
          </button>
        </form>
        {slack?.metadata.default_channel_id && (
          <p className="mt-2 text-xs text-gray-500">
            Resolved channel ID: {slack.metadata.default_channel_id}
          </p>
        )}
        <button
          type="button"
          onClick={() => void testChannel("slack")}
          className="mt-4 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Send test to Slack
        </button>
        <details className="mt-4 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-800">Troubleshooting</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Redirect URI mismatch: must match exactly in Slack app settings.</li>
            <li>Wrong workspace: reinstall the app in the intended workspace.</li>
            <li>Channel not found: invite the bot to the channel first.</li>
          </ul>
        </details>
      </section>

      {/* Gmail */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-gray-900">Gmail (Google)</h3>
          {google && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(google.connection_status)}`}>
              {google.connection_status}
            </span>
          )}
        </div>
        {meta?.google && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-gray-600">
              <span className="font-medium text-gray-800">Redirect URI:</span>{" "}
              <code className="break-all text-xs">{meta.google.redirect_uri}</code>
              <button
                type="button"
                className="ml-2 text-blue-600 hover:underline"
                onClick={() => void copy(meta.google.redirect_uri)}
              >
                Copy
              </button>
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-800">Scopes:</span>{" "}
              <code className="break-all text-xs">{meta.google.oauth_scopes}</code>
              <button
                type="button"
                className="ml-2 text-blue-600 hover:underline"
                onClick={() => void copy(meta.google.oauth_scopes)}
              >
                Copy
              </button>
            </p>
          </div>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-gray-800">Setup steps</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-gray-600">
            <li>Create an OAuth client in Google Cloud (desktop or web with redirect URI above).</li>
            <li>Enable Gmail API for the project.</li>
            <li>Paste client ID and secret, save templates, then Connect.</li>
          </ol>
        </details>
        {google?.metadata.google_email && (
          <p className="mt-2 text-sm text-gray-600">
            Sender: <span className="font-medium">{google.metadata.google_email}</span>
          </p>
        )}
        {google?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {google.last_error}</p>
        )}
        <form onSubmit={saveGoogle} className="mt-4 space-y-3 max-w-2xl">
          <p className="text-sm text-gray-600">
            OAuth credentials and email templates are configured on this page (below). Edit templates,
            click <strong>Save</strong>, then use <strong>Preview templates</strong> or{" "}
            <strong>Send test email</strong>.
          </p>
          <label className="block text-sm text-gray-700">
            Client ID
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={gClientId}
              onChange={(e) => setGClientId(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-700">
            Client secret
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={gSecret}
              onChange={(e) => setGSecret(e.target.value)}
              placeholder={google?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
          </label>
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900">Email templates</h4>
            <p className="mt-1 text-xs text-gray-500">
              Mustache-style placeholders: <code className="text-xs">{"{{title}}"}</code>,{" "}
              <code className="text-xs">{"{{body}}"}</code>, <code className="text-xs">{"{{service_name}}"}</code>,{" "}
              <code className="text-xs">{"{{renewal_date}}"}</code>, etc. Save before sending a test.
            </p>
          </div>
          <label className="block text-sm text-gray-700">
            Subject template (Mustache)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono text-xs"
              value={gSubj}
              onChange={(e) => setGSubj(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-700">
            HTML body template
            <textarea
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
              rows={4}
              value={gHtml}
              onChange={(e) => setGHtml(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-700">
            Plain text template (optional)
            <textarea
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
              rows={3}
              value={gText}
              onChange={(e) => setGText(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void connectGoogle()}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
            >
              Connect Google
            </button>
            <button
              type="button"
              onClick={() => void runPreview()}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Preview templates
            </button>
            <button
              type="button"
              onClick={() => void testChannel("google_mail")}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Send test email
            </button>
          </div>
        </form>
        {(previewSubj || previewHtml) && (
          <div className="mt-4 rounded border border-gray-100 bg-gray-50 p-4 text-sm">
            <p className="font-medium text-gray-800">Preview</p>
            <p className="mt-1 text-gray-700">
              <span className="text-gray-500">Subject:</span> {previewSubj}
            </p>
            <div
              className="mt-2 border border-gray-200 bg-white p-2 text-xs max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-600">{previewText}</pre>
          </div>
        )}
        <details className="mt-4 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-800">Troubleshooting</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Redirect mismatch: Google Cloud OAuth client must list the exact redirect URI.</li>
            <li>No refresh token: revoke app access in Google account and reconnect.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}
