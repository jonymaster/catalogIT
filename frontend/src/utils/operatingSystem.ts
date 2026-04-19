import type { OperatingSystem } from "../types/models";

export const OS_OPTIONS: { value: OperatingSystem; label: string }[] = [
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
];

export function operatingSystemLabel(os: OperatingSystem | null | undefined): string {
  if (!os) return "—";
  const row = OS_OPTIONS.find((o) => o.value === os);
  return row?.label ?? os;
}
