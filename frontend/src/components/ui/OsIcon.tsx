import type { OperatingSystem } from "../../types/models";
import { ComputerDesktopIcon } from "../Icons";
import linuxPng from "../../assets/os/linux.png";
import macosPng from "../../assets/os/macos.png";
import windowsPng from "../../assets/os/windows.png";

type OsKind = OperatingSystem | null | undefined;

const OS_SRC: Record<OperatingSystem, string> = {
  macos: macosPng,
  linux: linuxPng,
  windows: windowsPng,
};

const OS_ALT: Record<OperatingSystem, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
};

/** Leading list glyph for laptop OS (~26px, matches Monogram column). */
export function OsIcon({
  operatingSystem,
  className = "h-[26px] w-[26px] shrink-0 text-fg-2",
  title,
}: {
  operatingSystem: OsKind;
  className?: string;
  title?: string;
}) {
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
