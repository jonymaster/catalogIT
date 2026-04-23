import type { ReactNode } from "react";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  size?: "sm" | "md";
  compact?: boolean;
  /** `brand`: strong fill on the selected segment (e.g. report chart controls). */
  activeTone?: "default" | "brand";
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  compact = false,
  activeTone = "default",
}: SegmentedControlProps<T>) {
  const textSize = size === "sm" ? "text-[11.5px]" : "text-xs";
  return (
    <div
      role="tablist"
      className={`inline-flex gap-0.5 rounded-md border border-border bg-surface-2 p-0.5 ${textSize}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const activeClasses =
          activeTone === "brand"
            ? "bg-brand-600 font-semibold text-white shadow-sm hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-500"
            : "bg-surface font-semibold text-fg shadow-sm";
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.title ?? (typeof opt.label === "string" ? opt.label : undefined)}
            className={[
              "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 transition-all duration-150",
              size === "sm" ? "py-0.5" : "py-1",
              active
                ? activeClasses
                : "text-fg-3 hover:text-fg-2 dark:text-gray-400 dark:hover:text-gray-200",
            ].join(" ")}
          >
            {opt.icon}
            {(!compact || !opt.icon) && opt.label}
          </button>
        );
      })}
    </div>
  );
}
