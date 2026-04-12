import { useLayoutEffect } from "react";
import { useAuth } from "../context/useAuth";

/** Applies the user's theme class on <html> for Tailwind `dark:` variants. */
export function ThemeSync() {
  const { preferences } = useAuth();

  // useLayoutEffect: keep `html.dark` in sync before paint so sidebar tokens and
  // theme-aware assets (e.g. BrandMark) never disagree for a visible frame.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const dark = preferences?.theme === "dark";
    root.classList.toggle("dark", dark);
  }, [preferences?.theme]);

  return null;
}
