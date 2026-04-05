import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client";
import { useToast } from "../../context/useToast";
import type { User } from "../../types/models";

interface NotificationSettings {
  renewal_reminders_enabled: boolean;
  renewal_offsets_days: number[];
  calendar_timezone: string;
  renewal_email_subject_template: string | null;
  renewal_email_html_template: string | null;
  renewal_email_text_template: string | null;
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
          renewal_email_subject_template:
            data.renewal_email_subject_template?.trim() || null,
          renewal_email_html_template:
            data.renewal_email_html_template?.trim() || null,
          renewal_email_text_template:
            data.renewal_email_text_template?.trim() || null,
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

  if (loading || !data) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Renewal reminders</h2>
        <p className="mt-1 text-sm text-gray-500">
          Service owners receive email reminders before each service renewal date
          (requires Gmail connected under{" "}
          <Link
            to="/settings/integrations"
            className="font-medium text-gray-900 underline"
          >
            Integrations
          </Link>
          ). A daily job calls the API to send due reminders; configure{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">CRON_SECRET</code>{" "}
          and schedule{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">
            POST /api/internal/notifications/renewal-dispatch
          </code>
          .
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={data.renewal_reminders_enabled}
          onChange={(e) =>
            setData((d) =>
              d ? { ...d, renewal_reminders_enabled: e.target.checked } : d,
            )
          }
          className="h-4 w-4 rounded border-gray-300"
        />
        Enable renewal reminder emails
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Days before renewal (send on each day)
        </label>
        <input
          type="text"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          value={offsetsText}
          onChange={(e) => setOffsetsText(e.target.value)}
          placeholder="30, 14, 7, 1"
        />
        <p className="mt-1 text-xs text-gray-500">
          Comma-separated. Emails send when the calendar date matches (renewal
          date minus each offset) in the timezone below.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Calendar timezone
        </label>
        <input
          type="text"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
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
        <h3 className="text-sm font-medium text-gray-900">Email templates</h3>
        <p className="text-xs text-gray-500">
          Mustache-style variables:{" "}
          <code className="rounded bg-gray-100 px-1">{"{{service_name}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{renewal_date}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{days_before}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{owner_name}}"}</code>,{" "}
          <code className="rounded bg-gray-100 px-1">{"{{body}}"}</code>, etc.
          Leave blank to use built-in defaults.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600">Subject</label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900"
            value={data.renewal_email_subject_template ?? ""}
            onChange={(e) =>
              setData((d) =>
                d
                  ? {
                      ...d,
                      renewal_email_subject_template:
                        e.target.value || null,
                    }
                  : d,
              )
            }
            placeholder="Built-in default"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">HTML body</label>
          <textarea
            rows={5}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900"
            value={data.renewal_email_html_template ?? ""}
            onChange={(e) =>
              setData((d) =>
                d
                  ? {
                      ...d,
                      renewal_email_html_template:
                        e.target.value || null,
                    }
                  : d,
              )
            }
            placeholder="Built-in default"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Plain text</label>
          <textarea
            rows={5}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900"
            value={data.renewal_email_text_template ?? ""}
            onChange={(e) =>
              setData((d) =>
                d
                  ? {
                      ...d,
                      renewal_email_text_template:
                        e.target.value || null,
                    }
                  : d,
              )
            }
            placeholder="Built-in default"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">
          Additional notification recipients
        </h3>
        <p className="text-xs text-gray-500">
          These users receive renewal notifications for all eligible services,
          regardless of ownership. Admin users already receive notifications by
          default and do not need to be added here.
        </p>

        {selectedRecipients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedRecipients.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {u.first_name} {u.last_name}
                {u.role === "admin" && (
                  <span className="text-xs text-gray-400">(admin)</span>
                )}
                <button
                  type="button"
                  onClick={() => removeRecipient(u.id)}
                  className="ml-1 text-gray-400 hover:text-gray-600"
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
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          {recipientSearch && availableUsers.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
              {availableUsers.slice(0, 10).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => addRecipient(u.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
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
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
              No matching users found.
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
