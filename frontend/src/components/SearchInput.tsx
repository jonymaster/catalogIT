interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  containerClassName?: string;
  inputClassName?: string;
  iconClassName?: string;
  bare?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  onFocus,
  onKeyDown,
  containerClassName = "",
  inputClassName = "",
  iconClassName = "",
  bare = false,
}: Props) {
  const baseInputClassName = bare
    ? "w-full rounded-md border-0 bg-transparent py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-none outline-none focus:border-transparent focus:outline-none focus:ring-0"
    : "w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500";

  return (
    <div className={`relative ${containerClassName}`.trim()}>
      <svg
        className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 ${iconClassName}`.trim()}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${baseInputClassName} ${inputClassName}`.trim()}
      />
    </div>
  );
}
