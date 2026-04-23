import { useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useCommandPalette } from "../context/CommandPaletteContext";
import client from "../api/client";
import { SunIcon, MoonIcon, BellIcon } from "./Icons";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteTrigger } from "./CommandPaletteTrigger";

export function TopBar() {
  const { pathname } = useLocation();
  const { preferences, setPreferences } = useAuth();
  const { open, closePalette } = useCommandPalette();

  /** Dashboard has its own prominent search; hide the duplicate strip here. */
  const showToolbarSearch = pathname !== "/";

  const theme = preferences?.theme ?? "light";

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    // Optimistic local flip so the UI responds immediately.
    if (next === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    client
      .patch("/api/me/preferences", {
        locale: preferences?.locale ?? null,
        timezone: preferences?.timezone ?? null,
        theme: next,
      })
      .then((r) => setPreferences(r.data))
      .catch(() => {
        // Revert on failure.
        if (theme === "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      });
  };

  return (
    <>
      <div
        className="sticky top-0 z-50 flex items-center gap-2.5 border-b border-border px-5 py-2.5"
        style={{
          background: "color-mix(in oklab, var(--bg) 82%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          minHeight: 52,
        }}
      >
        {showToolbarSearch && <CommandPaletteTrigger variant="toolbar" />}
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-2 hover:bg-surface-2"
        >
          {theme === "dark" ? (
            <SunIcon className="h-4 w-4" />
          ) : (
            <MoonIcon className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          title="Notifications"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-2 hover:bg-surface-2"
        >
          <BellIcon className="h-4 w-4" />
        </button>
      </div>
      <CommandPalette open={open} onClose={closePalette} />
    </>
  );
}
