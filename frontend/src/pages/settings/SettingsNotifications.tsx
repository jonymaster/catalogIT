import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client";
import { PageTransition } from "../../components/PageTransition";
import { Button } from "../../components/ui/Button";

/** Source files in the public repo (docs + canned HTML). */
const REPO_MAIN =
  "https://github.com/jcoponet/catalogIT/blob/main";
import { useToast } from "../../context/useToast";
import type { User } from "../../types/models";

interface NotificationSettings {
  renewal_reminders_enabled: boolean;
  renewal_offsets_days: number[];
  calendar_timezone: string;
  renewal_email_subject_template: string | null;
  renewal_email_html_template: string | null;
  renewal_email_text_template: string | null;
  renewal_email_html_storage_key: string | null;
  renewal_email_template_asset_keys: Record<string, string> | null;
  extra_recipient_ids: string[];
  updated_at: string | null;
}

const COMMON_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function SettingsNotifications() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<NotificationSettings | null>(null);
  const [offsetsText, setOffsetsText] = useState("30, 14, 7, 1");
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const htmlFileRef = useRef<HTMLInputElement>(null);
  const assetFilesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      client.get<NotificationSettings>("/api/settings/notifications"),
      client.get<User[]>("/api/settings/users/"),
    ])
      .then(([settingsRes, usersRes]) => {
        setData(settingsRes.data);
        setOffsetsText(settingsRes.data.renewal_offsets_days.join(", "));
        setAllUsers(usersRes.data);
      })
      .catch(() => showToast({ type: "error", text: "Failed to load settings." }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const selectedRecipients = useMemo(
    () =>
      allUsers.filter((u) =>
        (data?.extra_recipient_ids ?? []).includes(u.id),
      ),
    [allUsers, data?.extra_recipient_ids],
  );

  const availableUsers = useMemo(() => {
    const selectedIds = new Set(data?.extra_recipient_ids ?? []);
    const q = recipientSearch.toLowerCase();
    return allUsers
      .filter((u) => u.is_active && !selectedIds.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.first_name.toLowerCase().includes(q) ||
          u.last_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
  }, [allUsers, data?.extra_recipient_ids, recipientSearch]);

  function addRecipient(userId: string) {
    setData((d) =>
      d
        ? { ...d, extra_recipient_ids: [...d.extra_recipient_ids, userId] }
        : d,
    );
    setRecipientSearch("");
  }

  function removeRecipient(userId: string) {
    setData((d) =>
      d
        ? {
            ...d,
            extra_recipient_ids: d.extra_recipient_ids.filter(
              (id) => id !== userId,
            ),
          }
        : d,
    );
  }

  async function save() {
    if (!data) return;
    const parts = offsetsText.split(/[\s,]+/).filter(Boolean);
    const offsets: number[] = [];
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (Number.isNaN(n) || n <= 0) {
        showToast({
          type: "error",
          text: "Reminder offsets must be positive integers (e.g. 30, 14, 7, 1).",
        });
        return;
      }
      offsets.push(n);
    }
    if (offsets.length === 0) {
      showToast({
        type: "error",
        text: "At least one reminder offset is required.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await client.patch<NotificationSettings>(
        "/api/settings/notifications",
        {
          renewal_reminders_enabled: data.renewal_reminders_enabled,
          renewal_offsets_days: offsets,
          calendar_timezone: data.calendar_timezone.trim() || "UTC",
          extra_recipient_ids: data.extra_recipient_ids,
        },
      );
      setData(res.data);
      setOffsetsText(res.data.renewal_offsets_days.join(", "));
      showToast({ type: "success", text: "Notification settings saved." });
    } catch {
      showToast({ type: "error", text: "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function uploadTemplate() {
    const html = htmlFileRef.current?.files?.[0];
    if (!html) {
      showToast({ type: "error", text: "Choose an HTML file (.html or .htm)." });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("html", html);
      const assets = assetFilesRef.current?.files;
      if (assets?.length) {
        for (let i = 0; i < assets.length; i++) {
          fd.append("assets", assets[i]);
        }
      }
      const res = await client.post<NotificationSettings>(
        "/api/settings/notifications/email-template-upload",
        fd,
      );
      setData(res.data);
      if (htmlFileRef.current) htmlFileRef.current.value = "";
      if (assetFilesRef.current) assetFilesRef.current.value = "";
      showToast({ type: "success", text: "HTML template uploaded to storage." });
    } catch {
      showToast({ type: "error", text: "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function clearUploadedTemplate() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await client.patch<NotificationSettings>(
        "/api/settings/notifications",
        {
          renewal_email_html_storage_key: null,
          renewal_email_template_asset_keys: null,
          renewal_email_html_template: null,
          renewal_email_text_template: null,
          renewal_email_subject_template: null,
        },
      );
      setData(res.data);
      showToast({
        type: "success",
        text: "Template reset to the built-in default. Upload a new file anytime.",
      });
    } catch {
      showToast({ type: "error", text: "Failed to reset template." });
    } finally {
      setSaving(false);
    }
  }

  async function openPreviewInNewTab() {
    setPreviewLoading(true);
    try {
      const r = await client.post<{ html: string }>(
        "/api/settings/notifications/email-preview",
        {
          sample_data: {
            title: "CatalogIT",
            service_name: "Example Service",
            renewal_date: "2026-12-31",
            days_before: "7",
            owner_name: "Jane Doe",
          },
        },
      );
      const html = r.data.html;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        URL.revokeObjectURL(url);
        showToast({
          type: "error",
          text: "Could not open a new tab. Allow pop-ups for this site and try again.",
        });
        return;
      }
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 120_000);
    } catch {
      showToast({ type: "error", text: "Preview failed." });
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading || !data) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }

  return (
    <PageTransition>
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Renewal reminders</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Service owners receive email reminders before each service renewal date
          (requires Gmail connected under{" "}
          <Link
            to="/settings/integrations"
            className="font-medium text-gray-900 dark:text-gray-100 underline"
          >
            Integrations
          </Link>
          ). A daily job calls the API to send due reminders; configure{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-xs">CRON_SECRET</code>{" "}
          and schedule{" "}
          <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-xs">
            POST /api/internal/notifications/renewal-dispatch
          </code>
          .
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={data.renewal_reminders_enabled}
          onChange={(e) =>
            setData((d) =>
              d ? { ...d, renewal_reminders_enabled: e.target.checked } : d,
            )
          }
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
        />
        Enable renewal reminder emails
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          Days before renewal (send on each day)
        </label>
        <input
          type="text"
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          value={offsetsText}
          onChange={(e) => setOffsetsText(e.target.value)}
          placeholder="30, 14, 7, 1"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Comma-separated. Emails send when the calendar date matches (renewal
          date minus each offset) in the timezone below.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          Calendar timezone
        </label>
        <input
          type="text"
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          list="tz-suggestions"
          value={data.calendar_timezone}
          onChange={(e) =>
            setData((d) =>
              d ? { ...d, calendar_timezone: e.target.value } : d,
            )
          }
        />
        <datalist id="tz-suggestions">
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Email template</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Upload one <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 text-xs">.html</code>{" "}
          file (and optional images). Edit a copy of the{" "}
          <a
            href={`${REPO_MAIN}/email-templates/catalogit-renewal.html`}
            className="font-medium text-gray-900 dark:text-gray-100 underline"
            target="_blank"
            rel="noreferrer"
          >
            canned template
          </a>{" "}
          from the repo, or design your own. Use Mustache placeholders in the HTML
          (e.g. <code className="rounded bg-gray-100 dark:bg-gray-800 px-1">{"{{service_name}}"}</code>
          ). See{" "}
          <a
            href={`${REPO_MAIN}/docs/email-templates.md`}
            className="font-medium text-gray-900 dark:text-gray-100 underline"
            target="_blank"
            rel="noreferrer"
          >
            docs/email-templates.md
          </a>{" "}
          for details. If you do not upload anything, the app uses the built-in HTML.
        </p>

        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-2">
          <p>
            Optional images (png, jpg, gif, webp, svg): name files like{" "}
            <code className="text-xs">logo.png</code> and in HTML use{" "}
            <code className="text-xs">{"src=\"cid:logo\""}</code> (name without extension = CID).
            Or use <code className="text-xs">{"{{logo_block}}"}</code> with a{" "}
            <code className="text-xs">logo</code> image uploaded.
          </p>
          {data.renewal_email_html_storage_key && (
            <p className="text-gray-800 dark:text-gray-100">
              Active:{" "}
              <code className="break-all text-xs">{data.renewal_email_html_storage_key}</code>
              {data.renewal_email_template_asset_keys &&
                Object.keys(data.renewal_email_template_asset_keys).length > 0 && (
                  <>
                    {" "}
                    · inline images:{" "}
                    {Object.keys(data.renewal_email_template_asset_keys).join(", ")}
                  </>
                )}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">
              HTML file
              <input
                ref={htmlFileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-200"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">
              Images (optional)
              <input
                ref={assetFilesRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                multiple
                className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-200"
              />
            </label>
            <button
              type="button"
              disabled={uploading}
              onClick={() => void uploadTemplate()}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload HTML + images"}
            </button>
            {(data.renewal_email_html_storage_key ||
              data.renewal_email_html_template ||
              data.renewal_email_subject_template ||
              data.renewal_email_text_template) && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void clearUploadedTemplate()}
                className="rounded-md border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-50 dark:bg-red-950/40 disabled:opacity-50"
              >
                Reset to default template
              </button>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            <strong className="text-gray-700 dark:text-gray-200">Preview</strong> opens the rendered HTML in a new
            tab (sample data). Your browser shows it like a normal page.
          </p>
          <button
            type="button"
            disabled={previewLoading}
            onClick={() => void openPreviewInNewTab()}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {previewLoading ? "Opening…" : "Preview HTML in new tab"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Additional notification recipients
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          These users receive renewal notifications for all eligible services,
          regardless of ownership. Admin users already receive notifications by
          default and do not need to be added here.
        </p>

        {selectedRecipients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedRecipients.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-sm text-gray-700 dark:text-gray-200"
              >
                {u.first_name} {u.last_name}
                {u.role === "admin" && (
                  <span className="text-xs text-gray-400">(admin)</span>
                )}
                <button
                  type="button"
                  onClick={() => removeRecipient(u.id)}
                  className="ml-1 text-gray-400 hover:text-gray-600 dark:text-gray-300"
                  aria-label={`Remove ${u.first_name} ${u.last_name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative max-w-sm">
          <input
            type="text"
            value={recipientSearch}
            onChange={(e) => setRecipientSearch(e.target.value)}
            placeholder="Search users to add..."
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
          {recipientSearch && availableUsers.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
              {availableUsers.slice(0, 10).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => addRecipient(u.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {u.first_name} {u.last_name}{" "}
                    <span className="text-gray-400">{u.email}</span>
                    {u.role === "admin" && (
                      <span className="ml-1 text-xs text-gray-400">
                        (admin)
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {recipientSearch && availableUsers.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 shadow-lg">
              No matching users found.
            </div>
          )}
        </div>
      </div>

      <Button disabled={saving} onClick={() => void save()}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
    </PageTransition>
  );
}
