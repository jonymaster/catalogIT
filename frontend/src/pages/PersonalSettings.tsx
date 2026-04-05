import { useEffect, useMemo, useState } from "react";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import type { UserPreferences } from "../types/models";

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

export function PersonalSettings() {
  const { preferences, preferencesLoading, setPreferences } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState<UserPreferences>({
    locale: null,
    timezone: null,
    theme: "light",
  });
  const [saving, setSaving] = useState(false);

  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);
  const browserLocale = navigator.language;
  const browserTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => {
    setForm({
      locale: preferences?.locale ?? null,
      timezone: preferences?.timezone ?? null,
      theme: preferences?.theme ?? "light",
    });
  }, [preferences]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await client.patch<UserPreferences>("/api/me/preferences", {
        locale: form.locale,
        timezone: form.timezone,
        theme: form.theme,
      });
      setPreferences(response.data);
      showToast({ type: "success", text: "Personal settings updated." });
    } catch {
      showToast({ type: "error", text: "Failed to update personal settings." });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm({
      locale: preferences?.locale ?? null,
      timezone: preferences?.timezone ?? null,
      theme: preferences?.theme ?? "light",
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Personal Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Locale, timezone, and appearance for your account.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6"
      >
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
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-gray-500 dark:focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:focus:ring-gray-400"
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
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-gray-500 dark:focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:focus:ring-gray-400"
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
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-gray-500 dark:focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:focus:ring-gray-400"
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
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
