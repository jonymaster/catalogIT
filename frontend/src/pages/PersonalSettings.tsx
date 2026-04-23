import { useEffect, useMemo, useState } from "react";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import type { User, UserPreferences } from "../types/models";

const COMMON_LOCALES = [
  "en-US",
  "en-GB",
  "it-IT",
  "de-DE",
  "fr-FR",
  "es-ES",
];

function getTimeZoneOptions() {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  return intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? ["UTC"];
}

function formatApiError(err: unknown): string {
  const ax = err as {
    response?: { data?: { detail?: string | { message?: string; code?: string } } };
  };
  const d = ax.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  return "Something went wrong.";
}

export function PersonalSettings() {
  const { preferences, preferencesLoading, setPreferences } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [form, setForm] = useState<UserPreferences>({
    locale: null,
    timezone: null,
    theme: "light",
    receive_renewal_notifications: true,
  });
  const [savingNotifications, setSavingNotifications] = useState(false);

  const [profileForm, setProfileForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    display_name: "",
    department: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [pwd, setPwd] = useState({
    old_password: "",
    new_password: "",
    confirm: "",
  });
  const [savingPwd, setSavingPwd] = useState(false);

  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);
  const browserLocale = navigator.language;
  const browserTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => {
    setForm({
      locale: preferences?.locale ?? null,
      timezone: preferences?.timezone ?? null,
      theme: preferences?.theme ?? "light",
      receive_renewal_notifications:
        preferences?.receive_renewal_notifications ?? true,
    });
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    client
      .get<User>("/api/me/profile")
      .then((r) => {
        if (!cancelled) {
          setProfile(r.data);
          setProfileForm({
            email: r.data.email,
            first_name: r.data.first_name,
            last_name: r.data.last_name,
            display_name: r.data.display_name ?? "",
            department: r.data.department ?? "",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNotificationToggle(next: boolean) {
    setForm((current) => ({ ...current, receive_renewal_notifications: next }));
    setSavingNotifications(true);
    try {
      const response = await client.patch<UserPreferences>(
        "/api/me/preferences",
        { receive_renewal_notifications: next },
      );
      setPreferences(response.data);
      showToast({
        type: "success",
        text: next
          ? "Renewal notifications enabled."
          : "Renewal notifications disabled.",
      });
    } catch {
      setForm((current) => ({
        ...current,
        receive_renewal_notifications: !next,
      }));
      showToast({
        type: "error",
        text: "Failed to update notification preference.",
      });
    } finally {
      setSavingNotifications(false);
    }
  }

  async function handlePreferencesSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSavingPrefs(true);
    try {
      const response = await client.patch<UserPreferences>("/api/me/preferences", {
        locale: form.locale,
        timezone: form.timezone,
        theme: form.theme,
      });
      setPreferences(response.data);
      showToast({ type: "success", text: "Locale and appearance updated." });
    } catch {
      showToast({ type: "error", text: "Failed to update locale and appearance." });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || profile.provisioning_source !== "local") return;
    setSavingProfile(true);
    try {
      const response = await client.patch<User>("/api/me/profile", {
        email: profileForm.email.trim(),
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        display_name: profileForm.display_name.trim() || null,
        department: profileForm.department.trim() || null,
      });
      setProfile(response.data);
      showToast({ type: "success", text: "Profile updated." });
    } catch (err) {
      showToast({ type: "error", text: formatApiError(err) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || profile.provisioning_source !== "local") return;
    if (pwd.new_password.length < 8) {
      showToast({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (pwd.new_password !== pwd.confirm) {
      showToast({ type: "error", text: "New passwords do not match." });
      return;
    }
    setSavingPwd(true);
    try {
      await client.post("/auth/reset-password", {
        old_password: pwd.old_password,
        new_password: pwd.new_password,
      });
      setPwd({ old_password: "", new_password: "", confirm: "" });
      showToast({ type: "success", text: "Password updated." });
    } catch (err) {
      showToast({ type: "error", text: formatApiError(err) });
    } finally {
      setSavingPwd(false);
    }
  }

  const isLocal = profile?.provisioning_source === "local";
  const isManaged = profile && !isLocal;

  return (
    <PageTransition>
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Personal Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Profile, password, locale, timezone, and appearance.
        </p>
      </div>

      {profileLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading profile...</p>
      ) : (
        <>
          {isLocal && (
            <form
              onSubmit={handleProfileSubmit}
              className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6"
            >
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Profile</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm((c) => ({ ...c, email: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    First name
                  </label>
                  <input
                    required
                    value={profileForm.first_name}
                    onChange={(e) =>
                      setProfileForm((c) => ({ ...c, first_name: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Last name
                  </label>
                  <input
                    required
                    value={profileForm.last_name}
                    onChange={(e) =>
                      setProfileForm((c) => ({ ...c, last_name: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Display name
                  </label>
                  <input
                    value={profileForm.display_name}
                    onChange={(e) =>
                      setProfileForm((c) => ({ ...c, display_name: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Department
                  </label>
                  <input
                    value={profileForm.department}
                    onChange={(e) =>
                      setProfileForm((c) => ({ ...c, department: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save profile"}
              </Button>
            </form>
          )}

          {isManaged && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-6 text-sm text-gray-700 dark:text-gray-300">
              <p className="font-medium text-gray-900 dark:text-gray-100">Organization-managed profile</p>
              <p className="mt-2">
                Profile fields are managed by your organization. Please contact your administrator to change
                name, email, or department.
              </p>
            </div>
          )}

          {isLocal && (
            <form
              onSubmit={handlePasswordSubmit}
              className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6"
            >
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Password</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Current password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={pwd.old_password}
                  onChange={(e) =>
                    setPwd((c) => ({ ...c, old_password: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  New password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={pwd.new_password}
                  onChange={(e) =>
                    setPwd((c) => ({ ...c, new_password: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Confirm new password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={pwd.confirm}
                  onChange={(e) => setPwd((c) => ({ ...c, confirm: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <Button type="submit" disabled={savingPwd}>
                {savingPwd ? "Updating..." : "Change password"}
              </Button>
            </form>
          )}

          {isManaged && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Password</p>
              <p className="mt-2">
                Your account is managed by your organization. Please contact your administrator to change your
                password.
              </p>
            </div>
          )}
        </>
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Notifications
        </h2>
        <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={form.receive_renewal_notifications}
            disabled={savingNotifications}
            onChange={(e) => void handleNotificationToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600"
          />
          <span>
            <span className="block font-medium text-gray-900 dark:text-gray-100">
              Receive renewal reminders
            </span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              When disabled, you won&apos;t receive any renewal reminder emails,
              Slack, or Telegram messages — even for services where you&apos;re
              an owner or extra recipient. Changes apply immediately.
            </span>
          </span>
        </label>
      </div>

      <form
        onSubmit={handlePreferencesSubmit}
        className="space-y-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6"
      >
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Locale and appearance</h2>
        <div>
          <label
            htmlFor="locale"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Locale
          </label>
          <input
            id="locale"
            list="locale-options"
            value={form.locale ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                locale: event.target.value.trim() || null,
              }))
            }
            placeholder={`Browser default (${browserLocale})`}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <datalist id="locale-options">
            {COMMON_LOCALES.map((locale) => (
              <option key={locale} value={locale} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Leave blank to use your browser default.
          </p>
        </div>

        <div>
          <label
            htmlFor="timezone"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Timezone
          </label>
          <select
            id="timezone"
            value={form.timezone ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                timezone: event.target.value || null,
              }))
            }
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="">Browser default ({browserTimeZone})</option>
            {timeZoneOptions.map((timeZone) => (
              <option key={timeZone} value={timeZone}>
                {timeZone}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="theme"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Theme
          </label>
          <select
            id="theme"
            value={form.theme}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                theme: event.target.value as "light" | "dark",
              }))
            }
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Applies across the app after you save.
          </p>
        </div>

        <div className="rounded-md bg-gray-50 dark:bg-gray-950 p-4 text-sm text-gray-600 dark:text-gray-300">
          <p>Current locale: {preferences?.locale ?? browserLocale}</p>
          <p className="mt-1">
            Current timezone: {preferences?.timezone ?? browserTimeZone}
          </p>
          <p className="mt-1 capitalize">
            Current theme: {preferences?.theme ?? "light"}
          </p>
          {preferencesLoading && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading saved preferences...</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={savingPrefs}>
            {savingPrefs ? "Saving..." : "Save locale and appearance"}
          </Button>
          <button
            type="button"
            onClick={() =>
              setForm({
                locale: preferences?.locale ?? null,
                timezone: preferences?.timezone ?? null,
                theme: preferences?.theme ?? "light",
              })
            }
            disabled={savingPrefs}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
    </PageTransition>
  );
}
