import type { OperatingSystem, HardwareType } from "../../types/models";
import { operatingSystemLabel } from "../../utils/operatingSystem";
import { ComputerDesktopIcon } from "../Icons";
import linuxPng from "../../assets/os/linux.png";
import macosPng from "../../assets/os/macos.png";
import windowsPng from "../../assets/os/windows.png";

type OsKind = OperatingSystem | null | undefined;

const OS_SRC: Partial<Record<OperatingSystem, string>> = {
  macos: macosPng,
  linux: linuxPng,
  windows: windowsPng,
};

const OS_ALT: Partial<Record<OperatingSystem, string>> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
};

/** Leading list glyph for hardware OS (~26px, matches Monogram column). */
export function OsIcon({
  operatingSystem,
  className = "h-[26px] w-[26px] shrink-0 text-fg-2",
  title,
  hardwareType,
}: {
  operatingSystem: OsKind;
  className?: string;
  title?: string;
  hardwareType?: HardwareType;
}) {
  if (hardwareType === "accessory") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} role="img" aria-label="Accessory">
      <path d="M7 3v4m4-4v4M5 7h8v4a4 4 0 0 1-8 0V7Zm4 8v2a4 4 0 0 0 8 0v-4m-2-4h4v4h-4V9Z" />
    </svg>;
  }
  if (hardwareType === "phone" || hardwareType === "tablet" || ["android", "ios", "ipados"].includes(operatingSystem ?? "")) {
    const tablet = hardwareType === "tablet" || operatingSystem === "ipados";
    const label = title ?? (operatingSystem ? operatingSystemLabel(operatingSystem) : (tablet ? "Tablet" : "Phone"));
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={tablet ? 4 : 6} y="2" width={tablet ? 16 : 12} height="20" rx="2" />
      <path d="M10 18h4" />
    </svg>;
  }
  if (
    operatingSystem === "macos" ||
    operatingSystem === "linux" ||
    operatingSystem === "windows"
  ) {
    const alt = title ?? OS_ALT[operatingSystem];
    return (
      <img
        src={OS_SRC[operatingSystem]}
        alt={alt}
        title={title ?? alt}
        className={[className, "object-contain"].filter(Boolean).join(" ")}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <ComputerDesktopIcon
      className={[className, "text-fg-4"].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}
