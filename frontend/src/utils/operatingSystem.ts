import type { OperatingSystem } from "../types/models";

export const OS_OPTIONS: { value: OperatingSystem; label: string }[] = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
  { value: "ipados", label: "iPadOS" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
];

export function operatingSystemLabel(os: OperatingSystem | null | undefined): string {
  if (!os) return "—";
  const row = OS_OPTIONS.find((o) => o.value === os);
  return row?.label ?? os;
}
