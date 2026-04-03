import type { UserPreferences } from "../types/models";

interface FormatOptions {
  locale?: string;
  timeZone?: string;
}

function getLocale(preferences: UserPreferences | null, overrideLocale?: string) {
  return overrideLocale ?? preferences?.locale ?? undefined;
}

function getTimeZone(preferences: UserPreferences | null, overrideTimeZone?: string) {
  return overrideTimeZone ?? preferences?.timezone ?? undefined;
}

function createFormatter(
  preferences: UserPreferences | null,
  options: Intl.DateTimeFormatOptions,
  overrides?: FormatOptions,
) {
  const locale = getLocale(preferences, overrides?.locale);
  const timeZone = getTimeZone(preferences, overrides?.timeZone);

  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return new Intl.DateTimeFormat(undefined, options);
  }
}

function parseDateOnlyValue(value: string | Date) {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12),
    );
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatDateOnly(
  value: string | Date | null | undefined,
  preferences: UserPreferences | null,
  options?: Intl.DateTimeFormatOptions,
  overrides?: FormatOptions,
) {
  if (!value) {
    return "--";
  }

  return createFormatter(
    preferences,
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      ...options,
      timeZone: "UTC",
    },
    overrides,
  ).format(parseDateOnlyValue(value));
}

export function formatDateTime(
  value: string | Date | null | undefined,
  preferences: UserPreferences | null,
  options?: Intl.DateTimeFormatOptions,
  overrides?: FormatOptions,
) {
  if (!value) {
    return "--";
  }

  return createFormatter(preferences, options ?? {}, overrides).format(
    value instanceof Date ? value : new Date(value),
  );
}

export function formatMonthYear(value: Date, preferences: UserPreferences | null) {
  return formatDateTime(
    value,
    preferences,
    { month: "long", year: "numeric" },
    { timeZone: "UTC" },
  );
}

export function formatWeekdayShort(value: Date, preferences: UserPreferences | null) {
  return formatDateTime(
    value,
    preferences,
    { weekday: "short" },
    { timeZone: "UTC" },
  );
}
