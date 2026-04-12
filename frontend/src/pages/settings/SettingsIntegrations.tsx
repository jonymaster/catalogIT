import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "../../api/client";
import { PageTransition } from "../../components/PageTransition";
import { IntegrationEnabledIndicator } from "../../components/IntegrationEnabledIndicator";

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
  if (status === "connected") return "bg-green-100 text-green-800 dark:text-green-200";
  if (status === "error") return "bg-red-100 text-red-800 dark:text-red-200";
  return "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300";
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
  const [slackResolving, setSlackResolving] = useState(false);
  const [gClientId, setGClientId] = useState("");
  const [gSecret, setGSecret] = useState("");

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
          setSlackChannelLabel(
            ch.metadata.default_channel_id ?? ch.metadata.default_channel_label ?? "",
          );
        }
        if (ch.channel === "google_mail") {
          setGClientId(ch.metadata.client_id ?? "");
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
    setSlackResolving(true);
    try {
      const r = await client.post<{ channel_id: string }>(
        "/api/settings/integrations/slack/resolve-channel",
        {
          label: slackChannelLabel,
        },
      );
      setSlackChannelLabel(r.data.channel_id);
      setMessage({ type: "success", text: "Channel resolved and saved." });
      await refresh();
    } catch (e: unknown) {
      setMessage({
        type: "error",
        text: axiosDetail(e) ?? "Resolve failed.",
      });
    } finally {
      setSlackResolving(false);
    }
  }

  async function saveGoogle(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.patch("/api/settings/integrations/google_mail", {
        client_id: gClientId || null,
        client_secret: gSecret || null,
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

  async function disconnectChannel(channel: string) {
    if (!window.confirm(`Disconnect ${channel.replace("_", " ")}? This will clear all credentials and tokens.`))
      return;
    setMessage(null);
    try {
      await client.post(`/api/settings/integrations/${channel}/disconnect`);
      setMessage({ type: "success", text: `${channel.replace("_", " ")} disconnected.` });
      await refresh();
    } catch (e: unknown) {
      setMessage({ type: "error", text: axiosDetail(e) ?? "Disconnect failed." });
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

  const google = ch("google_mail");
  const slack = ch("slack");
  const webhook = ch("webhook");
  const telegram = ch("telegram");

  return (
    <PageTransition>
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Integrations</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure outbound notifications for this deployment. Only admins can change these settings.
          Set <code className="text-xs">PUBLIC_BASE_URL</code> and OAuth redirect URIs to match your
          deployment.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200">{loadError}</p>
      )}
      {message && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200"
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4 text-sm text-gray-700 dark:text-gray-200">
          <p>
            <span className="font-medium">Public base URL:</span> {meta.public_base_url}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Webhook payload version {meta.webhook_payload_version}
            {meta.secrets_encryption_configured ? (
              <span className="ml-2 text-green-700 dark:text-green-300">· Secret encryption: on</span>
            ) : (
              <span className="ml-2 text-amber-700">· Secret encryption: off</span>
            )}
          </p>
        </div>
      )}

      {/* Webhook */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Webhook</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <IntegrationEnabledIndicator enabled={!!webhook?.enabled} />
          {webhook && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(webhook.connection_status)}`}
            >
              {webhook.connection_status}
            </span>
          )}
        </div>
        {webhook?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {webhook.last_error}</p>
        )}
        <form onSubmit={saveWebhook} className="mt-4 space-y-3 max-w-xl">
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            URL
            <input
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://example.com/hooks/catalogit"
            />
          </label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            Signing secret (optional, HMAC-SHA256 header{" "}
            <code className="text-xs">X-CatalogIT-Signature</code>)
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={webhook?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void testChannel("webhook")}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Send test
            </button>
            {webhook?.connection_status !== "not_configured" && (
              <button
                type="button"
                onClick={() => void disconnectChannel("webhook")}
                className="rounded border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              >
                Disconnect
              </button>
            )}
          </div>
        </form>
        <details className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">Troubleshooting</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Ensure the target URL accepts POST JSON and returns 2xx.</li>
            <li>If using a signing secret, verify HMAC of the raw body matches the header.</li>
          </ul>
        </details>
      </section>

      {/* Telegram */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Telegram</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <IntegrationEnabledIndicator enabled={!!telegram?.enabled} />
          {telegram && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(telegram.connection_status)}`}
            >
              {telegram.connection_status}
            </span>
          )}
        </div>
        {telegram?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {telegram.last_error}</p>
        )}
        <form onSubmit={saveTelegram} className="mt-4 space-y-3 max-w-xl">
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            Bot token
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder={telegram?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
          </label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            Chat ID
            <input
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={tgChat}
              onChange={(e) => setTgChat(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void testChannel("telegram")}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Send test
            </button>
            {telegram?.connection_status !== "not_configured" && (
              <button
                type="button"
                onClick={() => void disconnectChannel("telegram")}
                className="rounded border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              >
                Disconnect
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Slack */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Slack</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <IntegrationEnabledIndicator enabled={!!slack?.enabled} />
          {slack && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(slack.connection_status)}`}
            >
              {slack.connection_status}
            </span>
          )}
        </div>
        {meta?.slack && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-800 dark:text-gray-100">Redirect URI:</span>{" "}
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
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-800 dark:text-gray-100">Scopes:</span>{" "}
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
          <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">Setup steps</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-gray-600 dark:text-gray-300">
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
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            Client ID
            <input
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={slackClientId}
              onChange={(e) => setSlackClientId(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            OAuth client secret
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={slackSecret}
              onChange={(e) => setSlackSecret(e.target.value)}
              placeholder={slack?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              From Basic Information → App Credentials. Not the Signing Secret on that page.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void connectSlack()}
              className="rounded bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-500"
            >
              Connect Slack
            </button>
            {slack?.connection_status !== "not_configured" && (
              <button
                type="button"
                onClick={() => void disconnectChannel("slack")}
                className="rounded border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              >
                Disconnect
              </button>
            )}
          </div>
        </form>
        <form onSubmit={resolveSlackChannel} className="mt-4 flex max-w-xl flex-wrap items-end gap-2">
          <label className="block flex-1 text-sm text-gray-700 dark:text-gray-200">
            Default channel (#name or ID)
            <input
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm disabled:bg-gray-50 dark:bg-gray-950 disabled:text-gray-500 dark:text-gray-400"
              value={slackChannelLabel}
              onChange={(e) => setSlackChannelLabel(e.target.value)}
              disabled={slackResolving}
            />
          </label>
          <button
            type="submit"
            disabled={slackResolving}
            aria-busy={slackResolving}
            className="inline-flex items-center gap-2 rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {slackResolving && (
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-700"
                aria-hidden
              />
            )}
            {slackResolving ? "Resolving…" : "Resolve"}
          </button>
        </form>
        {slack?.metadata.default_channel_id && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Resolved channel ID: {slack.metadata.default_channel_id}
          </p>
        )}
        <button
          type="button"
          onClick={() => void testChannel("slack")}
          className="mt-4 rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Send test to Slack
        </button>
        <details className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">Troubleshooting</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Redirect URI mismatch: must match exactly in Slack app settings.</li>
            <li>Wrong workspace: reinstall the app in the intended workspace.</li>
            <li>Channel not found: invite the bot to the channel first.</li>
          </ul>
        </details>
      </section>

      {/* Gmail */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Gmail (Google)</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <IntegrationEnabledIndicator enabled={!!google?.enabled} />
          {google && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(google.connection_status)}`}
            >
              {google.connection_status}
            </span>
          )}
        </div>
        {meta?.google && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-800 dark:text-gray-100">Redirect URI:</span>{" "}
              <code className="break-all text-xs">{meta.google.redirect_uri}</code>
              <button
                type="button"
                className="ml-2 text-blue-600 hover:underline"
                onClick={() => void copy(meta.google.redirect_uri)}
              >
                Copy
              </button>
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-800 dark:text-gray-100">Scopes:</span>{" "}
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
          <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">Setup steps</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-gray-600 dark:text-gray-300">
            <li>Create an OAuth client in Google Cloud (desktop or web with redirect URI above).</li>
            <li>Enable Gmail API for the project.</li>
            <li>Paste client ID and secret, save, then Connect.</li>
          </ol>
        </details>
        {google?.metadata.google_email && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Sender: <span className="font-medium">{google.metadata.google_email}</span>
          </p>
        )}
        {google?.last_error && (
          <p className="mt-2 text-sm text-red-600">Last error: {google.last_error}</p>
        )}
        <form onSubmit={saveGoogle} className="mt-4 space-y-3 max-w-2xl">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            OAuth credentials are configured below. Email subject and HTML templates are managed under{" "}
            <Link to="/settings/notifications" className="font-medium text-gray-900 dark:text-gray-100 underline">
              Settings → Notifications
            </Link>
            . After saving, use <strong>Send test email</strong> to verify delivery.
          </p>
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            Client ID
            <input
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={gClientId}
              onChange={(e) => setGClientId(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            Client secret
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm"
              value={gSecret}
              onChange={(e) => setGSecret(e.target.value)}
              placeholder={google?.has_encrypted_secrets ? "(unchanged)" : ""}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void connectGoogle()}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Connect Google
            </button>
            {google?.connection_status !== "not_configured" && (
              <button
                type="button"
                onClick={() => void disconnectChannel("google_mail")}
                className="rounded border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              >
                Disconnect
              </button>
            )}
            <Link
              to="/settings/notifications"
              className="inline-flex items-center rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Edit email templates
            </Link>
            <button
              type="button"
              onClick={() => void testChannel("google_mail")}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Send test email
            </button>
          </div>
        </form>
        <details className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">Troubleshooting</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Redirect mismatch: Google Cloud OAuth client must list the exact redirect URI.</li>
            <li>No refresh token: revoke app access in Google account and reconnect.</li>
          </ul>
        </details>
      </section>
    </div>
    </PageTransition>
  );
}
