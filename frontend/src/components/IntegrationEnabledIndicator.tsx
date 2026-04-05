interface Props {
  enabled: boolean;
  enabledLabel?: string;
  disabledLabel?: string;
  /** Extra classes on the wrapper (e.g. spacing). */
  className?: string;
}

/** High-contrast status dot for integration settings (light + dark). */
export function IntegrationEnabledIndicator({
  enabled,
  enabledLabel = "Enabled",
  disabledLabel = "Disabled",
  className = "",
}: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <span
        aria-hidden
        className={
          enabled
            ? "box-border h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.5)] dark:border-gray-900 dark:bg-emerald-400 dark:shadow-[0_0_0_1px_rgba(52,211,153,0.6)]"
            : "box-border h-3.5 w-3.5 shrink-0 rounded-full border-2 border-gray-100 bg-gray-300 dark:border-gray-800 dark:bg-gray-600"
        }
      />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {enabled ? enabledLabel : disabledLabel}
      </span>
    </div>
  );
}
