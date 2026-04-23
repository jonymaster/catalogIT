import { useEffect, useRef, useState } from "react";

export interface MultiSelectFacetOption {
  value: string;
  label: string;
}

interface MultiSelectFacetProps {
  label: string;
  options: MultiSelectFacetOption[];
  values: string[];
  onChange: (next: string[]) => void;
  /** Shown under the control in muted text. */
  hint?: string;
  /** When true, trigger and dropdown match the container width (e.g. grid cells). */
  fullWidth?: boolean;
}

export function MultiSelectFacet({
  label,
  options,
  values,
  onChange,
  hint,
  fullWidth = false,
}: MultiSelectFacetProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = values.length > 0;

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }

  return (
    <div className={`relative min-w-0 ${fullWidth ? "w-full" : ""}`} ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
          fullWidth ? "w-full justify-between" : "",
          active
            ? "border-accent bg-accent-soft text-accent-strong"
            : "border-border bg-surface text-fg-2 hover:border-border-strong hover:bg-surface-2",
        ].join(" ")}
      >
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
          <svg
            className="h-3.5 w-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 6h15l-6 7.5v4.5l-3 1.5v-6L4.5 6z"
            />
          </svg>
          <span className="truncate">{label}</span>
          {active && (
            <span className="tnum shrink-0 rounded-sm bg-accent px-1 text-[10px] font-semibold text-white">
              {values.length}
            </span>
          )}
        </span>
        <svg
          className="h-3 w-3 shrink-0 text-fg-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div
          className={[
            "absolute left-0 z-20 mt-1 rounded-md border border-border bg-surface py-1 shadow-lg",
            fullWidth ? "right-0 w-full min-w-0" : "w-56",
          ].join(" ")}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-3">No values</div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {options.map((opt) => {
                const checked = values.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px] text-fg-2 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900"
                    />
                    <span className="min-w-0 truncate">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          )}
          {active && (
            <div className="border-t border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-left text-[12px] text-fg-3 hover:bg-surface-2 hover:text-fg-2"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
      {hint && (
        <p className="mt-1 text-xs text-fg-3">{hint}</p>
      )}
    </div>
  );
}
