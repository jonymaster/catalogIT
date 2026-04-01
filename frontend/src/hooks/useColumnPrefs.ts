import { useState, useCallback } from "react";

export function useColumnPrefs(
  storageKey: string,
  allKeys: string[],
): [string[], (keys: string[]) => void] {
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        const valid = parsed.filter((k) => allKeys.includes(k));
        if (valid.length > 0) return valid;
      }
    } catch {
      // ignore
    }
    return allKeys;
  });

  const update = useCallback(
    (keys: string[]) => {
      setVisible(keys);
      localStorage.setItem(storageKey, JSON.stringify(keys));
    },
    [storageKey],
  );

  return [visible, update];
}
