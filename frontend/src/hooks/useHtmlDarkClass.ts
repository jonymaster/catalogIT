import { useSyncExternalStore } from "react";

/**
 * Tracks `document.documentElement.classList.contains("dark")` so components can
 * match the same theme as Tailwind without relying on `dark:` display utilities
 * (which can lose specificity fights against `.hidden` in Tailwind v4).
 */
export function useHtmlHasDarkClass(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const el = document.documentElement;
      const obs = new MutationObserver(onStoreChange);
      obs.observe(el, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}
