import { useMemo } from "react";
import { useCommandPalette } from "../context/CommandPaletteContext";
import { MagnifyingGlassIcon } from "./Icons";

interface Props {
  /** Compact strip (top bar) vs dashboard promo row */
  variant?: "toolbar" | "prominent";
  className?: string;
}

export function CommandPaletteTrigger({
  variant = "toolbar",
  className = "",
}: Props) {
  const { openPalette } = useCommandPalette();
  const mac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      navigator.platform.toUpperCase().includes("MAC"),
    [],
  );

  const prominent = variant === "prominent";

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-haspopup="dialog"
      className={
        prominent
          ? `flex w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3.5 text-left shadow-sm transition-colors hover:border-border-strong hover:bg-surface-2 ${className}`
          : `flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-fg-3 transition-colors hover:border-border-strong hover:bg-surface-2 ${className}`
      }
      style={!prominent ? { minWidth: 280 } : undefined}
    >
      <MagnifyingGlassIcon
        className={`shrink-0 text-fg-3 ${prominent ? "h-5 w-5" : "h-4 w-4"}`}
      />
      <span className="min-w-0 flex-1">
        {prominent ? (
          <>
            <span className="block text-[15px] font-semibold text-fg">
              Search or jump to…
            </span>
            <span className="mt-0.5 block text-[13px] text-fg-3">
              Open anything in CatalogIT—services, hardware, people, or pages
            </span>
          </>
        ) : (
          <span className="block text-left text-sm text-fg-3">
            Search or jump to…
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="kbd">{mac ? "⌘" : "Ctrl"}</span>
        <span className="kbd">K</span>
      </span>
    </button>
  );
}
