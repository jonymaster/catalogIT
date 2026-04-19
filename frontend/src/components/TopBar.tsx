import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/useAuth";
import client from "../api/client";
import {
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  BellIcon,
} from "./Icons";
import { CommandPalette } from "./CommandPalette";

export function TopBar() {
  const { preferences, setPreferences } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      navigator.platform.toUpperCase().includes("MAC"),
    [],
  );

  // Keyboard shortcut to open palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-border px-5 py-2.5"
        style={{
          background: "color-mix(in oklab, var(--bg) 82%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          minHeight: 52,
        }}
      >
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-fg-3 hover:border-border-strong hover:bg-surface-2 transition-colors"
          style={{ minWidth: 280 }}
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <span className="kbd">{mac ? "⌘" : "Ctrl"}</span>
          <span className="kbd">K</span>
        </button>
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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
