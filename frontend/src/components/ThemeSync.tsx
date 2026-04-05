import { useEffect } from "react";
import { useAuth } from "../context/useAuth";

/** Applies the user's theme class on <html> for Tailwind `dark:` variants. */
export function ThemeSync() {
  const { preferences } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    const dark = preferences?.theme === "dark";
    root.classList.toggle("dark", dark);
  }, [preferences?.theme]);

  return null;
}
