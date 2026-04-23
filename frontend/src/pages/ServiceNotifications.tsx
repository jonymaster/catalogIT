import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import client from "../api/client";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { formatRenewalConfig } from "../service/renewalConfig";
import type { Service, User } from "../types/models";
import { formatDateOnly } from "../utils/formatting";

interface OutletContext {
  service: Service;
  reloadService: () => void;
}

export function ServiceNotifications() {
  const { service, reloadService } = useOutletContext<OutletContext>();
  const { canEdit, preferences } = useAuth();
  const { showToast } = useToast();

  const [enabled, setEnabled] = useState(service.renewal_reminders_enabled);
  const [offsetsText, setOffsetsText] = useState(
    service.renewal_offsets_days?.join(", ") ?? "",
  );
  const [recipientIds, setRecipientIds] = useState<string[]>(
    service.notification_recipients.map((u) => u.id),
  );
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(service.renewal_reminders_enabled);
    setOffsetsText(service.renewal_offsets_days?.join(", ") ?? "");
    setRecipientIds(service.notification_recipients.map((u) => u.id));
  }, [service]);

  useEffect(() => {
    client
      .get<User[]>("/api/settings/users/")
      .then((r) => setAllUsers(r.data))
      .catch(() => {
        // Non-admins can't access the settings users endpoint; fall back silently.
      });
  }, []);

  const selectedRecipients = useMemo(
    () => allUsers.filter((u) => recipientIds.includes(u.id)),
    [allUsers, recipientIds],
  );

  const availableUsers = useMemo(() => {
    const selected = new Set(recipientIds);
    const q = recipientSearch.toLowerCase();
    return allUsers
      .filter((u) => u.is_active && !selected.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.first_name.toLowerCase().includes(q) ||
          u.last_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
  }, [allUsers, recipientIds, recipientSearch]);

  const ownerIds = useMemo(
    () => new Set(service.owners.map((o) => o.id)),
    [service.owners],
  );

  async function save() {
    let offsets: number[] | null = null;
    const trimmed = offsetsText.trim();
    if (trimmed) {
      const parts = trimmed.split(/[\s,]+/).filter(Boolean);
      const parsed: number[] = [];
      for (const p of parts) {
        const n = parseInt(p, 10);
        if (Number.isNaN(n) || n <= 0) {
          showToast({
            type: "error",
            text: "Offsets must be positive integers (e.g. 30, 14, 7, 1).",
          });
          return;
        }
        parsed.push(n);
      }
      offsets = parsed;
    }
    setSaving(true);
    try {
      await client.put<Service>(`/api/services/${service.id}`, {
        renewal_reminders_enabled: enabled,
        renewal_offsets_days: offsets,
        notification_recipient_ids: recipientIds,
      });
      reloadService();
      showToast({ type: "success", text: "Notification settings saved." });
    } catch {
      showToast({ type: "error", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  const renewalSummary = service.renewal_config
    ? formatRenewalConfig(service.renewal_config)
    : "No renewal configured";
  const nextRenewal = service.renewal_date
    ? formatDateOnly(service.renewal_date, preferences)
    : "—";

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="rounded-md border border-border bg-surface-2 p-4">
        <h3 className="text-sm font-medium text-fg">Renewal summary</h3>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-32 text-fg-3">Schedule</dt>
            <dd className="text-fg">{renewalSummary}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-32 text-fg-3">Next renewal</dt>
            <dd className="text-fg">{nextRenewal}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-32 text-fg-3">Owners</dt>
            <dd className="text-fg">
              {service.owners.length > 0
                ? service.owners
                    .map((o) => `${o.first_name} ${o.last_name}`)
                    .join(", ")
                : "None"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-fg-3">
          Owners and admins always receive notifications. Adjust offsets and
          extra recipients below. Global defaults live in{" "}
          <Link
            to="/settings/notifications"
            className="font-medium text-accent hover:text-accent-strong"
          >
            Settings &rarr; Notifications
          </Link>
          .
        </p>
      </section>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border-strong"
        />
        Enable renewal reminders for this service
      </label>

      <div>
        <label className="block text-sm font-medium text-fg">
          Offsets override (days before renewal)
        </label>
        <input
          type="text"
          value={offsetsText}
          disabled={!canEdit}
          onChange={(e) => setOffsetsText(e.target.value)}
          placeholder="e.g. 30, 14, 7, 1"
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
        <p className="mt-1 text-xs text-fg-3">
          Comma-separated positive integers. Leave empty to use the global
          defaults.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-fg">Extra recipients</h3>
          <p className="mt-1 text-xs text-fg-3">
            Users added here receive reminders for this service only, in
            addition to owners, admins, and globally-configured recipients.
          </p>
        </div>

        {selectedRecipients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedRecipients.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm text-fg"
              >
                {u.first_name} {u.last_name}
                {u.role === "admin" && (
                  <span className="text-xs text-fg-4">(admin)</span>
                )}
                {ownerIds.has(u.id) && (
                  <span className="text-xs text-fg-4">(owner)</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setRecipientIds((ids) => ids.filter((id) => id !== u.id))
                    }
                    className="ml-1 text-fg-4 hover:text-fg-2"
                    aria-label={`Remove ${u.first_name} ${u.last_name}`}
                  >
                    &times;
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="relative max-w-sm">
            <input
              type="text"
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Search users to add..."
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            {recipientSearch && availableUsers.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
                {availableUsers.slice(0, 10).map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientIds((ids) => [...ids, u.id]);
                        setRecipientSearch("");
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      {u.first_name} {u.last_name}{" "}
                      <span className="text-fg-4">{u.email}</span>
                      {u.role === "admin" && (
                        <span className="ml-1 text-xs text-fg-4">(admin)</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {recipientSearch && availableUsers.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-3 shadow-lg">
                No matching users found.
              </div>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}
