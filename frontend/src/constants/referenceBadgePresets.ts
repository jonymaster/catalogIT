/**
 * Curated badge presets: light/dark readable chips (aligned with {@link Badge} where possible).
 * Ordered brightest → darkest (light-mode chip appearance). Keep in sync with
 * `BADGE_COLOR_PRESETS` in backend `app/reference_data_colors.py`.
 */
export const REFERENCE_BADGE_PRESETS = [
  { id: "white", label: "White" },
  { id: "yellow", label: "Yellow" },
  { id: "lime", label: "Lime" },
  { id: "cyan", label: "Cyan" },
  { id: "sky", label: "Sky" },
  { id: "green", label: "Green" },
  { id: "emerald", label: "Emerald" },
  { id: "teal", label: "Teal" },
  { id: "blue", label: "Blue" },
  { id: "pink", label: "Pink" },
  { id: "rose", label: "Rose" },
  { id: "fuchsia", label: "Fuchsia" },
  { id: "magenta", label: "Magenta" },
  { id: "violet", label: "Violet" },
  { id: "purple", label: "Purple" },
  { id: "orange", label: "Orange" },
  { id: "amber", label: "Amber" },
  { id: "red", label: "Red" },
  { id: "indigo", label: "Indigo" },
  { id: "brand", label: "Brand" },
  { id: "gray", label: "Gray" },
  { id: "navy", label: "Navy" },
  { id: "brown", label: "Brown" },
  { id: "dark_gray", label: "Charcoal" },
] as const;

export type ReferenceBadgePresetId = (typeof REFERENCE_BADGE_PRESETS)[number]["id"];

const _ids = new Set<string>(REFERENCE_BADGE_PRESETS.map((p) => p.id));

export function isReferenceBadgePresetId(value: string): value is ReferenceBadgePresetId {
  return _ids.has(value);
}

/** Tailwind classes for reference chips. */
export const REFERENCE_BADGE_PRESET_CLASSES: Record<ReferenceBadgePresetId, string> = {
  white:
    "bg-white text-gray-900 ring-1 ring-inset ring-gray-300 dark:bg-gray-100 dark:text-gray-900 dark:ring-gray-500",
  yellow:
    "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-300",
  lime: "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-300",
  cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  green:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  fuchsia:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  magenta:
    "bg-fuchsia-200 text-fuchsia-900 dark:bg-fuchsia-900/40 dark:text-fuchsia-200",
  violet:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  purple:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  orange:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  indigo:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  brand:
    "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  navy: "bg-blue-950 text-blue-50 dark:bg-slate-950 dark:text-blue-200",
  brown:
    "bg-amber-900 text-amber-50 dark:bg-amber-950 dark:text-amber-100",
  dark_gray:
    "bg-gray-800 text-gray-100 dark:bg-gray-950 dark:text-gray-200",
};
